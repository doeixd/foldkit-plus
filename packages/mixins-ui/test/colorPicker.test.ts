/**
 * The color picker as markup and as a Model. The markup: a group named by its
 * label, the area's thumb a slider saying both its values, hue and alpha
 * Sliders, the format and the text, the eyedropper only where asked, presets
 * as radios. The Model: each key and point decided from the color `update`
 * holds, the draft committed only when it names a color, and the eyedropper
 * a Command. `parse` reads every format `format` writes.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { A11y, Attr, Capability, Event, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { ColorPicker, ColorPickerSlots, Recipes } from '../src/index.js'
import { message, type TestMessage } from './fixture.js'

const style = Style.forSlots(ColorPickerSlots)(Recipes.ColorPicker({}))
const blue = ColorPicker.color('#3b82f6')
const presets = [
  { label: 'Blue', value: blue },
  { label: 'Rose', value: ColorPicker.color('#f43f5e') },
]
const model = ColorPicker.init({ id: 'accent', color: blue })

interface More {
  readonly model?: ColorPicker.Model
  readonly disabled?: boolean
  readonly alpha?: boolean
  readonly eyedropper?: boolean
}

// Drawn through `Inert.draw`, which alone marks the Slots that `bySlot` and `unslotted` read.
const Picker = SlotView.forMessages<TestMessage>().define(ColorPickerSlots, (more: More, _, h) =>
  ColorPicker.view(
    {
      model,
      label: 'Accent',
      onMessage: () => message('Clicked'),
      presets,
      eyedropper: true,
      style,
      ...more,
    },
    h,
  ),
)
const drawn = (more: More = {}) => Inert.draw(Picker, more)

const ranges = (picker: ReturnType<typeof drawn>) =>
  Inert.byTag(picker, 'input').filter(node => Inert.value(node, 'type') === 'range')

const step = (from: ColorPicker.Model, sent: ColorPicker.Message) =>
  ColorPicker.update(from, sent).model

/**
 * The slots Patterns.ColorPicker should name once the hand-off lands there:
 * the area's thumb and the text field replace the three channel ranges.
 */
const pattern = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role] },
  label: { capability: Capability.Container },
  areaThumb: {
    capability: Capability.Focusable,
    events: [Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaLabel],
  },
  input: { capability: Capability.TextInput, events: [Event.Input, Event.Change] },
  preset: {
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaLabel],
    optional: true,
  },
})

