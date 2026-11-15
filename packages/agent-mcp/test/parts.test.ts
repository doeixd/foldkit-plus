/**
 * `app://parts`: the controls on the screen, served as a resource. Reading it
 * sends nothing to `update`, and its parts follow availability.
 */
import { Agent } from 'foldkit-agent'
import { Projection } from 'foldkit-surface'
import { AgentMcp, type Response } from 'foldkit-agent-mcp'
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'

const Todo = Schema.Struct({ id: Schema.String, title: Schema.String })
const Message = defineMessageUnion({
  RequestedCreateTodo: { title: Schema.String },
  RequestedDeleteTodo: { id: Schema.String },
})
type Message = typeof Message.Type

interface Model {
  readonly todos: ReadonlyArray<typeof Todo.Type>
  readonly title: string
}

const TodoAgent = Agent.forModel<Model>()
const definition = TodoAgent.make({
  context: Projection.fromReader(
    Schema.Struct({ todos: Schema.Array(Todo), title: Schema.String }),
    (model: Model) => model,
  ),
  messages: TodoAgent.expose(Message, {
    RequestedCreateTodo: { name: 'create_todo', description: 'Create a todo' },
    RequestedDeleteTodo: {
      name: 'delete_todo',
      description: 'Delete a todo',
      available: model => model.todos.length > 0,
    },
  }),
})
const Parts = TodoAgent.parts(definition, {
  title: Agent.part({
    label: 'New title',
    role: 'textbox',
    field: 'title',
    sets: Message.RequestedCreateTodo,
  }),
  remove: Agent.part({
    role: 'button',
    invokes: Message.RequestedDeleteTodo,
    each: context => context.todos,
    key: todo => todo.id,
    label: todo => `Delete ${todo.title}`,
    input: todo => ({ id: todo.id }),
  }),
})

const served = (model: Model, parts?: Agent.Parts<any>) => {
  const dispatched: Array<Message> = []
  const handler = AgentMcp.handler({
    agent: TodoAgent.bind({
      definition,
      host: { model: () => model, dispatch: (message: Message) => void dispatched.push(message) },
      ...(parts === undefined ? {} : { parts }),
    }),
  })
  return { handler, dispatched }
}

const call = async (
  handler: AgentMcp.Handler,
  method: string,
  params?: Record<string, unknown>,
): Promise<Record<string, unknown>> => {
  await handler.handle({ jsonrpc: '2.0', id: 0, method: 'initialize' })
  const response = (await handler.handle({ jsonrpc: '2.0', id: 1, method, params })) as Response
  if (!('result' in response)) throw new Error(JSON.stringify(response))
  return response.result
}

const readParts = async (handler: AgentMcp.Handler) => {
  const result = await call(handler, 'resources/read', { uri: 'app://parts' })
  const [content] = result['contents'] as Array<{ readonly text: string }>
  return JSON.parse(content!.text) as ReadonlyArray<unknown>
}

describe('app://parts', () => {
  it('serves the parts as JSON, leaving out what is absent', async () => {
    const { handler, dispatched } = served(
      { todos: [{ id: 't1', title: 'Milk' }], title: 'Eggs' },
      Parts,
    )
    expect(await readParts(handler)).toEqual([
      {
        id: 'title',
        label: 'New title',
        role: 'textbox',
        capability: { name: 'create_todo', requiresAuthorization: false },
        value: 'Eggs',
      },
      {
        id: 'remove',
        occurrence: 't1',
        label: 'Delete Milk',
        role: 'button',
        capability: { name: 'delete_todo', input: { id: 't1' }, requiresAuthorization: false },
      },
    ])
    expect(dispatched).toEqual([])
  })

  it('leaves out a part whose capability is not offered', async () => {
    const { handler } = served({ todos: [], title: '' }, Parts)
    expect((await readParts(handler)).map(part => (part as { id: string }).id)).toEqual(['title'])
  })

  it('is listed only when the runtime has parts', async () => {
    const uris = async (parts?: Agent.Parts<any>) =>
      (
        (await call(served({ todos: [], title: '' }, parts).handler, 'resources/list'))[
          'resources'
        ] as Array<{ readonly uri: string }>
      ).map(resource => resource.uri)
    expect(await uris(Parts)).toEqual(['app://context', 'app://parts'])
    expect(await uris()).toEqual(['app://context'])
  })

  it('gives way to a resource the contract declares as parts', async () => {
    const Declared = TodoAgent.make({
      messages: definition.messages,
      resources: [
        TodoAgent.resource('parts', {
          description: 'Spare parts',
          schema: Schema.Array(Schema.String),
          read: () => ['bolt'],
        }),
      ],
    })
    const handler = AgentMcp.handler({
      agent: TodoAgent.bind({
        definition: Declared,
        host: { model: () => ({ todos: [], title: '' }), dispatch: () => {} },
        parts: TodoAgent.parts(Declared, {
          create: Agent.part({
            label: 'New',
            role: 'button',
            invokes: Message.RequestedCreateTodo,
          }),
        }),
      }),
    })
    expect(await readParts(handler)).toEqual(['bolt'])
    const listed = (await call(handler, 'resources/list'))['resources'] as Array<{ uri: string }>
    expect(listed.map(resource => resource.uri)).toEqual(['app://parts'])
  })
})
