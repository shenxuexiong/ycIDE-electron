// AutoBuild「编译成功后自动运行」链路的测试。
//
// 运行产物复用 compiler 的 runExecutable（与 IDE「运行」按钮同一条路径），
// 因此这里把 compiler 模块整体 mock 掉，专注验证 AutoBuild 这一侧的接线：
//   - 产物退出码经 notifyProcessExit 回到 Promise；
//   - 超时由 AutoBuild 自己看管（调 stopExecutable 并以 124 收场）；
//   - 启动失败 / 同步抛异常都被兜住，不冒泡成「未捕获异常」；
//   - 不可直接运行的产物（DLL）被识别并跳过，而不是抛出看不懂的 spawn EFTYPE。
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { AutoBuild, type AutoBuildProject, type AutoBuildRequest } from '../../src/main/autoBuild'

const mocks = vi.hoisted(() => ({
  runExecutable: vi.fn<(exePath: string) => boolean>(),
  stopExecutable: vi.fn<() => boolean>(),
}))

vi.mock('../../src/main/compiler', () => ({
  runExecutable: (exePath: string) => mocks.runExecutable(exePath),
  stopExecutable: () => mocks.stopExecutable(),
  isRunning: () => true,
  compileProject: vi.fn(),
  setCompilerHost: vi.fn(),
}))

const EXE = join(tmpdir(), '__ycide_fake_program__.exe')

/** runProgram / buildOne 是私有实现，这里按运行时形状取用，避免为测试放开可见性 */
type Internals = {
  runProgram(exePath: string, project: AutoBuildProject): Promise<number>
  buildOne(
    project: AutoBuildProject,
    compileProject: (options: { projectDir: string; debug?: boolean; arch?: string; mode?: 'compile' | 'run' }) => Promise<{
      success: boolean
      outputFile: string
      errorCount: number
      warningCount: number
      elapsedMs: number
    }>,
  ): Promise<{ success: boolean; runExitCode: number | null; note?: string }>
  pendingRunFinish: ((code: number) => void) | null
}

const FAKE_PROJECT: AutoBuildProject = {
  dir: process.cwd(),
  // 指向不存在的 .epp：readProjectOutputType 会回落为「控制台程序」，
  // 于是 runProgram 不设默认超时，测试行为确定。
  eppPath: join(process.cwd(), '__no_such__.epp'),
  label: 'test-project',
}

function makeAutoBuild(overrides: Partial<AutoBuildRequest> = {}): { instance: AutoBuild; lines: string[] } {
  const lines: string[] = []
  const request: AutoBuildRequest = {
    projectDir: process.cwd(),
    run: true,
    debug: false,
    encoding: 'utf8',
    json: false,
    ...overrides,
  }
  const instance = new AutoBuild(request, {
    appPath: process.cwd(),
    print: (line) => { lines.push(line) },
    writeRaw: (text) => { lines.push(text) },
    exitProcess: () => { /* 不真的退出 */ },
  })
  return { instance, lines }
}

const internals = (instance: AutoBuild): Internals => instance as unknown as Internals

/** 轮询等待 runProgram 进入「已启动、等待退出」状态 */
async function waitForPendingRun(instance: AutoBuild): Promise<void> {
  for (let i = 0; i < 100; i++) {
    if (internals(instance).pendingRunFinish) return
    await new Promise(resolve => setTimeout(resolve, 5))
  }
  throw new Error('runProgram 未进入等待退出状态')
}

beforeEach(() => {
  mocks.runExecutable.mockReset()
  mocks.stopExecutable.mockReset()
})

