/**
 * Writes packages' `.tsbuild/build` declarations, unchecked, before tsdown
 * runs. With TypeScript 7, tsdown emits a package's declarations with
 * `tsc -p tsconfig.json --noCheck`, which reads each referenced package from
 * these outputs; where they are missing, the imports resolve to nothing, the
 * TS6305 errors that say so are suppressed, and the emitter writes `any` for
 * what it cannot resolve (`declare const Query: any`) and names it never
 * declares (`Root_1`) (#340). Checking is `pnpm typecheck`'s job, and a later
 * checked `tsc -b` still checks what this wrote.
 *
 *   node scripts/declarations.mjs                  every package
 *   node scripts/declarations.mjs <package-dir>    what that package's tsdown reads
 *
 * A package's own `build` runs the second form, so no build order emits from
 * missing references; once the first form has run, it finds them up to date.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const asked = process.argv.slice(2)

/** A project path a `references` entry names: a config file, or a directory holding `tsconfig.json`. */
const projectOf = (from, path) => {
  const target = resolve(dirname(from), path)
  return target.endsWith('.json') ? target : join(target, 'tsconfig.json')
}

/** The package's build project and every project its `tsconfig.json` references. */
const projectsOf = dir => {
  const config = join(dir, 'tsconfig.json')
  const { references = [] } = JSON.parse(readFileSync(config, 'utf8'))
  return [
    join(dir, 'tsconfig.build.json'),
    ...references.map(({ path }) => projectOf(config, path)),
  ]
}

const projects =
  asked.length === 0
    ? readdirSync(join(root, 'packages'))
        .map(dir => join(root, 'packages', dir, 'tsconfig.build.json'))
        .filter(existsSync)
    : asked.flatMap(dir => projectsOf(resolve(dir)))

const { status } = spawnSync(
  process.execPath,
  [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-b', ...projects, '--noCheck'],
  { cwd: root, stdio: 'inherit' },
)
process.exit(status ?? 1)
