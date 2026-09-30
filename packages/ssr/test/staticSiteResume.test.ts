// @vitest-environment jsdom
/**
 * A page the `staticSite` plugin built resumes: its button answers without
 * a fresh `init`. The build runs in a plain Node child (`vite` cannot be
 * imported where a DOM realm owns the globals), then the about page loads
 * as the document and hydrates the way `handover.test.ts` does.
 */
import { execFileSync } from 'node:child_process'
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it, vi } from 'vitest'
import { SSR } from 'foldkit-ssr'
import { config, plan } from './fixture-site/src/app.js'
import { dir } from './fixtureDir.js'

const outDir = join(dir, 'dist-fixture-resume')

afterAll(() => {
  rmSync(outDir, { recursive: true, force: true })
})

/** Loads a served page as the document, as a browser would. */
const load = (page: string) => {
  const parsed = new DOMParser().parseFromString(page, 'text/html')
  document.documentElement.innerHTML = parsed.documentElement.innerHTML
}

it('resumes a page the plugin built', async () => {
  const root = join(dir, '..', '..', '..', '..')
  const bins = join(root, 'node_modules', '.bin')
  // The child prints the build's own log lines before the directory: the
  // directory is its last line.
  const lines = execFileSync(
    process.platform === 'win32' ? join(bins, 'tsx.cmd') : join(bins, 'tsx'),
    [join(dir, '..', 'runFixtureBuild.ts'), 'dist-fixture-resume'],
    {
      cwd: join(root, 'packages', 'ssr'),
      encoding: 'utf8',
      timeout: 240_000,
      // A `.cmd` is not directly executable.
      shell: process.platform === 'win32',
    },
  )
    .trim()
    .split('\n')
  const out = lines.at(-1)
  if (out === undefined) throw new Error('the fixture build printed nothing')
  load(readFileSync(join(out, 'about/index.html'), 'utf8'))
  // On the route the page was generated for: anything else is refused.
  window.history.replaceState({}, '', '/about')

  const button = document.querySelector('button')
  SSR.hydrate(config, plan, { buildId: 'fixture-build' })
  await vi.waitFor(() => expect(button?.textContent).toBe('Count: 0'))
  button?.click()
  await vi.waitFor(() => expect(button?.textContent).toBe('Count: 1'))
}, 240_000)
