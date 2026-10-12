import { Agent } from 'foldkit-agent'
import { Projection } from 'foldkit-surface'

import { App, Message } from './app.js'

const Todos = Agent.forApplication(App)

// An agent sees the todos and may send two Messages. Nothing else exists to it.
export const TodoAgent = Todos.make({
  context: Projection.pick(App.model.todos),
  messages: Todos.expose(Message, {
    AddedTodo: 'Add a todo',
    ToggledTodo: {
      name: 'toggle_todo',
      description: 'Mark a todo done, or not done',
      available: model => model.todos.length > 0,
    },
  }),
})
