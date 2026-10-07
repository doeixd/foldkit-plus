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
import * as UpstreamDatePicker from '@foldkit/ui/datePicker'
import { Message } from '@foldkit/ui/datePicker'
import type { Model, ViewInputs as UpstreamViewInputs } from '@foldkit/ui/datePicker'
import * as Popover from '@foldkit/ui/popover'
import {
  type Html,
  type HtmlBuilder,
} from 'foldkit/html'
import { defineView } from 'foldkit/submodel'
import type { SlotAttributes } from 'foldkit-mixins'
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

/** Upstream view inputs plus the seam. Omit `toView` for upstream markup. */
export type DatePickerViewInputs = UpstreamViewInputs &
  Readonly<{ toView?: (render: DatePickerRenderInfo) => Html }>

const encodeIsoDate = Schema.encodeSync(Calendar.CalendarDateFromIsoString)

export const view = defineView<Model, Message, DatePickerViewInputs>(
  (model, viewInputs, h): Html => {
    const {
      anchor,
      maybeSelectedDate,
      triggerContent,
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
        maybeSelectedDate,
        toView: toCalendarView,
        ...calendarViewLabels,
      },
      toParentMessage: (message: UiCalendar.Message) =>
        Message.GotCalendarMessage({ message }),
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
        triggerContent: triggerContent(maybeSelectedDate),
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
      return (viewInputs.toView ?? defaultToView(h))(render)
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
      toParentMessage: (message: Popover.Message) =>
        Message.GotPopoverMessage({ message }),
    })

    const hiddenInputValue = Option.match(maybeSelectedDate, {
      onNone: () => '',
      onSome: encodeIsoDate,
    })

    const maybeHiddenInput: ReadonlyArray<Html> =
      name !== undefined
        ? [h.input([h.Type('hidden'), h.Name(name), h.Value(hiddenInputValue)])]
        : []

    const wrapperAttributes = [
      ...(className !== undefined ? [h.Class(className)] : []),
      ...attributes,
    ]

    return h.div(wrapperAttributes, [popoverVNode, ...maybeHiddenInput])
  },
)

/** Upstream's popover assembly from the computed bundles: the default `toView`. */
export const defaultToView =
  (h: HtmlBuilder<Message>) =>
  (render: DatePickerRenderInfo): Html =>
    h.div(
      [],
      [
        h.button([...render.trigger], [render.triggerContent]),
        ...(render.isVisible
          ? [
              h.div([...(render.backdrop ?? [])]),
              h.div([...(render.panel ?? [])], [render.calendar]),
            ]
          : []),
      ],
    )
