/**
 * The views around a `foldkit-crud` editor and remover: what an editor says in
 * each of its states around the form, a question before a delete, and a row of
 * a list's controls. Each is given its state and Messages and owns neither:
 * saving is `Crud.editor`'s, deleting `Crud.remover`'s, and dismissing the
 * application's. Drawn in a page, or in a Dialog or a Drawer the application
 * places, whose focus and dismissal stay that component's.
 */
import { Option } from 'effect'
import type { EditorStatus, RemoverStatus } from 'foldkit-crud'
import { fillWords } from 'foldkit-form'
import { Attr, Capability, Event, Slot, Slots, SlotView } from 'foldkit-mixins'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { Empty, Failure, Loading } from './index.js'

/** What an editor says itself. `{message}` is the error's. */
export interface EditorWords {
  readonly loading?: string
  readonly notFound?: string
  readonly loadFailed?: string
  readonly saving?: string
  readonly saved?: string
  readonly saveFailed?: string
  readonly conflict?: string
  readonly moved?: string
  readonly close?: string
  readonly retry?: string
}

const editorWords: Required<EditorWords> = {
  loading: 'Loading…',
  notFound: 'That does not exist.',
  loadFailed: 'It could not be read.',
  saving: 'Saving…',
  saved: 'Saved.',
  saveFailed: 'Not saved: {message}',
  conflict: 'Someone else saved this first, so your changes were not saved.',
  moved: 'Someone else has saved this since you opened it.',
  close: 'Close',
  retry: 'Try again',
}

export const EditorSlots = Slots.define({
  /** The editor, named by its title, with its state in `data-status`. */
  root: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Base }),
  /** What the state says: busy, a failure, or done. Absent while there is nothing to say. */
  status: Slot.make({ capability: Capability.Base }),
  /** Around the form, while there is something to edit. */
  body: Slot.make({ capability: Capability.Container }),
  actions: Slot.make({ capability: Capability.Container }),
  close: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  retry: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

export interface EditorInput<Message> {
  /** Unique on the page: the root's id, and the prefix of its title's. */
  readonly id: string
  readonly status: EditorStatus
  readonly title: string
  /** The form, drawn by its own view (`EditForm.view(model, h, inputs)`). Shown while there is something to edit. */
  readonly form: Html
  /** Why the last save failed: the editor's `saveError(model)?.message`. */
  readonly error?: string | undefined
  /** Closes the editor. Given, a close button sends it. */
  readonly onClose?: Message | undefined
  /** Asks again after a failed read: a Message whose `update` calls `refresh`. */
  readonly onRetry?: Message | undefined
  readonly words?: EditorWords | undefined
}

type Line = 'busy' | 'said' | 'alert' | 'none'

/** What each state says, how, and whether the form is there to edit. */
const states: {
  readonly [S in EditorStatus]: {
    readonly line: Line
    readonly words: keyof EditorWords | undefined
    readonly form: boolean
  }
} = {
  Closed: { line: 'none', words: undefined, form: false },
  Loading: { line: 'busy', words: 'loading', form: false },
  NotFound: { line: 'said', words: 'notFound', form: false },
  LoadFailed: { line: 'alert', words: 'loadFailed', form: false },
  Editing: { line: 'none', words: undefined, form: true },
  Saving: { line: 'busy', words: 'saving', form: true },
  Saved: { line: 'said', words: 'saved', form: true },
  // A failed save keeps the form: the draft is what the person wrote.
  SaveFailed: { line: 'alert', words: 'saveFailed', form: true },
  Conflict: { line: 'alert', words: 'conflict', form: true },
  Moved: { line: 'said', words: 'moved', form: true },
}

const editor = <Message>() => ({
  define: (options: { readonly name?: string } = {}) =>
    SlotView.forMessages<Message>().define(
      EditorSlots,
      (input: EditorInput<Message>, slots, h) => {
        if (input.status === 'Closed') return h.empty
        const words = { ...editorWords, ...input.words }
        const state = states[input.status]
        const said =
          state.words === undefined
            ? ''
            : fillWords(words[state.words], { message: input.error ?? '' })
        const titleId = `${input.id}-title`
        const line = {
          busy: () => [Loading.view(slots.status, h, said)],
          said: () => [Empty.view(slots.status, h, said)],
          alert: () => [Failure.view(slots.status, h, said)],
          none: () => [],
        }[state.line]()
        const actions = [
          ...(input.status === 'LoadFailed' && input.onRetry !== undefined
            ? [
                h.button(slots.retry.attrs([h.Type('button'), h.OnClick(input.onRetry)]), [
                  words.retry,
                ]),
              ]
            : []),
          ...(input.onClose === undefined
            ? []
            : [
                h.button(slots.close.attrs([h.Type('button'), h.OnClick(input.onClose)]), [
                  words.close,
                ]),
              ]),
        ]
        return h.section(
          slots.root.attrs([
            h.Id(input.id),
            h.AriaLabelledBy(titleId),
            h.DataAttribute('status', input.status),
            ...(state.line === 'busy' ? [h.AriaBusy(true)] : []),
          ]),
          [
            h.h2(slots.title.attrs([h.Id(titleId)]), [input.title]),
            ...line,
            ...(state.form ? [h.div(slots.body.attrs(), [input.form])] : []),
            ...(actions.length === 0 ? [] : [h.div(slots.actions.attrs(), actions)]),
          ],
        )
      },
      { name: options.name ?? 'Editor' },
    ),
})

