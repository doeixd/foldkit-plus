/**
 * A picker that is a dropdown on a desktop and a bottom sheet on a phone:
 * one control, one Model and one set of Messages whatever the width. The
 * application owns the value, as with `@foldkit/ui`'s Listbox, and hears a
 * choice made either way as the same `Chose`.
 *
 * ```text
 * at or above the breakpoint: Listbox trigger -> Listbox panel -> Selected -> Chose
 * below it:                   opener -> Sheet -> an option pressed  -> Chose
 * ```
 *
 * Both are drawn, and `Recipes.Picker` shows one: the `dropdown` (a Listbox,
 * its panel kept in place with `portal: false`) at or above its
 * `sheetBelow` breakpoint, the `opener` below it, so nothing reads the width
 * and a server render is right at every width. The one hidden is
 * `display: none`, out of the accessibility tree and the tab order. Opening
 * the Sheet closes the Listbox, so one left open behind a window narrowed
 * past the breakpoint does not stay open beside it; a Sheet open when the
 * window widens stays until chosen from or dismissed.
 *
 * The Sheet's list is a listbox of option buttons: the chosen one (or the
 * first) takes the Dialog's first focus and is the one in the tab order, the
 * arrows, Home and End move focus between them, and Enter, Space or a tap
 * chooses, which closes the Sheet and gives focus back to the opener. An
 * option's content and the trigger's are `Listbox.parts`', in the Listbox's
 * slots.
 */
import * as UiDialog from '@foldkit/ui/dialog'
import * as UiListbox from '@foldkit/ui/listbox'
import { Effect, Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { ReturnWithOutMessage } from 'foldkit/update'
import type { ResolvedDialog } from './dialog.js'
import * as Listbox from './listbox.js'
import * as ListboxView from './listboxView.js'
import type { MixinList } from './resolve.js'
import * as Sheet from './sheet.js'

export const PickerSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  /** The desktop's half: the Listbox, its trigger and its panel. */
  dropdown: Slot.make({ capability: Capability.Container }),
  /** The phone's half: the button that opens the Sheet. */
  opener: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded, Attr.AriaLabel],
  }),
  /** The Sheet's options. */
  list: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  option: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaSelected],
  }),
})

export const Model = Schema.Struct({
  id: Schema.String,
  /** The desktop's dropdown: which row is active, whether it is open. */
  listbox: UiListbox.Model,
  /** The phone's sheet. */
  sheet: Sheet.Model,
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  GotListbox: { message: UiListbox.Message },
  GotSheet: { message: Sheet.Message },
  OpenedSheet: {},
  ChoseInSheet: { value: Schema.String },
  /** A key moved focus to the Sheet's option at `to`. */
  Stepped: { to: Schema.Number },
  CompletedFocus: {},
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  /** An option was chosen, in the dropdown or in the Sheet. */
  Chose: { value: Schema.String },
})
export type OutMessage = typeof OutMessage.Type

export interface InitConfig {
  /** Prefixes the ids the picker draws, unique on the page. */
  readonly id: string
  /** The phone's Sheet, beside its id: points, swipe, animation. It comes from the bottom. */
  readonly sheet?: Omit<Sheet.InitConfig, 'id' | 'side'>
}

/** A closed picker. */
export const init = (config: InitConfig): Model => ({
  id: config.id,
  listbox: UiListbox.init({ id: `${config.id}-listbox` }),
  sheet: Sheet.init({ ...config.sheet, id: `${config.id}-sheet`, side: 'bottom' }),
})

/** The id of the Sheet's option at `index`. */
export const optionId = (id: string, index: number): string => `${id}-option-${index}`

/** Upstream's Listbox `update` with this package's view, over the picker's options. */
const Dropdown = ListboxView.create<PickerOption<string>, string>()

const Focus = Command.define('FocusPickerOption', {
  args: { selector: Schema.String },
  messages: [Message.CompletedFocus],
  execute: ({ selector }) =>
    Dom.focus(selector).pipe(Effect.ignore, Effect.as(Message.CompletedFocus())),
})

export type Return = ReturnWithOutMessage<Model, Message, OutMessage>

const listboxStep = (
  model: Model,
  next: ReturnWithOutMessage<UiListbox.Model, UiListbox.Message, UiListbox.OutMessage>,
): Return => ({
  model: next.model === model.listbox ? model : modifyFields(model, { listbox: () => next.model }),
  commands: Command.mapMessages(next.commands ?? [], message => Message.GotListbox({ message })),
  ...(next.outMessage === undefined
    ? {}
    : { outMessage: OutMessage.Chose({ value: next.outMessage.value }) }),
})

const sheetStep = (model: Model, next: Sheet.Return): Return => ({
  model: next.model === model.sheet ? model : modifyFields(model, { sheet: () => next.model }),
  commands: Command.mapMessages(next.commands ?? [], message => Message.GotSheet({ message })),
})

/** The picker after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return =>
  Message.match(message, {
    GotListbox: ({ message }) => listboxStep(model, Dropdown.update(model.listbox, message)),
    GotSheet: ({ message }) => sheetStep(model, Sheet.update(model.sheet, message)),
    OpenedSheet: () => {
      const closed = model.listbox.isOpen
        ? listboxStep(model, Dropdown.close(model.listbox))
        : { model, commands: [] }
      const opened = sheetStep(closed.model, Sheet.open(closed.model.sheet))
      return {
        model: opened.model,
        commands: [...(closed.commands ?? []), ...(opened.commands ?? [])],
      }
    },
    ChoseInSheet: ({ value }) => ({
      ...sheetStep(model, Sheet.close(model.sheet)),
      outMessage: OutMessage.Chose({ value }),
    }),
    Stepped: ({ to }) => ({ model, commands: [Focus({ selector: `#${optionId(model.id, to)}` })] }),
    CompletedFocus: () => ({ model }),
  })

/** An option: its value, and what it shows in the list and on the trigger. */
export interface PickerOption<Value extends string> extends Listbox.OptionContent {
  readonly value: Value
}

