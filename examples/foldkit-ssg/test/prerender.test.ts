// @vitest-environment jsdom
/**
 * The pages the build writes, read back through an HTML parser, as a browser
 * reads them: a server markup the parser rebuilds differently is one the
 * browser cannot adopt.
 */
import { describe, expect, test } from 'vitest'

import { stylesheet } from '../src/style.js'
import { generate, template } from './helpers.js'

const BUILD_ID = 'test-build'

const parse = (html: string): Document => new DOMParser().parseFromString(html, 'text/html')

const rootOf = (page: Document): HTMLElement => {
  const root = page.querySelector<HTMLElement>('[data-foldkit-app]')
  if (root === null) throw new Error('no rendered application')
  return root
}

/** The envelope off a served page, as the browser reads it. */
const envelopeOf = (page: Document): unknown =>
  JSON.parse(rootOf(page).getAttribute('data-foldkit-plus-resume') ?? '')

describe('the generated pages', () => {
  test('are one per prerendered path, written where a static host serves it', async () => {
    const pages = await generate(template, BUILD_ID)
    expect(pages.map(page => [page.path, page.file])).toEqual([
      ['/', 'index.html'],
      ['/about', 'about/index.html'],
    ])
  })

  test.each([
    ['/', 'Home | Static Generation | Foldkit', 'Statically generated home', { _tag: 'Home' }],
    [
      '/about',
      'About | Static Generation | Foldkit',
      'Statically generated about page',
      { _tag: 'About' },
    ],
  ])('%s carries its title, its content and its route', async (path, title, heading, route) => {
    const pages = await generate(template, BUILD_ID)
    const page = parse(pages.find(each => each.path === path)?.html ?? '')
    expect(page.title).toBe(title)
    expect(page.getElementById('page-title')?.textContent).toBe(heading)
    expect(envelopeOf(page)).toMatchObject({ plan: 'ssg', state: { route }, route: path })
  })

  test('is the markup a parser builds from it', async () => {
    for (const { html } of await generate(template, BUILD_ID)) {
      expect(html).toContain(rootOf(parse(html)).outerHTML)
    }
  })

  test('is stamped with the build both sides were compiled as', async () => {
    const [home] = await generate(template, BUILD_ID)
    expect(rootOf(parse(home.html)).getAttribute('data-foldkit-build')).toBe(BUILD_ID)
  })

  test('styles its first paint: the stylesheet and every class it draws, with every token they read', async () => {
    for (const { html } of await generate(template, BUILD_ID)) {
      const page = parse(html)
      const css = Array.from(page.head.querySelectorAll('style'), style => style.textContent).join(
        '',
      )
      expect(
        Array.from(page.head.querySelectorAll('style')).filter(
          style => style.textContent === stylesheet,
        ),
      ).toHaveLength(1)
      const drawn = new Set(
        Array.from(page.body.querySelectorAll('[class]')).flatMap(element =>
          Array.from(element.classList),
        ),
      )
      expect(drawn.size).toBeGreaterThan(0)
      expect([...drawn].filter(name => !css.includes(`.${name}{`))).toEqual([])
      const read = new Set(
        [...`${css}${page.body.innerHTML}`.matchAll(/var\((--fk-[\w-]+)\)/g)].map(
          ([, name]) => name,
        ),
      )
      expect([...read].filter(name => !css.includes(`${name}:`))).toEqual([])
    }
  })
})