describe('ColorPicker.view', () => {
  it('meets the color picker pattern', () => {
    expect(A11y.validate(pattern, ColorPickerSlots)).toEqual([])
  })

  it('is a group named by its label, its area one slider saying both values', () => {
    const picker = drawn()
    const [group] = Inert.byRole(picker, 'group')
    const [label] = Inert.bySlot(picker, 'label')
    expect(Inert.value(group, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    const [thumb] = Inert.bySlot(picker, 'areaThumb')
    expect(Inert.value(thumb, 'role')).toBe('slider')
    expect(Inert.value(thumb, 'aria-label')).toBe('Saturation and brightness')
    expect(Inert.value(thumb, 'aria-valuenow')).toBe('76')
    expect(Inert.value(thumb, 'aria-valuetext')).toBe('Saturation 76%, Brightness 96%')
    expect(Inert.value(thumb, 'tabindex')).toBe(0)
    expect(typeof thumb?.data?.on?.['keydown']).toBe('function')
  })

  it('draws nothing outside a Slot but the format’s options', () => {
    expect(Inert.unslotted(drawn()).filter(path => !path.endsWith('option'))).toEqual([])
  })

  it('draws hue and alpha as Sliders, in degrees and in percent', () => {
    const [hue, alpha, ...rest] = ranges(drawn())
    expect(rest).toEqual([])
    expect([Inert.value(hue, 'max'), Inert.value(hue, 'value')]).toEqual(['360', '217'])
    expect(Inert.value(hue, 'aria-valuetext')).toBe('217 degrees')
    expect([Inert.value(alpha, 'max'), Inert.value(alpha, 'value')]).toEqual(['100', '100'])
    const channels = Inert.bySlot(drawn(), 'channel')
    expect(channels.map(channel => Inert.value(channel, 'data-channel'))).toEqual(['hue', 'alpha'])
  })

  it('leaves alpha out when the color is opaque by design', () => {
    expect(ranges(drawn({ alpha: false }))).toHaveLength(1)
  })

  it('draws the eyedropper only when asked', () => {
    expect(Inert.bySlot(drawn(), 'eyedropper')).toHaveLength(1)
    expect(Inert.bySlot(drawn({ eyedropper: false }), 'eyedropper')).toEqual([])
  })

  it('sets the color on the root as the paint the recipe reads', () => {
    const [group] = Inert.byRole(drawn(), 'group')
    const paint = Inert.style(group)
    expect(paint['--fk-color']).toBe('rgb(59 130 246)')
    expect(paint['--fk-color-hue']).toBe('hsl(217 100% 50%)')
    expect([paint['--fk-color-x'], paint['--fk-color-y']]).toEqual(['0.7602', '0.0353'])
    expect(paint['--fk-color-area']).toContain('hsl(217 100% 50%)')
  })

  it('shows the color in its format, or the draft while one is typed, marked when it names none', () => {
    const shown = (from: ColorPicker.Model) => Inert.bySlot(drawn({ model: from }), 'input')[0]
    expect(Inert.value(shown(model), 'value')).toBe('#3b82f6')
    const rgb = step(model, ColorPicker.Message.ChangedFormat({ format: 'rgb' }))
    expect(Inert.value(shown(rgb), 'value')).toBe('rgb(59 130 246)')
    const typing = step(model, ColorPicker.Message.TypedText({ text: '#f0' }))
    expect(Inert.value(shown(typing), 'value')).toBe('#f0')
    expect(Inert.value(shown(typing), 'aria-invalid')).toBe('true')
    const fine = step(model, ColorPicker.Message.TypedText({ text: '#f00' }))
    expect(Inert.value(shown(fine), 'aria-invalid')).toBeUndefined()
    const [format] = Inert.bySlot(drawn({ model: rgb }), 'format')
    expect(Inert.value(format, 'value')).toBe('rgb')
  })

  it('draws the presets as radios under one name, the one equal to the color checked', () => {
    const [group] = Inert.byRole(drawn(), 'radiogroup')
    const radios = Inert.byTag(group, 'input')
    expect(radios.map(radio => Inert.value(radio, 'aria-label'))).toEqual(['Blue', 'Rose'])
    expect(new Set(radios.map(radio => Inert.value(radio, 'name')))).toEqual(
      new Set(['accent-presets']),
    )
    expect(radios.map(radio => Inert.value(radio, 'checked'))).toEqual([true, false])
  })

  it('listens on nothing when disabled, and takes no keys on the area', () => {
    const picker = drawn({ disabled: true })
    const controls = [
      ...Inert.byTag(picker, 'input'),
      ...Inert.byTag(picker, 'select'),
      ...Inert.byTag(picker, 'button'),
    ]
    expect(controls.map(control => Inert.value(control, 'disabled'))).toEqual(
      Array(controls.length).fill(true),
    )
    expect(controls.some(control => Object.keys(control.data?.on ?? {}).length > 0)).toBe(false)
    const [thumb] = Inert.bySlot(picker, 'areaThumb')
    expect(Inert.value(thumb, 'tabindex')).toBeUndefined()
    expect(Inert.value(thumb, 'aria-disabled')).toBe('true')
  })
})

describe('ColorPicker.update', () => {
  const at = (s: number, v: number) =>
    ColorPicker.init({ id: 'a', color: { h: 200, s, v, alpha: 1 } })

  it.each([
    ['ArrowRight', false, 0.51, 0.5],
    ['ArrowLeft', true, 0.4, 0.5],
    ['ArrowUp', false, 0.5, 0.51],
    ['ArrowDown', true, 0.5, 0.4],
    ['PageUp', false, 0.5, 0.6],
    ['PageDown', true, 0.4, 0.5],
    ['Home', false, 0, 0.5],
    ['End', false, 1, 0.5],
  ] as const)('%s (shift %s) moves the area to %s, %s', (key, shift, s, v) => {
    const { color } = step(at(0.5, 0.5), ColorPicker.Message.PressedAreaKey({ key, shift }))
    expect([color.s, color.v]).toEqual([s, v])
  })

  it('steps each key from the color before it, as keys faster than a frame arrive', () => {
    const keys = Array(3).fill(ColorPicker.Message.PressedAreaKey({ key: 'ArrowUp', shift: false }))
    expect(keys.reduce(step, at(0.5, 0.5)).color.v).toBe(0.53)
  })

  it('keeps the area inside its edges, and its Model when nothing moves', () => {
    const top = at(1, 1)
    expect(step(top, ColorPicker.Message.PressedAreaKey({ key: 'End', shift: false }))).toBe(top)
    expect(step(top, ColorPicker.Message.PressedAreaKey({ key: 'Tab', shift: false }))).toBe(top)
  })

  it('takes a point of the area as saturation across and brightness up, held inside', () => {
    const { color } = step(at(0, 0), ColorPicker.Message.PointedArea({ x: 0.25, y: 1.5 }))
    expect([color.h, color.s, color.v]).toEqual([200, 0.25, 0])
  })

  it('sets the hue in degrees and alpha in percent', () => {
    const hue = step(model, ColorPicker.Message.ChangedHue({ hue: 30 })).color
    expect(hue.h).toBe(30)
    expect(step(model, ColorPicker.Message.ChangedAlpha({ alpha: 40 })).color.alpha).toBe(0.4)
  })

  it('commits a draft that names a color, and drops one that names none', () => {
    const typed = step(model, ColorPicker.Message.TypedText({ text: 'rgb(255 0 0 / 50%)' }))
    expect(typed.color).toBe(model.color)
    const red = step(typed, ColorPicker.Message.CommittedText())
    expect(ColorPicker.format(red.color, 'hex')).toBe('#ff000080')
    expect(red.draft).toEqual(Option.none())
    const wrong = step(
      step(model, ColorPicker.Message.TypedText({ text: 'red-ish' })),
      ColorPicker.Message.CommittedText(),
    )
    expect(wrong.color).toBe(model.color)
    expect(wrong.draft).toEqual(Option.none())
  })

  it('keeps its Model for a commit or a revert with nothing typed, and for the same format', () => {
    expect(step(model, ColorPicker.Message.CommittedText())).toBe(model)
    expect(step(model, ColorPicker.Message.RevertedText())).toBe(model)
    expect(step(model, ColorPicker.Message.ChangedFormat({ format: 'hex' }))).toBe(model)
  })

  it('drops the draft on a revert or a new format', () => {
    const typed = step(model, ColorPicker.Message.TypedText({ text: '#000' }))
    expect(step(typed, ColorPicker.Message.RevertedText()).draft).toEqual(Option.none())
    const hsl = step(typed, ColorPicker.Message.ChangedFormat({ format: 'hsl' }))
    expect([hsl.format, hsl.draft]).toEqual(['hsl', Option.none()])
  })

  it('opens the eyedropper as a Command, and keeps alpha through what it reads', () => {
    const pressed = ColorPicker.update(model, ColorPicker.Message.PressedEyedropper())
    expect(pressed.model).toBe(model)
    expect(pressed.commands?.map(command => command.name)).toEqual(['ColorPicker.Eyedrop'])
    const faint = step(model, ColorPicker.Message.ChangedAlpha({ alpha: 50 }))
    const read = step(faint, ColorPicker.Message.GotEyedropperColor({ hex: '#00ff00' }))
    expect(ColorPicker.format(read.color, 'hex')).toBe('#00ff0080')
    expect(step(model, ColorPicker.Message.CancelledEyedropper())).toBe(model)
  })

  it('keeps the hue through a grey', () => {
    const grey = step(
      step(model, ColorPicker.Message.TypedText({ text: '#808080' })),
      ColorPicker.Message.CommittedText(),
    )
    expect(grey.color.h).toBe(model.color.h)
  })
})

describe('ColorPicker.parse', () => {
  it.each(['hex', 'rgb', 'hsl', 'oklch'] as const)('reads back what %s writes', as => {
    for (const each of [blue, ColorPicker.color('#f43f5e80'), ColorPicker.color('#000000')]) {
      const read = ColorPicker.parse(ColorPicker.format(each, as))
      expect(Option.map(read, color => ColorPicker.format(color, as))).toEqual(
        Option.some(ColorPicker.format(each, as)),
      )
    }
  })

  it.each([
    ['#3b82f6', '#3b82f6'],
    ['3b82f6', '#3b82f6'],
    ['#FFF', '#ffffff'],
    ['#ffffff80', '#ffffff80'],
    ['rgb(59, 130, 246)', '#3b82f6'],
    ['rgba(59 130 246 / 50%)', '#3b82f680'],
    ['rgb(100% 0% 0%)', '#ff0000'],
    ['hsl(217deg 91% 60%)', '#3c83f6'],
    ['hsla(0, 100%, 50%, 0.5)', '#ff000080'],
    ['oklch(62.3% 0.188 259.8)', '#3b82f6'],
    ['OKLCH(0.623 0.188 259.8 / 0.5)', '#3b82f680'],
    ['oklch(90% 0.4 30)', '#ff0000'],
  ])('reads %j', (text, hex) => {
    expect(Option.map(ColorPicker.parse(text), color => ColorPicker.format(color, 'hex'))).toEqual(
      Option.some(hex),
    )
  })

  it.each([
    '#12',
    '#12345',
    'rgb(300 0 0)',
    'rgb(0 0)',
    'hsl(0 120% 50%)',
    'oklch(120% 0.1 20)',
    'blue',
    '',
  ])('is none for %j', text => {
    expect(ColorPicker.parse(text)).toEqual(Option.none())
  })

  it('gives a grey the hue it is handed, having none of its own', () => {
    expect(Option.map(ColorPicker.parse('#808080', 120), color => color.h)).toEqual(
      Option.some(120),
    )
  })
})

describe('ColorPicker.color', () => {
  it('throws on text that names no color, where it is written', () => {
    expect(() => ColorPicker.color('#ggg')).toThrow('not a color: #ggg')
  })
})

describe('ColorPicker.toOklch', () => {
  it('gives lightness in percent, as the theme takes it', () => {
    const { l, c, h: hue } = ColorPicker.toOklch(blue)
    expect([Math.round(l * 10) / 10, Math.round(c * 1000) / 1000, Math.round(hue)]).toEqual([
      62.3, 0.188, 260,
    ])
  })
})
