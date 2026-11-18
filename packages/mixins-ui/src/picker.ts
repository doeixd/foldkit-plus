/**
 * A picker that is a dropdown on a desktop and a bottom sheet on a phone:
 * one control, one Model and one set of Messages whatever the width. The
 * application owns the value, read through a `Choice` as the Listbox's is,
 * and hears a choice made either way as the same `Chose`.
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
 * slots, and so is the clear button, drawn beside the opener as the Listbox
 * draws it beside its trigger.
 */
import * as UiDialog from '@foldkit/ui/dialog'
import * as UiListbox from '@foldkit/ui/listbox'
import { Effect, Option, Schema } from 'effect'
import {
  Attr,
  Behaviors,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type Diagnostic,
  type NamedStyle,
} from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import * as Dom from 'foldkit/dom'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { ReturnWithOutMessage } from 'foldkit/update'
import type { SingleChoice } from './choice.js'
import { layered, type PresetOption, type Presets } from './configure.js'
import type { ResolvedDialog } from './dialog.js'
import { idSelector } from './datePickerUtils.js'
import * as Listbox from './listbox.js'
import { ListboxSlots } from './listbox/slots.js'
import { words as listboxWords, type ListboxWords } from './listbox/words.js'
import * as ListboxView from './listboxView.js'
import { buildersOf, type MixinList } from './resolve.js'
import type { RowContent } from './rowContent.js'
import * as Sheet from './sheet.js'
import { wordsOf } from './words.js'

export const PickerSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  /** The desktop's half: the Listbox, its trigger and its panel. */
  dropdown: Slot.make({ capability: Capability.Container }),
  /** The phone's half: the opener with the clear button beside it. */
  phone: Slot.make({ capability: Capability.Container }),
  /** The button that opens the Sheet. */
  opener: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaExpanded, Attr.AriaLabel, Attr.AriaDisabled, Attr.AriaInvalid],
  }),
  /** The Sheet's options. */
  list: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  option: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click, Event.KeyDown],
    attributes: [Attr.Role, Attr.AriaSelected, Attr.AriaDisabled],
  }),
  /** A group of the Sheet's options, and its heading. */
  group: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role, Attr.AriaLabelledby],
  }),
  heading: Slot.make({ capability: Capability.Container }),
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
  /** Moves focus to the Sheet's option at `to`: what an application's key route answers. */
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
const Dropdown = ListboxView.create<string>()

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
    Stepped: ({ to }) => ({
      model,
      commands: [Focus({ selector: idSelector(optionId(model.id, to)) })],
    }),
    CompletedFocus: () => ({ model }),
  })

/** A key the application answers on a Sheet option; the press's `item.index` is the option's place. */
export type Route<Message> = Behaviors.Keys.Route<undefined, Message>

export interface PickerView<Item extends string, Value, Outer> {
  readonly model: Model
  readonly onMessage: (message: Message) => NoInfer<Outer>
  /** Names the control, and titles the Sheet. */
  readonly label: string
  /**
   * How `value` is read: `Picker.one(items)`, or the application's own choice
   * of at most one item. The item and value types come from here alone.
   */
  readonly choice: SingleChoice<Item, Value>
  /** The application's field, folded through the same `choice` where the Bundle reports. */
  readonly value: NoInfer<Value>
  /** The rows offered now; default every item of the choice. */
  readonly items?: ReadonlyArray<NoInfer<Item>> | undefined
  /** A row's content; default its item as the label. */
  readonly option?: ((item: NoInfer<Item>) => RowContent) | undefined
  /** The group a row belongs to; rows of one group must be adjacent. */
  readonly groupBy?: ((item: NoInfer<Item>) => string) | undefined
  /** A group's heading in the dropdown and the Sheet; none draws the groups apart and unnamed. */
  readonly heading?: ((group: string) => Html) | undefined
  /** Shown on the trigger while nothing is chosen. */
  readonly placeholder?: string | undefined
  /**
   * A button beside the trigger that empties the choice while something is
   * chosen: it sends `onClear`, and the application folds
   * `ChoiceChange.ClearedSelection()` through its `choice`.
   */
  readonly clear?:
    | { readonly onClear: NoInfer<Outer>; readonly content?: Html | undefined }
    | undefined
  readonly disabled?: boolean | undefined
  readonly invalid?: boolean | undefined
  /** Submits the chosen item under this name. */
  readonly name?: string | undefined
  /** Where the dropdown's panel opens; default below the trigger's start, kept in place. */
  readonly anchor?: UiListbox.AnchorConfig
  readonly words?: Partial<ListboxWords> | undefined
  /** A style of `PickerSlots` (`Recipes.Picker`). */
  readonly style?: NamedStyle<typeof PickerSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Outer> | undefined
  /** The Listbox's style and mixins (`Recipes.Listbox`), which also draw the options' and the trigger's content. */
  readonly listbox?: MixinList<Outer> | undefined
  /** The Sheet's style and mixins (`Recipes.Sheet`), on `DialogSlots`. */
  readonly sheet?: MixinList<Outer> | undefined
  /**
   * Keys the application answers on a Sheet option, beside the arrows, Home
   * and End. They share one keydown owner with those: a route on the same
   * gesture is a diagnostic naming both. The dropdown's keys are the
   * Listbox's.
   */
  readonly routes?: ReadonlyArray<Route<NoInfer<Outer>>> | undefined
}

