import * as UiButton from '@foldkit/ui/button'
import * as UiCheckbox from '@foldkit/ui/checkbox'
import * as UiInput from '@foldkit/ui/input'
import { Array, Clock, Effect, Match, Option, Random, Schema, String } from 'effect'
import type { KeyValueStore } from 'effect/unstable/persistence'
import { Command, type Runtime, Subscription, type Update } from 'foldkit'
import type { Document, Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import { Mirror } from 'foldkit-mirror'
import { type NamedStyle, SlotView, Style, type SlotBuilders } from 'foldkit-mixins'
import { Button, type ButtonSlots, Checkbox, Input } from 'foldkit-mixins-ui'
import { Surface } from 'foldkit-surface'

import {
  ActionButtonStyle,
  AddButtonStyle,
  CancelButtonStyle,
  CheckboxStyle,
  ClearButtonStyle,
  DeleteButtonStyle,
  EditInputStyle,
  FilterButtonStyle,
  NewTodoInputStyle,
  SaveButtonStyle,
  SelectedFilterButtonStyle,
  TodoPage,
} from './style.js'

// CONSTANT

const TODOS_STORAGE_KEY = 'todos'

// MODEL

const Todo = Schema.Struct({
  id: Schema.String,
  text: Schema.String,
  completed: Schema.Boolean,
  createdAt: Schema.Number,
})
type Todo = typeof Todo.Type

const Todos = Schema.Array(Todo)
type Todos = typeof Todos.Type

const Filter = Schema.Literals(['All', 'Active', 'Completed'])
type Filter = typeof Filter.Type

export const EditingState = defineTaggedUnion({
  NotEditing: {},
  Editing: { id: Schema.String, text: Schema.String },
})
export type EditingState = typeof EditingState.Type

export const Model = Schema.Struct({
  todos: Todos,
  newTodoText: Schema.String,
  filter: Filter,
  editing: EditingState,
})
export type Model = typeof Model.Type

// MESSAGE

export const Message = defineMessageUnion({
  UpdatedNewTodo: { text: Schema.String },
  UpdatedEditingTodo: { text: Schema.String },
  AddedTodo: {},
  CompletedGenerateTodo: {
    id: Schema.String,
    timestamp: Schema.Number,
    text: Schema.String,
  },
  DeletedTodo: { id: Schema.String },
  ToggledTodo: { id: Schema.String },
  StartedEditing: { id: Schema.String },
  SavedEdit: {},
  CancelledEdit: {},
  ToggledAll: {},
  ClearedCompleted: {},
  SelectedFilter: { filter: Filter },
})
export type Message = typeof Message.Type

// MIRROR

/** Also the mirror's default: an empty list is not stored. */
export const initialModel: Model = {
  todos: [],
  newTodoText: '',
  filter: 'All',
  editing: EditingState.NotEditing(),
}

const App = Surface.application({ Model, Message })

/**
 * The list, remembered in localStorage. The Model owns it: `update` changes
 * it, and the mirror's Subscription writes the store after each change, where
 * upstream returned a `SaveTodos` Command from every branch that changed it.
 * The store is read once, into Flags, before `init`.
 */
export const TodosMirror = Mirror.kv(App, {
  key: TODOS_STORAGE_KEY,
  initial: initialModel,
  fields: [App.model.todos],
  // The list changes only on a click, so nothing is gained by waiting, and
  // upstream wrote at once: a reload right after a click keeps the click.
  throttle: 0,
})

// FLAGS

export const Flags = Schema.Struct({
  restored: Mirror.Message,
})
export type Flags = typeof Flags.Type

// INIT

export const init: Runtime.ApplicationInit<Model, Message, Flags> = flags => ({
  model: TodosMirror.reduce(initialModel, flags.restored),
})

// UPDATE

type UpdateReturn = Update.Return<Model, Message>

export const update = (model: Model, message: Message) =>
  Message.match<UpdateReturn>(message, {
    UpdatedNewTodo: ({ text }) => ({
      model: modifyFields(model, {
        newTodoText: () => text,
      }),
    }),

    UpdatedEditingTodo: ({ text }) => ({
      model: modifyFields(model, {
        editing: () =>
          EditingState.match(model.editing, {
            NotEditing: () => model.editing,
            Editing: ({ id }) => EditingState.Editing({ id, text }),
          }),
      }),
    }),

    AddedTodo: () => {
      if (String.isEmpty(String.trim(model.newTodoText))) {
        return { model }
      }

      return {
        model,
        commands: [GenerateTodo({ text: String.trim(model.newTodoText) })],
      }
    },

    CompletedGenerateTodo: ({ id, timestamp, text }) => {
      const newTodo: Todo = {
        id,
        text,
        completed: false,
        createdAt: timestamp,
      }

      return {
        model: modifyFields(model, {
          todos: todos => [...todos, newTodo],
          newTodoText: () => '',
        }),
      }
    },

    DeletedTodo: ({ id }) => ({
      model: modifyFields(model, {
        todos: todos => Array.filter(todos, todo => todo.id !== id),
      }),
    }),

    ToggledTodo: ({ id }) => ({
      model: modifyFields(model, {
        todos: todos =>
          Array.map(todos, todo =>
            todo.id === id ? modifyFields(todo, { completed: completed => !completed }) : todo,
          ),
      }),
    }),

    StartedEditing: ({ id }) => {
      const maybeTodo = Array.findFirst(model.todos, todo => todo.id === id)
      return {
        model: modifyFields(model, {
          editing: () =>
            EditingState.Editing({
              id,
              text: Option.match(maybeTodo, {
                onNone: () => '',
                onSome: todo => todo.text,
              }),
            }),
        }),
      }
    },

    SavedEdit: () =>
      EditingState.match<UpdateReturn>(model.editing, {
        NotEditing: () => ({ model }),

        Editing: ({ id, text }) => {
          if (String.isEmpty(String.trim(text))) {
            return {
              model: modifyFields(model, {
                editing: () => EditingState.NotEditing(),
              }),
            }
          }

          return {
            model: modifyFields(model, {
              todos: todos =>
                Array.map(todos, todo =>
                  todo.id === id ? modifyFields(todo, { text: () => String.trim(text) }) : todo,
                ),
              editing: () => EditingState.NotEditing(),
            }),
          }
        },
      }),

    CancelledEdit: () => ({
      model: modifyFields(model, {
        editing: () => EditingState.NotEditing(),
      }),
    }),

    ToggledAll: () => {
      const allCompleted = Array.every(model.todos, todo => todo.completed)

      return {
        model: modifyFields(model, {
          todos: todos =>
            Array.map(todos, todo => modifyFields(todo, { completed: () => !allCompleted })),
        }),
      }
    },

    ClearedCompleted: () => ({
      model: modifyFields(model, {
        todos: todos => Array.filter(todos, todo => !todo.completed),
      }),
    }),

    SelectedFilter: ({ filter }) => ({
      model: modifyFields(model, {
        filter: () => filter,
      }),
    }),
  })

// COMMAND

export const GenerateTodo = Command.define('GenerateTodo', {
  args: { text: Schema.String },
  messages: [Message.CompletedGenerateTodo],
  execute: ({ text }) =>
    Effect.gen(function* () {
      const id = yield* Random.nextIntBetween(0, Number.MAX_SAFE_INTEGER).pipe(
        Effect.map(value => value.toString(36)),
      )
      const timestamp = yield* Clock.currentTimeMillis
      return Message.CompletedGenerateTodo({ id, timestamp, text })
    }),
})

// SUBSCRIPTION

export const subscriptions = Subscription.make<Model, Message, KeyValueStore.KeyValueStore>()(
  () => ({
    ...TodosMirror.subscriptions,
  }),
)

// VIEW

type Slots = SlotBuilders<typeof TodoPage.slots, Message>

const button = (
  config: Readonly<{
    onClick: Message
    label: string
    style: NamedStyle<typeof ButtonSlots>
    ariaLabel?: string
  }>,
  h: HtmlBuilder<Message>,
): Html =>
  UiButton.view(
    {
      onClick: config.onClick,
      toView: attributes =>
        h.button(
          [
            ...Button.resolve<undefined, Message>(attributes, [config.style.mixin], {
              input: undefined,
              h,
            }).button,
            ...(config.ariaLabel === undefined ? [] : [h.AriaLabel(config.ariaLabel)]),
          ],
          [config.label],
        ),
    },
    h,
  )

const editingTextFor = (editing: EditingState, todoId: string): Option.Option<string> =>
  EditingState.match(editing, {
    NotEditing: () => Option.none(),
    Editing: ({ id, text }) => Option.liftPredicate(text, () => id === todoId),
  })

const todoItemView = (
  todo: Todo,
  maybeEditingText: Option.Option<string>,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  Option.match(maybeEditingText, {
    onNone: () => nonEditingTodoView(todo, slots, h),
    onSome: text => editingTodoView(todo, text, slots, h),
  })

const editingTodoView = (todo: Todo, text: string, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.keyed('li')(todo.id, slots.editingItem.attrs(), [
    UiInput.view(
      {
        id: `edit-${todo.id}`,
        value: text,
        onInput: text => Message.UpdatedEditingTodo({ text }),
        toView: attributes =>
          h.input([
            ...Input.resolve<undefined, Message>(attributes, [EditInputStyle.mixin], {
              input: undefined,
              h,
            }).input,
            h.AriaLabel('Edit todo'),
          ]),
      },
      h,
    ),
    button({ onClick: Message.SavedEdit(), label: 'Save', style: SaveButtonStyle }, h),
    button({ onClick: Message.CancelledEdit(), label: 'Cancel', style: CancelButtonStyle }, h),
  ])

const nonEditingTodoView = (todo: Todo, slots: Slots, h: HtmlBuilder<Message>): Html =>
  h.keyed('li')(todo.id, slots.item.attrs(), [
    UiCheckbox.view(
      {
        id: `todo-${todo.id}`,
        isChecked: todo.completed,
        onToggle: () => Message.ToggledTodo({ id: todo.id }),
        toView: attributes => {
          const resolved = Checkbox.resolve<undefined, Message>(attributes, [CheckboxStyle.mixin], {
            input: undefined,
            h,
          })
          return h.div(slots.checkboxField.attrs(), [
            h.div(resolved.checkbox, []),
            h.span([...resolved.label, h.AriaLabel(todo.text)]),
          ])
        },
      },
      h,
    ),
    h.span(
      slots.todoText.attrs([
        h.DataAttribute('state', todo.completed ? 'completed' : 'active'),
        h.OnClick(Message.StartedEditing({ id: todo.id })),
      ]),
      [todo.text],
    ),
    button(
      {
        onClick: Message.DeletedTodo({ id: todo.id }),
        label: '×',
        style: DeleteButtonStyle,
        ariaLabel: `Delete ${todo.text}`,
      },
      h,
    ),
  ])

const filterButtonView = (model: Model, filter: Filter, h: HtmlBuilder<Message>): Html =>
  button(
    {
      onClick: Message.SelectedFilter({ filter }),
      label: filter,
      style: model.filter === filter ? SelectedFilterButtonStyle : FilterButtonStyle,
    },
    h,
  )

const footerView = (
  model: Model,
  activeCount: number,
  completedCount: number,
  slots: Slots,
  h: HtmlBuilder<Message>,
): Html =>
  Array.match(model.todos, {
    onEmpty: () => h.empty,
    onNonEmpty: todos =>
      h.div(slots.footer.attrs(), [
        h.div(slots.status.attrs([h.Role('status')]), [
          `${activeCount} active, ${completedCount} completed`,
        ]),

        h.div(slots.buttonRow.attrs(), [
          filterButtonView(model, 'All', h),
          filterButtonView(model, 'Active', h),
          filterButtonView(model, 'Completed', h),
        ]),

        h.div(slots.buttonRow.attrs(), [
          button(
            {
              onClick: Message.ToggledAll(),
              label: Array.every(todos, todo => todo.completed)
                ? 'Mark all active'
                : 'Mark all complete',
              style: ActionButtonStyle,
            },
            h,
          ),

          completedCount > 0
            ? button(
                {
                  onClick: Message.ClearedCompleted(),
                  label: `Clear ${completedCount} completed`,
                  style: ClearButtonStyle,
                },
                h,
              )
            : h.empty,
        ]),
      ]),
  })

const filterTodos = (todos: Todos, filter: Filter): Todos =>
  Match.value(filter).pipe(
    Match.when('All', () => todos),
    Match.when('Active', () => Array.filter(todos, todo => !todo.completed)),
    Match.when('Completed', () => Array.filter(todos, todo => todo.completed)),
    Match.exhaustive,
  )

const emptyText = (filter: Filter): string =>
  Match.value(filter).pipe(
    Match.when('All', () => 'No todos yet. Add one above!'),
    Match.when('Active', () => 'No active todos'),
    Match.when('Completed', () => 'No completed todos'),
    Match.exhaustive,
  )

const activeCountOf = (todos: Todos): number =>
  Array.length(Array.filter(todos, todo => !todo.completed))

export const Page = SlotView.forMessages<Message>()
  .define(TodoPage.slots, (model: Model, slots, h) => {
    const filteredTodos = filterTodos(model.todos, model.filter)
    const activeCount = activeCountOf(model.todos)
    const completedCount = Array.length(model.todos) - activeCount

    return h.div(slots.page.attrs(), [
      h.div(slots.card.attrs(), [
        h.h1(slots.heading.attrs(), ['Todo App']),

        h.form(slots.form.attrs([h.OnSubmit(Message.AddedTodo())]), [
          UiInput.view(
            {
              id: 'new-todo',
              value: model.newTodoText,
              placeholder: 'What needs to be done?',
              onInput: text => Message.UpdatedNewTodo({ text }),
              toView: attributes =>
                h.input([
                  ...Input.resolve<undefined, Message>(attributes, [NewTodoInputStyle.mixin], {
                    input: undefined,
                    h,
                  }).input,
                  h.AriaLabel('New todo'),
                ]),
            },
            h,
          ),
          UiButton.view(
            {
              type: 'submit',
              toView: attributes =>
                h.button(
                  Button.resolve<undefined, Message>(attributes, [AddButtonStyle.mixin], {
                    input: undefined,
                    h,
                  }).button,
                  ['Add'],
                ),
            },
            h,
          ),
        ]),

        Array.match(filteredTodos, {
          onEmpty: () => h.div(slots.empty.attrs(), [emptyText(model.filter)]),
          onNonEmpty: todos =>
            h.ul(
              slots.list.attrs(),
              Array.map(todos, todo =>
                todoItemView(todo, editingTextFor(model.editing, todo.id), slots, h),
              ),
            ),
        }),

        footerView(model, activeCount, completedCount, slots, h),
      ]),
    ])
  })
  .pipe(Style.attach(TodoPage.style))

export const view = (model: Model, h: HtmlBuilder<Message>): Document => ({
  title: `Todos (${activeCountOf(model.todos)})`,
  body: Page(model, h),
})

// FLAG

/** The stored list, read before `init` as upstream's Flags read it, so the first frame shows it. */
export const flags: Effect.Effect<Flags, never, KeyValueStore.KeyValueStore> =
  TodosMirror.restore.effect.pipe(Effect.map(restored => ({ restored })))
