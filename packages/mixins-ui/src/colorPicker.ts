import { Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * An OKLCH color picker, Zag's color picker cut to the channels this repo's
 * palette is written in: a group named by its `label`, one native range per
 * channel (lightness, chroma, hue), each labelled and saying its value with
 * its unit, a `swatch` of the result and the result as text, and optionally
 * `presets` as a radio group of swatches. The browser gives the ranges and
 * radios their keys. The color is the application's: the view draws `value`
 * and sends `onChange` with the next one.
 *
 * The root carries the color as custom properties (`--fk-color` whole, and
 * `--fk-color-l`, `--fk-color-c`, `--fk-color-h`), so the recipe paints each
 * track's gradient from the other two channels; each `slider` says its
 * channel in `data-channel`. A `preset` carries its own `--fk-color`.
 */
export const ColorPickerSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  label: Slot.make({ capability: Capability.Container }),
  swatch: Slot.make({ capability: Capability.Base }),
  value: Slot.make({ capability: Capability.Container }),
  channel: Slot.make({ capability: Capability.Container }),
  channelLabel: Slot.make({ capability: Capability.Container }),
  slider: Slot.make({
    capability: Capability.Focusable,
    events: [Event.Input],
    attributes: [Attr.Disabled, Attr.Value],
  }),
  presets: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  preset: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Change],
    attributes: [Attr.AriaLabel, Attr.Disabled],
  }),
})

/** A color in OKLCH: lightness 0–100 (percent), chroma 0–0.4, hue 0–360 degrees. */
export const Oklch = Schema.Struct({ l: Schema.Number, c: Schema.Number, h: Schema.Number })
export type Oklch = typeof Oklch.Type

/** One of a color's three channels. */
export type Channel = keyof Oklch

const round = (value: number, places: number) => Number(value.toFixed(places))

const bounds = { l: [0, 100], c: [0, 0.4], h: [0, 360] } as const

/** Each channel's step, and how its value reads aloud. */
const channels: ReadonlyArray<{
  readonly key: Channel
  readonly step: number
  readonly spoken: (value: number) => string
}> = [
  { key: 'l', step: 0.5, spoken: value => `${round(value, 2)}%` },
  { key: 'c', step: 0.005, spoken: value => String(round(value, 4)) },
  { key: 'h', step: 1, spoken: value => `${round(value, 2)} degrees` },
]

/** `color` with `channel` set to `value`, held to the channel's range and rounded to four places. */
export const withChannel = (color: Oklch, channel: Channel, value: number): Oklch => {
  const [min, max] = bounds[channel]
  return { ...color, [channel]: round(Math.min(max, Math.max(min, value)), 4) }
}

/** `oklch(62.5% 0.15 250)`: lightness to two places, chroma to four, hue to two. */
export const format = (color: Oklch): string =>
  `oklch(${round(color.l, 2)}% ${round(color.c, 4)} ${round(color.h, 2)})`

const number = String.raw`[+-]?(?:\d+\.?\d*|\.\d+)`
const pattern = new RegExp(
  String.raw`^\s*oklch\(\s*(${number})(%?)\s+(${number})\s+(${number})(?:deg)?\s*\)\s*$`,
  'i',
)

/**
 * The color CSS text names, or none when it is not `oklch(L C H)` within the
 * picker's ranges. Lightness may be a percentage or CSS's 0–1 number; a hue
 * past a turn is brought into one. A color with alpha is none, since the
 * picker would drop it.
 */
export const parse = (text: string): Option.Option<Oklch> => {
  const match = pattern.exec(text)
  if (match === null) return Option.none()
  const [, lightness = '', percent, chroma = '', hue = ''] = match
  const l = percent === '%' ? Number(lightness) : round(Number(lightness) * 100, 4)
  const c = Number(chroma)
  const h = ((Number(hue) % 360) + 360) % 360
  return l >= bounds.l[0] && l <= bounds.l[1] && c >= bounds.c[0] && c <= bounds.c[1]
    ? Option.some({ l, c, h })
    : Option.none()
}

