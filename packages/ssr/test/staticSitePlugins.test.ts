/**
 * `staticSite`'s `plugins` are what the build's own server loads the site module
 * with: the application's plugins are not otherwise there, so a transform that
 * changes what a view draws (Foldkit's view-identity branding) reaches the
 * client's bundle but not the pages unless the site passes it.
 */
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, expect, it } from 'vitest'
import { buildFixtureSite } from './staticSiteFixture.js'
import { dir } from './fixtureDir.js'

const outDir = 'dist-fixture-plugins'

afterAll(() => {
  rmSync(join(dir, outDir), { recursive: true, force: true })
})

it('loads the site module with the plugins it is given', async () => {
  const out = await buildFixtureSite(outDir, {
    name: 'rewrite-about',
    transform: (code, id) =>
      id.endsWith('app.ts') ? code.replaceAll('The about page', 'The rewritten about page') : null,
  })
  expect(readFileSync(join(out, 'about/index.html'), 'utf8')).toContain('The rewritten about page')
}, 240_000)