/** Where each key moves focus from the option at `index` of `count`. */
const STEPS = {
  Home: () => 0,
  End: (_index, count) => count - 1,
  ArrowDown: (index, count) => Math.min(count - 1, index + 1),
  ArrowUp: index => Math.max(0, index - 1),
} satisfies Readonly<Record<string, (index: number, count: number) => number>>
const STEP_KEYS = ['Home', 'End', 'ArrowDown', 'ArrowUp'] as const satisfies ReadonlyArray<
  keyof typeof STEPS & Behaviors.Keys.NamedKey
>

/** A Sheet option's own keys: the arrows, Home and End, each answered with the option's place. */
const ownRoutes = <Outer>(
  step: (
    key: (typeof STEP_KEYS)[number],
    index: number,
  ) => Option.Option<Outer | Behaviors.Keys.Focus<Outer>>,
): ReadonlyArray<Route<Outer>> =>
  STEP_KEYS.map(key =>
    Behaviors.Keys.route<undefined, Outer>(`Step ${key}`, {
      on: [...Behaviors.Keys.withShift(key)],
      handle: ({ item }) =>
        Option.flatMap(Option.fromNullishOr(item), ({ index }) => step(key, index)),
    }),
  )

/**
 * The `mixins:key-conflict` that drawing the Sheet's options with `routes`
 * would throw, or none: the application's routes against the options' own and
 * against each other. The dropdown's keys are the Listbox's.
 */
export const conflict = <Outer>(routes: ReadonlyArray<Route<Outer>>): Option.Option<Diagnostic> =>
  Behaviors.Keys.conflict(
    [...ownRoutes<Outer>(() => Option.none()), ...routes],
    Option.some('option'),
  )

