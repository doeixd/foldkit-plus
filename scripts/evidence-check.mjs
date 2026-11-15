/**
 * Calls of `Evidence.issuer` outside the modules that produce evidence (#537).
 * A record's stamp says which producer made it, and only these modules may
 * make an issuer: anywhere else, a test could stamp what it typed by hand,
 * and `Module.validate` would count it as a check, a walk or a scenario.
 *
 * Every code file under `packages`, `examples` and `scripts` is read, tests
 * included. Blind spots, kept simple on purpose: an issuer reached through an
 * alias (`const { issuer } = Evidence`) or a computed member is not seen.
 *
 *   node scripts/evidence-check.mjs [root]   list findings; exit 1 if there are any
 */
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

/** The modules that may make an issuer, each with why. */
export const producers = {
  'packages/entity/src/laws.ts': '`Laws.check` issues `Enumerated`',
  'packages/remote/src/walk.ts': '`Walk.run` issues `Walked`',
  'packages/remote/src/scenario.ts': '`Scenario.run` issues `Scenario`',
  'packages/metadata/test/evidence.test.ts': 'tests the issuer itself',
}

const call = /\bEvidence\s*\.\s*issuer\s*\(/
const code = /\.(?:ts|tsx|mts|cts|js|mjs|cjs)$/
const skipped = new Set(['node_modules', 'dist', '.tsbuild', '.git'])

const filesUnder = dir =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (skipped.has(entry.name)) return []
    const path = join(dir, entry.name)
    if (entry.isDirectory()) return filesUnder(path)
    return code.test(entry.name) && !entry.name.endsWith('.d.ts') ? [path] : []
  })

/** Each `path:line` under `root` calling `Evidence.issuer` outside `producers`. */
export const issuerFindings = root =>
  ['packages', 'examples', 'scripts']
    .map(dir => join(root, dir))
    .filter(existsSync)
    .flatMap(filesUnder)
    .flatMap(file => {
      const path = relative(root, file).replaceAll('\\', '/')
      if (Object.hasOwn(producers, path)) return []
      return readFileSync(file, 'utf8')
        .split(/\r?\n/)
        .flatMap((line, index) => (call.test(line) ? [`${path}:${index + 1}`] : []))
    })

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const root = process.argv[2] ?? fileURLToPath(new URL('..', import.meta.url))
  const findings = issuerFindings(root)
  for (const finding of findings) console.log(finding)
  if (findings.length > 0) {
    console.error(
      `\n${findings.length} issuers outside the producers. Evidence comes from Laws.check, Walk.run, Scenario.run or Evidence.runtimeOnly (see scripts/evidence-check.mjs).`,
    )
    process.exit(1)
  }
}