/** What a question before a delete says. `{name}` is the thing's, `{message}` the error's. */
export interface ConfirmWords {
  readonly question?: string
  readonly confirm?: string
  readonly cancel?: string
  readonly deleting?: string
  readonly deleted?: string
  readonly failed?: string
}

const confirmWords: Required<ConfirmWords> = {
  question: 'Delete {name}?',
  confirm: 'Delete',
  cancel: 'Cancel',
  deleting: 'Deleting…',
  deleted: 'Deleted.',
  failed: 'Not deleted: {message}',
}

export const ConfirmSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  question: Slot.make({ capability: Capability.Base }),
  status: Slot.make({ capability: Capability.Base }),
  actions: Slot.make({ capability: Capability.Container }),
  confirm: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.Disabled],
  }),
  cancel: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
})

export interface ConfirmInput<Message> {
  /** Unique on the page: the root's id, and the prefix of its question's. */
  readonly id: string
  readonly status: RemoverStatus
  /**
   * What is about to be deleted, as the question names it: a post's title, or its
   * id where that is all the page holds (`Remover.target`). Without one there is nothing to confirm, so the confirm button is disabled.
   */
  readonly name: Option.Option<string>
  readonly onConfirm: Message
  readonly onCancel: Message
  /** Why the delete failed: the remover's `error(model)?.message`. */
  readonly error?: string | undefined
  readonly words?: ConfirmWords | undefined
}

const confirm = <Message>() => ({
  define: (options: { readonly name?: string } = {}) =>
    SlotView.forMessages<Message>().define(
      ConfirmSlots,
      (input: ConfirmInput<Message>, slots, h) => {
        const words = { ...confirmWords, ...input.words }
        const questionId = `${input.id}-question`
        const asking = (said: ReadonlyArray<Html>) =>
          h.div(slots.root.attrs([h.Id(input.id), h.Role('group'), h.AriaLabelledBy(questionId)]), [
            h.p(slots.question.attrs([h.Id(questionId)]), [
              fillWords(words.question, { name: Option.getOrElse(input.name, () => '') }),
            ]),
            ...said,
            h.div(slots.actions.attrs(), [
              h.button(
                slots.confirm.attrs([
                  h.Type('button'),
                  ...(Option.isNone(input.name)
                    ? [h.Disabled(true)]
                    : [h.OnClick(input.onConfirm)]),
                ]),
                [words.confirm],
              ),
              h.button(slots.cancel.attrs([h.Type('button'), h.OnClick(input.onCancel)]), [
                words.cancel,
              ]),
            ]),
          ])
        const done = (line: Html) => h.div(slots.root.attrs([h.Id(input.id)]), [line])
        return {
          Idle: () => h.empty,
          Confirming: () => asking([]),
          Deleting: () => done(Loading.view(slots.status, h, words.deleting)),
          Deleted: () => done(Empty.view(slots.status, h, words.deleted)),
          // A failed delete asks again: the question stands, with why it failed.
          DeleteFailed: () =>
            asking([
              Failure.view(
                slots.status,
                h,
                fillWords(words.failed, { message: input.error ?? '' }),
              ),
            ]),
        }[input.status]()
      },
      { name: options.name ?? 'Confirm' },
    ),
})

export const ToolbarSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container }),
  search: Slot.make({ capability: Capability.Container }),
  filters: Slot.make({ capability: Capability.Container }),
  sort: Slot.make({ capability: Capability.Container }),
  actions: Slot.make({ capability: Capability.Container }),
})

/**
 * A list's controls, each the application's own drawing: the search box, the
 * filters, the order and the actions. It reads no query state; what each
 * control changes is the query's input, in the application's Model.
 */
export interface ToolbarInput {
  readonly search?: Html | undefined
  readonly filters?: ReadonlyArray<Html> | undefined
  readonly sort?: Html | undefined
  readonly actions?: ReadonlyArray<Html> | undefined
}

const toolbar = <Message>() => ({
  define: (options: { readonly name?: string } = {}) =>
    SlotView.forMessages<Message>().define(
      ToolbarSlots,
      (input: ToolbarInput, slots, h: HtmlBuilder<Message>) =>
        h.div(slots.root.attrs(), [
          ...(input.search === undefined ? [] : [h.div(slots.search.attrs(), [input.search])]),
          ...(input.filters === undefined || input.filters.length === 0
            ? []
            : [h.div(slots.filters.attrs(), input.filters)]),
          ...(input.sort === undefined ? [] : [h.div(slots.sort.attrs(), [input.sort])]),
          ...(input.actions === undefined || input.actions.length === 0
            ? []
            : [h.div(slots.actions.attrs(), input.actions)]),
        ]),
      { name: options.name ?? 'Toolbar' },
    ),
})

export const EditorView = {
  /** Names the Messages its buttons send: `EditorView.forMessages<Message>().define()`. */
  forMessages: editor,
}

export const ConfirmView = {
  /** Names the Messages its buttons send: `ConfirmView.forMessages<Message>().define()`. */
  forMessages: confirm,
}

export const Toolbar = {
  /** Names the Messages its controls send: `Toolbar.forMessages<Message>().define()`. */
  forMessages: toolbar,
}
