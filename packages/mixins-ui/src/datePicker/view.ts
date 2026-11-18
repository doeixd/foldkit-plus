/**
 * The DatePicker drawn from options: `view` over the state
 * `Bundles.DatePicker` holds, and `configure`. Its panel is the Calendar's
 * frame (presets, today button, `aside`, `footer`) around the picker's one
 * month. A module of its own beside the adapter (`../datePicker.ts`).
 */
import type { AnchorConfig } from '@foldkit/ui/anchor'
import type * as UiDatePicker from '@foldkit/ui/datePicker'
import type { Option } from 'effect'
import type * as Dates from 'foldkit/calendar'
import type { Html, HtmlBuilder } from 'foldkit/html'
import type { NamedStyle } from 'foldkit-mixins'
import { toView as calendarToView, type CalendarSlots, type Preset } from '../calendar.js'
import {
  captionOf,
  labelsOf,
  layout,
  words,
  type Caption,
  type CalendarWords,
  type TodayButton,
} from '../calendar/layout.js'
import type { Selection } from '../calendar/selection.js'
import { layered, type PresetOption, type Presets } from '../configure.js'
import { toView, type DatePickerSlots } from '../datePicker.js'
import { view as pickerView } from '../datePickerView.js'
import type { MixinList } from '../resolve.js'
import { wordsOf } from '../words.js'
import { Message, type Model } from './state.js'

/** Under the trigger's start, and left in place: a portal would move the panel out of the runtime's reach. */
const DEFAULT_ANCHOR: AnchorConfig = {
  placement: 'bottom-start',
  gap: 4,
  padding: 8,
  portal: false,
}

export interface DatePickerView<Outer> {
  /** The state `Bundles.DatePicker` placed, or `DatePicker.init` made. */
  readonly model: Model
  readonly onMessage: (message: Message) => Outer
  /** Names the trigger, and the panel's group. */
  readonly label: string
  /** The trigger's text for the selection, such as a date, both ends of a range, or a prompt. */
  readonly trigger: (selection: Selection) => string
  /** Submits each chosen day under this name, as ISO dates: a range's start, then its end. */
  readonly name?: string | undefined
  readonly disabled?: boolean | undefined
  /** Where the panel stands; default under the trigger's start, not portaled. */
  readonly anchor?: AnchorConfig | undefined
  /** The Calendar's options, for the panel: see `Calendar.view`. */
  readonly weekNumbers?: boolean | undefined
  readonly caption?: Caption | undefined
  readonly paging?: 'both' | 'previous' | 'next' | 'none' | 'end' | undefined
  readonly today?: TodayButton | undefined
  readonly presets?: ReadonlyArray<Preset> | undefined
  readonly detail?: ((date: Dates.CalendarDate) => Option.Option<string>) | undefined
  /** Drawn in the panel beside the month, such as a list of times; place with `closes: 'manual'`. */
  readonly aside?: Html | undefined
  /** Drawn in the panel under everything else. */
  readonly footer?: Html | undefined
  readonly words?: Partial<CalendarWords> | undefined
  /** A style of `DatePickerSlots`: the trigger, the panel, the backdrop. */
  readonly style?: NamedStyle<typeof DatePickerSlots> | undefined
  /** A style of `CalendarSlots`, for the panel's calendar. */
  readonly calendarStyle?: NamedStyle<typeof CalendarSlots> | undefined
  /** Mixins beside the calendar's style, such as `Calendar.readingKeys`. */
  readonly calendarMixins?: MixinList<Outer> | undefined
}

/**
 * A DatePicker: a trigger showing the selection, and a popover holding a
 * Calendar. Every press goes to `onMessage`; the selection is
 * `model.selection`. The popover closes on the pick that makes the
 * selection whole, unless the state was made with `closes: 'manual'`.
 */
export const view = <Outer>(options: DatePickerView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const { model, onMessage } = options
  const { calendar } = model.picker
  const text = wordsOf(words, options.words)
  const calendarMixins: MixinList<Outer> = [
    ...(options.calendarStyle === undefined ? [] : [options.calendarStyle.mixin]),
    ...(options.calendarMixins ?? []),
  ]
  const face = options.trigger(model.selection)
  return h.submodel({
    slotId: model.picker.id,
    model: model.picker,
    view: pickerView,
    viewInputs: {
      anchor: options.anchor ?? DEFAULT_ANCHOR,
      selection: model.selection,
      // The trigger's text is drawn by `toView` below, in the trigger's own slot.
      triggerContent: () => null,
      toCalendarView: calendarToView(
        model.selection,
        calendarMixins,
        { h },
        {
          weekNumbers: options.weekNumbers,
          detail: options.detail,
          paging: options.paging,
          preview: {
            date: model.preview,
            onPreview: date => onMessage(Message.Previewed({ date })),
          },
          ...captionOf(
            options.caption,
            calendar,
            shown => onMessage(Message.Showed({ shown })),
            text,
          ),
        },
      ),
      ariaLabel: options.label,
      ...(options.disabled === undefined ? {} : { isDisabled: options.disabled }),
      ...(options.name === undefined ? {} : { name: options.name }),
      ...labelsOf(text, calendar.locale),
      toView: toView(options.style === undefined ? [] : [options.style.mixin], (resolved, inner) =>
        inner.div(resolved.wrapper, [
          inner.button(resolved.trigger, [face]),
          ...(resolved.backdrop === undefined ? [] : [inner.div(resolved.backdrop, [])]),
          ...(resolved.panel === undefined
            ? []
            : [
                inner.div(resolved.panel, [
                  layout(
                    {
                      label: options.label,
                      months: [resolved.calendar],
                      selection: model.selection,
                      presets: options.presets,
                      presetsLabel: text.presets,
                      onPreset: selection => onMessage(Message.PickedPreset({ selection })),
                      today: options.today,
                      onToday: selects => onMessage(Message.PressedToday({ selects })),
                      aside: options.aside,
                      footer: options.footer,
                      mixins: calendarMixins,
                    },
                    h,
                  ),
                ]),
              ]),
        ]),
      ),
    },
    toParentMessage: (message: UiDatePicker.Message) =>
      onMessage(Message.GotPickerMessage({ message })),
  })
}

/**
 * What a DatePicker is given once: its looks and each option that holds no
 * Message and no drawing. The trigger's text is one field's, so it stays at
 * the call.
 */
export type DatePickerPreset = Pick<
  DatePickerView<never>,
  | 'anchor'
  | 'weekNumbers'
  | 'caption'
  | 'paging'
  | 'today'
  | 'presets'
  | 'detail'
  | 'words'
  | 'style'
  | 'calendarStyle'
>

/**
 * The application's own DatePicker: `base` for every use, `presets` chosen
 * at a use with `preset`, and the call over both. `words` merge word by
 * word; any other option given at the call replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<DatePickerPreset, Names>,
): {
  readonly view: <Outer>(
    options: DatePickerView<Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
