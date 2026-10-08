import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import iconv from 'iconv-lite'
import { classifyEncodingState } from './classify-encoding.mjs'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const DEFAULT_REPO_ROOT = path.resolve(__dirname, '..', '..')

const THIRD_PARTY_ROOTS = {
  易语言的功能库: '第三方相关文件/易语言的功能库',
  易语言的界面库: '第三方相关文件/易语言的界面库'
}

const BASELINE_PATH = '.planning/baselines/inventory-baseline.json'
const REPORTS_ROOT = '.planning/phases/02-deterministic-encoding-conversion/reports'
const MIGRATED_ROOT = '支持库源码'
const SAMPLE_SIZE = 5

const SKIP_DIRS = new Set(['.git', 'node_modules', 'dist', 'out', 'test-results', 'third_party'])
const BINARY_EXTS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.ico', '.dll', '.lib', '.obj', '.exe', '.zip', '.7z', '.rar', '.pdf', '.dat'])
const SAFE_TEXT_EXTS = new Set(['.txt', '.md', '.json', '.xml', '.ini', '.cfg', '.h', '.hpp', '.c', '.cc', '.cpp', '.def', '.asm', '.eyc', '.ecs', '.efw', '.edt', '.epp', '.epl', '.eprj', '.vcxproj', '.sln', '.filters', '.user', '.rc'])

const HIGH_RISK_MARKERS = ['锟斤拷', '鈥', 'Ã©', 'Ã¨', 'ï»¿', '�']
// Policy anchors: D-01 D-02 D-03 D-04 D-05 D-06 D-07 D-08 D-09 D-10 D-11 D-12 D-13 D-14 D-15 D-16

export async function runConversion({
  repoRoot = DEFAULT_REPO_ROOT,
  write = false,
  strictGate = false
} = {}) {
  const baseline = await readBaseline(repoRoot)
  const queue = baseline.libraries.filter((row) => !row.isMigrated)

  const reports = []
  for (const row of queue) {
    const report = await processLibrary(row, { repoRoot, write })
    reports.push(report)
  }

  const summary = buildPhaseSummary(queue, reports)
  validateSummaryMath(summary, baseline, reports)
  await writeReports({ repoRoot, reports, summary })

  if (strictGate && !summary.phaseGatePassed) {
    throw new Error('Strict phase gate failed: blocked files exist or library failures detected')
  }

  return { reports, summary }
}

async function processLibrary(row, { repoRoot, write }) {
  const libraryRoot = resolveLibraryRoot(row, repoRoot)
  const files = await collectLibraryFiles(libraryRoot)
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath, 'en'))

  const report = {
    library: row.name,
    sourceRoot: row.sourceRoot,
    total: files.length,
    scanned: 0,
    converted: 0,
    skipped: 0,
    blocked: 0,
    blockedReasons: [],
    sampleFiles: [],
    status: 'success',
    syncedToMigrated: false
  }

  const libraryEncodingState = await classifyEncodingState(libraryRoot).catch(() => 'mixed')
  for (const file of files) {
    report.scanned += 1
    const outcome = await processFile(file.absolutePath, { write, libraryEncodingState })
    if (outcome.action === 'converted') {
      report.converted += 1
    } else if (outcome.action === 'blocked') {
      report.blocked += 1
      report.blockedReasons.push({ path: file.relativePath, reason: outcome.reason })
    } else {
      report.skipped += 1
    }
    if (report.sampleFiles.length < SAMPLE_SIZE) {
      report.sampleFiles.push(file.relativePath)
    }
  }

  if (report.blocked > 0) report.status = 'failed'
  if (report.scanned !== report.converted + report.skipped + report.blocked) {
    throw new Error(`Invariant failed for ${row.name}: scanned math mismatch`)
  }

  if (write && report.status === 'success') {
    await syncLibraryToMigrated(row, { repoRoot })
    report.syncedToMigrated = true
  }

  return report
}

async function processFile(filePath, { write, libraryEncodingState }) {
  const ext = path.extname(filePath).toLowerCase()
  const fileName = path.basename(filePath)
  if (BINARY_EXTS.has(ext)) return { action: 'skipped', reason: 'binary_extension' }

  const buffer = await fs.readFile(filePath)
  if (buffer.length === 0) return { action: 'skipped', reason: 'empty_file' }
  if (looksBinary(buffer)) return { action: 'skipped', reason: 'binary_content' }
  if (!SAFE_TEXT_EXTS.has(ext) && ext !== '' && !isLikelyText(buffer)) return { action: 'skipped', reason: 'non_text_candidate' }
  if (fileName === 'binary.dat') return { action: 'skipped', reason: 'binary_content' }

  const classification = classifyFileEncoding(buffer, libraryEncodingState)
  if (classification === 'mixed') return { action: 'blocked', reason: 'mixed_or_uncertain' } // D-01

  let text
  if (classification === 'gbk') {
    text = iconv.decode(buffer, 'gbk') // D-02
  } else {
    text = buffer.toString('utf8')
  }
  if (containsHighRisk(text, buffer)) return { action: 'blocked', reason: 'high_risk_mojibake' } // D-07
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1) // D-04 canonical rewrite

  const outBuffer = Buffer.from(text, 'utf8')
  if (write) {
    await fs.writeFile(filePath, outBuffer)
  }
  return { action: 'converted' }
}

