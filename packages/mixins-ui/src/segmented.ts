import { Option } from 'effect'
import { Behaviors, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { RovingTabindex } from 'foldkit-primitives/interaction'
import { flipped } from './choices.js'
import { layered, type PresetOption, type Presets } from './configure.js'
import type { MixinList } from './resolve.js'
import { SegmentedSlots } from './segmented/slots.js'

export { fluid } from './segmented/fluid.js'
export { SegmentedSlots } from './segmented/slots.js'

/** One option of a segmented control: what it stands for, and its words. */
export interface SegmentedOption<Value extends string> {
  readonly value: Value
  /** Its words; with `iconOnly`, its accessible name and tooltip. */
  readonly label: string
  /** Drawn before the words, hidden from assistive technology. */
  readonly icon?: Html | undefined
  /** Draws the icon alone, a square option named by `label`. */
  readonly iconOnly?: boolean | undefined
  readonly disabled?: boolean | undefined
}

interface SegmentedCommon<Value extends string, Message> {
  readonly options: ReadonlyArray<SegmentedOption<Value>>
  /** The chosen values, as the application keeps them: at most one for a single choice. */
  readonly pressed: ReadonlyArray<Value>
  /** The Message a press, or an arrow key in a single choice, sends; its type comes from `h`. */
  readonly onPress: (value: Value) => NoInfer<Message>
  /** The group's accessible name: what the options choose. */
  readonly label: string
  /** Submits the chosen values under this name, one hidden input each, in the options' order. */
  readonly name?: string | undefined
  /** `vertical` stacks the options, which the recipe lays out; the arrow keys are as in a row. Default `horizontal`. */
  readonly orientation?: 'horizontal' | 'vertical' | undefined
  /** Every option is off and the group says so (`aria-disabled`); no key or press is taken. */
  readonly disabled?: boolean | undefined
  /** A style of `SegmentedSlots`, for the control's look. */
  readonly style?: NamedStyle<typeof SegmentedSlots> | undefined
  /** Mixins beside the style; `Segmented.fluid` glides a single choice's pill. */
  readonly mixins?: MixinList<Message> | undefined
}

/** One of the options: a radio group, whose arrows choose as they move. */
export interface SegmentedSingle<Value extends string, Message> extends SegmentedCommon<
  Value,
  Message
> {
  readonly multiple?: false | undefined
  /** Prefixes the ids the options draw, which the arrows move focus by; unique on the page. */
  readonly id: string
  /** Default `ltr`; `rtl` swaps ArrowLeft and ArrowRight. */
  readonly direction?: 'ltr' | 'rtl' | undefined
}

/** Any number of the options: a group of pressed buttons, each a tab stop. */
export interface SegmentedMultiple<Value extends string, Message> extends SegmentedCommon<
  Value,
  Message
> {
  readonly multiple: true
}

export type SegmentedView<Value extends string, Message> =
  | SegmentedSingle<Value, Message>
  | SegmentedMultiple<Value, Message>

/**
 * The pressed values after `value` is pressed. A single control keeps one
 * pressed, so pressing the pressed one changes nothing unless it is
 * `optional`; with `multiple`, a press turns its option on or off.
 */
export const toggled = <Value extends string>(
  pressed: ReadonlyArray<Value>,
  value: Value,
  options: { readonly multiple?: boolean; readonly optional?: boolean } = {},
): ReadonlyArray<Value> => {
  const on = pressed.includes(value)
  if (options.multiple === true) return flipped(pressed, value)
  if (!on) return [value]
  return options.optional === true ? [] : pressed
}

/**
 * A segmented control in one call: the options in a group, each label also in
 * `data-label` so turning semibold when chosen moves nothing, after the
 * indicator and highlight `fluid` moves. An option with an icon draws it and
 * its words in a `content` row and is marked `data-icon`; one drawn `iconOnly`
 * is named by its label.
 */
export const view = <Value extends string, Message>(
  options: SegmentedView<Value, Message>,
  h: HtmlBuilder<Message>,
): Html => {
  const multiple = options.multiple === true
  const off = options.disabled === true
  const chosen = new Set<string>(options.pressed)
  const idOf = (value: Value) => `${options.multiple === true ? '' : options.id}-${value}`
  // The tab stop of a radio group: the chosen option, else the first one that can take focus.
  const enabled = options.options.flatMap((option, index) =>
    off || option.disabled === true ? [] : [index],
  )
  const chosenAt = options.options.findIndex(option => chosen.has(option.value))
  const stop = enabled.includes(chosenAt) ? chosenAt : (enabled[0] ?? -1)
  // Keys come faster than frames, and this handler is the last drawn view's: each press moves
  // on from the option the previous one of this drawing chose, since `pressed` reaches the
  // next drawing only (two ArrowRights would otherwise choose one option).
  let reached = chosenAt
  const keys = Behaviors.Keys.behavior(SegmentedSlots)<unknown, Message>({
    slot: 'group',
    name: 'SegmentedKeys',
    routes: [
      Behaviors.Keys.route<unknown, Message>('Radio', {
        on: [
          Behaviors.Keys.chord('Home'),
          Behaviors.Keys.chord('End'),
          ...RovingTabindex.arrowChords('both'),
        ],
        handle: ({ key, modifiers }) => {
          const next = RovingTabindex.move(enabled, reached, key, modifiers, {
            orientation: 'both',
            loop: true,
            direction: multiple ? 'ltr' : (options.direction ?? 'ltr'),
          })
          const target = next === undefined ? undefined : options.options[next]
          if (next === undefined || target === undefined) return Option.none()
          reached = next
          return Option.some(
            Behaviors.Keys.focus(idOf(target.value), options.onPress(target.value)),
          )
        },
      }),
    ],
  })
  const builders = SlotView.buildersFor(
    SegmentedSlots,
    [
      ...(options.style === undefined ? [] : [options.style.mixin]),
      ...(multiple ? [] : [keys.mixin]),
      ...(options.mixins ?? []),
    ],
    { input: undefined, h },
  )
  const submitted = (name: string) =>
    options.options.flatMap(option =>
      chosen.has(option.value)
        ? [
            h.input(
              builders.hiddenInput.attrs([
                h.Key(`submit-${option.value}`),
                h.Type('hidden'),
                h.Name(name),
                h.Value(option.value),
              ]),
            ),
          ]
        : [],
    )
  return h.div(
    builders.group.attrs([
      h.Role(multiple ? 'group' : 'radiogroup'),
      h.AriaLabel(options.label),
      h.DataAttribute('orientation', options.orientation ?? 'horizontal'),
      ...(off ? [h.AriaDisabled(true)] : []),
    ]),
    [
      h.div(builders.indicator.attrs([h.AriaHidden(true)]), []),
      h.div(builders.highlight.attrs([h.AriaHidden(true)]), []),
      ...options.options.map((option, index) => {
        const words = h.span(builders.label.attrs(), [option.label])
        // What the option names itself by, and what it draws.
        const drawn = (): readonly [ReadonlyArray<Attribute<Message>>, ReadonlyArray<Html>] => {
          const named = h.DataAttribute('label', option.label)
          if (option.icon === undefined) return [[named], [words]]
          const mark = h.span(builders.icon.attrs([h.AriaHidden(true)]), [option.icon])
          if (option.iconOnly === true) {
            return [
              [h.AriaLabel(option.label), h.Title(option.label), h.DataAttribute('icon', 'only')],
              [mark],
            ]
          }
          return [
            [named, h.DataAttribute('icon', '')],
            [h.span(builders.content.attrs(), [mark, words])],
          ]
        }
        const [naming, children] = drawn()
        const on = chosen.has(option.value)
        const unavailable = off || option.disabled === true
        return h.button(
          builders.option.attrs([
            h.Key(option.value),
            h.Type('button'),
            ...(multiple ? [] : [h.Id(idOf(option.value))]),
            ...(multiple
              ? [h.AriaPressed(String(on))]
              : [h.Role('radio'), h.AriaChecked(on), h.Tabindex(index === stop ? 0 : -1)]),
            ...naming,
            ...(unavailable ? [h.Disabled(true)] : [h.OnClick(options.onPress(option.value))]),
          ]),
          children,
        )
      }),
      ...(options.name === undefined ? [] : submitted(options.name)),
    ],
  )
}

/** What a Segmented is given once: its look and the options that hold no Message and nothing of one use's choice. */
export type SegmentedPreset = Pick<
  SegmentedSingle<string, never>,
  'orientation' | 'direction' | 'style'
> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Segmented: `base` for every use, `presets` chosen at
 * a use with `preset`, and the call over both. `mixins` concatenate in that
 * order (`Segmented.fluid` goes in `base`); any other option given at the
 * call replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<SegmentedPreset, Names>,
): {
  readonly view: <const Value extends string, Outer>(
    options: SegmentedView<Value, Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
