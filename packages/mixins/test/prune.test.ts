/**
 * `Inert.prune` (#487): a sheet without the tokens nothing reads.
 */
import { describe, expect, it } from 'vitest'
import { Capability, Layers, Slot, Slots, Style } from '../src/index.js'
import { Inert } from '../src/testing.js'
import * as SlotView from '../src/slotView.js'
import { Theme } from '../src/theme.js'

/** The text of a sheet holding the theme's tokens. */
const sheetOf = (theme: Parameters<typeof Theme.root>[0]) =>
  Style.stylesheet(Layers.standard.declare, Layers.standard.in('theme', Theme.root(theme)))

describe('Inert.prune', () => {
  it.each([
    [
      'a token a rule reads',
      ':root{--fk-a:1px;--fk-b:2px}.x{margin:var(--fk-a)}',
      ':root{--fk-a:1px;}.x{margin:var(--fk-a)}',
    ],
    [
      'a token read with a fallback',
      ':root{--fk-a:1px;--fk-b:2px}.x{margin:var(--fk-a, 0)}',
      ':root{--fk-a:1px;}.x{margin:var(--fk-a, 0)}',
    ],
    ['the last declaration of a rule', '.x{margin:0;--fk-b:2px}', '.x{margin:0;}'],
    [
      'a token only a kept token reads, and not one only a dropped token reads',
      ':root{--fk-a:var(--fk-b);--fk-b:calc(var(--fk-c) * 2);--fk-c:1px;--fk-d:var(--fk-e);--fk-e:3px}.x{margin:var(--fk-a)}',
      ':root{--fk-a:var(--fk-b);--fk-b:calc(var(--fk-c) * 2);--fk-c:1px;}.x{margin:var(--fk-a)}',
    ],
    [
      'every definition of a read token, under each theme',
      ':root{--fk-a:1px;--fk-b:2px}[data-theme=dark]{--fk-a:3px;--fk-b:4px}.x{margin:var(--fk-a)}',
      ':root{--fk-a:1px;}[data-theme=dark]{--fk-a:3px;}.x{margin:var(--fk-a)}',
    ],
    [
      "an unread token's registration",
      '@property --fk-a{syntax:"<length>";inherits:true;initial-value:0px}@property --fk-b{syntax:"<length>";inherits:true;initial-value:0px}:root{--fk-a:1px;--fk-b:2px}.x{margin:var(--fk-a)}',
      '@property --fk-a{syntax:"<length>";inherits:true;initial-value:0px}:root{--fk-a:1px;}.x{margin:var(--fk-a)}',
    ],
    [
      'a value whose string holds a semicolon',
      ':root{--fk-b:"a;b";--fk-a:1px}.x{margin:var(--fk-a)}',
      ':root{--fk-a:1px}.x{margin:var(--fk-a)}',
    ],
    [
      'a value whose parentheses hold a semicolon',
      ':root{--fk-b:url(data:image/svg+xml;utf8,x);--fk-a:1px}.x{margin:var(--fk-a)}',
      ':root{--fk-a:1px}.x{margin:var(--fk-a)}',
    ],
    [
      'a token another custom property reads',
      ':root{--fk-a:1px;--fk-b:2px}.x{--local:var(--fk-a)}',
      ':root{--fk-a:1px;}.x{--local:var(--fk-a)}',
    ],
    [
      'the tokens a script reads by name',
      ':root{--fk-knob-motion:1;--fk-knob-travel:1;--fk-b:2}',
      ':root{--fk-knob-motion:1;--fk-knob-travel:1;}',
    ],
  ])('keeps %s', (_, css, pruned) => {
    expect(Inert.prune(css)).toBe(pruned)
  })

  it('keeps what `keep` names, by name or as `Theme.ref` writes it', () => {
    const css = ':root{--fk-a:1px;--fk-b:var(--fk-c);--fk-c:2px;--fk-d:3px}'
    expect(Inert.prune(css, { keep: ['--fk-a', 'var(--fk-b)'] })).toBe(
      ':root{--fk-a:1px;--fk-b:var(--fk-c);--fk-c:2px;}',
    )
  })

  it('refuses a `keep` entry that names no token', () => {
    expect(() => Inert.prune('', { keep: ['surface.overt'] })).toThrow(/names no --fk- token/)
  })

  it('leaves every token the standard theme reads of itself defined', () => {
    const theme = Theme.standard(Theme.make({}))
    const css = `${sheetOf(theme)}.x{color:${Theme.ref(theme).text.default}}`
    const pruned = Inert.prune(css)
    const defined = (name: string) => pruned.includes(`${name}:`)
    const reads = Array.from(pruned.matchAll(/var\((--fk-[\w-]+)\)/g), ([, name]) => name ?? '')
    expect(reads.filter(name => !defined(name))).toEqual([])
    expect(defined('--fk-text-default')).toBe(true)
    expect(pruned.length).toBeLessThan(css.length / 4)
  })

  // A view reads a token inline: nothing in the sheet does, so pruning takes it.
  const theme = Theme.standard(Theme.make({}))
  const overt = Theme.ref(theme).surface.overt
  const Page = { slots: Slots.define({ root: Slot.make({ capability: Capability.Container }) }) }
  const drawnReading = (value: string) =>
    Inert.draw(
      SlotView.forMessages<never>().define(Page.slots, (_: void, slots, h) =>
        h.main(slots.root.attrs(value === '' ? [] : [h.Style({ background: value })]), []),
      ),
      undefined,
    )

  it('takes a token a view reads inline unless kept, which missingTokens reports', () => {
    const css = sheetOf(theme)
    const tree = drawnReading(overt)
    expect(Inert.missingTokens(tree, css)).toEqual([])
    expect(Inert.missingTokens(tree, Inert.prune(css))).toEqual([overt.slice(4, -1)])
    expect(Inert.missingTokens(tree, Inert.prune(css, { keep: [overt] }))).toEqual([])
  })
})
