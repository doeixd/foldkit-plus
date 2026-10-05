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

  test('draws a card for each demo, with its steps and its links', async () => {
    const { pages } = await generate()
    const page = new DOMParser().parseFromString(pages[0]?.html ?? '', 'text/html')
    const cards = Array.from(page.querySelectorAll('main > ul > li'))
    expect(cards.map(card => card.querySelector('h2')?.textContent)).toEqual(
      demos.map(demo => demo.title),
    )
    cards.forEach((card, index) => {
      const demo = demos[index]!
      expect(card.querySelector('h2 a')?.getAttribute('href')).toBe(demo.url)
      const open = Array.from(card.querySelectorAll('a')).find(
        a => a.textContent === 'Open the demo',
      )
      expect(open?.getAttribute('href')).toBe(demo.url)
      expect(Array.from(card.querySelectorAll('ol li'), li => li.textContent)).toEqual(
        demo.tryThis.map(step => `${step.title} ${step.text}`),
      )
      const links = Array.from(card.querySelectorAll('a'), a => a.getAttribute('href'))
      expect(links).toContain(onGitHub(demo.readFirst))
      expect(links).toEqual(
        expect.arrayContaining(demo.packages.map(name => onGitHub(`packages/${name}/README.md`))),
      )
    })
  })
})
