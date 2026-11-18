/**
 * Frame: a tray that holds panels, with a heading, an action and a note
 * where it has them, a recipe that stands the tray off the page and sets its
 * spacing and corners, and `configure` for one look bound once.
 */
import { describe, expect, it } from 'vitest'
import { Capability, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { FrameSlots, configure, view } from '../src/frame.js'
import { Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const style = Style.forSlots(FrameSlots)(Recipes.Frame({}))
const panels = ['One', 'Two', 'Three'].map(text => h.p([], [text]))

describe('FrameSlots', () => {
  it('publishes containers and nothing stateful', () => {
    expect(Object.keys(FrameSlots)).toEqual([
      'root',
      'header',
      'title',
      'description',
      'action',
      'panels',
      'panel',
      'footer',
    ])
    for (const slot of Object.values(FrameSlots)) {
      expect(slot.capability).toBe(Capability.Container)
    }
  })
})

describe('Frame view', () => {
  it('draws each panel in a panel of its own, in order', () => {
    const drawn = view({ panels, style }, h)
    const tray = Inert.children(drawn)[0]
    const cells = Inert.children(tray)
    expect(cells.map(cell => Inert.text(cell))).toEqual(['One', 'Two', 'Three'])
    // Each is the panel's own element, styled as a surface, around what was handed in.
    for (const cell of cells) {
      expect(Inert.classes(cell).length).toBeGreaterThan(0)
      expect(Inert.children(cell)).toHaveLength(1)
    }
    // Without a header or footer the tray is all there is.
    expect(Inert.children(drawn)).toHaveLength(1)
  })

  it('draws only the header regions it was given, the title as a heading of its level', () => {
    const titled = view({ panels, title: 'Alerts', headingLevel: 2, style }, h)
    expect(Inert.byTag(titled, 'h2')).toHaveLength(1)
    expect(Inert.byTag(titled, 'p').map(node => Inert.text(node))).toEqual(['One', 'Two', 'Three'])
    const full = view(
      {
        panels,
        title: 'Alerts',
        description: 'Three of them',
        action: h.span([], ['Edit']),
        style,
      },
      h,
    )
    expect(Inert.byTag(full, 'h3')).toHaveLength(1)
    expect(Inert.text(full)).toContain('Three of them')
    expect(Inert.text(full)).toContain('Edit')
  })

  it('draws the footer after the panels', () => {
    const drawn = view({ panels, footer: h.span([], ['Updated now']), style }, h)
    const regions = Inert.children(drawn)
    expect(Inert.text(regions[regions.length - 1]!)).toBe('Updated now')
  })
})

describe('Frame recipe', () => {
  const css = (selection: Parameters<typeof Recipes.Frame>[0]): string =>
    Style.forSlots(FrameSlots)(Recipes.Frame(selection)).css

  it('stands the tray off the page by its variant', () => {
    expect(css({})).toContain('background:var(--fk-surface-muted)')
    // The panels' own hairline is in every sheet; the outline variant adds the tray's.
    const lines = (sheet: string) => sheet.split('border:var(--fk-border-thin) solid').length - 1
    expect(lines(css({ variant: 'outline' }))).toBe(lines(css({})) + 1)
    expect(css({ variant: 'outline' })).not.toContain('background:var(--fk-surface-muted)')
    expect(css({ variant: 'plain' })).toContain('padding:0')
  })

  it('sets spacing and corners once, for the tray and its panels', () => {
    expect(css({ spacing: 'roomy' })).toContain('--_fk-frame-pad:var(--fk-space-md)')
    expect(css({ radius: 'none' })).toContain('--_fk-frame-radius:0px')
    expect(css({})).toContain(
      'border-radius:max(var(--fk-radius-sm), calc(var(--_fk-frame-radius) - var(--_fk-frame-pad)))',
    )
  })

  it('gives each panel a hairline of its own', () => {
    expect(css({})).toContain('border:var(--fk-border-thin) solid var(--fk-outline-subtle)')
  })
})

describe('Frame.configure', () => {
  const roomy = Style.forSlots(FrameSlots)(Recipes.Frame({ spacing: 'roomy' }))
  const App = configure({
    base: { style, headingLevel: 4 },
    presets: { roomy: { style: roomy } },
  })

  it('binds the look and heading level once, and a preset or the call wins', () => {
    const classes = (drawn: ReturnType<typeof view>) => Inert.classes(drawn)
    expect(classes(App.view({ panels, title: 'T' }, h))).toEqual(
      classes(view({ panels, title: 'T', style }, h)),
    )
    expect(Inert.byTag(App.view({ panels, title: 'T' }, h), 'h4')).toHaveLength(1)
    expect(classes(App.view({ panels, title: 'T', preset: 'roomy' }, h))).toEqual(
      classes(view({ panels, title: 'T', style: roomy }, h)),
    )
    expect(Inert.byTag(App.view({ panels, title: 'T', headingLevel: 2 }, h), 'h2')).toHaveLength(1)
    expect(classes(view({ panels, style }, h))).not.toEqual(
      classes(view({ panels, style: roomy }, h)),
    )
  })
})