export interface PickerView<Value extends string, Outer> {
  readonly model: Model
  readonly onMessage: (message: Message) => NoInfer<Outer>
  /** Names the control, and titles the Sheet. */
  readonly label: string
  readonly options: ReadonlyArray<PickerOption<Value>>
  /** The chosen value, which the application keeps. */
  readonly value: Option.Option<NoInfer<Value>>
  /** Shown on the trigger while nothing is chosen. */
  readonly placeholder: string
  /** Where the dropdown's panel opens; default below the trigger's start, kept in place. */
  readonly anchor?: UiListbox.AnchorConfig
  /** A style of `PickerSlots` (`Recipes.Picker`). */
  readonly style?: NamedStyle<typeof PickerSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Outer> | undefined
  /** The Listbox's style and mixins (`Recipes.Listbox`), which also draw the options' and the trigger's content. */
  readonly listbox?: MixinList<Outer> | undefined
  /** The Sheet's style and mixins (`Recipes.Sheet`), on `DialogSlots`. */
  readonly sheet?: MixinList<Outer> | undefined
}

/** Where a key moves focus from the option at `index` of `count`, if it is one that moves it. */
const stepped = (key: string, index: number, count: number): Option.Option<number> => {
  if (count === 0) return Option.none()
  if (key === 'Home') return Option.some(0)
  if (key === 'End') return Option.some(count - 1)
  if (key === 'ArrowDown') return Option.some(Math.min(count - 1, index + 1))
  if (key === 'ArrowUp') return Option.some(Math.max(0, index - 1))
  return Option.none()
}

/** The picker: the dropdown and the opener, one shown by the style, and the Sheet. */
export const view = <Value extends string, Outer>(
  options: PickerView<Value, Outer>,
  h: HtmlBuilder<Outer>,
): Html => {
  const { model, onMessage, value } = options
  const builders = SlotView.buildersFor(
    PickerSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const listboxMixins = options.listbox ?? []
  const part = Listbox.parts(listboxMixins, { h })
  const chosen = Option.flatMap(value, current =>
    Option.fromNullishOr(options.options.find(option => option.value === current)),
  )
  const trigger = part.trigger(chosen, options.placeholder)
  const choices = options.options
  const focused = Math.max(
    0,
    choices.findIndex(option => Option.contains(value, option.value)),
  )
  // Both triggers say what they choose and what is chosen.
  const named = `${options.label}: ${Option.match(chosen, {
    onNone: () => options.placeholder,
    onSome: option => option.label,
  })}`
  return h.div(builders.root.attrs(), [
    h.div(builders.dropdown.attrs(), [
      h.submodel({
        slotId: model.listbox.id,
        model: model.listbox,
        view: Dropdown.view,
        viewInputs: {
          anchor: options.anchor ?? {
            placement: 'bottom-start',
            gap: 4,
            padding: 8,
            portal: false,
          },
          items: choices,
          itemToValue: (option: PickerOption<string>) => option.value,
          maybeSelectedValue: value,
          ariaLabel: named,
          itemToConfig: (option: PickerOption<string>) => ({ content: part.option(option) }),
          buttonContent: trigger,
          toView: Listbox.toView(listboxMixins, { h }),
        },
        toParentMessage: message => onMessage(Message.GotListbox({ message })),
      }),
    ]),
    h.button(
      builders.opener.attrs([
        h.Type('button'),
        h.AriaHasPopup('dialog'),
        h.AriaExpanded(Sheet.isOpen(model.sheet)),
        h.AriaLabel(named),
        h.OnClick(onMessage(Message.OpenedSheet())),
      ]),
      [trigger],
    ),
    Sheet.view(
      {
        model: model.sheet,
        onMessage: message => onMessage(Message.GotSheet({ message })),
        mixins: options.sheet ?? [],
        draw: (dialog: ResolvedDialog<Outer>) =>
          h.dialog(
            dialog.dialog,
            dialog.isVisible
              ? [
                  h.div(dialog.backdrop),
                  h.div(dialog.panel, [
                    h.div(dialog.handle),
                    h.h2(dialog.title, [options.label]),
                    h.div(
                      builders.list.attrs([
                        h.Role('listbox'),
                        h.AriaLabelledBy(UiDialog.titleId(model.sheet.dialog)),
                      ]),
                      choices.map((option, index) =>
                        h.keyed('button')(
                          option.value,
                          builders.option.attrs([
                            h.Type('button'),
                            h.Id(optionId(model.id, index)),
                            h.Role('option'),
                            h.AriaSelected(Option.contains(value, option.value)),
                            h.Tabindex(index === focused ? 0 : -1),
                            ...(index === focused ? dialog.initialFocus : []),
                            h.OnClick(onMessage(Message.ChoseInSheet({ value: option.value }))),
                            h.OnKeyDownPreventDefault(key =>
                              Option.map(stepped(key, index, choices.length), to =>
                                onMessage(Message.Stepped({ to })),
                              ),
                            ),
                          ]),
                          [part.option(option)],
                        ),
                      ),
                    ),
                  ]),
                ]
              : [],
          ),
      },
      h,
    ),
  ])
}
