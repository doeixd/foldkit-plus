/// <reference types="@vitest/browser-playwright" />
/**
 * The desktop page in a real browser, answered by the port's own `/remote`
 * in process: the filter triggers' colours are readable `rgb()`, as
 * upstream's contrast check reads them, and the TLD dropdown opens as a tab
 * stop whose click-away stands over the header. A phone's layout is the
 * e2e's (`e2e/dev.e2e.ts`): in this frame narrowed to a phone the list
 * measured itself into a loop of reads the served page never makes.
 */
import { Option } from 'effect'
import type { Html, HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { fromString } from 'foldkit/url'
import { Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Remote } from 'foldkit-remote'
import { afterEach, expect, it, vi } from 'vitest'
import { userEvent } from 'vitest/browser'
import { Model, init, subscriptions, update, type Message } from '../src/client/app.js'
import { stylesheet } from '../src/server/sheet.js'
import { view } from '../src/client/view.js'
import { serveRemote } from '../src/server/remote.js'

const answered = { timeout: 20_000 }
// A test outlasts its waits: each waits up to `answered` for the page's reads,
// and the prune comparison reads every property of every element twice. The
// release job runs every file in one unsharded run, where the default 15 s ran
// out (run 43218652067).
vi.setConfig({ testTimeout: 60_000 })

let dispose = () => {}
afterEach(() => {
  dispose()
  document.body.replaceChildren()
})

/** The page at `/?q=<query>`, its reads answered by the Worker's own `/remote`. */
const mount = async (query: string, css = stylesheet) => {
  const sheet = Style.install(css)
  const container = document.createElement('div')
  container.id = 'domains-test'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => init(Option.getOrThrow(fromString(`http://domains.test/?q=${query}`))),
      update,
      view: (model: Model, h: HtmlBuilder<Message>): Html => view(model, h).body,
      subscriptions,
      resources: Remote.clientLayer(
        Remote.http('/remote', {
          fetch: (_url, request) =>
            serveRemote(new Request('http://domains.test/remote', request), undefined),
        }),
      ),
    }),
  )
  dispose = () => {
    handle.dispose()
    // A sheet left in the head would define every token for the next test's pruned one.
    sheet.remove()
  }
  await vi.waitUntil(() => document.querySelector('.domain-card .price'), answered)
  return sheet
}

const element = <E extends Element = HTMLElement>(selector: string): E => {
  const found = document.querySelector<E>(selector)
  if (found === null) throw new Error(`nothing matches ${selector}`)
  return found
}

/** WCAG's contrast of two opaque `rgb()` colours; anything else is refused, as upstream's check refuses it. */
const contrast = (foreground: string, background: string): number => {
  const luminance = (color: string) => {
    const match = /^rgb\((\d+), (\d+), (\d+)\)$/.exec(color)
    if (match === null) throw new Error(`not an opaque rgb() colour: ${color}`)
    const [red, green, blue] = match.slice(1).map(channel => {
      const normalized = Number(channel) / 255
      return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4
    })
    return 0.2126 * red! + 0.7152 * green! + 0.0722 * blue!
  }
  const [lighter, darker] = [luminance(foreground), luminance(background)].sort((a, b) => b - a)
  return (lighter! + 0.05) / (darker! + 0.05)
}

it('draws every filter trigger in readable rgb() colours', async () => {
  await mount('acme')
  const triggers = [...document.querySelectorAll('.filters .filter-trigger')]
  // The three desktop dropdowns and the phone's TLD opener.
  expect(triggers).toHaveLength(4)
  for (const trigger of triggers) {
    const style = getComputedStyle(trigger)
    expect(contrast(style.color, style.backgroundColor)).toBeGreaterThanOrEqual(4.5)
  }
})

it('opens the TLD dropdown as a tab stop whose click-away stands over the header', async () => {
  await mount('acme')
  await userEvent.click(element('#tld-filter-button'))
  const panel = await vi.waitUntil(
    () => document.querySelector<HTMLElement>('#tld-filter-items'),
    answered,
  )
  expect(panel.querySelectorAll('[role="option"]')).toHaveLength(557)
  // Its 557 rows scroll inside it: a keyboard reaches it as upstream's.
  expect(panel.getAttribute('tabindex')).toBe('0')
  expect(document.elementFromPoint(8, 8)?.classList.contains('filter-backdrop')).toBe(true)
  await userEvent.click(element('.filter-backdrop'), { position: { x: 8, y: 8 } })
  await vi.waitUntil(() => document.querySelector('#tld-filter-items') === null, answered)
})

it('draws every element the same with the sheet pruned to the tokens it reads (#487)', async () => {
  // As the build ships it, `vite.config.ts`'s `prune`: every class, then the prune.
  const full = Style.complete(stylesheet)
  const sheet = await mount('acme', full)
  await userEvent.click(element('#tld-filter-button'))
  await vi.waitUntil(() => document.querySelector('#tld-filter-items'), answered)
  // The dropdown's 557 rows are one row drawn many times: read the first few
  // and any chosen or active one, so the comparison fits a slow runner.
  const rows = Array.from(document.querySelectorAll('#tld-filter-items [role="option"]'))
  const read = new Set(
    rows.filter(
      (row, index) =>
        index < 8 ||
        row.getAttribute('aria-selected') === 'true' ||
        row.hasAttribute('data-active'),
    ),
  )
  const sampled = (node: Element) => {
    const row = node.closest('#tld-filter-items [role="option"]')
    return row === null || read.has(row)
  }
  // Custom properties excluded: the pruned ones are absent by design.
  const drawn = () =>
    Array.from(document.body.querySelectorAll('*'), node => node)
      .filter(sampled)
      .map(node => {
        const style = getComputedStyle(node)
        return Array.from(style)
          .filter(property => !property.startsWith('--'))
          .map(property => `${property}: ${style.getPropertyValue(property)}`)
          .join('; ')
      })
  const settled = async () => {
    // A font landing or a transition running between the two reads would
    // change what is drawn, not the prune: the sheet holds the `@font-face`,
    // so new text loads the face again, and the open dropdown's chevron turns.
    await Promise.all(Array.from(document.fonts, face => face.load()))
    await Promise.all(document.getAnimations().map(animation => animation.finished))
  }
  await settled()
  const before = drawn()
  sheet.textContent = Inert.prune(full)
  await settled()
  const after = drawn()
  expect(after.filter((style, index) => style !== before[index])).toEqual([])
  expect(sheet.textContent.length).toBeLessThan(full.length * 0.6)
})
