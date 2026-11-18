/**
 * The Toolbar's tab stop as a Bundle, and `Toolbar.configure`: the stop is
 * placed in a field the application names and follows `Toolbar.focused`;
 * a configured toolbar draws its base and preset, and the call over both.
 */
import { Schema } from 'effect'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Bundles, Toolbar, ToolbarSlots } from '../src/index.js'
import { h, message } from './fixture.js'

const App = Bundle.compose({ bold: Schema.Boolean }).pipe(
  Bundle.withChild('bar', Bundles.Toolbar, { args: { current: 'italic' } }),
)
const update = App.placements.update(model => ({ model }))
const start = () => App.placements.initial({ bold: false }).model

describe('Bundles.Toolbar', () => {
  it('starts on the control its args name, or on none', () => {
    expect(start().bar).toEqual({ current: 'italic' })
    const Bare = Bundle.compose({}).pipe(Bundle.withChild('bar', Bundles.Toolbar, { args: {} }))
    expect(Bare.placements.initial({}).model.bar).toEqual({ current: null })
  })

  it('follows the control that took focus, through the placement', () => {
    const wrap = Toolbar.focused(message => App.Message.GotBarMessage({ message }))
    const moved = update(start(), wrap('underline')).model
    expect(moved.bar.current).toBe('underline')
  })

  it('answers a focus on the control that already holds the stop with the Model it was given', () => {
    const wrap = Toolbar.focused(message => App.Message.GotBarMessage({ message }))
    const model = start()
    expect(update(model, wrap('italic')).model).toBe(model)
  })
})

const quiet = Style.forSlots(ToolbarSlots)({ root: Style.class('quiet') })
const loud = Style.forSlots(ToolbarSlots)({ root: Style.class('loud') })
const marked = Style.forSlots(ToolbarSlots)({ root: Style.class('marked') })

const drawn = (view: ReturnType<typeof Toolbar.view>) => {
  const [root] = Inert.byRole(view, 'toolbar')
  return {
    classes: Inert.classes(root),
    orientation: Inert.value(root, 'aria-orientation'),
  }
}

const items = [{ id: 'bold', draw: () => h.span([], ['Bold']) }]
const common = {
  id: 'bar',
  label: 'Formatting',
  roving: { current: null },
  onFocus: () => message('Clicked'),
  items,
}

describe('Toolbar.configure', () => {
  const App = Toolbar.configure({
    base: { style: quiet, orientation: 'vertical', mixins: [marked.mixin] },
    presets: { loud: { style: loud, orientation: 'horizontal' }, plain: {} },
  })

  it('draws the base where the call names no preset', () => {
    expect(drawn(App.view(common, h))).toEqual({
      classes: ['quiet', 'marked'],
      orientation: 'vertical',
    })
  })

  it('draws the named preset over the base, and the call over both', () => {
    expect(drawn(App.view({ ...common, preset: 'loud' }, h))).toEqual({
      classes: ['loud', 'marked'],
      orientation: 'horizontal',
    })
    expect(drawn(App.view({ ...common, preset: 'loud', orientation: 'vertical' }, h))).toEqual({
      classes: ['loud', 'marked'],
      orientation: 'vertical',
    })
  })

  it('refuses a preset it was not given, at run time too', () => {
    // @ts-expect-error `lout` is no preset.
    expect(() => App.view({ ...common, preset: 'lout' }, h)).toThrow('no preset named "lout"')
  })
})
