/**
 * Writes every package's `.tsbuild/build` declarations, unchecked, before
 * tsdown runs. With TypeScript 7, tsdown emits a package's declarations with
 * `tsc -p tsconfig.json --noCheck`, which reads each referenced package from
 * these outputs; where they are missing, the imports resolve to nothing, the
 * TS6305 errors that say so are suppressed, and the emitter writes names it
 * never declares (`Root_1`). Checking is `pnpm typecheck`'s job, and a later
 * checked `tsc -b` still checks what this wrote.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const projects = readdirSync(join(root, 'packages'))
  .map(dir => join('packages', dir, 'tsconfig.build.json'))
  .filter(project => existsSync(join(root, project)))

const { status } = spawnSync(
  process.execPath,
  [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-b', ...projects, '--noCheck'],
  { cwd: root, stdio: 'inherit' },
)
process.exit(status ?? 1)
