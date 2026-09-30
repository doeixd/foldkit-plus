/**
 * S7: a fixture site built with the `staticSite` plugin serves each path
 * with its text, its styles and its envelope, beside the sitemap and
 * robots text. A real `vite build` of the fixture, then its pages read
 * back. (Resuming a built page is `staticSiteResume.test.ts`: the build
 * must run in Node, while resuming needs a DOM.)
 */
import { readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'
import { fileFor } from 'foldkit-ssr/vite'
import { buildFixtureSite } from './staticSiteFixture.js'
import { dir } from './fixtureDir.js'

const outDir = 'dist-fixture'

afterAll(() => {
  rmSync(join(dir, outDir), { recursive: true, force: true })
})

const read = (out: string, file: string): string => readFileSync(join(out, file), 'utf8')

it('builds the fixture site through the plugin', async () => {
  const out = await buildFixtureSite(outDir)

  const about = read(out, 'about/index.html')
  const home = read(out, 'index.html')
  // Each path with its text...
  expect(about).toContain('The about page')
  expect(about).toContain('<title>About | Fixture</title>')
  expect(home).toContain('The home page')
  // ...its styles for the first paint...
  expect(about).toContain('.fixture-first-paint')
  // ...and its envelope, on the root the browser adopts (both pages: the
  // envelope is per page, not per site).
  expect(about).toContain('data-foldkit-app')
  expect(about).toContain('data-foldkit-plus-resume')
  expect(home).toContain('data-foldkit-app')
  expect(home).toContain('data-foldkit-plus-resume')
  // Beside the pages: the sitemap naming them, and robots naming it.
  const sitemap = read(out, 'sitemap.xml')
  expect(sitemap).toContain('<loc>https://fixture.test/about</loc>')
  expect(sitemap).toContain('<loc>https://fixture.test/</loc>')
  expect(sitemap).toContain('<lastmod>2026-09-27</lastmod>')
  expect(read(out, 'robots.txt')).toContain('Sitemap: https://fixture.test/sitemap.xml')
}, 240_000)

describe('fileFor', () => {
  it.each([
    ['/', 'directory', 'index.html'],
    ['/', 'flat', 'index.html'],
    ['/about', 'directory', 'about/index.html'],
    ['/about', 'flat', 'about.html'],
    ['/about/', 'directory', 'about/index.html'],
    ['/about/', 'flat', 'about.html'],
    ['/x.html', 'directory', 'x.html'],
    ['/x.html', 'flat', 'x.html'],
    ['/site/blog/x', 'directory', 'site/blog/x/index.html'],
    ['/site/blog/x', 'flat', 'site/blog/x.html'],
  ] as const)('maps %s in %s layout to %s', (path, layout, file) => {
    expect(fileFor(path, layout)).toBe(file)
  })
})