function classifyFileEncoding(buffer, libraryEncodingState) {
  if (hasUtf8Bom(buffer)) return 'utf-8'
  if (isValidUtf8(buffer)) return 'utf-8'
  if (looksLikeGbk(buffer)) return 'gbk'
  if (libraryEncodingState === 'gbk') return 'gbk'
  return 'mixed'
}

function buildPhaseSummary(queue, reports) {
  const summary = {
    totalLibraries: queue.length,
    processedLibraries: reports.length,
    failedLibraries: reports.filter((r) => r.status === 'failed').map((r) => r.library),
    totals: {
      total: reports.reduce((acc, r) => acc + r.total, 0),
      scanned: reports.reduce((acc, r) => acc + r.scanned, 0),
      converted: reports.reduce((acc, r) => acc + r.converted, 0),
      skipped: reports.reduce((acc, r) => acc + r.skipped, 0),
      blocked: reports.reduce((acc, r) => acc + r.blocked, 0)
    }
  }
  summary.phaseGatePassed = summary.totals.blocked === 0 && summary.failedLibraries.length === 0 // D-10
  return summary
}

function validateSummaryMath(summary, baseline, reports) {
  if (summary.processedLibraries !== baseline.totals.remainingCount) {
    throw new Error('Baseline mismatch: processed library count differs from baseline remainingCount') // D-12
  }
  if (summary.totals.scanned !== summary.totals.converted + summary.totals.skipped + summary.totals.blocked) {
    throw new Error('Summary invariant failed: scanned != converted + skipped + blocked')
  }
  for (const report of reports) {
    if (report.sampleFiles.length > SAMPLE_SIZE) {
      throw new Error(`Sample size exceeds N=${SAMPLE_SIZE} for ${report.library}`)
    }
  }
}

async function writeReports({ repoRoot, reports, summary }) {
  const reportsRoot = path.join(repoRoot, REPORTS_ROOT)
  const librariesDir = path.join(reportsRoot, 'libraries')
  await fs.mkdir(librariesDir, { recursive: true })

  for (const report of reports) {
    const slug = slugify(report.library)
    const reportPath = path.join(librariesDir, `${slug}.json`)
    await fs.writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, 'utf8')
  }
  await fs.writeFile(path.join(reportsRoot, 'phase-summary.json'), `${JSON.stringify(summary, null, 2)}\n`, 'utf8')
}

async function readBaseline(repoRoot) {
  const baselinePath = path.join(repoRoot, BASELINE_PATH)
  const raw = await fs.readFile(baselinePath, 'utf8')
  return JSON.parse(raw)
}

function resolveLibraryRoot(row, repoRoot) {
  const relRoot = THIRD_PARTY_ROOTS[row.sourceRoot]
  if (!relRoot) throw new Error(`Unknown sourceRoot: ${row.sourceRoot}`)
  return path.join(repoRoot, relRoot, row.name)
}

function resolveMigratedLibraryRoot(row, repoRoot) {
  return path.join(repoRoot, MIGRATED_ROOT, row.name)
}

async function collectLibraryFiles(rootDir) {
  const files = []
  const stack = [rootDir]
  while (stack.length > 0) {
    const current = stack.pop()
    const entries = await fs.readdir(current, { withFileTypes: true }).catch(() => [])
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name)
      if (entry.isDirectory()) {
        if (SKIP_DIRS.has(entry.name)) continue // D-08
        stack.push(fullPath)
        continue
      }
      if (entry.isFile()) {
        const relativePath = path.relative(rootDir, fullPath).replace(/\\/g, '/')
        files.push({ absolutePath: fullPath, relativePath })
      }
    }
  }
  return files
}

async function syncLibraryToMigrated(row, { repoRoot }) {
  const sourceRoot = resolveLibraryRoot(row, repoRoot)
  const targetRoot = resolveMigratedLibraryRoot(row, repoRoot)
  await fs.rm(targetRoot, { recursive: true, force: true })
  await copyDirectory(sourceRoot, targetRoot)
}

