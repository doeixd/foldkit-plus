import { Attr, Capability, Event, Slot, Slots, type SlotAttributes } from 'foldkit-mixins'
import { Match, Option, pipe } from 'effect'
import * as UiCalendar from '@foldkit/ui/calendar'
import { Message, OutMessage, update as upstreamUpdate, type Model } from '@foldkit/ui/datePicker'
import type * as Dates from 'foldkit/calendar'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { modifyFields } from 'foldkit/struct'
import type * as Update from 'foldkit/update'
import { isComplete, picked, type Selection } from './calendar.js'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'
import { defaultToView, type DatePickerRenderInfo } from './datePickerView.js'

/**
 * DatePicker is a small composed Submodel: a `trigger` button plus a
 * `panel`/`backdrop` pair around the embedded calendar. The resolver runs
 * once per bundle and each base attribute passes through by identity. The
 * wrapper and hidden form inputs are drawn outside the popover assembly and
 * pass through untouched.
 *
 * The trigger owns `click` while enabled. A Behavior adding its own handler
 * is a conflict, not a second silent owner. The backdrop owns `click` while
 * the popover shows it.
 */
export const DatePickerSlots = Slots.define({
  trigger: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded],
  }),
  panel: Slot.make({ capability: Capability.Container }),
  backdrop: Slot.make({ capability: Capability.Container, events: [Event.Click] }),
})

export type ResolvedDatePicker = Omit<DatePickerRenderInfo, 'trigger' | 'panel' | 'backdrop'> & {
  readonly trigger: SlotAttributes<Message>
  readonly panel: SlotAttributes<Message> | undefined
  readonly backdrop: SlotAttributes<Message> | undefined
}

/**
 * Resolves the date picker's popover bundles. Concrete over the date
 * picker's own Message: unlike the wrapped forks, these bundles mix the
 * popover's pre-bound groups with plain date-picker attributes, so they
 * cannot promise any other universe. Message-free Mixins (the styling
 * case) and date-picker-message Behaviors attach unchanged.
 */
export const resolve = <Input>(
  render: DatePickerRenderInfo,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedDatePicker => {
  const builders = buildersOf(DatePickerSlots, mixins, context)
  return {
    trigger: builders.trigger.attrs(render.trigger),
    triggerContent: render.triggerContent,
    panel: render.panel === undefined ? undefined : builders.panel.attrs(render.panel),
    backdrop: render.backdrop === undefined ? undefined : builders.backdrop.attrs(render.backdrop),
    calendar: render.calendar,
    isVisible: render.isVisible,
  }
}

/**
 * The date picker's `toView`: `draw` receives its bundles with `mixins`
 * applied, and the date picker's builder to draw them with; without one,
 * they are drawn as upstream draws them. Unlike the other adapters' it takes
 * no builder of the application's, which could not draw these bundles.
 */
export const toView =
  (
    mixins: MixinList<Message>,
    draw: (resolved: ResolvedDatePicker, h: HtmlBuilder<Message>) => Html = defaultToView,
  ) =>
  (render: DatePickerRenderInfo, h: HtmlBuilder<Message>): Html =>
    draw(resolve(render, mixins, { input: undefined, h }), h)

const toPicker = (message: UiCalendar.Message): Message => Message.GotCalendarMessage({ message })

/**
 * The date picker's `update` for the application's `selection`, read when
 * the Message arrives. Upstream closes the popover on every day picked; this
 * keeps it open while the day leaves the selection unfinished (a range's
 * first end, any day of a Multiple selection), and is upstream's `update`
 * otherwise. Either way it reports `SelectedDate`, which the application
 * folds through `Calendar.picked`. Escape, a press outside and the trigger
 * still close it, leaving whatever was picked so far.
 */
export const update =
  (selection: Selection) =>
  (model: Model, message: Message): Update.ReturnWithOutMessage<Model, Message, OutMessage> =>
    Match.value(message).pipe(
      Match.tag('GotCalendarMessage', ({ message: calendarMessage }) => {
        const next = UiCalendar.update(model.calendar, calendarMessage)
        return pipe(
          Option.fromNullishOr(next.outMessage),
          Option.flatMap(out =>
            UiCalendar.OutMessage.match<Option.Option<Dates.CalendarDate>>(out, {
              SelectedDate: ({ date }) => Option.some(date),
              ChangedViewMonth: () => Option.none(),
            }),
          ),
          Option.filter(date => !isComplete(picked(selection, date))),
          Option.match({
            onNone: () => upstreamUpdate(model, message),
            onSome: date => ({
              model: modifyFields(model, { calendar: () => next.model }),
              commands: Command.mapMessages(next.commands, toPicker),
              outMessage: OutMessage.SelectedDate({ date }),
            }),
          }),
        )
      }),
      Match.orElse(() => upstreamUpdate(model, message)),
    )
