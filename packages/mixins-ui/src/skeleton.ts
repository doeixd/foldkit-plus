import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import { layered, type PresetOption, type Presets } from './configure.js'
import type { MixinList } from './resolve.js'

/**
 * A loading placeholder publishes its bars, and the frame that lays several
 * out as one shape: text lines, an avatar beside two lines, a card, a table
 * row. It owns no state, messages, or bundles. A lone bar, or a frame, is
 * one `status` named by what it stands in for, or hidden from assistive
 * technology when it names nothing; the bars inside a frame are drawing. A frame carries `data-kind`, and its bars `data-shape` (`circle`,
 * `block` for a picture) and `data-short` for a line that ends early, for a
 * style to lay them out; a table row carries `--fk-skeleton-columns`.
 */
export const SkeletonSlots = Slots.define({
  bar: Slot.make({ capability: Capability.Container }),
  group: Slot.make({ capability: Capability.Container }),
})

interface Common<Message> {
  /** What it stands in for, announced politely. Without it the placeholder is hidden from assistive technology. */
  readonly label?: string | undefined
  /** A style of `SkeletonSlots`, for the look. */
  readonly style?: NamedStyle<typeof SkeletonSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/**
 * One bar in one call. No upstream component stands behind it. `inline` and
 * `block` are CSS lengths (`'8rem'`, `'60%'`) written as `--fk-skeleton-inline`
 * and `--fk-skeleton-block`, which the recipe reads for a lone bar; a bar of
 * a form's input or a list's action has a size of its own.
 */
export interface SkeletonView<Message = never> extends Common<Message> {
  readonly inline?: string | undefined
  readonly block?: string | undefined
}

const buildersOf = <Message>(options: Common<Message>, h: HtmlBuilder<Message>) =>
  SlotView.buildersFor(
    SkeletonSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )

// Without a label there is nothing to say: an empty `status` would be one
// more live region for each placeholder on the page, so it is hidden instead.
const announced = <Message>(options: Common<Message>, h: HtmlBuilder<Message>) =>
  options.label === undefined
    ? [h.AriaHidden(true)]
    : [h.Role('status'), h.AriaLabel(options.label)]

export const view = <Message = never>(
  options: SkeletonView<Message>,
  h: HtmlBuilder<Message>,
): Html =>
  h.div(
    // The recipe sizes a lone bar by this mark: an unnamed one is `aria-hidden`
    // like the bars of a frame, so that attribute cannot tell them apart.
    buildersOf(options, h).bar.attrs([
      ...announced(options, h),
      h.DataAttribute('lone', ''),
      ...(options.inline === undefined && options.block === undefined
        ? []
        : [
            h.Style({
              ...(options.inline === undefined ? {} : { '--fk-skeleton-inline': options.inline }),
              ...(options.block === undefined ? {} : { '--fk-skeleton-block': options.block }),
            }),
          ]),
    ]),
    [],
  )

const whole = (count: number, what: string) => {
  if (!Number.isInteger(count) || count < 1) {
    throw new Error(`Skeleton: ${what} must be a whole number from 1, not ${count}`)
  }
}

/** A frame of `kind` holding bars, each with its shape and whether it ends early. */
const frame = <Message>(
  options: Common<Message>,
  h: HtmlBuilder<Message>,
  kind: string,
  bars: ReadonlyArray<{ readonly shape?: 'circle' | 'block'; readonly short?: boolean }>,
  extra: ReadonlyArray<Attribute<Message>> = [],
): Html => {
  const builders = buildersOf(options, h)
  return h.div(
    builders.group.attrs([...announced(options, h), h.DataAttribute('kind', kind), ...extra]),
    bars.map(({ shape, short }) =>
      h.div(
        builders.bar.attrs([
          h.AriaHidden(true),
          ...(shape === undefined ? [] : [h.DataAttribute('shape', shape)]),
          ...(short === true ? [h.DataAttribute('short', '')] : []),
        ]),
        [],
      ),
    ),
  )
}

/** Lines of text, the last one ending early as a paragraph's does. */
export interface SkeletonLinesView<Message = never> extends Common<Message> {
  readonly lines: number
}

export const lines = <Message = never>(
  options: SkeletonLinesView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  whole(options.lines, 'lines')
  return frame(
    options,
    h,
    'lines',
    Array.from({ length: options.lines }, (_, index) => ({
      short: options.lines > 1 && index === options.lines - 1,
    })),
  )
}

/** A circle beside a name and a shorter line: a person, a comment, a notification. */
export const avatarRow = <Message = never>(
  options: Common<Message>,
  h: HtmlBuilder<Message>,
): Html => frame(options, h, 'avatar-row', [{ shape: 'circle' }, {}, { short: true }])

/** A picture over a title and two lines of text. */
export const card = <Message = never>(options: Common<Message>, h: HtmlBuilder<Message>): Html =>
  frame(options, h, 'card', [{ shape: 'block' }, { short: true }, {}, { short: true }])

/** One cell a column, for the rows of a table still loading. */
export interface SkeletonTableRowView<Message = never> extends Common<Message> {
  readonly columns: number
}

export const tableRow = <Message = never>(
  options: SkeletonTableRowView<Message>,
  h: HtmlBuilder<Message>,
): Html => {
  whole(options.columns, 'columns')
  return frame(
    options,
    h,
    'table-row',
    Array.from({ length: options.columns }, () => ({})),
    [h.Style({ '--fk-skeleton-columns': String(options.columns) })],
  )
}

/** What a Skeleton is given once: its look. Its `label` is each use's. */
export type SkeletonPreset = Pick<Common<never>, 'style'> & { readonly mixins?: MixinList<never> }

/**
 * The application's own Skeleton: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. The helpers share the look.
 */
export const configure = <const Names extends string = never>(
  config: Presets<SkeletonPreset, Names>,
): {
  readonly view: <Outer>(
    options: SkeletonView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
  readonly lines: <Outer>(
    options: SkeletonLinesView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
  readonly avatarRow: <Outer>(
    options: Common<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
  readonly card: <Outer>(
    options: Common<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
  readonly tableRow: <Outer>(
    options: SkeletonTableRowView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
  lines: (options, h) => lines(layered(config, options), h),
  avatarRow: (options, h) => avatarRow(layered(config, options), h),
  card: (options, h) => card(layered(config, options), h),
  tableRow: (options, h) => tableRow(layered(config, options), h),
})
