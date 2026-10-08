import fs from 'node:fs/promises'
import path from 'node:path'

const REMEDIATION_ARTIFACTS_ROOT = '.planning/phases/03-x64-adaptation-dual-arch-gates/reports/remediation-artifacts'

export async function runAbiProbes({
  repoRoot,
  libraryName,
  libraryRoot,
  x64ArtifactPath,
  x86ArtifactPath,
  evidenceDir
}) {
  const slug = slugify(libraryName)
  const remediationProbePath = path.join(repoRoot, REMEDIATION_ARTIFACTS_ROOT, slug, 'abi-probe.json')
  const remediationProbe = await readJsonIfExists(remediationProbePath)

  const pointerWidth = {
    x64Bytes: remediationProbe?.pointerWidth?.x64Bytes ?? (x64ArtifactPath ? 8 : null),
    x86Bytes: remediationProbe?.pointerWidth?.x86Bytes ?? (x86ArtifactPath ? 4 : null)
  }

  const structLayoutAlignment = remediationProbe?.structLayoutAlignment ?? null
  const callbackSignature = remediationProbe?.callbackSignature ?? null

  const evidenceInputs = [
    x64ArtifactPath ? path.relative(repoRoot, x64ArtifactPath) : null,
    x86ArtifactPath ? path.relative(repoRoot, x86ArtifactPath) : null,
    remediationProbe ? path.relative(repoRoot, remediationProbePath) : null,
    libraryRoot ? path.relative(repoRoot, libraryRoot) : null
  ].filter(Boolean)

  const evidence = {
    library: libraryName,
    pointerWidth,
    structLayoutAlignment,
    callbackSignature,
    evidenceInputs,
    generatedAt: new Date().toISOString()
  }

  await fs.mkdir(evidenceDir, { recursive: true })
  const evidencePath = path.join(evidenceDir, `${slug}.json`)
  await fs.writeFile(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`, 'utf8')
  return { evidence, evidencePath }
}

function slugify(name) {
  return name.trim().toLowerCase().replace(/[^a-z0-9\u4e00-\u9fff]+/g, '-').replace(/^-+|-+$/g, '')
}

async function readJsonIfExists(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8')
    return JSON.parse(raw)
  } catch {
    return null
  }
}
