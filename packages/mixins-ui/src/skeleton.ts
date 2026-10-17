import { Capability, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import type { Attribute, Html, HtmlBuilder } from 'foldkit/html'
import type { MixinList } from './resolve.js'

/**
 * A loading placeholder publishes its bars, and the frame that lays several
 * out as one shape: text lines, an avatar beside two lines, a card, a table
 * row. It owns no state, messages, or bundles. A lone bar, or a frame, is
 * one `status` named by what it stands in for; the bars inside a frame are
 * drawing. A frame carries `data-kind`, and its bars `data-shape` (`circle`,
 * `block` for a picture) and `data-short` for a line that ends early, for a
 * style to lay them out; a table row carries `--fk-skeleton-columns`.
 */
export const SkeletonSlots = Slots.define({
  bar: Slot.make({ capability: Capability.Container }),
  group: Slot.make({ capability: Capability.Container }),
})

interface Common<Message> {
  /** What it stands in for, announced politely. */
  readonly label?: string | undefined
  /** A style of `SkeletonSlots`, for the look. */
  readonly style?: NamedStyle<typeof SkeletonSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** One bar in one call. No upstream component stands behind it. */
export type SkeletonView<Message = never> = Common<Message>

const buildersOf = <Message>(options: Common<Message>, h: HtmlBuilder<Message>) =>
  SlotView.buildersFor(
    SkeletonSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )

const announced = <Message>(options: Common<Message>, h: HtmlBuilder<Message>) => [
  h.Role('status'),
  ...(options.label === undefined ? [] : [h.AriaLabel(options.label)]),
]

export const view = <Message = never>(
  options: SkeletonView<Message>,
  h: HtmlBuilder<Message>,
): Html => h.div(buildersOf(options, h).bar.attrs(announced(options, h)), [])

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
