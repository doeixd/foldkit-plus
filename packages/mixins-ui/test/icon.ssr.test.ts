// @vitest-environment jsdom
/**
 * Icons rendered on a server, as a browser parses them: the drawing is SVG
 * with every attribute in the markup, hidden from assistive technology, and
 * two icons that both call a gradient `a` each paint their own.
 */
import { Effect } from 'effect'
import { injectIntoTemplate, renderToString } from 'foldkit/experimental/server'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Icon } from 'foldkit-media'
import { parse } from 'foldkit-media/icons'
import { expect, test } from 'vitest'

const gradient = (color: string) =>
  parse(
    `<svg viewBox="0 0 24 24" fill="none" stroke-width="2"><defs><linearGradient id="a"><stop offset="0" stop-color="${color}"/></linearGradient></defs><circle cx="12" cy="12" r="9" stroke="url(#a)"/></svg>`,
    color,
  )
const red = gradient('red')
const blue = gradient('blue')

const served = async (body: (h: HtmlBuilder<never>) => Html) => {
  const rendered = await Effect.runPromise(
    renderToString(
      {
        init: () => ({ model: {} }),
        view: (_: unknown, h: HtmlBuilder<never>) => ({ title: 'Icons', body: body(h) }),
      },
      { buildId: 'b' },
    ),
  )
  return new DOMParser().parseFromString(
    injectIntoTemplate(
      '<!doctype html><html><head><title></title></head><body><div id="root"></div></body></html>',
      rendered,
    ),
    'text/html',
  )
}

test('an icon is SVG in the markup, its root painting as the file did, hidden and 1em square', async () => {
  const page = await served(h => h.div([], [Icon.draw(red, h)]))
  const svg = page.querySelector('svg')!
  expect(svg.namespaceURI).toBe('http://www.w3.org/2000/svg')
  expect(
    ['viewBox', 'width', 'height', 'aria-hidden', 'fill', 'stroke-width'].map(name =>
      svg.getAttribute(name),
    ),
  ).toEqual(['0 0 24 24', '1em', '1em', 'true', 'none', '2'])
  const circle = svg.querySelector('circle')!
  expect(circle.namespaceURI).toBe('http://www.w3.org/2000/svg')
  expect(['cx', 'cy', 'r'].map(name => circle.getAttribute(name))).toEqual(['12', '12', '9'])
})

test('two icons with one id each paint from their own gradient, and a key parts two copies', async () => {
  const page = await served(h =>
    h.div([], [Icon.draw(red, h), Icon.draw(blue, h), Icon.draw(red, h, { key: 'menu' })]),
  )
  const svgs = [...page.querySelectorAll('svg')]
  const ids = svgs.map(svg => svg.querySelector('linearGradient')!.id)
  expect(new Set(ids).size).toBe(3)
  svgs.forEach((svg, at) => {
    expect(svg.querySelector('circle')!.getAttribute('stroke')).toBe(`url(#${ids[at]})`)
  })
  const [redStop, blueStop] = ids.map(id =>
    page.getElementById(id)!.querySelector('stop')!.getAttribute('stop-color'),
  )
  expect([redStop, blueStop]).toEqual(['red', 'blue'])
})
