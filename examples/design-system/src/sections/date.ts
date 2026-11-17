/**
 * The Date section as an island: a month grid preview and a live date picker.
 */
import { Effect, Option, Schema } from 'effect'
import { Calendar as FoldkitCalendar, Runtime, Update } from 'foldkit'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { childAttributes } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import { DatePicker as UiDatePicker } from '@foldkit/ui'
import { SlotView } from 'foldkit-mixins'
import { Calendar, CalendarSlots, CardSlots } from 'foldkit-mixins-ui'
import { CalendarStyle, CardStyle, DateChromeStyle, PageStyle } from '../style.js'
import { DateChromeSlots, PageSlots } from '../slots.js'
import { foldsFor } from '../fold.js'

export type CalendarDate = typeof FoldkitCalendar.CalendarDate.Type

export const Model = Schema.Struct({
  picker: UiDatePicker.Model,
  maybeDue: Schema.Option(FoldkitCalendar.CalendarDate),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  DatePicker: { message: UiDatePicker.Message },
})
export type Message = typeof Message.Type

/** The picker opens on `today` and spans five years either way; tests pass a fixed date. */
export const initModel = (today: CalendarDate): Model => ({
  picker: UiDatePicker.init({
    id: 'due-date',
    today,
    minDate: FoldkitCalendar.subtractYears(today, 5),
    maxDate: FoldkitCalendar.addYears(today, 5),
  }),
  maybeDue: Option.none(),
})

const own = foldsFor<Model, Message>()

const foldDatePicker = Update.foldChild({
  ...own('picker', Message.DatePicker),
  update: UiDatePicker.update,
  foldOutMessage: UiDatePicker.OutMessage.match<Update.Step<Model, Message>>({
    SelectedDate:
      ({ date }) =>
      model => ({
        model: modifyFields(model, { maybeDue: () => Option.some(date) }),
      }),
    ClearedDate: () => model => ({ model: modifyFields(model, { maybeDue: () => Option.none() }) }),
    ChangedViewMonth: () => model => ({ model }),
  }),
})

export const update = (model: Model, message: Message) =>
  Message.match(message, {
    DatePicker: ({ message }) => foldDatePicker(model, message),
  })

const formatIsoDate = (date: CalendarDate): string =>
  `${date.year}-${String(date.month).padStart(2, '0')}-${String(date.day).padStart(2, '0')}`

const weekDays: ReadonlyArray<string> = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

const monthDays: ReadonlyArray<number> = [12, 13, 14, 15, 16, 17, 18]

const CalendarPreview = SlotView.forMessages<Message>()
  .define(CalendarSlots, (selected: number, slots, h) => {
    const card = SlotView.buildersFor(CardSlots, [CardStyle.mixin], { input: selected, h })
    // The recipe pads content, not the root: the calendar rides the content
    // slot so the preview card breathes.
    return h.div(card.root.attrs(), [
      h.div(card.content.attrs(), [
        h.div(slots.root.attrs(), [
          h.div(
            slots.grid.attrs([h.Role('grid'), h.AriaLabel('October 2026'), h.AriaRowcount(1)]),
            [
              h.div(slots.headerRow.attrs([h.Role('row')]), [
                ...weekDays.map(day =>
                  h.span(slots.columnHeader.attrs([h.Role('columnheader')]), [day]),
                ),
              ]),
              h.div(slots.weekRow.attrs([h.Role('row')]), [
                ...monthDays.map(day =>
                  h.span(slots.dayCell.attrs([h.Role('gridcell')]), [
                    h.button(
                      slots.dayButton.attrs([
                        h.Type('button'),
                        ...(day === selected ? [h.DataAttribute('selected', 'true')] : []),
                        h.AriaLabel(`October ${day}`),
                      ]),
                      [String(day)],
                    ),
                  ]),
                ),
              ]),
            ],
          ),
        ]),
      ]),
    ])
  })
  .pipe(SlotView.attach(CalendarStyle.mixin))

/**
 * A due-date picker: the shell rides attribute bundles (the adapter resolves
 * in the child's own universe), while the month grid inside draws through
 * CalendarSlots like the preview above.
 */
const DatePickerDemo = (
  model: Pick<Model, 'picker' | 'maybeDue'>,
  h: HtmlBuilder<Message>,
): Html => {
  const chrome = SlotView.buildersFor(DateChromeSlots, [DateChromeStyle.style.mixin], {
    input: model,
    h,
  })
  return h.submodel({
    slotId: model.picker.id,
    model: model.picker,
    view: UiDatePicker.view,
    viewInputs: {
      // Locked: paging months and years resizes the panel, which must not
      // flip it to the other side of the trigger mid-use.
      anchor: { placement: 'bottom-start', gap: 4, padding: 8, isPlacementLocked: true },
      maybeSelectedDate: model.maybeDue,
      triggerContent: maybeDue =>
        h.span(
          [],
          [Option.match(maybeDue, { onNone: () => 'Pick a date', onSome: formatIsoDate })],
        ),
      attributes: childAttributes(chrome.picker.attrs()),
      triggerAttributes: childAttributes(chrome.trigger.attrs()),
      panelAttributes: childAttributes(chrome.panel.attrs()),
      backdropAttributes: childAttributes(chrome.backdrop.attrs()),
      toCalendarView: Calendar.toView(
        Calendar.Selection.Single({ date: model.maybeDue }),
        [CalendarStyle.mixin],
        { h },
      ),
    },
    toParentMessage: message => Message.DatePicker({ message }),
  })
}

export const view = (model: Model, h: HtmlBuilder<Message>): Html => {
  const slots = SlotView.buildersFor(PageSlots, [PageStyle.style.mixin], { input: model, h })
  return h.div(slots.body.attrs(), [
    h.p(slots.sectionText.attrs(), [
      'A month grid preview through the Calendar slots, and a live picker that writes the due date. The picker shell rides attribute bundles; its grid draws through the same Calendar slots as the preview.',
    ]),
    CalendarPreview(15, h),
    DatePickerDemo(model, h),
    h.p(slots.sectionText.attrs(), [
      Option.match(model.maybeDue, {
        onNone: () => 'No due date yet.',
        onSome: date => `Due ${formatIsoDate(date)}.`,
      }),
    ]),
  ])
}

export const mount = (container: HTMLElement): void => {
  Runtime.embed(
    Runtime.makeElement({
      Model,
      container,
      init: () => ({ model: initModel(Effect.runSync(FoldkitCalendar.today.local)) }),
      update,
      view,
    }),
  )
}
