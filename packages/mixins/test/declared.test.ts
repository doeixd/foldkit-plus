/**
 * The short forms of a Style: a declarations object for `Style.self`, a list
 * for `Style.compose`, Slots declared by their style, an application's setup
 * fixed once, and the utility pieces over the shipped scales.
 */
import { describe, expect, it } from 'vitest'
import { Capability, Event, Layers, Slot, Style, type Piece } from '../src/index.js'
import { AppStyle } from '../src/app.js'
import { Defaults } from '../src/defaults.js'
import { Theme } from '../src/theme.js'
import { Utilities as U } from '../src/utilities.js'
import { FieldSlots } from './fixture.js'

const L = Layers.standard

describe('a piece as written', () => {
  it('reads a declarations object as Style.self, and a list as Style.compose', () => {
    const written = Style.forSlots(FieldSlots)({
      root: { color: 'red' },
      input: [Style.class('field'), { color: 'red' }, { color: 'blue', gap: '1px' }],
    })
    const spelled = Style.forSlots(FieldSlots)({
      root: Style.self({ color: 'red' }),
      input: Style.compose(
        Style.class('field'),
        Style.self({ color: 'red' }),
        Style.self({ color: 'blue', gap: '1px' }),
      ),
    })
    expect(written.css).toBe(spelled.css)
    expect(written.pieces).toEqual(spelled.pieces)
    expect(written.pieces.input?.classes).toEqual(['field'])
  })

  it('draws nothing for an empty declarations object', () => {
    const style = Style.forSlots(FieldSlots)({ root: {} })
    expect(style.pieces.root).toBe(Style.empty)
    expect(style.css).toBe('')
  })

  it('takes the short forms in when, whenInput and perItem too', () => {
    expect(Style.when(true, { color: 'red' }).rules).toEqual(Style.self({ color: 'red' }).rules)
    const conditional = Style.whenInput((dark: boolean) => dark, [{ color: 'red' }])
    expect(conditional.conditions?.[0]?.piece.rules).toEqual(Style.self({ color: 'red' }).rules)
    const perItem = Style.perItem(item => ({ '--row': String(item.index) }))
    expect(perItem.items?.[0]?.({ index: 2 }).rules).toEqual(Style.self({ '--row': '2' }).rules)
  })

  it('tells a StyleValue from declarations by its brand, not its keys', () => {
    const lookalike = { classes: ['x'], style: {} }
    // A declarations object with a StyleValue's keys compiles as declarations.
    // @ts-expect-error `classes` is not a CSS property.
    const style = Style.forSlots(FieldSlots)({ root: lookalike })
    expect(style.pieces.root?.classes).toEqual([])
    expect(style.rules).toHaveLength(1)
  })
})

describe('Style.slots', () => {
  const Page = Style.slots({
    root: { display: 'grid' },
    form: Style.slot({ events: [Event.Submit] }, { gap: '1rem' }),
    field: Style.slot({ capability: Capability.TextInput }),
  })

  it('declares a Container per piece, and the options a Style.slot gives', () => {
    expect(Page.slots.root.name).toBe('root')
    expect(Page.slots.root.capability).toBe(Capability.Container)
    expect(Page.slots.form.capability).toBe(Capability.Container)
    expect(Page.slots.form.events).toEqual([Event.Submit])
    expect(Page.slots.field.capability).toBe(Capability.TextInput)
    expect(Object.keys(Page.slots)).toEqual(['root', 'form', 'field'])
  })

  it('styles each declared slot as forSlots would', () => {
    const spelled = Style.forSlots(Page.slots)({
      root: Style.self({ display: 'grid' }),
      form: Style.self({ gap: '1rem' }),
    })
    expect(Page.style.css).toBe(spelled.css)
    expect(Page.style.pieces.field).toBe(Style.empty)
  })

  it('passes the layer and name through', () => {
    const layered = Style.slots({ root: { color: 'red' } }, { name: 'Page', layer: L.layer('app') })
    expect(layered.style.name).toBe('Page')
    expect(layered.style.css).toContain('@layer app{')
  })

  it('keeps a slot named like an Object.prototype key', () => {
    const odd = Style.slots({ constructor: { color: 'red' }, ['__proto__']: { color: 'blue' } })
    expect(Object.keys(odd.slots)).toEqual(['constructor', '__proto__'])
    expect(Slot.is(odd.slots.__proto__)).toBe(true)
    expect(Object.keys(odd.style.pieces)).toEqual(['constructor', '__proto__'])
  })
})

