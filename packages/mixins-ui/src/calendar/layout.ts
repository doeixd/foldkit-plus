/**
 * What `Calendar.view` and `DatePicker.view` share: the frame laid around
 * the months, the caption's options and upstream's labels from the
 * Calendar's words. Neither holds state, so a DatePicker reads this without
 * the Calendar's state module.
 */
import type * as UiCalendar from '@foldkit/ui/calendar'
import * as Dates from 'foldkit/calendar'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { CalendarSlots, presetsView, type CalendarOptions, type Preset } from '../calendar.js'
import { buildersOf, type MixinList } from '../resolve.js'
import { fill } from '../words.js'
import type { Selection } from './selection.js'
import type { Shown } from './shown.js'

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

export type Caption = 'grid' | 'label' | { readonly dropdowns: CaptionDropdowns }

/** A button under the months that turns the calendar to today's month. */
export interface TodayButton {
  readonly label: string
  /** Also picks today, unless the calendar's bounds disable it. */
  readonly selects?: boolean | undefined
}

/** What upstream's view is told to say, from the Calendar's words. */
export const labelsOf = (
  text: CalendarWords,
  locale: Dates.LocaleConfig,
): UiCalendar.ViewLabels => ({
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

/** The adapter's caption options for the month `calendar` shows, its selects answered by `onShow`. */
export const captionOf = <Outer>(
  caption: Caption | undefined,
  calendar: UiCalendar.Model,
  onShow: (shown: Shown) => Outer,
  text: CalendarWords,
): Pick<CalendarOptions<Outer>, 'caption' | 'dropdowns'> =>
  typeof caption === 'object'
    ? {
        dropdowns: {
          model: calendar,
          onShow,
          years: caption.dropdowns.years,
          month: caption.dropdowns.month,
          words: { month: text.month, year: text.year },
        },
      }
    : { caption: caption === 'label' ? 'label' : 'grid' }

export interface Layout<Outer> {
  /** Names the frame as a group. */
  readonly label: string
  /** The month grids, already drawn: one or two. */
  readonly months: ReadonlyArray<Html>
  readonly selection: Selection
  readonly presets: ReadonlyArray<Preset> | undefined
  readonly presetsLabel: string
  readonly onPreset: (selection: Selection) => Outer
  readonly today: TodayButton | undefined
  readonly onToday: (selects: boolean) => Outer
  readonly aside: Html | undefined
  readonly footer: Html | undefined
  /** The style's mixin and those beside it, of `CalendarSlots`. */
  readonly mixins: MixinList<Outer>
}

/**
 * The frame: the presets, the months over the today button and the
 * application's aside in a row, and its footer under them. Always drawn, so
 * the markup keeps its shape when an option is added.
 */
export const layout = <Outer>(options: Layout<Outer>, h: HtmlBuilder<Outer>): Html => {
  const builders = buildersOf(CalendarSlots, options.mixins, { input: undefined, h })
  const { today } = options
  return h.div(
    builders.frame.attrs([
      h.Role('group'),
      h.AriaLabel(options.label),
      h.DataAttribute('months', String(options.months.length)),
    ]),
    [
      h.div(builders.body.attrs(), [
        ...(options.presets === undefined || options.presets.length === 0
          ? []
          : [
              presetsView(
                {
                  presets: options.presets,
                  selection: options.selection,
                  onPick: options.onPreset,
                  label: options.presetsLabel,
                  mixins: options.mixins,
                },
                h,
              ),
            ]),
        h.div(builders.main.attrs(), [
          h.div(builders.months.attrs(), options.months),
          ...(today === undefined
            ? []
            : [
                h.button(
                  builders.todayButton.attrs([
                    h.Type('button'),
                    h.OnClick(options.onToday(today.selects === true)),
                  ]),
                  [today.label],
                ),
              ]),
        ]),
        ...(options.aside === undefined ? [] : [h.div(builders.aside.attrs(), [options.aside])]),
      ]),
      ...(options.footer === undefined ? [] : [h.div(builders.footer.attrs(), [options.footer])]),
    ],
  )
}
