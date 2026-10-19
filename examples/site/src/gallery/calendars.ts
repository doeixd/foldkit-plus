/**
 * The state of the Calendar page's further examples: each calendar's own
 * Model, the month shown and the focus, beside the selection the page owns.
 * The site's widgets hold one of these and fold `Message` into it.
 */
import { Option, Schema } from 'effect'
import { Calendar } from 'foldkit'
import * as Command from 'foldkit/command'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { Calendar as UiCalendar } from '@foldkit/ui'
import { Calendar as DateSelection } from 'foldkit-mixins-ui'
import { TODAY, appointmentCalendar, takenOn, unavailableCalendar } from '../snippets/components.js'

const Picked = Schema.Struct({ calendar: UiCalendar.Model, day: DateSelection.Selection })

export const Model = Schema.Struct({
  unavailable: Picked,
  several: Schema.Struct({ calendar: UiCalendar.Model, days: DateSelection.Selection }),
  prices: Schema.Struct({
    calendar: UiCalendar.Model,
    stay: DateSelection.Selection,
    preview: Schema.Option(Calendar.CalendarDate),
  }),
  events: Picked,
  appointment: Schema.Struct({
    calendar: UiCalendar.Model,
    day: DateSelection.Selection,
    time: Schema.Option(Schema.String),
  }),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotUnavailable: { message: UiCalendar.Message },
  GotSeveral: { message: UiCalendar.Message },
  ClearedSeveral: {},
  GotPrices: { message: UiCalendar.Message },
  PreviewedPrices: { date: Schema.Option(Calendar.CalendarDate) },
  GotEvents: { message: UiCalendar.Message },
  ShowedToday: {},
  GotAppointment: { message: UiCalendar.Message },
  PickedTime: { time: Schema.String },
})
export type Message = typeof Message.Type

export const init = (): Model => ({
  unavailable: {
    calendar: unavailableCalendar('preview-calendar-unavailable'),
    day: DateSelection.empty('Single'),
  },
  several: {
    calendar: UiCalendar.init({ id: 'preview-calendar-several', today: TODAY }),
    days: DateSelection.empty('Multiple'),
  },
  prices: {
    calendar: UiCalendar.init({ id: 'preview-calendar-prices', today: TODAY, minDate: TODAY }),
    stay: DateSelection.empty('Range'),
    preview: Option.none(),
  },
  events: {
    calendar: UiCalendar.init({ id: 'preview-calendar-events', today: TODAY }),
    day: DateSelection.day(TODAY),
  },
  appointment: {
    calendar: appointmentCalendar('preview-calendar-appointment'),
    day: DateSelection.empty('Single'),
    time: Option.none(),
  },
})

/** A calendar stepped by its Message: its next Model, the day it picked, and its Commands as `wrap`s. */
const step = (
  calendar: UiCalendar.Model,
  message: UiCalendar.Message,
  wrap: (message: UiCalendar.Message) => Message,
) => {
  const next = UiCalendar.update(calendar, message)
  return {
    calendar: next.model,
    picked: Option.flatMap(Option.fromNullishOr(next.outMessage), out =>
      UiCalendar.OutMessage.match(out, {
        SelectedDate: ({ date }) => Option.some(date),
        ChangedViewMonth: () => Option.none(),
      }),
    ),
    commands: Command.mapMessages(next.commands ?? [], wrap),
  }
}

const pickedInto = (
  selection: DateSelection.Selection,
  picked: Option.Option<Calendar.CalendarDate>,
): DateSelection.Selection =>
  Option.match(picked, {
    onNone: () => selection,
    onSome: date => DateSelection.picked(selection, date),
  })

const samePreview = Option.makeEquivalence(Calendar.Equivalence)

export const update = (model: Model, message: Message): Update.Return<Model, Message> =>
  Message.match(message, {
    GotUnavailable: ({ message }) => {
      const next = step(model.unavailable.calendar, message, inner =>
        Message.GotUnavailable({ message: inner }),
      )
      return {
        model: modifyFields(model, {
          unavailable: ({ day }) => ({
            calendar: next.calendar,
            day: pickedInto(day, next.picked),
          }),
        }),
        commands: next.commands,
      }
    },
    GotSeveral: ({ message }) => {
      const next = step(model.several.calendar, message, inner =>
        Message.GotSeveral({ message: inner }),
      )
      return {
        model: modifyFields(model, {
          several: ({ days }) => ({ calendar: next.calendar, days: pickedInto(days, next.picked) }),
        }),
        commands: next.commands,
      }
    },
    ClearedSeveral: () => ({
      model: modifyFields(model, {
        several: several => ({ ...several, days: DateSelection.empty('Multiple') }),
      }),
    }),
    GotPrices: ({ message }) => {
      const next = step(model.prices.calendar, message, inner =>
        Message.GotPrices({ message: inner }),
      )
      return {
        model: modifyFields(model, {
          prices: prices => ({
            calendar: next.calendar,
            stay: pickedInto(prices.stay, next.picked),
            // A finished stay previews nothing; one still open keeps the day under the pointer.
            preview: Option.isSome(next.picked) ? Option.none() : prices.preview,
          }),
        }),
        commands: next.commands,
      }
    },
    // The pointer moving within a day previews nothing new, and draws nothing again.
    PreviewedPrices: ({ date }) =>
      samePreview(model.prices.preview, date)
        ? { model }
        : { model: modifyFields(model, { prices: prices => ({ ...prices, preview: date }) }) },
    GotEvents: ({ message }) => {
      const next = step(model.events.calendar, message, inner =>
        Message.GotEvents({ message: inner }),
      )
      return {
        model: modifyFields(model, {
          events: ({ day }) => ({ calendar: next.calendar, day: pickedInto(day, next.picked) }),
        }),
        commands: next.commands,
      }
    },
    ShowedToday: () => ({
      model: modifyFields(model, {
        events: ({ calendar }) => ({
          calendar: UiCalendar.focusDate(calendar, TODAY),
          day: DateSelection.day(TODAY),
        }),
      }),
    }),
    GotAppointment: ({ message }) => {
      const next = step(model.appointment.calendar, message, inner =>
        Message.GotAppointment({ message: inner }),
      )
      return {
        model: modifyFields(model, {
          appointment: ({ day, time }) => ({
            calendar: next.calendar,
            day: pickedInto(day, next.picked),
            // A time the new day has taken already is no longer chosen.
            time: Option.match(next.picked, {
              onNone: () => time,
              onSome: date => Option.filter(time, chosen => !takenOn(date).includes(chosen)),
            }),
          }),
        }),
        commands: next.commands,
      }
    },
    PickedTime: ({ time }) => ({
      model: modifyFields(model, {
        appointment: appointment => ({ ...appointment, time: Option.some(time) }),
      }),
    }),
  })
