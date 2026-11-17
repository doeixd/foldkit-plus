/**
 * A Calendar's whole state: the month it shows (upstream's Model), a second
 * month beside it, the selection, and the day a range's hover previews.
 * `Bundles.Calendar` packages it; `Calendar.view` draws it. A module of its
 * own because it holds upstream's Model Schema: a page that draws through the
 * adapter alone must not carry it.
 */
import * as UiCalendar from '@foldkit/ui/calendar'
import { Option, Schema } from 'effect'
import * as Dates from 'foldkit/calendar'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Selection, empty, firstDate, isSame, picked } from './selection.js'
import { Shown, alongside, show } from './shown.js'

export const Model = Schema.Struct({
  /** The month shown, the focused day and the bounds: upstream's Model. */
  calendar: UiCalendar.Model,
  /** The month after it, where two are drawn side by side. */
  second: Schema.OptionFromNullOr(UiCalendar.Model),
  selection: Selection,
  /** The day the pointer is on while a range waits for its end. */
  preview: Schema.OptionFromNullOr(Dates.CalendarDate),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotCalendarMessage: { message: UiCalendar.Message },
  GotSecondMessage: { message: UiCalendar.Message },
  /** The caption's dropdowns chose a month or a year. */
  Showed: { shown: Shown },
  /** The pointer entered a day, or, with none, left the grid. */
  Previewed: { date: Schema.OptionFromNullOr(Dates.CalendarDate) },
  /** A preset was pressed. */
  PickedPreset: { selection: Selection },
  /** The today button was pressed; `selects` when it also picks the day. */
  PressedToday: { selects: Schema.Boolean },
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  /** The selection holds other days than it did. */
  Changed: { selection: Selection },
})
export type OutMessage = typeof OutMessage.Type

/** What a Calendar starts from: `init`'s options, and `Bundles.Calendar`'s args. */
export const Args = Schema.Struct({
  /** Prefixes every id the calendar draws, unique on the page. */
  id: Schema.String,
  today: Dates.CalendarDate,
  /** What is chosen at the start, which also sets the mode; default `empty('Single')`. */
  selection: Schema.optionalKey(Selection),
  /** Two months side by side; default one. */
  months: Schema.optionalKey(Schema.Literals([1, 2])),
  minDate: Schema.optionalKey(Dates.CalendarDate),
  maxDate: Schema.optionalKey(Dates.CalendarDate),
  disabledDaysOfWeek: Schema.optionalKey(Schema.Array(Dates.DayOfWeek)),
  disabledDates: Schema.optionalKey(Schema.Array(Dates.CalendarDate)),
  /** Month and day names and the week's first day; `Calendar.localeOf(tag)` makes one. */
  locale: Schema.optionalKey(Dates.LocaleConfig),
})
export type Args = typeof Args.Type

/** The second month's id prefix, for a page that reads its cells. */
export const secondId = (id: string): string => `${id}-second`

export const init = (args: Args): Model => {
  const { selection = empty('Single'), months, ...config } = args
  const calendar = UiCalendar.init({
    ...config,
    // A calendar that starts with days chosen opens on the first of them.
    ...Option.match(firstDate(selection), {
      onNone: () => ({}),
      onSome: initialViewDate => ({ initialViewDate }),
    }),
  })
  return {
    calendar,
    second:
      months === 2
        ? Option.some(alongside(UiCalendar.init({ ...config, id: secondId(args.id) }), calendar, 1))
        : Option.none(),
    selection,
    preview: Option.none(),
  }
}

type Return = Update.ReturnWithOutMessage<Model, Message, OutMessage>

const sameDay = Option.makeEquivalence(Dates.Equivalence)
const sameCalendar = Schema.toEquivalence(UiCalendar.Model)

/**
 * Upstream's update with the Model it was given back when nothing in it
 * moved: upstream builds a new one for a press on the day already focused, or
 * a blur of a grid that had no focus, and Foldkit draws again for any new Model.
 */
const stepOf = (
  calendar: UiCalendar.Model,
  next: ReturnType<typeof UiCalendar.update>,
): ReturnType<typeof UiCalendar.update> =>
  sameCalendar(calendar, next.model) ? { ...next, model: calendar } : next