/** The picker: the dropdown and the opener, one shown by the style, and the Sheet. */
export const view = <const Item extends string, Value, Outer>(
  options: PickerView<Item, Value, Outer>,
  h: HtmlBuilder<Outer>,
): Html => {
  const { model, onMessage, choice, value, clear } = options
  const items = options.items ?? choice.items
  const rowOf = options.option ?? ((item: Item): RowContent => ({ label: item }))
  const rows = new Map<string, RowContent>()
  for (const item of items) rows.set(item, rowOf(item))
  const chosen = choice.chosen(value)
  // A chosen item the offered rows no longer hold still shows on the trigger.
  const chosenRows = chosen.map(item => rows.get(item) ?? rowOf(item))
  const keys = Behaviors.Keys.behavior(PickerSlots)<undefined, Outer>({
    slot: 'option',
    name: 'PickerKeys',
    routes: [
      // Focus moves in the handler, not in a Command: a key pressed before the Command ran would
      // meet the option focus had not left and step from it again (two ArrowDowns moved one).
      ...ownRoutes<Outer>((key, index) =>
        Option.some(
          Behaviors.Keys.focus(
            optionId(model.id, STEPS[key](index, items.length)),
            onMessage(Message.CompletedFocus()),
          ),
        ),
      ),
      ...(options.routes ?? []),
    ],
  })
  const builders = SlotView.buildersFor(
    PickerSlots,
    [
      ...(options.style === undefined ? [] : [options.style.mixin]),
      keys.mixin,
      ...(options.mixins ?? []),
    ],
    { input: undefined, h },
  )
  const listboxMixins = options.listbox ?? []
  const part = Listbox.parts(listboxMixins, { h })
  const words = wordsOf(listboxWords, options.words)
  const focused = Math.max(
    0,
    items.findIndex(item => chosen.includes(item)),
  )
  // Both triggers say what they choose and what is chosen.
  const summary =
    chosenRows.length === 0
      ? (options.placeholder ?? '')
      : chosenRows.map(row => row.label).join(', ')
  const named = summary === '' ? options.label : `${options.label}: ${summary}`
  const own = buildersOf(ListboxSlots, listboxMixins, { h })
  const clearable = clear !== undefined && chosen.length > 0 && options.disabled !== true

  const optionRow = (item: Item, index: number, dialog: ResolvedDialog<Outer>): Html => {
    const row = rows.get(item) ?? { label: item }
    return h.keyed('button')(
      item,
      builders.option.attrs(
        [
          h.Type('button'),
          h.Id(optionId(model.id, index)),
          h.Role('option'),
          h.AriaSelected(chosen.includes(item)),
          h.Tabindex(index === focused ? 0 : -1),
          ...(index === focused ? dialog.initialFocus : []),
          ...(row.disabled === true
            ? [h.AriaDisabled(true)]
            : [h.OnClick(onMessage(Message.ChoseInSheet({ value: item })))]),
        ],
        { index, id: item, count: items.length },
      ),
      [part.option(row)],
    )
  }

  const sheetRows = (dialog: ResolvedDialog<Outer>): ReadonlyArray<Html> => {
    const { groupBy, heading } = options
    if (groupBy === undefined) return items.map((item, index) => optionRow(item, index, dialog))
    // Rows of one group are adjacent: each run is a group of its own, under its heading.
    const runs: Array<{ readonly name: string; readonly members: Array<Html> }> = []
    items.forEach((item, index) => {
      const name = groupBy(item)
      const row = optionRow(item, index, dialog)
      const last = runs.at(-1)
      if (last !== undefined && last.name === name) last.members.push(row)
      else runs.push({ name, members: [row] })
    })
    return runs.map(({ name, members }, run) => {
      const headingId = `${model.id}-heading-${run}`
      return h.div(
        builders.group.attrs([
          h.Role('group'),
          ...(heading === undefined ? [] : [h.AriaLabelledBy(headingId)]),
        ]),
        [
          ...(heading === undefined
            ? []
            : [h.div(builders.heading.attrs([h.Id(headingId)]), [heading(name)])]),
          ...members,
        ],
      )
    })
  }

  const opener = h.button(
    builders.opener.attrs([
      h.Type('button'),
      h.AriaHasPopup('dialog'),
      h.AriaExpanded(Sheet.isOpen(model.sheet)),
      h.AriaLabel(named),
      ...(options.invalid === true ? [h.AriaInvalid(true)] : []),
      ...(options.disabled === true
        ? [h.AriaDisabled(true)]
        : [h.OnClick(onMessage(Message.OpenedSheet()))]),
    ]),
    [part.trigger(chosenRows, options.placeholder ?? '')],
  )

  return h.div(builders.root.attrs(), [
    h.div(builders.dropdown.attrs(), [
      Listbox.view(
        {
          model: model.listbox,
          onMessage: message => onMessage(Message.GotListbox({ message })),
          label: options.label,
          choice,
          value,
          items,
          option: rowOf,
          ...(options.groupBy === undefined ? {} : { groupBy: options.groupBy }),
          ...(options.heading === undefined ? {} : { heading: options.heading }),
          ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
          ...(clear === undefined ? {} : { clear }),
          ...(options.disabled === undefined ? {} : { disabled: options.disabled }),
          ...(options.invalid === undefined ? {} : { invalid: options.invalid }),
          ...(options.name === undefined ? {} : { name: options.name }),
          anchor: options.anchor ?? {
            placement: 'bottom-start',
            gap: 4,
            padding: 8,
            portal: false,
          },
          words,
          mixins: listboxMixins,
        },
        h,
      ),
    ]),
    // The phone's half: the opener, with the clear button beside it as the Listbox's.
    h.div(builders.phone.attrs(), [
      h.div(own.root.attrs(clearable ? [h.DataAttribute('clearable', '')] : []), [
        opener,
        ...(clear === undefined || !clearable
          ? []
          : [
              h.button(
                own.clear.attrs([
                  h.Type('button'),
                  h.AriaLabel(words.clear),
                  h.OnClick(clear.onClear),
                  ...(clear.content === undefined ? [h.DataAttribute('glyph', 'cross')] : []),
                ]),
                clear.content === undefined ? [] : [clear.content],
              ),
            ]),
      ]),
    ]),
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
                      sheetRows(dialog),
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

// The shipped choice, a file of its own, so a page keeps it only when it reads it.
export { one } from './choice/one.js'

/**
 * What a Picker is given once: its look and each option that holds no
 * Message, no drawing and nothing of one field's value.
 */
export type PickerPreset = Pick<
  PickerView<string, unknown, never>,
  'placeholder' | 'anchor' | 'words' | 'style' | 'listbox' | 'sheet'
> & {
  readonly mixins?: MixinList<never>
}

/**
 * The application's own Picker: `base` for every use, `presets` chosen at a
 * use with `preset`, and the call over both. `mixins` concatenate in that
 * order and `words` merge word by word; any other option given at the call
 * replaces the preset's.
 */
export const configure = <const Names extends string = never>(
  config: Presets<PickerPreset, Names>,
): {
  readonly view: <const Item extends string, Value, Outer>(
    options: PickerView<Item, Value, Outer> & PresetOption<Names>,
    h: HtmlBuilder<Outer>,
  ) => Html
} => ({
  view: (options, h) => view(layered(config, options), h),
})
