import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'

const FIXED_ENUMS = [
  'missing_x64_artifact',
  'missing_x86_artifact',
  'x64_lane_failed',
  'x86_lane_failed',
  'abi_pointer_mismatch',
  'abi_layout_mismatch',
  'abi_callback_signature_mismatch',
  'abi_evidence_incomplete',
  'report_invariant_mismatch'
]

test('X64A-01 deterministic baseline order and x64 result per library', async () => {
  const fixture = await createFixtureRepo()
  const mod = await import('../../scripts/migration/x64-adaptation.mjs')
  const run = mod.runX64Adaptation
  const first = await run({ repoRoot: fixture.repoRoot, write: true, strictGate: false })
  const second = await run({ repoRoot: fixture.repoRoot, write: true, strictGate: false })

  assert.deepEqual(
    first.reports.map((r) => r.library),
    second.reports.map((r) => r.library),
    'library order must remain deterministic'
  )
  for (const report of first.reports) {
    assert.ok(report.x64Result === 'pass' || report.x64Result === 'fail', 'x64Result required per library')
  }
  const queuePath = path.join(
    fixture.repoRoot,
    '.planning',
    'phases',
    '03-x64-adaptation-dual-arch-gates',
    'reports',
    'blocked-remediation-queue.json'
  )
  const hash1 = hashText(await fs.readFile(queuePath, 'utf8'))
  await run({ repoRoot: fixture.repoRoot, write: true, strictGate: false })
  const hash2 = hashText(await fs.readFile(queuePath, 'utf8'))
  assert.equal(hash1, hash2, 'blocked remediation queue order hash must be stable')
  await cleanupFixtureRepo(fixture.repoRoot)
})

test('X64A-02 ABI matrix includes pointerWidth/structLayoutAlignment/callbackSignature', async () => {
  const fixture = await createFixtureRepo()
  const mod = await import('../../scripts/migration/x64-adaptation.mjs')
  const run = mod.runX64Adaptation
  await run({ repoRoot: fixture.repoRoot, write: true, strictGate: false, remediationBatchSize: 1 })
  const { reports } = await run({ repoRoot: fixture.repoRoot, write: true, strictGate: false, remediationBatchSize: 1 })

  for (const report of reports) {
    assert.ok(report.abi, 'abi object required')
    assert.ok('pointerWidth' in report.abi)
    assert.ok('structLayoutAlignment' in report.abi)
    assert.ok('callbackSignature' in report.abi)
  }
  const remediated = reports.find((r) => r.status === 'completed')
  assert.ok(remediated?.abiEvidenceRef, 'completed report must include abiEvidenceRef')
  const evidence = JSON.parse(await fs.readFile(path.join(fixture.repoRoot, remediated.abiEvidenceRef), 'utf8'))
  assert.ok('pointerWidth' in evidence)
  assert.ok('structLayoutAlignment' in evidence)
  assert.ok('callbackSignature' in evidence)
  assert.ok('evidenceInputs' in evidence)
  await cleanupFixtureRepo(fixture.repoRoot)
})

test('X64A-03 failures are explicit with fixed blocked enums', async () => {
  const fixture = await createFixtureRepo({ forceBlocked: true })
  const mod = await import('../../scripts/migration/x64-adaptation.mjs')
  const run = mod.runX64Adaptation
  const { reports, summary } = await run({ repoRoot: fixture.repoRoot, write: true, strictGate: false })

  const blocked = reports.find((r) => r.status === 'blocked')
  assert.ok(blocked, 'at least one blocked report expected')
  for (const code of blocked.blockedReasonCode) {
    assert.ok(FIXED_ENUMS.includes(code), `unexpected blocked enum ${code}`)
  }
  assert.equal(summary.phaseGatePassed, false, 'phase gate must fail while blocked libraries exist')
  await cleanupFixtureRepo(fixture.repoRoot)
})

test('X64A-04 x86 lane mandatory and can block even when x64 passes', async () => {
  const fixture = await createFixtureRepo({ x86FailOnly: true })
  const mod = await import('../../scripts/migration/x64-adaptation.mjs')
  const run = mod.runX64Adaptation
  const { reports } = await run({ repoRoot: fixture.repoRoot, write: true, strictGate: false })

  const target = reports.find((r) => r.library === 'lib-a')
  assert.ok(target, 'target report missing')
  assert.equal(target.x64Result, 'pass')
  assert.equal(target.x86Result, 'fail')
  assert.equal(target.status, 'blocked')
  assert.ok(target.blockedReasonCode.includes('x86_lane_failed'))
  await cleanupFixtureRepo(fixture.repoRoot)
})

