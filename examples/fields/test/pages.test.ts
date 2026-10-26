// @vitest-environment jsdom
/**
 * The gallery's pages as a browser would read them before any script: one per
 * recipe and an index linking each, every control holding the draft its stored
 * value fills.
 */
import { Effect, Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { gallery } from '../src/gallery.js'
import { read } from '../src/read.js'
import { pages } from '../src/render.js'

const readings = gallery.map(read)
const parsed = new Map(
  Effect.runSync(pages(readings)).map(([name, html]) => [
    name,
    new DOMParser().parseFromString(html, 'text/html'),
  ]),
)

describe('the gallery’s pages', () => {
  it('has a page for every recipe, each linked from the index', () => {
    expect([...parsed.keys()]).toEqual([
      'index.html',
      ...gallery.map(entry => `${entry.name}.html`),
    ])
    const links = Array.from(parsed.get('index.html')!.querySelectorAll('a'), link =>
      link.getAttribute('href'),
    )
    expect(links).toEqual(gallery.map(entry => `./${entry.name}.html`))
  })

  it.each(
    readings.flatMap(reading =>
      Option.match(reading.draft, {
        onNone: () => [],
        onSome: draft => [[reading.entry.name, draft] as const],
      }),
    ),
  )('serves %s’s control filled with %j', (name, draft) => {
    const page = parsed.get(`${name}.html`)!
    const control = page.querySelector('[name="value"]')!
    expect(control.getAttribute('value')).toBe(draft)
    expect(page.title).toBe(name)
  })

  it('serves the image key as kept, with no file input while it holds an image', () => {
    const page = parsed.get('image.html')!
    expect(page.querySelector('[role="status"]')?.textContent).toBe('An image of 1200 × 630')
    expect(page.querySelector('input[type="file"]')).toBeNull()
  })

  it('names each recipe’s failures on its page', () => {
    for (const entry of gallery) {
      const items = Array.from(
        parsed.get(`${entry.name}.html`)!.querySelectorAll('li'),
        item => item.textContent,
      )
      expect(items).toEqual(entry.failures)
    }
  })
})
