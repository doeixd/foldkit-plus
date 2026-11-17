/**
 * The Calendar drawn from options: `view` over the state `Bundles.Calendar`
 * holds, and `configure`, the application's own Calendar. A module of its own
 * beside the adapter (`../calendar.ts`), which stays the rung for a calendar
 * an application draws itself.
 */
import * as UiCalendar from '@foldkit/ui/calendar'
import { Option } from 'effect'
import * as Dates from 'foldkit/calendar'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import {
  CalendarSlots,
  inputs,
  presetsView,
  type CalendarOptions,
  type Preset,
} from '../calendar.js'
import { layered, type PresetOption, type Presets } from '../configure.js'
import { buildersOf, type MixinList } from '../resolve.js'
import { fill, wordsOf } from '../words.js'
import { Message, type Model } from './state.js'

/** The fixed text a Calendar draws or says. Each is text; `{blanks}` are filled as noted. */
export interface CalendarWords {
  readonly previousMonth: string
  readonly nextMonth: string
  readonly previousYears: string
  readonly nextYears: string
  /** The heading button's name over the days, and over the months. */
  readonly toMonths: string
  readonly toYears: string
  /** The day grid's name; `{month}` is the month and year shown. */
  readonly daysGrid: string
  /** A week row's name; `{date}` is its first day, written long. */
  readonly week: string
  /** The month grid's name; `{year}` is the year shown. */
  readonly monthsGrid: string
  /** The year grid's name; `{from}` and `{to}` are its first and last years. */
  readonly yearsGrid: string
  /** The caption's selects. */
  readonly month: string
  readonly year: string
  /** The presets group's name. */
  readonly presets: string
}

/** The words a Calendar uses when none are given: upstream's English. */
export const words: CalendarWords = {
  previousMonth: 'Previous month',
  nextMonth: 'Next month',
  previousYears: 'Previous 12 years',
  nextYears: 'Next 12 years',
  toMonths: 'Switch to month picker',
  toYears: 'Switch to year picker',
  daysGrid: 'Calendar, {month}',
  week: 'Week of {date}',
  monthsGrid: 'Month picker, {year}',
  yearsGrid: 'Year picker, {from}–{to}',
  month: 'Month',
  year: 'Year',
  presets: 'Presets',
}

/** The caption's selects in place of its heading. */
export interface CaptionDropdowns {
  /** The years offered; default the bounds' years, or ten either side of the year shown. */
  readonly years?: { readonly from: number; readonly to: number } | undefined
  /** `label` writes the month as text beside a select of years; default `select`. */
  readonly month?: 'select' | 'label' | undefined
}

/** A button under the months that turns the calendar to today's month. */
export interface TodayButton {
  readonly label: string
  /** Also picks today, unless the calendar's bounds disable it. */
  readonly selects?: boolean | undefined
}

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
  readonly caption?: 'grid' | 'label' | { readonly dropdowns: CaptionDropdowns } | undefined
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

/** What upstream's view is told to say, from the Calendar's words. */
const labelsOf = (text: CalendarWords, locale: Dates.LocaleConfig): UiCalendar.ViewLabels => ({
  previousMonthLabel: text.previousMonth,
  nextMonthLabel: text.nextMonth,
  previousYearsPageLabel: text.previousYears,
  nextYearsPageLabel: text.nextYears,
  daysHeadingButtonLabel: text.toMonths,
  monthsHeadingButtonLabel: text.toYears,
  toDaysGridLabel: month => fill(text.daysGrid, { month }),
  toWeekLabel: start => fill(text.week, { date: Dates.formatLong(start, locale) }),
  toMonthsGridLabel: year => fill(text.monthsGrid, { year }),
  toYearsGridLabel: (from, to) => fill(text.yearsGrid, { from, to }),
})

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
  const builders = buildersOf(CalendarSlots, mixins, { input: undefined, h })
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
  const dropdowns =
    typeof options.caption === 'object'
      ? Option.some(options.caption.dropdowns)
      : Option.none<CaptionDropdowns>()
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
    ...Option.match(dropdowns, {
      onNone: () => ({ caption: options.caption === 'label' ? 'label' : 'grid' }) as const,
      onSome: ({ years, month: monthAs }) => ({
        dropdowns: {
          model: model.calendar,
          onShow: shown => onMessage(Message.Showed({ shown })),
          years,
          month: monthAs,
          words: { month: text.month, year: text.year },
        },
      }),
    }),
  })
  const second = Option.map(model.second, calendar =>
    month(calendar, message => Message.GotSecondMessage({ message }), {
      paging: paging === 'none' ? 'none' : 'next',
      // The first month's selects move both, so the second only names its month.
      caption: Option.isSome(dropdowns) || options.caption === 'label' ? 'label' : 'grid',
    }),
  )
  return h.div(
    builders.frame.attrs([
      h.Role('group'),
      h.AriaLabel(options.label),
      h.DataAttribute('months', two ? '2' : '1'),
    ]),
    [
      h.div(builders.body.attrs(), [
        ...(options.presets === undefined || options.presets.length === 0
          ? []
          : [
              presetsView(
                {
                  presets: options.presets,
                  selection: model.selection,
                  onPick: selection => onMessage(Message.PickedPreset({ selection })),
                  label: text.presets,
                  mixins,
                },
                h,
              ),
            ]),
        h.div(builders.main.attrs(), [
          h.div(builders.months.attrs(), [first, ...Option.toArray(second)]),
          ...(options.today === undefined
            ? []
            : [
                h.button(
                  builders.todayButton.attrs([
                    h.Type('button'),
                    h.OnClick(
                      onMessage(Message.PressedToday({ selects: options.today.selects === true })),
                    ),
                  ]),
                  [options.today.label],
                ),
              ]),
        ]),
        ...(options.aside === undefined ? [] : [h.div(builders.aside.attrs(), [options.aside])]),
      ]),
      ...(options.footer === undefined ? [] : [h.div(builders.footer.attrs(), [options.footer])]),
    ],
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