/** `model` holding `selection`: the same Model, and nothing reported, when it holds those days already. */
const selected = (model: Model, selection: Selection): Return =>
  isSame(selection, model.selection)
    ? { model }
    : {
        // A preview belongs to the range it was made for.
        model: modifyFields(model, { selection: () => selection, preview: () => Option.none() }),
        outMessage: OutMessage.Changed({ selection }),
      }

/** `model` with its first month as `calendar` and its second a month after it. */
const showing = (model: Model, calendar: UiCalendar.Model): Model => {
  const second = Option.map(model.second, other => alongside(other, calendar, 1))
  const moved = Option.exists(second, next => !Option.exists(model.second, was => was === next))
  return calendar === model.calendar && !moved
    ? model
    : modifyFields(model, { calendar: () => calendar, second: () => second })
}

/** The Days grid on `date`'s month, the day focused: the same Model when it is there already. */
const turnedTo = (calendar: UiCalendar.Model, date: Dates.CalendarDate): UiCalendar.Model => {
  const days = calendar.viewMode === 'Days' ? calendar : UiCalendar.dropToDays(calendar)
  return days.viewYear === date.year &&
    days.viewMonth === date.month &&
    Option.exists(days.maybeFocusedDate, Dates.isEqual(date))
    ? days
    : UiCalendar.focusDate(days, date)
}

/** `model` with its month turned to `selection`'s first day, where it has one. */
const openedOn = (model: Model, selection: Selection): Model =>
  Option.match(firstDate(selection), {
    onNone: () => model,
    onSome: date => showing(model, turnedTo(model.calendar, date)),
  })

const pickedIn = (selection: Selection, out: UiCalendar.OutMessage | undefined): Selection =>
  Option.match(Option.fromNullishOr(out), {
    onNone: () => selection,
    onSome: UiCalendar.OutMessage.match<Selection>({
      SelectedDate: ({ date }) => picked(selection, date),
      ChangedViewMonth: () => selection,
    }),
  })

/** One of the two months stepped by upstream's update, the other kept beside it. */
const stepped = (
  model: Model,
  next: ReturnType<typeof UiCalendar.update>,
  moved: Model,
  lift: (message: UiCalendar.Message) => Message,
): Return => {
  const result = selected(moved, pickedIn(model.selection, next.outMessage))
  return next.commands === undefined
    ? result
    : { ...result, commands: Command.mapMessages(next.commands, lift) }
}

const toFirst = (message: UiCalendar.Message): Message => Message.GotCalendarMessage({ message })
const toSecond = (message: UiCalendar.Message): Message => Message.GotSecondMessage({ message })

/**
 * `model` holding `selection`, its month turned to the selection's first
 * day: for a parent that sets the selection itself (a form reset, a value
 * loaded later). Nothing is reported, since the parent chose it.
 */
export const set = (model: Model, selection: Selection): Model => {
  const shown = openedOn(model, selection)
  return isSame(selection, shown.selection)
    ? shown
    : modifyFields(shown, { selection: () => selection, preview: () => Option.none() })
}

export const update = (model: Model, message: Message): Return =>
  Message.match(message, {
    GotCalendarMessage: ({ message: inner }) => {
      const next = stepOf(model.calendar, UiCalendar.update(model.calendar, inner))
      return stepped(model, next, showing(model, next.model), toFirst)
    },
    GotSecondMessage: ({ message: inner }) =>
      Option.match(model.second, {
        onNone: () => ({ model }),
        onSome: second => {
          const next = stepOf(second, UiCalendar.update(second, inner))
          const moved =
            next.model === second
              ? model
              : modifyFields(model, {
                  calendar: calendar => alongside(calendar, next.model, -1),
                  second: () => Option.some(next.model),
                })
          return stepped(model, next, moved, toSecond)
        },
      }),
    Showed: ({ shown }) => ({ model: showing(model, show(model.calendar, shown)) }),
    Previewed: ({ date }) =>
      sameDay(date, model.preview)
        ? { model }
        : { model: modifyFields(model, { preview: () => date }) },
    PickedPreset: ({ selection }) => selected(openedOn(model, selection), selection),
    PressedToday: ({ selects }) => {
      const today = model.calendar.today
      const turned = turnedTo(model.calendar, today)
      if (!selects) return { model: showing(model, turned) }
      // Upstream refuses a disabled day, so a today outside the bounds is shown and not picked.
      const next = stepOf(turned, UiCalendar.selectDate(turned, today))
      return stepped(model, next, showing(model, next.model), toFirst)
    },
  })
