/**
 * A DatePicker view with the consumer `toView` seam `@foldkit/ui/datePicker`
 * does not expose. State, Messages, update, Commands, and helpers stay
 * upstream; only markup assembly is transcribed, from `@foldkit/ui@0.165.0`
 * (`packages/ui/src/datePicker/index.ts`, MIT (c) 2025 Devin Jameson) at tag
 * `@foldkit/ui@0.165.0`, with the popover-level bundles named
 * (`DatePickerRenderInfo`) and handed to `toView`.
 *
 * The fork keeps upstream's composition: the calendar grid still renders
 * through the consumer's `toCalendarView`, and the trigger face through
 * `triggerContent`. Only the popover assembly (trigger button, backdrop,
 * panel around the calendar) gains the seam. The default `toView`
 * reproduces upstream's markup; the parity battery draws both views over the
 * same models, so drift fails loudly. If upstream gains a seam, delete this
 * module; on a bump, re-transcribe and re-run the battery.
 */
import { Option, Predicate, Schema } from 'effect'
import * as Calendar from 'foldkit/calendar'
import * as UiCalendar from '@foldkit/ui/calendar'
import { Message } from '@foldkit/ui/datePicker'
import type { Model, ViewInputs as UpstreamViewInputs } from '@foldkit/ui/datePicker'
import * as Popover from '@foldkit/ui/popover'
import { type Html, type HtmlBuilder } from 'foldkit/html'
import { defineView } from 'foldkit/submodel'
import type { SlotAttributes } from 'foldkit-mixins'
import { Selection, selectedDate } from './calendar.js'
import { idSelector } from './datePickerUtils.js'

/**
 * The date picker's popover-level bundles. `panel` and `backdrop` are
 * present only while the popover shows them; `calendar` is the embedded
 * calendar submodel's content and `triggerContent` the trigger face, both
 * drawn by their consumer callbacks, passed through for the draw to place.
 */
export type DatePickerRenderInfo = Readonly<{
  trigger: SlotAttributes<Message>
  triggerContent: Html
  panel: SlotAttributes<Message> | undefined
  backdrop: SlotAttributes<Message> | undefined
  calendar: Html
  isVisible: boolean
}>

/** What upstream's picker shows: one day. */
type OfDate = Pick<UpstreamViewInputs, 'maybeSelectedDate' | 'triggerContent'> &
  Readonly<{ selection?: never }>

/**
 * What a picker of a whole Calendar selection shows, one that
 * `DatePicker.update(selection)` keeps open while a range is unfinished.
 */
type OfSelection = Readonly<{
  /**
   * The application's selection: the calendar's marked day, the trigger and
   * the hidden inputs all read it. Under `name`, each chosen day is a hidden
   * input of its own, in order (a range's start, then its end), as a multiple
   * select submits its options, so `FormData.getAll(name)` reads them back.
   */
  selection: Selection
  /** The trigger's face for the selection, such as both ends of a range. */
  triggerContent: (selection: Selection) => Html
  maybeSelectedDate?: never
}>

/**
 * Upstream view inputs plus the seam. Omit `toView` for upstream markup. It
 * is handed the date picker's own builder, since its bundles speak the date
 * picker's Message. In place of upstream's one day, a picker may show a
 * whole `selection`.
 */
export type DatePickerViewInputs = Omit<UpstreamViewInputs, keyof OfDate> &
  (OfDate | OfSelection) &
  Readonly<{ toView?: (render: DatePickerRenderInfo, h: HtmlBuilder<Message>) => Html }>

/** What the trigger, the calendar's mark and the hidden inputs show, from either kind of input. */
const shownOf = (inputs: OfDate | OfSelection) => {
  if (inputs.selection === undefined) {
    return {
      maybeSelectedDate: inputs.maybeSelectedDate,
      face: inputs.triggerContent(inputs.maybeSelectedDate),
      days: Option.toArray(inputs.maybeSelectedDate),
    }
  }
  return {
    maybeSelectedDate: selectedDate(inputs.selection),
    face: inputs.triggerContent(inputs.selection),
    days: submitted(inputs.selection),
  }
}

/** The days a selection submits: its day, a range's ends, or every day of many. */
const submitted = (selection: Selection): ReadonlyArray<Calendar.CalendarDate> =>
  Selection.match(selection, {
    Single: ({ date }) => Option.toArray(date),
    Range: ({ start, end }) => [...Option.toArray(start), ...Option.toArray(end)],
    Multiple: ({ dates }) => dates,
  })

const encodeIsoDate = Schema.encodeSync(Calendar.CalendarDateFromIsoString)

