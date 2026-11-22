/**
 * The hand-written `update` the application ran before `foldkit-surface/declared`
 * derived it (`92d3114e2^:examples/todo-app/src/app.ts`), kept as a fixture so
 * `replay.test.ts` can replay the same Messages through both and compare. It
 * runs the transitions of that time: a new todo's id and time were minted by
 * a Command (`MintTodo`), not supplied.
 */
import { Clock, Effect, Match } from 'effect'
import * as Dom from 'foldkit/dom'
import type * as Update from 'foldkit/update'
import { fact } from 'foldkit-sync'
import { Eq, Str, Transition } from 'metakit'
import * as Machine from 'metakit/machine'
import type { EmitOf, MessageOf } from 'metakit/machine'
import { COMPOSER_ID, Message, Model, titleId, visibleTodos } from '../src/app.js'
import { todoMachine } from '../src/surface.js'

const filled = (text: Parameters<typeof Str.trim>[0]) => Eq.isNot(Str.trim(text), '')

/** The application's machine as it was: the two Messages that made a todo emitted `Mint`. */
export const handWrittenMachine = Machine.make({
  state: Model,
  transitions: {
    ...todoMachine.transitions,
    DraftSubmitted: Transition.make({
      state: Model,
      input: Message.DraftSubmitted,
      when: ({ state }) => filled(state.draft),
      apply: ({ state }) => [Transition.set(state.draft, '')],
      emits: ({ state }) => [
        Transition.emit('Mint', { title: Str.trim(state.draft), requestId: null }),
      ],
    }),
    RequestedTodo: Transition.make({
      state: Model,
      input: Message.RequestedTodo,
      when: ({ input }) => filled(input.title),
      apply: () => [],
      emits: ({ input }) => [
        Transition.emit('Mint', { title: Str.trim(input.title), requestId: input.requestId }),
      ],
    }),
  },
})
type TodoMachine = typeof handWrittenMachine

type Return = Update.Return<Model, Message>
type Command = NonNullable<Return['commands']>[number]

/** Mints what a durable fact needs and cannot compute itself: an id and a time. */
const mintTodo = (title: string, request: { readonly requestId?: string }) => ({
  name: 'MintTodo',
  effect: Effect.map(Clock.currentTimeMillis, createdAt =>
    Message.SubmittedTodo({ id: crypto.randomUUID(), title, createdAt, ...request }),
  ),
})

const focusSelector = (selector: string) => ({
  name: 'Focus',
  effect: Dom.focus(selector).pipe(Effect.ignore, Effect.as(Message.CompletedFocus())),
})

const focusTitle = (id: string) => focusSelector(`[id="${titleId(id)}"]`)

const UNDO_FOR = '8 seconds'

type Emitted = EmitOf<TodoMachine['transitions']>

const commandsOf = (record: Emitted): ReadonlyArray<Command> =>
  Match.valueTags(record, {
    Rename: ({ id, title }) =>
      id === null
        ? []
        : [{ name: 'Rename', effect: Effect.succeed(Message.RenamedTodo({ id, title })) }],
    Focus: ({ id }) => (id === null ? [] : [focusTitle(id)]),
    Mint: ({ title, requestId }) => [
      mintTodo(title, typeof requestId === 'string' ? { requestId } : {}),
    ],
    Delete: ({ id }) => [fact(Message.DeletedTodo({ id }))],
    RenameList: ({ title }) => [fact(Message.RenamedList({ title }))],
    FocusNeighbour: ({ id, todos, filter }) => {
      const rows = visibleTodos({ todos, filter })
      const at = rows.findIndex(row => row.id === id)
      const neighbour = rows[at + 1] ?? rows[at - 1]
      return [neighbour === undefined ? focusSelector(`#${COMPOSER_ID}`) : focusTitle(neighbour.id)]
    },
    ExpireUndo: ({ id }) => [
      {
        name: 'ExpireUndo',
        effect: Effect.sleep(UNDO_FOR).pipe(Effect.as(Message.UndoExpired({ id }))),
      },
    ],
    Restore: ({ todo }) => (todo === null ? [] : [fact(Message.RestoredTodo({ todo }))]),
  })

export const makeUpdate =
  (machine: TodoMachine) =>
  (model: Model, message: Message): Return => {
    const run = (declared: MessageOf<TodoMachine['transitions']>): Return => {
      const [next, emitted] = machine.update(model, declared)
      const commands = emitted.flatMap(commandsOf)
      return commands.length === 0 ? { model: next } : { model: next, commands }
    }
    return Message.match<Return>(message, {
      UrlChanged: input => run({ _tag: 'UrlChanged', input }),
      MirrorRestored: input => run({ _tag: 'MirrorRestored', input }),
      DraftSubmitted: input => run({ _tag: 'DraftSubmitted', input }),
      RequestedTodo: input => run({ _tag: 'RequestedTodo', input }),
      EditingCommitted: input => run({ _tag: 'EditingCommitted', input }),
      EditingSubmitted: input => run({ _tag: 'EditingSubmitted', input }),
      DeleteRequested: input => run({ _tag: 'DeleteRequested', input }),
      UndoRequested: input => run({ _tag: 'UndoRequested', input }),
      ListRenameRequested: input => run({ _tag: 'ListRenameRequested', input }),
      SubmittedTodo: input => run({ _tag: 'SubmittedTodo', input }),
      RestoredTodo: input => run({ _tag: 'RestoredTodo', input }),
      ToggledTodo: input => run({ _tag: 'ToggledTodo', input }),
      RenamedTodo: input => run({ _tag: 'RenamedTodo', input }),
      PrioritySet: input => run({ _tag: 'PrioritySet', input }),
      DeletedTodo: input => run({ _tag: 'DeletedTodo', input }),
      ClearedCompleted: input => run({ _tag: 'ClearedCompleted', input }),
      RenamedList: input => run({ _tag: 'RenamedList', input }),
      DraftChanged: input => run({ _tag: 'DraftChanged', input }),
      FilterSelected: input => run({ _tag: 'FilterSelected', input }),
      EditingStarted: input => run({ _tag: 'EditingStarted', input }),
      EditDraftChanged: input => run({ _tag: 'EditDraftChanged', input }),
      EditingStopped: input => run({ _tag: 'EditingStopped', input }),
      UndoExpired: input => run({ _tag: 'UndoExpired', input }),
      OfflineSet: input => run({ _tag: 'OfflineSet', input }),
      SyncStatusChanged: input => run({ _tag: 'SyncStatusChanged', input }),
      CompletedFocus: input => run({ _tag: 'CompletedFocus', input }),
    })
  }