export interface ColorPickerPreset {
  /** The color's name, which its swatch reads aloud. */
  readonly label: string
  readonly value: Oklch
}

export interface ColorPickerView<Message> {
  /** Prefixes every id the picker draws, and names the presets as one group; unique on the page. */
  readonly id: string
  /** What the color is for, shown and naming the group. */
  readonly label: string
  readonly value: Oklch
  /** The Message for the next color; its type comes from `h`. */
  readonly onChange: (value: Oklch) => NoInfer<Message>
  /** The channels' names; default `Lightness`, `Chroma`, `Hue`. */
  readonly channelLabels?:
    | { readonly l: string; readonly c: string; readonly h: string }
    | undefined
  /** Colors one press away, drawn as a radio group of swatches; the one equal to `value` is checked. */
  readonly presets?: ReadonlyArray<ColorPickerPreset> | undefined
  /** The presets' group name; default `Presets`. */
  readonly presetsLabel?: string | undefined
  readonly disabled?: boolean | undefined
  /** A style of `ColorPickerSlots`, for the look. */
  readonly style?: NamedStyle<typeof ColorPickerSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

const defaultLabels = { l: 'Lightness', c: 'Chroma', h: 'Hue' } as const

const same = (left: Oklch, right: Oklch) =>
  left.l === right.l && left.c === right.c && left.h === right.h

export const view = <Message>(options: ColorPickerView<Message>, h: HtmlBuilder<Message>): Html => {
  const builders = SlotView.buildersFor(
    ColorPickerSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const color = options.value
  const disabled = options.disabled === true
  const labels = options.channelLabels ?? defaultLabels
  const labelId = `${options.id}-label`
  const presets = options.presets ?? []

  return h.div(
    builders.root.attrs([
      h.Role('group'),
      h.AriaLabelledBy(labelId),
      h.Style({
        '--fk-color': format(color),
        '--fk-color-l': `${color.l}%`,
        '--fk-color-c': String(color.c),
        '--fk-color-h': String(color.h),
      }),
    ]),
    [
      h.span(builders.label.attrs([h.Id(labelId)]), [options.label]),
      // The text beside it says the color; the swatch only shows it.
      h.div(builders.swatch.attrs([h.AriaHidden(true)]), []),
      h.span(builders.value.attrs(), [format(color)]),
      ...channels.map(channel => {
        const inputId = `${options.id}-${channel.key}`
        return h.div(builders.channel.attrs([h.Key(channel.key)]), [
          h.label(builders.channelLabel.attrs([h.For(inputId)]), [labels[channel.key]]),
          h.input(
            builders.slider.attrs([
              h.Id(inputId),
              h.Type('range'),
              h.DataAttribute('channel', channel.key),
              // The bounds and step before the value, so the browser does not clamp it to the default range.
              h.Min(String(bounds[channel.key][0])),
              h.Max(String(bounds[channel.key][1])),
              h.Step(String(channel.step)),
              h.Value(String(color[channel.key])),
              h.AriaValuetext(channel.spoken(color[channel.key])),
              ...(disabled
                ? [h.Disabled(true)]
                : [
                    h.OnInput(text =>
                      options.onChange(withChannel(color, channel.key, Number(text))),
                    ),
                  ]),
            ]),
          ),
        ])
      }),
      ...(presets.length === 0
        ? []
        : [
            h.div(
              builders.presets.attrs([
                h.Role('radiogroup'),
                h.AriaLabel(options.presetsLabel ?? 'Presets'),
              ]),
              presets.map(preset =>
                h.input(
                  builders.preset.attrs([
                    h.Key(preset.label),
                    h.Type('radio'),
                    // An attribute, not `h.Name`'s client-only property, so server markup groups the radios too.
                    h.Attribute('name', `${options.id}-presets`),
                    h.AriaLabel(preset.label),
                    h.Checked(same(preset.value, color)),
                    h.Style({ '--fk-color': format(preset.value) }),
                    ...(disabled
                      ? [h.Disabled(true)]
                      : [h.OnChange(() => options.onChange(preset.value))]),
                  ]),
                ),
              ),
            ),
          ]),
    ],
  )
}
