/**
 * Editing a value where it is shown, in an `<input>`: a title becomes a text
 * field on Enter, F2 or a double click, Enter saves, Escape puts it back. The
 * Model slice is which item is being edited and its draft, and nothing is
 * read back from the field: every key the field takes arrives as a Message,
 * so a commit sends what `update` has, whatever the last frame drew.
 *
 * A commit of a changed value is the OutMessage `Committed`; the placement's
 * `onOut` saves it, or hands it back to `refuse` with the reason, which keeps
 * the editor open on the same draft with that error. A value left as it was
 * commits nothing.
 */
import { Effect, Option, Schema } from 'effect'
import type { HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Render from 'foldkit/render'
import type * as Update from 'foldkit/update'
import { Bundle, type Declared } from 'foldkit-bundle'
import { Behavior, Behaviors, Capability, Event, type SlotItem } from 'foldkit-mixins'
import { isPrintable } from './typeahead.js'

export const Editing = Schema.Struct({
  /** The item being edited. */
  id: Schema.String,
  /** The value when editing began: committing it unchanged commits nothing. */
  initial: Schema.String,
  draft: Schema.String,
  /** Why the parent refused the last commit, until the draft changes. */
  error: Schema.OptionFromNullOr(Schema.String),
})
export type Editing = typeof Editing.Type

export const Model = Schema.Struct({
  editing: Schema.OptionFromNullOr(Editing),
})
export type Model = typeof Model.Type

export const Message = defineMessageUnion({
  /** A double click where the value shows, or a parent's `start`: edit it, its text selected. */
  Started: { id: Schema.String, text: Schema.String },
  /**
   * A key where the value shows (`text`). Not editing yet, Enter and F2 edit
   * it with its text selected, and a printable key starts over with that key,
   * as a spreadsheet does. Already editing the item, the field not yet drawn,
   * the key does what it would in the field (a character is typed over the
   * selection, Backspace deletes, Enter commits), so keys faster than a frame
   * are kept.
   */
  KeyedOver: { id: Schema.String, text: Schema.String, key: Schema.String },
  /** What the field holds now. */
  Changed: { id: Schema.String, text: Schema.String },
  /** Enter in the field. */
  Entered: { id: Schema.String },
  /** Escape in the field. */
  Escaped: { id: Schema.String },
  /** The field lost focus. */
  Blurred: { id: Schema.String },
  /** A focus Command ran; nothing to change. */
  CompletedFocus: {},
})
export type Message = typeof Message.Type

export const Committed = Schema.TaggedStruct('Committed', {
  id: Schema.String,
  value: Schema.String,
  /** The value the edit began from, which `refuse` needs to go on. */
  initial: Schema.String,
})
export type Committed = typeof Committed.Type

export const Args = Schema.Struct({
  /** Names this editor on the page; the ids it writes start with it. */
  id: Schema.String,
  /**
   * What leaving the field does: `'commit'` saves the draft, `'cancel'` drops
   * it. Either way focus stays where the user put it.
   */
  blur: Schema.Literals(['commit', 'cancel']),
})
export type Args = typeof Args.Type

/** The DOM id of the field. */
export const inputId = (args: Args): string => `${args.id}-input`
/** The DOM id of the element showing item `id`'s value, where focus returns. */
export const displayId = (args: Args, id: string): string => `${args.id}-display-${id}`
/** The DOM id of the refusal's text, which the field is described by. */
export const errorId = (args: Args): string => `${args.id}-error`

/**
 * Focuses the field once it is drawn: its text selected while it still holds
 * `initial`, else the caret at its end, since keys typed before it was drawn
 * are its text now. Decided when it runs, from what is drawn.
 */
const focusInput = (args: Args, initial: string) => ({
  name: 'InlineEdit.focusInput',
  args: { id: args.id },
  effect: Render.afterCommit.pipe(
    Effect.andThen(
      Effect.sync(() => {
        const input = document.getElementById(inputId(args))
        if (input instanceof HTMLInputElement || input instanceof HTMLTextAreaElement) {
          input.focus()
          if (input.value === initial) input.select()
          else input.setSelectionRange(input.value.length, input.value.length)
        }
        return Message.CompletedFocus()
      }),
    ),
  ),
})

/**
 * Focuses the element showing `id` again once the field is gone, unless focus
 * went somewhere else meanwhile: only focus left on nothing comes back.
 */
const returnFocus = (args: Args, id: string) => ({
  name: 'InlineEdit.returnFocus',
  args: { id: args.id, item: id },
  effect: Render.afterCommit.pipe(
    Effect.andThen(
      Effect.sync(() => {
        const active = document.activeElement
        if (active === null || active === document.body || !active.isConnected)
          document.getElementById(displayId(args, id))?.focus()
        return Message.CompletedFocus()
      }),
    ),
  ),
})

type Return = Update.ReturnWithOutMessage<Model, Message, Committed>

const editingOf = (model: Model, id: string): Option.Option<Editing> =>
  Option.filter(model.editing, editing => editing.id === id)

const start = (args: Args, id: string, initial: string, draft: string): Return => ({
  model: { editing: Option.some({ id, initial, draft, error: Option.none() }) },
  commands: [focusInput(args, initial)],
})

/** Ends the edit of `id`, committing its draft when it changed; `refocus` hands focus back. */
const commit = (model: Model, args: Args, id: string, refocus: boolean): Return =>
  Option.match(editingOf(model, id), {
    onNone: () => ({ model }),
    onSome: ({ initial, draft }) => ({
      model: { editing: Option.none() },
      ...(refocus ? { commands: [returnFocus(args, id)] } : {}),
      ...(draft === initial ? {} : { outMessage: Committed.make({ id, value: draft, initial }) }),
    }),
  })

const cancel = (model: Model, args: Args, id: string, refocus: boolean): Return =>
  Option.isNone(editingOf(model, id))
    ? { model }
    : {
        model: { editing: Option.none() },
        ...(refocus ? { commands: [returnFocus(args, id)] } : {}),
      }

const update = (model: Model, message: Message, args: Args): Return =>
  Message.match<Return>(message, {
    // A second Enter before the field is drawn starts nothing new.
    Started: ({ id, text }) =>
      Option.isSome(editingOf(model, id)) ? { model } : start(args, id, text, text),
    KeyedOver: ({ id, text, key }) =>
      Option.match(editingOf(model, id), {
        onNone: () =>
          key === 'Enter' || key === 'F2'
            ? start(args, id, text, text)
            : key === 'Backspace'
              ? { model }
              : start(args, id, text, key),
        onSome: editing => {
          if (key === 'Enter') return commit(model, args, id, true)
          if (key === 'F2') return { model }
          // Until something is typed the whole draft is selected, so a key replaces it.
          const untouched = editing.draft === editing.initial
          const draft =
            key === 'Backspace'
              ? untouched
                ? ''
                : Array.from(editing.draft).slice(0, -1).join('')
              : untouched
                ? key
                : editing.draft + key
          return draft === editing.draft
            ? { model }
            : { model: { editing: Option.some({ ...editing, draft }) } }
        },
      }),
    Changed: ({ id, text }) =>
      Option.match(editingOf(model, id), {
        onNone: () => ({ model }),
        onSome: editing =>
          editing.draft === text
            ? { model }
            : {
                model: { editing: Option.some({ ...editing, draft: text, error: Option.none() }) },
              },
      }),
    Entered: ({ id }) => commit(model, args, id, true),
    Escaped: ({ id }) => cancel(model, args, id, true),
    Blurred: ({ id }) =>
      args.blur === 'commit' ? commit(model, args, id, false) : cancel(model, args, id, false),
    CompletedFocus: () => ({ model }),
  })

export const bundle = Bundle.make('InlineEdit', {
  Model,
  Message,
  args: Args,
  init: () => ({ model: { editing: Option.none() } }),
  update,
  /**
   * What a parent decides: `start(id, text)` edits an item, as a Rename menu
   * item would; `refuse(committed, error)` reopens the editor `Committed` just
   * closed, on the same draft, with `error` for the view. Neither moves focus
   * from where a blur put it.
   */
  helpers: args => ({
    start: (model: Model, id: string, text: string) =>
      update(model, Message.Started({ id, text }), args),
    refuse: (model: Model, committed: Committed, error: string): Update.Return<Model, Message> => ({
      model: {
        editing: Option.some({
          id: committed.id,
          initial: committed.initial,
          draft: committed.value,
          error: Option.some(error),
        }),
      },
    }),
  }),
})

/**
 * The Message a key where the value shows sends, or none: Enter, F2,
 * Backspace, and a printable key other than Space, none of them with Ctrl,
 * Alt or Meta held (nor Shift, for Enter and F2).
 */
export const displayKey = (
  id: string,
  text: string,
  key: string,
  modifiers: KeyboardModifiers,
): Option.Option<Message> => {
  const handled =
    key === 'Enter' || key === 'F2' || key === 'Backspace'
      ? !modifiers.ctrlKey && !modifiers.altKey && !modifiers.metaKey && !modifiers.shiftKey
      : isPrintable(key, modifiers) && key !== ' '
  return handled ? Option.some(Message.KeyedOver({ id, text, key })) : Option.none()
}

export interface BehaviorOptions<Input, Slots, ParentMessage> {
  /** The slot showing an item's value, once per item; it must take focus. */
  readonly display: keyof Slots & string
  /** The field, drawn in place of the display of the item being edited; it must publish `keydown`. */
  readonly input: keyof Slots & string
  /** Where a refusal's text is drawn. */
  readonly error?: keyof Slots & string
  /** The value item `id` shows, which an edit starts from. */
  readonly value: (input: Input, id: string) => string
  /** Items that cannot be edited. */
  readonly disabled?: (input: Input, id: string) => boolean
  /**
   * Keys the field answers beside Enter and Escape, such as Tab moving to the
   * next cell. They share one keydown owner with them: a route on the same
   * key is a diagnostic naming both.
   */
  readonly routes?: ReadonlyArray<Behaviors.Keyboard.Route<Input, ParentMessage>>
}

/**
 * Wires a placed `InlineEdit` to the slots. Each display gets its `id`, a
 * double click and its keys; the field gets its `id`, its value from the
 * draft, `OnInput`, `OnBlur`, `aria-invalid` and `aria-describedby` while a
 * refusal stands, and Enter and Escape as `Behaviors.Keyboard` routes, so an
 * Escape that cancels the edit is default-prevented and closes no dialog
 * around it. A key an input method is composing reaches none of them.
 *
 * The field needs a name of its own: give it `aria-label` (the item's name,
 * or "Rename …"), as a field with no visible label has none.
 */
export const behavior =
  <Field extends string>(declared: Declared<typeof bundle, Field>, args: Args) =>
  <Slots>(slots: Slots) =>
  <Input extends { readonly [K in Field]: Model }, ParentMessage>(
    options: BehaviorOptions<Input, Slots, ParentMessage>,
  ): Behavior.NamedBehavior<Slots, Input, ParentMessage> => {
    const send = (message: Message): ParentMessage =>
      declared.wrapper.make(message) as unknown as ParentMessage
    const editingIn = (input: Input) => input[declared.field].editing
    const whileEditing = (input: Input, toMessage: (id: string) => Message) =>
      Option.map(editingIn(input), ({ id }) => send(toMessage(id)))
    const keys = Behaviors.Keyboard.behavior(slots)<Input, ParentMessage>({
      target: options.input,
      name: 'InlineEditKeys',
      routes: [
        {
          name: 'Commit',
          key: 'Enter',
          toMessage: input => whileEditing(input, id => Message.Entered({ id })),
        },
        {
          name: 'Cancel',
          key: 'Escape',
          toMessage: input => whileEditing(input, id => Message.Escaped({ id })),
        },
        ...(options.routes ?? []),
      ],
    })
    // The routes' one keydown handler, written beside the field's own attributes.
    const keyAttributes = (
      keys.spec as Readonly<Record<string, Behavior.BehaviorSlotOptions<Input, ParentMessage>>>
    )[options.input]?.attributes
    return Behavior.forSlots(slots)<Input, ParentMessage>(
      {
        [options.display]: Behavior.slot({
          requires: { capability: Capability.Focusable },
          attributes: ({
            input,
            h,
            item,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
            readonly item?: SlotItem
          }) => {
            const id = item?.id
            if (id === undefined) return []
            if (options.disabled?.(input, id) === true) return [h.Id(displayId(args, id))]
            const text = options.value(input, id)
            return [
              h.Id(displayId(args, id)),
              h.OnDoubleClick(send(Message.Started({ id, text }))),
              h.OnKeyDownPreventDefault((key, modifiers) =>
                Option.map(displayKey(id, text, key, modifiers), send),
              ),
            ]
          },
        }),
        [options.input]: Behavior.slot({
          requires: { capability: Capability.TextInput, events: [Event.KeyDown] },
          attributes: ({
            input,
            h,
          }: {
            readonly input: Input
            readonly h: HtmlBuilder<ParentMessage>
          }) =>
            Option.match(editingIn(input), {
              onNone: () => [],
              onSome: editing => [
                h.Id(inputId(args)),
                h.Value(editing.draft),
                h.OnInput(text => send(Message.Changed({ id: editing.id, text }))),
                h.OnBlur(send(Message.Blurred({ id: editing.id }))),
                ...(Option.isSome(editing.error)
                  ? [h.AriaInvalid(true), h.AriaDescribedBy(errorId(args))]
                  : []),
                ...(keyAttributes?.({ input, h }) ?? []),
              ],
            }),
        }),
        ...(options.error === undefined
          ? {}
          : {
              [options.error]: Behavior.slot({
                attributes: ({ h }: { readonly h: HtmlBuilder<ParentMessage> }) => [
                  h.Id(errorId(args)),
                ],
              }),
            }),
        // Keyed by values the caller chose; `forSlots` checks every key exists.
      } as unknown as Behavior.BehaviorSpec<Slots, Input, ParentMessage>,
      { name: 'InlineEdit' },
    )
  }

/** The refusal's text while one stands, for the view to draw in the error slot. */
export const errorOf = (model: Model): Option.Option<string> =>
  Option.flatMap(model.editing, editing => editing.error)
