/**
 * Labels on a real page, read from computed style and layout: the required
 * marker is in the error ink and the optional one muted, a disabled label is
 * dimmed, an invalid one reads in the error ink, and a trailing drawing
 * stands beside the label on its line, not under it.
 */
import { Schema } from 'effect'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Layers, Style } from 'foldkit-mixins'
import { Defaults } from 'foldkit-mixins/defaults'
import { Theme } from 'foldkit-mixins/theme'
import { afterEach, expect, test, vi } from 'vitest'
import { Label, LabelSlots, Recipes } from '../src/index.js'
import { unitKnobs } from './fixture.js'

const theme = Theme.standard(Theme.make({ ...unitKnobs, accent: { hue: 265, chroma: 0.16 } }))
const style = Style.forSlots(LabelSlots)(Recipes.Label({}))
const Model = Schema.Struct({})

afterEach(() => {
  document.head.querySelectorAll('style[data-test]').forEach(element => element.remove())
  document.body.replaceChildren()
})

const mount = async () => {
  const sheet = document.createElement('style')
  sheet.dataset['test'] = ''
  sheet.textContent =
    Style.stylesheet(
      Layers.standard.declare,
      Layers.standard.in('reset', Defaults.reset),
      Layers.standard.in('theme', Theme.root(theme)),
    ) + style.css
  document.head.append(sheet)
  const container = document.createElement('div')
  container.id = 'label-browser'
  document.body.appendChild(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: {} }),
      update: (model: typeof Model.Type) => ({ model }),
      view: (_: unknown, h: HtmlBuilder<never>) =>
        h.div(
          [],
          [
            h.div([h.Id('plain')], [Label.view({ for: 'a', text: 'Plain', style }, h)]),
            h.div(
              [h.Id('required')],
              [Label.view({ for: 'a', text: 'Name', required: true, style }, h)],
            ),
            h.div(
              [h.Id('optional')],
              [Label.view({ for: 'a', text: 'Nick', optional: true, style }, h)],
            ),
            h.div(
              [h.Id('off')],
              [Label.view({ for: 'a', text: 'Locked', disabled: true, style }, h)],
            ),
            h.div(
              [h.Id('bad')],
              [Label.view({ for: 'a', text: 'Email', invalid: true, style }, h)],
            ),
            h.div(
              [h.Id('beside')],
              [
                Label.view(
                  { for: 'a', text: 'Key', trailing: h.span([h.Id('help')], ['?']), style },
                  h,
                ),
              ],
            ),
            h.span([h.Id('error-ink'), h.Style({ color: 'var(--fk-error-ink)' })], []),
            h.span([h.Id('muted'), h.Style({ color: 'var(--fk-text-muted)' })], []),
            h.span([h.Id('overt'), h.Style({ color: 'var(--fk-text-overt)' })], []),
          ],
        ),
    }),
  )
  await vi.waitFor(() => expect(document.getElementById('beside')).not.toBeNull())
  return handle
}

const colorOf = (element: Element) => getComputedStyle(element).color
const inkOf = (id: string) => colorOf(document.getElementById(id)!)
const labelIn = (id: string) => document.getElementById(id)!.querySelector('label')!

test('a required marker is in the error ink and an optional one is muted', async () => {
  const handle = await mount()
  try {
    expect(colorOf(labelIn('required').querySelector('span')!)).toBe(inkOf('error-ink'))
    expect(colorOf(labelIn('optional').querySelector('span')!)).toBe(inkOf('muted'))
    // The text itself stays in the label's own ink.
    expect(colorOf(labelIn('required'))).toBe(inkOf('overt'))
  } finally {
    handle.dispose()
  }
})

test('a disabled label is dimmed, and an invalid one reads in the error ink', async () => {
  const handle = await mount()
  try {
    expect(Number(getComputedStyle(labelIn('off')).opacity)).toBeLessThan(1)
    expect(Number(getComputedStyle(labelIn('plain')).opacity)).toBe(1)
    expect(colorOf(labelIn('bad'))).toBe(inkOf('error-ink'))
    expect(colorOf(labelIn('plain'))).toBe(inkOf('overt'))
  } finally {
    handle.dispose()
  }
})

test('a trailing drawing stands beside the label on the same line, with the label’s room below moved to the row', async () => {
  const handle = await mount()
  try {
    const label = labelIn('beside').getBoundingClientRect()
    const help = document.getElementById('help')!.getBoundingClientRect()
    expect(help.left).toBeGreaterThanOrEqual(label.right)
    expect(Math.abs(help.top + help.height / 2 - (label.top + label.height / 2))).toBeLessThan(2)
    expect(getComputedStyle(labelIn('beside')).marginBlockEnd).toBe('0px')
    expect(parseFloat(getComputedStyle(labelIn('plain')).marginBlockEnd)).toBeGreaterThan(0)
    expect(
      parseFloat(getComputedStyle(labelIn('beside').parentElement!).marginBlockEnd),
    ).toBeGreaterThan(0)
  } finally {
    handle.dispose()
  }
})