describe('AppStyle', () => {
  const palette = Theme.oklch({ accent: { h: 260, c: 0.21, l: '62%' } })

  it('writes the page stylesheet every application wrote by hand', () => {
    const app = AppStyle.make({ palette, colorScheme: 'light' })
    expect(app.stylesheet).toBe(
      Style.stylesheet(
        L.declare,
        L.in('reset', Defaults.reset),
        L.in('tokens', Theme.root(Theme.tokens, { colorScheme: 'light' })),
        L.in('theme', Theme.root(palette, { omit: Theme.tokens, colorScheme: 'light' })),
        L.in('defaults', Defaults.body),
      ),
    )
  })

  it('lets the palette override a shipped token, in the later layer', () => {
    const app = AppStyle.make({
      palette: Theme.compose(palette, Theme.define({ knob: { density: '0.8' } })),
    })
    const theme = app.stylesheet.slice(app.stylesheet.indexOf('@layer theme{'))
    expect(theme).toContain('--fk-knob-density:0.8')
    expect(app.theme.knob.density).toBe('0.8')
    expect(app.t.surface.base).toBe('var(--fk-surface-base)')
    expect(app.stylesheet).toContain('color-scheme:light dark')
  })

  it('adds global pieces to the defaults layer, after the body', () => {
    const app = AppStyle.make({ palette, global: [Defaults.headings] })
    const defaults = app.stylesheet.slice(app.stylesheet.indexOf('@layer defaults{'))
    expect(defaults.indexOf(':where(body)')).toBeGreaterThan(-1)
    expect(defaults.indexOf(':where(h1)')).toBeGreaterThan(defaults.indexOf(':where(body)'))
  })

  it('compiles every style it makes in the app layer', () => {
    const app = AppStyle.make({ palette })
    const Page = app.slots({ root: { color: app.t.text.muted } }, { name: 'Page' })
    const Field = app.forSlots(FieldSlots)({ root: { color: 'red' } })
    expect(Page.style.name).toBe('Page')
    expect(Page.style.css).toMatch(/^@layer app\{\.style-\w+\{color:var\(--fk-text-muted\)\}\}$/)
    expect(Field.css).toMatch(/^@layer app\{/)
  })
})

describe('Utilities', () => {
  const css = (piece: Piece): string =>
    Style.forSlots(FieldSlots)({ root: piece }).css.replace(/\.style-\w+/, '.x')

  it.each([
    [U.p('md'), 'padding:var(--fk-space-md)'],
    [U.px('0'), 'padding-inline:0'],
    [U.py('2xs'), 'padding-block:var(--fk-space-2xs)'],
    [U.mx('auto'), 'margin-inline:auto'],
    [U.gap('sm'), 'gap:var(--fk-space-sm)'],
    [U.text('4xl'), 'font-size:var(--fk-size-4xl)'],
    [U.font('bold'), 'font-weight:var(--fk-weight-bold)'],
    [U.leading('tight'), 'line-height:var(--fk-leading-tight)'],
    [U.rounded('full'), 'border-radius:var(--fk-radius-full)'],
    [U.color('accent.on-fill'), 'color:var(--fk-accent-on-fill)'],
    [U.bg('surface.base'), 'background:var(--fk-surface-base)'],
    [U.items('start'), 'align-items:flex-start'],
    [U.justify('between'), 'justify-content:space-between'],
    [U.column, 'display:flex;flex-direction:column'],
    [U.truncate, 'overflow:hidden;text-overflow:ellipsis;white-space:nowrap'],
    [
      U.srOnly,
      'border:0;clip:rect(0, 0, 0, 0);height:1px;margin:-1px;overflow:hidden;padding:0;position:absolute;white-space:nowrap;width:1px',
    ],
  ])('%# writes %s', (piece, declarations) => {
    expect(css(piece)).toBe(`.x{${declarations}}`)
  })

  it('names only tokens the shipped theme defines', () => {
    const app = AppStyle.make({ palette: Theme.oklch({ accent: { h: 0, c: 0, l: '50%' } }) })
    const read = css([U.p('3xs'), U.text('xs'), U.rounded('xl'), U.bg('error.subtle')]).match(
      /--fk-[\w-]+/g,
    )
    expect(read?.filter(name => !app.stylesheet.includes(`${name}:`))).toEqual([])
  })

  it('composes into one class, with a plain declaration after it winning', () => {
    const style = Style.forSlots(FieldSlots)({ root: [U.flex, U.gap('sm'), { gap: '2px' }] })
    expect(style.rules).toHaveLength(1)
    expect(style.css).toMatch(/gap:var\(--fk-space-sm\)\}.*gap:2px\}$/)
  })
})

describe('Style.install outside a browser', () => {
  it('throws rather than dropping the sheet', () => {
    expect(() => Style.install('body{}')).toThrow('Style.install needs a browser document')
  })
})