export const view = defineView<Model, Message, DatePickerViewInputs>(
  (model, viewInputs, h): Html => {
    const {
      anchor,
      toCalendarView,
      isDisabled,
      name,
      className,
      attributes = [],
      triggerClassName,
      triggerAttributes = [],
      ariaLabel,
      ariaLabelledBy,
      panelClassName,
      panelAttributes = [],
      backdropClassName,
      backdropAttributes = [],
    } = viewInputs

    const resolveTriggerLabel = () => {
      if (Predicate.isNotUndefined(ariaLabel)) {
        return [h.AriaLabel(ariaLabel)]
      } else if (Predicate.isNotUndefined(ariaLabelledBy)) {
        return [h.AriaLabelledBy(ariaLabelledBy)]
      } else {
        return []
      }
    }

    const triggerLabelAttributes = resolveTriggerLabel()

    const shown = shownOf(viewInputs)

    const calendarViewLabels: UiCalendar.ViewLabels = {
      ...(viewInputs.previousMonthLabel !== undefined && {
        previousMonthLabel: viewInputs.previousMonthLabel,
      }),
      ...(viewInputs.nextMonthLabel !== undefined && {
        nextMonthLabel: viewInputs.nextMonthLabel,
      }),
      ...(viewInputs.previousYearsPageLabel !== undefined && {
        previousYearsPageLabel: viewInputs.previousYearsPageLabel,
      }),
      ...(viewInputs.nextYearsPageLabel !== undefined && {
        nextYearsPageLabel: viewInputs.nextYearsPageLabel,
      }),
      ...(viewInputs.daysHeadingButtonLabel !== undefined && {
        daysHeadingButtonLabel: viewInputs.daysHeadingButtonLabel,
      }),
      ...(viewInputs.monthsHeadingButtonLabel !== undefined && {
        monthsHeadingButtonLabel: viewInputs.monthsHeadingButtonLabel,
      }),
      ...(viewInputs.toDaysGridLabel !== undefined && {
        toDaysGridLabel: viewInputs.toDaysGridLabel,
      }),
      ...(viewInputs.toWeekLabel !== undefined && {
        toWeekLabel: viewInputs.toWeekLabel,
      }),
      ...(viewInputs.toMonthsGridLabel !== undefined && {
        toMonthsGridLabel: viewInputs.toMonthsGridLabel,
      }),
      ...(viewInputs.toYearsGridLabel !== undefined && {
        toYearsGridLabel: viewInputs.toYearsGridLabel,
      }),
    }

    const calendarVNode = h.submodel({
      slotId: model.calendar.id,
      model: model.calendar,
      view: UiCalendar.view,
      viewInputs: {
        maybeSelectedDate: shown.maybeSelectedDate,
        toView: toCalendarView,
        ...calendarViewLabels,
      },
      toParentMessage: (message: UiCalendar.Message) => Message.GotCalendarMessage({ message }),
    })

    const renderPopover = ({
      button,
      panel,
      backdrop,
      isVisible,
    }: {
      button: SlotAttributes<Message>
      panel: SlotAttributes<Message>
      backdrop: SlotAttributes<Message>
      isVisible: boolean
    }): Html => {
      const render: DatePickerRenderInfo = {
        trigger: [
          ...button,
          ...triggerLabelAttributes,
          ...(triggerClassName !== undefined ? [h.Class(triggerClassName)] : []),
          ...triggerAttributes,
        ],
        triggerContent: shown.face,
        panel: isVisible
          ? [
              ...panel,
              ...(panelClassName !== undefined ? [h.Class(panelClassName)] : []),
              ...panelAttributes,
            ]
          : undefined,
        backdrop: isVisible
          ? [
              ...backdrop,
              ...(backdropClassName !== undefined ? [h.Class(backdropClassName)] : []),
              ...backdropAttributes,
            ]
          : undefined,
        calendar: calendarVNode,
        isVisible,
      }
      return (viewInputs.toView ?? defaultToView)(render, h)
    }

    const popoverVNode = h.submodel({
      slotId: model.popover.id,
      model: model.popover,
      view: Popover.view,
      viewInputs: {
        anchor,
        ...(isDisabled !== undefined && { isDisabled }),
        focusSelector: idSelector(`${model.calendar.id}-grid`),
        toView: renderPopover,
      },
      toParentMessage: (message: Popover.Message) => Message.GotPopoverMessage({ message }),
    })

    // Nothing chosen still submits the name, empty, as upstream's one input does.
    const hiddenValues = shown.days.length === 0 ? [''] : shown.days.map(day => encodeIsoDate(day))

    const maybeHiddenInput: ReadonlyArray<Html> =
      name !== undefined
        ? hiddenValues.map(value => h.input([h.Type('hidden'), h.Name(name), h.Value(value)]))
        : []

    const wrapperAttributes = [
      ...(className !== undefined ? [h.Class(className)] : []),
      ...attributes,
    ]

    return h.div(wrapperAttributes, [popoverVNode, ...maybeHiddenInput])
  },
)

/** Upstream's popover assembly from the computed bundles: the default `toView`. */
export const defaultToView = (render: DatePickerRenderInfo, h: HtmlBuilder<Message>): Html =>
  h.div(
    [],
    [
      h.button([...render.trigger], [render.triggerContent]),
      ...(render.isVisible
        ? [h.div([...(render.backdrop ?? [])]), h.div([...(render.panel ?? [])], [render.calendar])]
        : []),
    ],
  )
