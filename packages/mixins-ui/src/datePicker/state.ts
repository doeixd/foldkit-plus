/**
 * A DatePicker's whole state: upstream's picker (its popover and its
 * calendar), the selection, the day a range's hover previews, and when a
 * pick closes it. `Bundles.DatePicker` packages it; `DatePicker.view` draws
 * it. A module of its own, as the Calendar's state is: it holds upstream's
 * Model Schema, which a page drawing through the adapter must not carry.
 */
import * as UiCalendar from '@foldkit/ui/calendar'
import * as UiDatePicker from '@foldkit/ui/datePicker'
import { Option, Schema } from 'effect'
import * as Dates from 'foldkit/calendar'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Selection, empty, firstDate, isComplete, isSame, picked } from '../calendar/selection.js'
import { Shown, show } from '../calendar/shown.js'
import { update as pickerUpdate } from '../datePicker.js'

/** When a pick closes the popover: once the selection is whole, or never. */
export const Closes = Schema.Literals(['complete', 'manual'])
export type Closes = typeof Closes.Type

export const Model = Schema.Struct({
  /** The popover and the calendar in it: upstream's Model. */
  picker: UiDatePicker.Model,
  selection: Selection,
  /** The day the pointer is on while a range waits for its end. */
  preview: Schema.OptionFromNullOr(Dates.CalendarDate),
  closes: Closes,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotPickerMessage: { message: UiDatePicker.Message },
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

/** What a DatePicker starts from: `init`'s options, and `Bundles.DatePicker`'s args. */
export const Args = Schema.Struct({
  /** Prefixes every id the picker draws, unique on the page. */
  id: Schema.String,
  today: Dates.CalendarDate,
  /** What is chosen at the start, which also sets the mode; default `Calendar.empty('Single')`. */
  selection: Schema.optionalKey(Selection),
  /**
   * `complete` (default) closes the popover on the pick that makes the
   * selection whole; `manual` leaves it open for every pick, as a picker with
   * a time beside its days needs. Escape, a press outside and the trigger
   * close it either way.
   */
  closes: Schema.optionalKey(Closes),
  /** Waits for the panel's CSS transition as it opens and closes. */
  animated: Schema.optionalKey(Schema.Boolean),
  minDate: Schema.optionalKey(Dates.CalendarDate),
  maxDate: Schema.optionalKey(Dates.CalendarDate),
  disabledDaysOfWeek: Schema.optionalKey(Schema.Array(Dates.DayOfWeek)),
  disabledDates: Schema.optionalKey(Schema.Array(Dates.CalendarDate)),
  /** Month and day names and the week's first day; `Calendar.localeOf(tag)` makes one. */
  locale: Schema.optionalKey(Dates.LocaleConfig),
})
export type Args = typeof Args.Type

export const init = (args: Args): Model => {
  const { selection = empty('Single'), closes = 'complete', animated, ...config } = args
  return {
    picker: UiDatePicker.init({
      ...config,
      ...(animated === undefined ? {} : { isAnimated: animated }),
      // A picker that starts with days chosen opens on the first of them.
      ...Option.match(firstDate(selection), {
        onNone: () => ({}),
        onSome: initialViewDate => ({ initialViewDate }),
      }),
    }),
    selection,
    preview: Option.none(),
    closes,
  }
}

type Return = Update.ReturnWithOutMessage<Model, Message, OutMessage>
type PickerReturn = Update.ReturnWithOutMessage<
  UiDatePicker.Model,
  UiDatePicker.Message,
  UiDatePicker.OutMessage
>

const sameDay = Option.makeEquivalence(Dates.Equivalence)
const samePicker = Schema.toEquivalence(UiDatePicker.Model)
const lift = (message: UiDatePicker.Message): Message => Message.GotPickerMessage({ message })

/** `model` holding `selection`: the same Model, and nothing reported, when it holds those days already. */
const selected = (model: Model, selection: Selection): Return =>
  isSame(selection, model.selection)
    ? { model }
    : {
        // A preview belongs to the range it was made for.
        model: modifyFields(model, { selection: () => selection, preview: () => Option.none() }),
        outMessage: OutMessage.Changed({ selection }),
      }

/** `model` around `picker`: the same Model when upstream's holds what it held. */
const around = (model: Model, picker: UiDatePicker.Model): Model =>
  picker === model.picker || samePicker(picker, model.picker)
    ? model
    : modifyFields(model, { picker: () => picker })

const withCalendar = (model: Model, calendar: UiCalendar.Model): Model =>
  calendar === model.picker.calendar
    ? model
    : modifyFields(model, { picker: picker => modifyFields(picker, { calendar: () => calendar }) })

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
    onSome: date => withCalendar(model, turnedTo(model.picker.calendar, date)),
  })

/** Upstream's step folded into the Model: its picker, its Commands lifted, a pick or a clear in the selection. */
const stepped = (model: Model, next: PickerReturn): Return => {
  const selection = Option.match(Option.fromNullishOr(next.outMessage), {
    onNone: () => model.selection,
    onSome: UiDatePicker.OutMessage.match<Selection>({
      SelectedDate: ({ date }) => picked(model.selection, date),
      ClearedDate: () => empty(model.selection._tag),
      ChangedViewMonth: () => model.selection,
    }),
  })
  const result = selected(around(model, next.model), selection)
  return next.commands === undefined
    ? result
    : { ...result, commands: Command.mapMessages(next.commands, lift) }
}

const step = (model: Model, message: UiDatePicker.Message): Return =>
  stepped(model, pickerUpdate(model.selection, model.closes)(model.picker, message))

/**
 * `model` holding `selection`, its month turned to the selection's first
 * day: for a parent that sets the selection itself. Nothing is reported, and
 * the popover stays as it is.
 */
export const set = (model: Model, selection: Selection): Model => {
  const shown = openedOn(model, selection)
  return isSame(selection, shown.selection)
    ? shown
    : modifyFields(shown, { selection: () => selection, preview: () => Option.none() })
}

export const update = (model: Model, message: Message): Return =>
  Message.match(message, {
    GotPickerMessage: ({ message: inner }) => step(model, inner),
    Showed: ({ shown }) => ({ model: withCalendar(model, show(model.picker.calendar, shown)) }),
    Previewed: ({ date }) =>
      sameDay(date, model.preview)
        ? { model }
        : { model: modifyFields(model, { preview: () => date }) },
    PickedPreset: ({ selection }) => {
      const chosen = selected(openedOn(model, selection), selection)
      // A preset that makes the selection whole closes the popover, as the pick that does would.
      if (model.closes === 'manual' || !isComplete(selection) || !model.picker.popover.isOpen)
        return chosen
      const closed = UiDatePicker.close(chosen.model.picker)
      return {
        ...chosen,
        model: around(chosen.model, closed.model),
        ...(closed.commands === undefined
          ? {}
          : { commands: Command.mapMessages(closed.commands, lift) }),
      }
    },
    PressedToday: ({ selects }) => {
      const today = model.picker.calendar.today
      const turned = withCalendar(model, turnedTo(model.picker.calendar, today))
      // Picked as a press on the day is, so the bounds and the closing rule apply to it.
      return selects
        ? step(
            turned,
            UiDatePicker.Message.GotCalendarMessage({
              message: UiCalendar.Message.ClickedDay({ date: today }),
            }),
          )
        : { model: turned }
    },
  })