test('Gap closure invariants: completed >= 1 after remediation and strict gate stays false with blockers', async () => {
  const fixture = await createFixtureRepo()
  const mod = await import('../../scripts/migration/x64-adaptation.mjs')
  const run = mod.runX64Adaptation
  await run({ repoRoot: fixture.repoRoot, write: true, strictGate: false })
  const before = await readSummary(fixture.repoRoot)

  await run({ repoRoot: fixture.repoRoot, write: true, strictGate: false, remediationBatchSize: 1 })
  const after = await readSummary(fixture.repoRoot)
  assert.ok(after.completedLibraries >= 1, 'completedLibraries should be >= 1 after remediation batch')
  assert.ok(after.blockedLibraries <= before.blockedLibraries, 'blockedLibraries must be monotonic non-increase')
  assert.equal(after.phaseGatePassed, false, 'strict gate must remain false while blocked libraries exist')
  await cleanupFixtureRepo(fixture.repoRoot)
})

async function createFixtureRepo(options = {}) {
  const repoRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'x64-adapt-'))
  const thirdPartyFunc = path.join(repoRoot, '第三方相关文件', '易语言的功能库')
  const thirdPartyUi = path.join(repoRoot, '第三方相关文件', '易语言的界面库')
  const baselineDir = path.join(repoRoot, '.planning', 'baselines')
  const phase2Reports = path.join(repoRoot, '.planning', 'phases', '02-deterministic-encoding-conversion', 'reports', 'libraries')
  await fs.mkdir(thirdPartyFunc, { recursive: true })
  await fs.mkdir(thirdPartyUi, { recursive: true })
  await fs.mkdir(baselineDir, { recursive: true })
  await fs.mkdir(phase2Reports, { recursive: true })

  for (const name of ['lib-a', 'lib-b']) {
    const root = path.join(thirdPartyFunc, name)
    await fs.mkdir(root, { recursive: true })
    await fs.writeFile(path.join(root, `${name}.txt`), 'placeholder', 'utf8')
    await fs.mkdir(path.join(root, 'lib', 'x64'), { recursive: true })
    await fs.mkdir(path.join(root, 'lib', 'x86'), { recursive: true })
    await fs.writeFile(path.join(root, 'lib', 'x64', `${name}.lib`), 'x64', 'utf8')
    await fs.writeFile(path.join(root, 'lib', 'x86', `${name}.lib`), 'x86', 'utf8')
    await fs.writeFile(path.join(phase2Reports, `${name}.json`), JSON.stringify({ library: name }), 'utf8')
  }

  if (options.forceBlocked) {
    await fs.rm(path.join(thirdPartyFunc, 'lib-a', 'lib', 'x64', 'lib-a.lib'))
  }
  if (options.x86FailOnly) {
    await fs.rm(path.join(thirdPartyFunc, 'lib-a', 'lib', 'x86', 'lib-a.lib'))
  }

  const baseline = {
    generatedAt: new Date().toISOString(),
    roots: {
      thirdParty: ['第三方相关文件/易语言的功能库', '第三方相关文件/易语言的界面库'],
      migrated: '支持库源码'
    },
    totals: {
      candidateCount: 2,
      migratedCount: 0,
      remainingCount: 2,
      coveragePct: 0
    },
    libraries: [
      { name: 'lib-a', sourceRoot: '易语言的功能库', isMigrated: false, archState: 'mixed', encodingState: 'utf-8' },
      { name: 'lib-b', sourceRoot: '易语言的功能库', isMigrated: false, archState: 'mixed', encodingState: 'utf-8' }
    ]
  }
  await fs.writeFile(path.join(baselineDir, 'inventory-baseline.json'), `${JSON.stringify(baseline, null, 2)}\n`, 'utf8')

  return { repoRoot }
}

async function cleanupFixtureRepo(repoRoot) {
  await fs.rm(repoRoot, { recursive: true, force: true })
}

async function readSummary(repoRoot) {
  const summaryPath = path.join(repoRoot, '.planning', 'phases', '03-x64-adaptation-dual-arch-gates', 'reports', 'phase-summary.json')
  return JSON.parse(await fs.readFile(summaryPath, 'utf8'))
}

function hashText(content) {
  return crypto.createHash('sha256').update(content).digest('hex')
}
