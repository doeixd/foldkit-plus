// @vitest-environment jsdom
/**
 * `Timer.configure`, `ColorPicker.configure` and `Toast.configure`: the base,
 * the named preset and the call, each over the last, `words` merging word by
 * word; and the words the three draw, which `labels` and `closeLabel` once were.
 */
import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { ColorPicker, Timer, Toast } from '../src/index.js'
import { h, message, type TestMessage } from './fixture.js'

const noop = () => message('Clicked')

describe('Timer.configure', () => {
  const App = Timer.configure({
    base: { units: ['minutes', 'seconds'], words: { start: 'Commencer', reset: 'Remise' } },
    presets: { hundredths: { units: ['seconds', 'milliseconds'] } },
  })
  const model = Timer.init({ id: 'round' })
  type More = Partial<Timer.TimerView<TestMessage>> & { readonly preset?: 'hundredths' }
  const draw = (more: More = {}) =>
    App.view({ model, onMessage: noop, label: 'Manche', ...more }, h)
  const units = (html: ReturnType<typeof draw>) =>
    Inert.byRole(html, 'timer').map(timer => Inert.text(timer))
  const presses = (html: ReturnType<typeof draw>) =>
    Inert.byTag(html, 'button').map(button => Inert.text(button))

  it('draws the base, then a preset over it, then the call over both', () => {
    expect(units(draw())).toEqual(['00:00'])
    expect(units(draw({ preset: 'hundredths' }))).toEqual(['00:000'])
    expect(units(draw({ preset: 'hundredths', units: ['minutes'] }))).toEqual(['00'])
  })

  it('merges words word by word: a call changes one and keeps the base’s others', () => {
    expect(presses(draw())).toEqual(['Commencer', 'Remise'])
    expect(presses(draw({ words: { start: 'Go' } }))).toEqual(['Go', 'Remise'])
    // A word the base never named is the widget's own default.
    const started = Timer.update(model, Timer.Message.Acted({ action: 'start', at: 0 })).model
    expect(presses(draw({ model: started }))).toEqual(['Pause', 'Remise'])
  })
})

describe('ColorPicker.configure', () => {
  const swatches = [{ label: 'Ink', value: ColorPicker.color('#111827') }]
  const App = ColorPicker.configure({
    base: { presets: swatches, words: { presets: 'Palette' } },
    presets: { opaque: { alpha: false } },
  })
  const model = ColorPicker.init({ id: 'ink' })
  type More = Partial<ColorPicker.ColorPickerView<TestMessage>> & { readonly preset?: 'opaque' }
  const draw = (more: More = {}) => App.view({ model, onMessage: noop, label: 'Ink', ...more }, h)
  const sliders = (html: ReturnType<typeof draw>) =>
    Inert.byTag(html, 'input').filter(input => Inert.value(input, 'type') === 'range').length

  it('draws the swatches and words of the base, and a preset’s own option over it', () => {
    const shown = draw()
    expect(
      Inert.byTag(shown, 'input')
        .filter(input => Inert.value(input, 'type') === 'radio')
        .map(radio => Inert.value(radio, 'aria-label')),
    ).toEqual(['Ink'])
    expect(
      Inert.byRole(shown, 'radiogroup').map(group => Inert.value(group, 'aria-label')),
    ).toEqual(['Palette'])
    // The hue and the alpha track; a preset without alpha draws one less.
    expect(sliders(draw({ preset: 'opaque' }))).toBe(sliders(shown) - 1)
  })

  it('reads its own words where none is given', () => {
    const plain = ColorPicker.view({ model, onMessage: noop, label: 'Ink', presets: swatches }, h)
    expect(
      Inert.byRole(plain, 'radiogroup').map(group => Inert.value(group, 'aria-label')),
    ).toEqual([ColorPicker.words.presets])
  })
})

describe('Toast.configure and Toast.words', () => {
  const model = Toast.show(Toast.init('notices'), { title: 'Saved' }).model
  type More = Partial<Toast.ToastViewOptions<TestMessage>> & { readonly preset?: 'quiet' }
  const App = Toast.configure({
    base: { words: { label: 'Alertes', close: 'Fermer' } },
    presets: { quiet: { label: 'Silencieux' } },
  })
  const draw = (more: More = {}) => App.view({ model, onMessage: noop, ...more }, h)
  const landmark = (html: ReturnType<typeof draw>) =>
    Inert.byRole(html, 'region').map(region => Inert.value(region, 'aria-label'))
  const closeName = (html: ReturnType<typeof draw>) =>
    Inert.byTag(html, 'button').map(button => Inert.value(button, 'aria-label'))

  it('names the stack and its close button from the words, a given label winning', () => {
    expect(landmark(draw())).toEqual(['Alertes'])
    expect(closeName(draw())).toEqual(['Fermer'])
    expect(landmark(draw({ preset: 'quiet' }))).toEqual(['Silencieux'])
    expect(landmark(draw({ label: 'Mine' }))).toEqual(['Mine'])
  })

  it('has English defaults for each word', () => {
    const plain = Toast.view({ model, onMessage: noop }, h)
    expect(landmark(plain)).toEqual([Toast.words.label])
    expect(closeName(plain)).toEqual([Toast.words.close])
  })
})
