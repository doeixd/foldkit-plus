/**
 * The Calendar drawn from options: `view` over the state `Bundles.Calendar`
 * holds, and `configure`, the application's own Calendar. A module of its own
 * beside the adapter (`../calendar.ts`), which stays the rung for a calendar
 * an application draws itself.
 */
import * as UiCalendar from '@foldkit/ui/calendar'
import { Option } from 'effect'
import type * as Dates from 'foldkit/calendar'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { inputs, type CalendarOptions, type CalendarSlots, type Preset } from '../calendar.js'
import { layered, type PresetOption, type Presets } from '../configure.js'
import type { MixinList } from '../resolve.js'
import { wordsOf } from '../words.js'
import {
  captionOf,
  labelsOf,
  layout,
  words,
  type Caption,
  type CalendarWords,
  type TodayButton,
} from './layout.js'
import { Message, type Model } from './state.js'

export { words, type CalendarWords, type CaptionDropdowns, type TodayButton } from './layout.js'

export interface CalendarView<Outer> {
  /** The state `Bundles.Calendar` placed, or `Calendar.init` made. */
  readonly model: Model
  readonly onMessage: (message: Message) => Outer
  /** Names the calendar as a group: its months, presets and today button. */
  readonly label: string
  /** A column of ISO 8601 week numbers before the days. */
  readonly weekNumbers?: boolean | undefined
  /**
   * The days' heading: `grid` (default) is a button opening a grid of months,
   * then of years; `label` the month and year as text; `dropdowns` a select of
   * months and one of years. With two months, the dropdowns are on the first
   * and the second reads as a label.
   */
  readonly caption?: Caption | undefined
  /**
   * The paging buttons: either side of the caption (`both`, the default),
   * one alone, none, or both after the caption (`end`). Two months draw the
   * previous button on the first and the next on the second, or none.
   */
  readonly paging?: 'both' | 'previous' | 'next' | 'none' | 'end' | undefined
  readonly today?: TodayButton | undefined
  /** Selections one press away, drawn before the months. */
  readonly presets?: ReadonlyArray<Preset> | undefined
  /** A line under a day's number, such as its price; none for a day without one. */
  readonly detail?: ((date: Dates.CalendarDate) => Option.Option<string>) | undefined
  /** Drawn beside the months, such as a list of times: the application's own drawing and state. */
  readonly aside?: Html | undefined
  /** Drawn under everything else. */
  readonly footer?: Html | undefined
  readonly words?: Partial<CalendarWords> | undefined
  /** A style of `CalendarSlots`. */
  readonly style?: NamedStyle<typeof CalendarSlots> | undefined
  /** Mixins beside the style, such as `Calendar.readingKeys`. */
  readonly mixins?: MixinList<Outer> | undefined
}

/**
 * A Calendar: one month or two, with its presets before the months, a today
 * button under them, and the application's `aside` and `footer` around them.
 * Every press goes to `onMessage`; the selection is `model.selection`, read
 * with `Calendar.selectedDate`, `rangeOf` or `datesOf`.
 */
export const view = <Outer>(options: CalendarView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const { model, onMessage } = options
  const text = wordsOf(words, options.words)
  const mixins: MixinList<Outer> = [
    ...(options.style === undefined ? [] : [options.style.mixin]),
    ...(options.mixins ?? []),
  ]
  const labels = labelsOf(text, model.calendar.locale)
  const two = Option.isSome(model.second)
  const paging = options.paging ?? 'both'
  const shared: CalendarOptions<Outer> = {
    weekNumbers: options.weekNumbers,
    detail: options.detail,
    preview: {
      date: model.preview,
      onPreview: date => onMessage(Message.Previewed({ date })),
    },
  }
  const month = (
    calendar: UiCalendar.Model,
    lift: (message: UiCalendar.Message) => Message,
    more: CalendarOptions<Outer>,
  ): Html =>
    h.submodel({
      slotId: calendar.id,
      model: calendar,
      view: UiCalendar.view,
      viewInputs: {
        ...inputs(model.selection, mixins, { h }, { ...shared, ...more }),
        ...labels,
      },
      toParentMessage: (message: UiCalendar.Message) => onMessage(lift(message)),
    })
  const first = month(model.calendar, message => Message.GotCalendarMessage({ message }), {
    paging: two ? (paging === 'none' ? 'none' : 'previous') : paging,
    ...captionOf(
      options.caption,
      model.calendar,
      shown => onMessage(Message.Showed({ shown })),
      text,
    ),
  })
  const second = Option.map(model.second, calendar =>
    month(calendar, message => Message.GotSecondMessage({ message }), {
      paging: paging === 'none' ? 'none' : 'next',
      // The first month's selects move both, so the second only names its month.
      caption: options.caption === undefined || options.caption === 'grid' ? 'grid' : 'label',
    }),
  )
  return layout(
    {
      label: options.label,
      months: [first, ...Option.toArray(second)],
      selection: model.selection,
      presets: options.presets,
      presetsLabel: text.presets,
      onPreset: selection => onMessage(Message.PickedPreset({ selection })),
      today: options.today,
      onToday: selects => onMessage(Message.PressedToday({ selects })),
      aside: options.aside,
      footer: options.footer,
      mixins,
    },
    h,
  )
}

/**
 * What a Calendar is given once: its look and each option that holds no
 * Message and no drawing. Named apart from `Preset`, a selection one press away.
 */
export type CalendarViewPreset = Pick<
  CalendarView<never>,
  'weekNumbers' | 'caption' | 'paging' | 'today' | 'presets' | 'detail' | 'words' | 'style'
> & { readonly mixins?: MixinList<never> }

/**
 * The application's own Calendar: `base` for every use, `presets` chosen at a
 * use with `preset` (a set of options, not the calendar's own `presets` of
 * selections), and the call over both. `mixins` concatenate in that order and
 * `words` merge word by word; any other option given at the call replaces the
 * preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<CalendarViewPreset, Names>,
): {
  readonly view: <Outer>(
    options: CalendarView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
