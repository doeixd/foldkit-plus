// @vitest-environment jsdom
/**
 * The page the build writes, read back through an HTML parser as a browser
 * reads it: one card per demo, with its steps and its links, and the sitemap
 * naming the site's origin.
 */
import { Effect } from 'effect'
import { generateStaticSite } from 'foldkit-ssr/vite'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, test } from 'vitest'

import { demos, onGitHub } from '../src/demos.js'
import { site } from '../src/site.js'

const template = readFileSync(join(import.meta.dirname, '../index.html'), 'utf8')
const generate = () =>
  Effect.runPromise(generateStaticSite({ ...site, buildId: 'test-build', template }))

describe('the generated site', () => {
  test('is one page, at the root, with a sitemap naming the origin', async () => {
    const { pages, sitemap } = await generate()
    expect(pages.map(page => [page.path, page.file])).toEqual([['/', 'index.html']])
    expect(sitemap).toContain('<loc>https://foldkit-plus.pages.dev/</loc>')
  })

  test('draws a row for each demo, with the way in, its code and its packages', async () => {
    const { pages } = await generate()
    const page = new DOMParser().parseFromString(pages[0]?.html ?? '', 'text/html')
    const rows = Array.from(page.querySelectorAll('main > ul > li'))
    expect(rows.map(row => row.querySelector('h2')?.textContent)).toEqual(
      demos.map(demo => demo.title),
    )
    rows.forEach((row, index) => {
      const demo = demos[index]!
      const href = (text: string) =>
        Array.from(row.querySelectorAll('a'))
          .find(a => a.textContent === text)
          ?.getAttribute('href')
      expect(row.querySelector('h2 a')?.getAttribute('href')).toBe(demo.url)
      expect(href('Open')).toBe(demo.url)
      expect(href('Source')).toBe(onGitHub(demo.readFirst))
      expect(
        Array.from(row.querySelectorAll('[aria-label="Packages"] a'), a => a.getAttribute('href')),
      ).toEqual(demo.packages.map(name => onGitHub(`packages/${name}/README.md`)))
    })
  })
})