describe('AutoBuild.runProgram', () => {
  it('程序正常退出：退出码经 notifyProcessExit 回到 Promise', async () => {
    mocks.runExecutable.mockReturnValue(true)
    const { instance } = makeAutoBuild()

    const pending = internals(instance).runProgram(EXE, FAKE_PROJECT)
    await waitForPendingRun(instance)
    internals(instance).pendingRunFinish?.(0)

    expect(await pending).toBe(0)
  })

  it('非零退出码原样透传', async () => {
    mocks.runExecutable.mockReturnValue(true)
    const { instance } = makeAutoBuild()

    const pending = internals(instance).runProgram(EXE, FAKE_PROJECT)
    await waitForPendingRun(instance)
    internals(instance).pendingRunFinish?.(7)

    expect(await pending).toBe(7)
  })

  it('超时：结束程序并以 124 收场', async () => {
    mocks.runExecutable.mockReturnValue(true)
    mocks.stopExecutable.mockReturnValue(true)
    const { instance } = makeAutoBuild({ runTimeoutMs: 30 })

    const code = await internals(instance).runProgram(EXE, FAKE_PROJECT)

    expect(code).toBe(124)
    expect(mocks.stopExecutable).toHaveBeenCalledTimes(1)
  })

  it('runExecutable 返回 false（启动失败）时返回失败码 1', async () => {
    mocks.runExecutable.mockReturnValue(false)
    const { instance } = makeAutoBuild()

    const code = await internals(instance).runProgram(EXE, FAKE_PROJECT)

    expect(code).toBe(1)
  })

  it('runExecutable 同步抛异常时不冒泡，返回 1 并给出可读提示', async () => {
    mocks.runExecutable.mockImplementation(() => {
      const error = new Error('spawn EFTYPE') as Error & { code?: string }
      error.code = 'EFTYPE'
      throw error
    })
    const { instance, lines } = makeAutoBuild()

    const code = await internals(instance).runProgram(EXE, FAKE_PROJECT)

    expect(code).toBe(1)
    expect(lines.join('\n')).toContain('启动程序失败')
    expect(lines.join('\n')).toContain('EFTYPE')
  })
})

describe('AutoBuild.buildOne 产物可运行性判断', () => {
  const dirs: string[] = []

  afterAll(() => {
    for (const dir of dirs) {
      try {
        rmSync(dir, { recursive: true, force: true, maxRetries: 2 })
      } catch {
        /* 沙箱下删除可能较慢/失败，不影响测试结论 */
      }
    }
  })

  /** 造一个「编译成功」的假产物目录 */
  function makeArtifact(outputType: string, fileName: string): { project: AutoBuildProject; outputFile: string } {
    const dir = mkdtempSync(join(tmpdir(), 'ycide-artifact-'))
    dirs.push(dir)
    const eppPath = join(dir, 'proj.epp')
    writeFileSync(eppPath, `ProjectName=proj\nOutputType=${outputType}\n`, 'utf-8')
    const outputFile = join(dir, fileName)
    writeFileSync(outputFile, '', 'utf-8')
    return { project: { dir, eppPath, label: 'proj' }, outputFile }
  }

  it('DLL 产物：跳过运行，标注不可直接运行，但编译本身算成功', async () => {
    const { project, outputFile } = makeArtifact('DynamicLibrary', 'proj.dll')
    const { instance, lines } = makeAutoBuild()
    const fakeCompile = vi.fn(async () => ({
      success: true, outputFile, errorCount: 0, warningCount: 0, elapsedMs: 1,
    }))

    const result = await internals(instance).buildOne(project, fakeCompile)

    expect(result.success).toBe(true)
    expect(result.runExitCode).toBeNull()
    expect(result.note).toContain('不可直接运行')
    expect(mocks.runExecutable).not.toHaveBeenCalled()
    expect(lines.join('\n')).toContain('动态链接库')
  })

  it('控制台程序：正常进入运行流程', async () => {
    const { project, outputFile } = makeArtifact('Console', 'proj.exe')
    mocks.runExecutable.mockReturnValue(true)
    const { instance } = makeAutoBuild()
    const fakeCompile = vi.fn(async () => ({
      success: true, outputFile, errorCount: 0, warningCount: 0, elapsedMs: 1,
    }))

    const pending = internals(instance).buildOne(project, fakeCompile)
    await waitForPendingRun(instance)
    internals(instance).pendingRunFinish?.(0)

    const result = await pending
    expect(result.success).toBe(true)
    expect(result.runExitCode).toBe(0)
    expect(mocks.runExecutable).toHaveBeenCalledTimes(1)
  })
})

describe('AutoBuild 构造与默认值', () => {
  it('run 为 false 时请求即为仅编译', () => {
    const { instance } = makeAutoBuild({ run: false })
    expect(instance).toBeInstanceOf(AutoBuild)
  })
})
