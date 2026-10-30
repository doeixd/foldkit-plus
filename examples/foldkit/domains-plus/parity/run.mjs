/**
 * Runs upstream's Playwright suites against the port: copies
 * `examples/foldkit/domains/e2e` and the `src/shared` files its specs import
 * into `parity/.suite`, puts the ported `api.ts` in place of upstream's, and
 * runs `parity/playwright.config.ts`. Arguments go to `playwright test`.
 */
import { spawnSync } from 'node:child_process'
import { cpSync, rmSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = fileURLToPath(new URL('.', import.meta.url))
const upstream = fileURLToPath(new URL('../../domains/', import.meta.url))
const suite = `${here}.suite`

rmSync(suite, { recursive: true, force: true })
cpSync(`${upstream}e2e`, `${suite}/e2e`, { recursive: true })
cpSync(`${upstream}src/shared`, `${suite}/src/shared`, { recursive: true })
cpSync(`${here}api.ts`, `${suite}/e2e/api.ts`)

const result = spawnSync(
  'pnpm',
  [
    'exec',
    'playwright',
    'test',
    '--config',
    `${here}playwright.config.ts`,
    ...process.argv.slice(2),
  ],
  { stdio: 'inherit', shell: true, cwd: fileURLToPath(new URL('..', import.meta.url)) },
)
process.exit(result.status ?? 1)
