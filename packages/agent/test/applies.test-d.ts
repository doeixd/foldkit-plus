/**
 * Compile-time expectations for `applies`: it reads the external input, the
 * Model and the principal it is declared with, and answers a decision.
 */
import { Schema } from 'effect'
import { Agent } from '../src/index.js'
import { type Model, Message } from './todoApp.js'

const TodoAgent = Agent.forModel<Model, { readonly canRename: boolean }>()

TodoAgent.expose(Message, {
  RequestedRenameTodo: {
    description: 'Rename a held todo',
    input: Schema.Struct({ id: Schema.String }),
    toMessage: ({ id }) => ({ id, title: 'Renamed' }),
    applies: ({ input, model, principal }) =>
      principal.canRename && model.todos.some(todo => todo.id === input.id),
  },
})

TodoAgent.expose(Message, {
  RequestedRenameTodo: {
    description: 'Rename a held todo',
    input: Schema.Struct({ id: Schema.String }),
    toMessage: ({ id }) => ({ id, title: 'Renamed' }),
    // @ts-expect-error the external input has `id`, not `todoId`.
    applies: ({ input }) => input.todoId === '',
  },
})

TodoAgent.expose(Message, {
  RequestedRenameTodo: {
    description: 'Rename a held todo',
    input: Schema.Struct({ id: Schema.String }),
    toMessage: ({ id }) => ({ id, title: 'Renamed' }),
    // @ts-expect-error a refusal says `applies: false`, not `allowed: false`.
    applies: () => ({ allowed: false, reason: 'No' }),
  },
})

// `Agent.action` and `Agent.variant` carry it too.
Agent.variant({
  description: 'Rename a held todo',
  input: Schema.Struct({ id: Schema.String }),
  toMessage: ({ id }: { id: string }) => ({ id, title: 'Renamed' }),
  applies: ({ input }) => input.id !== '',
})