async function copyDirectory(sourceDir, targetDir) {
  await fs.mkdir(targetDir, { recursive: true })
  const entries = await fs.readdir(sourceDir, { withFileTypes: true })
  entries.sort((a, b) => a.name.localeCompare(b.name, 'en'))
  for (const entry of entries) {
    const srcPath = path.join(sourceDir, entry.name)
    const dstPath = path.join(targetDir, entry.name)
    if (entry.isDirectory()) {
      await copyDirectory(srcPath, dstPath)
    } else if (entry.isFile()) {
      await fs.copyFile(srcPath, dstPath)
    }
  }
}

function containsHighRisk(text, buffer) {
  if (buffer.includes(Buffer.from([0xef, 0xbf, 0xbd]))) return true
  return HIGH_RISK_MARKERS.some((marker) => text.includes(marker))
}

function looksBinary(buffer) {
  const limit = Math.min(buffer.length, 4096)
  let nonText = 0
  for (let i = 0; i < limit; i += 1) {
    const b = buffer[i]
    if (b === 0x00) return true
    if (b < 0x09 || (b > 0x0d && b < 0x20)) nonText += 1
  }
  return nonText / limit > 0.2
}

function isLikelyText(buffer) {
  const limit = Math.min(buffer.length, 4096)
  let printable = 0
  for (let i = 0; i < limit; i += 1) {
    const b = buffer[i]
    if (b === 0x09 || b === 0x0a || b === 0x0d || (b >= 0x20 && b <= 0x7e) || b >= 0x80) {
      printable += 1
    }
  }
  return printable / limit > 0.85
}

function hasUtf8Bom(buffer) {
  return buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf
}

function isValidUtf8(buffer) {
  let i = 0
  while (i < buffer.length) {
    const byte1 = buffer[i]
    if (byte1 <= 0x7f) {
      i += 1
      continue
    }
    if (byte1 >= 0xc2 && byte1 <= 0xdf) {
      if (i + 1 >= buffer.length || !isContinuation(buffer[i + 1])) return false
      i += 2
      continue
    }
    if (byte1 >= 0xe0 && byte1 <= 0xef) {
      if (i + 2 >= buffer.length) return false
      const b2 = buffer[i + 1]
      const b3 = buffer[i + 2]
      if (!isContinuation(b2) || !isContinuation(b3)) return false
      if (byte1 === 0xe0 && b2 < 0xa0) return false
      if (byte1 === 0xed && b2 >= 0xa0) return false
      i += 3
      continue
    }
    if (byte1 >= 0xf0 && byte1 <= 0xf4) {
      if (i + 3 >= buffer.length) return false
      const b2 = buffer[i + 1]
      const b3 = buffer[i + 2]
      const b4 = buffer[i + 3]
      if (!isContinuation(b2) || !isContinuation(b3) || !isContinuation(b4)) return false
      if (byte1 === 0xf0 && b2 < 0x90) return false
      if (byte1 === 0xf4 && b2 > 0x8f) return false
      i += 4
      continue
    }
    return false
  }
  return true
}

function looksLikeGbk(buffer) {
  let i = 0
  let multibyteCount = 0
  while (i < buffer.length) {
    const byte1 = buffer[i]
    if (byte1 <= 0x7f) {
      i += 1
      continue
    }
    if (byte1 < 0x81 || byte1 > 0xfe) return false
    if (i + 1 >= buffer.length) return false
    const byte2 = buffer[i + 1]
    const validSecond = (byte2 >= 0x40 && byte2 <= 0xfe && byte2 !== 0x7f)
    if (!validSecond) return false
    multibyteCount += 1
    i += 2
  }
  return multibyteCount > 0
}

function isContinuation(byte) {
  return byte >= 0x80 && byte <= 0xbf
}

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '')
}

function hashFile(filePath) {
  return fs.readFile(filePath).then((buf) => crypto.createHash('sha256').update(buf).digest('hex'))
}

export async function hashReportPair(repoRoot, libraryNameSlug) {
  const librariesDir = path.join(repoRoot, REPORTS_ROOT, 'libraries')
  const reportHash = await hashFile(path.join(librariesDir, `${libraryNameSlug}.json`))
  const summaryHash = await hashFile(path.join(repoRoot, REPORTS_ROOT, 'phase-summary.json'))
  return { reportHash, summaryHash }
}

async function runCli(argv) {
  const args = new Set(argv.slice(2))
  const repoRootArg = argv.find((v) => v.startsWith('--repo-root='))
  const repoRoot = repoRootArg ? path.resolve(repoRootArg.split('=')[1]) : DEFAULT_REPO_ROOT
  const write = args.has('--write')
  const check = args.has('--check')
  const strictGate = check
  const result = await runConversion({ repoRoot, write, strictGate })
  console.log(JSON.stringify(result.summary, null, 2))
}

if (isDirectExecution()) {
  runCli(process.argv).catch((error) => {
    console.error(error.message)
    process.exit(1)
  })
}

function isDirectExecution() {
  if (!process.argv[1]) return false
  return path.resolve(process.argv[1]) === __filename
}
