/**
 * Parts: what an agent may know of the screen's controls, read from the
 * contract and the projected context, and no new way to act.
 */
import { Effect, Option, Schema } from 'effect'
import { inertHtml } from 'foldkit/html'
import { Projection } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Agent } from '../src/index.js'
import { Message, type Model, emptyModel, modelWith } from './todoApp.js'

interface Principal {
  readonly canRename: boolean
}

const TodoAgent = Agent.forModel<Model, Principal>()

/** The context shows each todo's id and title, and never `completed`. */
const Context = Schema.Struct({
  todos: Schema.Array(Schema.Struct({ id: Schema.String, title: Schema.String })),
})

const AppAgent = TodoAgent.make({
  // The reader hands back whole todos; the Schema is what decides what is seen.
  context: Projection.fromReader(Context, (model: Model) => ({ todos: model.todos })),
  messages: TodoAgent.expose(Message, {
    RequestedCreateTodo: 'Create a todo',
    RequestedDeleteTodo: {
      description: 'Delete a todo',
      available: model => model.todos.length > 0,
    },
    RequestedRenameTodo: {
      description: 'Rename a todo',
      authorize: ({ principal }) => principal.canRename,
    },
    ClearedSelection: {
      description: 'Clear the selection',
      available: model => Option.isSome(model.selectedTodoId),
    },
  }),
})

const AppParts = TodoAgent.parts(AppAgent, {
  todos: Agent.part({ label: 'Todos', role: 'list', field: 'todos' }),
  create: Agent.part({ label: 'New todo', role: 'button', invokes: Message.RequestedCreateTodo }),
  clear: Agent.part({ label: 'Clear', role: 'button', invokes: Message.ClearedSelection }),
  remove: Agent.part({
    role: 'button',
    invokes: Message.RequestedDeleteTodo,
    each: context => context.todos,
    key: todo => todo.id,
    label: todo => `Delete ${todo.title}`,
    input: todo => ({ id: todo.id }),
  }),
  rename: Agent.part({
    role: 'textbox',
    invokes: Message.RequestedRenameTodo,
    each: context => context.todos,
    key: todo => todo.id,
    label: 'Title',
  }),
})

const milk = { id: 't1', title: 'Milk', completed: true }
const eggs = { id: 't2', title: 'Eggs', completed: false }

/** A host over a Model the test sets, recording what reaches `update` and how often it is read. */
const hostOver = (start: Model, principal: Principal = { canRename: true }) => {
  const state = { model: start, reads: 0, dispatched: [] as Array<Message> }
  const host = {
    model: () => {
      state.reads += 1
      return state.model
    },
    dispatch: (message: Message) => void state.dispatched.push(message),
    principal: () => principal,
  }
  return { state, host }
}

const bound = (start: Model, principal?: Principal) => {
  const { state, host } = hostOver(start, principal)
  const runtime = TodoAgent.bind({ definition: AppAgent, host, parts: AppParts })
  return { state, runtime }
}

const list = (runtime: ReturnType<typeof bound>['runtime']) => Effect.runSync(runtime.parts.list)

const idsOf = (parts: ReadonlyArray<Agent.PartDescriptor>) =>
  parts.map(
    part =>
      `${part.id}${Option.match(part.occurrence, { onNone: () => '', onSome: key => `:${key}` })}`,
  )

describe('Agent.parts', () => {
  it('describes each part from the contract and the projected context', () => {
    const { runtime } = bound(modelWith({ todos: [milk] }))
    const [todos, create, remove, rename] = list(runtime)

    expect(todos).toEqual({
      id: 'todos',
      occurrence: Option.none(),
      label: 'Todos',
      role: 'list',
      capability: Option.none(),
      value: Option.some([{ id: 't1', title: 'Milk' }]),
    })
    expect(create).toEqual({
      id: 'create',
      occurrence: Option.none(),
      label: 'New todo',
      role: 'button',
      capability: Option.some({
        name: 'requested_create_todo',
        input: Option.none(),
        requiresAuthorization: false,
      }),
      value: Option.none(),
    })
    expect(remove).toEqual({
      id: 'remove',
      occurrence: Option.some('t1'),
      label: 'Delete Milk',
      role: 'button',
      capability: Option.some({
        name: 'requested_delete_todo',
        input: Option.some({ id: 't1' }),
        requiresAuthorization: false,
      }),
      value: Option.none(),
    })
    expect(Option.map(rename!.capability, capability => capability.requiresAuthorization)).toEqual(
      Option.some(true),
    )
  })

  it('never shows a field the context leaves out, in a value or to each, key and label', () => {
    const seen: Array<ReadonlyArray<string>> = []
    const Peeking = TodoAgent.parts(AppAgent, {
      todos: Agent.part({ label: 'Todos', role: 'list', field: 'todos' }),
      row: Agent.part({
        role: 'listitem',
        each: context => context.todos,
        key: todo => todo.id,
        label: todo => {
          seen.push(Object.keys(todo))
          return todo.title
        },
      }),
    })
    const { host } = hostOver(modelWith({ todos: [milk, eggs] }))
    const runtime = TodoAgent.bind({ definition: AppAgent, host, parts: Peeking })
    const [todos] = Effect.runSync(runtime.parts.list)

    expect(JSON.stringify(Option.getOrThrow(todos!.value))).not.toContain('completed')
    expect(seen).toEqual([
      ['id', 'title'],
      ['id', 'title'],
    ])
  })

  it('has no value for an optional field the context leaves out', () => {
    const Notes = Agent.forModel<{ readonly note?: string }>()
    const Noted = Notes.make({
      context: Projection.fromReader(
        Schema.Struct({ note: Schema.optionalKey(Schema.String) }),
        (model: { readonly note?: string }) => model,
      ),
      messages: Notes.expose(Message, {}),
    })
    const NotedParts = Notes.parts(Noted, {
      note: Agent.part({ label: 'Note', role: 'note', field: 'note' }),
    })
    const valueOf = (model: { readonly note?: string }) =>
      Effect.runSync(
        Notes.bind({
          definition: Noted,
          host: { model: () => model, dispatch: () => {} },
          parts: NotedParts,
        }).parts.list,
      )[0]!.value
    expect(valueOf({})).toEqual(Option.none())
    expect(valueOf({ note: 'hi' })).toEqual(Option.some('hi'))
  })

  it('leaves out a part whose capability is unavailable, every occurrence included', () => {
    const { state, runtime } = bound(emptyModel)
    expect(idsOf(list(runtime))).toEqual(['todos', 'create'])

    state.model = modelWith({ todos: [milk], selectedTodoId: Option.some('t1') })
    expect(idsOf(list(runtime))).toEqual(['todos', 'create', 'clear', 'remove:t1', 'rename:t1'])
  })

  it("follows the context's items, one occurrence each", () => {
    const { state, runtime } = bound(modelWith({ todos: [milk, eggs] }))
    expect(idsOf(list(runtime))).toEqual([
      'todos',
      'create',
      'remove:t1',
      'remove:t2',
      'rename:t1',
      'rename:t2',
    ])

    state.model = modelWith({ todos: [eggs] })
    expect(idsOf(list(runtime))).toEqual(['todos', 'create', 'remove:t2', 'rename:t2'])
  })

  it('reads one Model snapshot per listing', () => {
    const { state, runtime } = bound(modelWith({ todos: [milk] }))
    list(runtime)
    expect(state.reads).toBe(1)
  })

  it('projects no context for parts that read none', () => {
    let projected = 0
    const Counted = TodoAgent.make({
      context: Projection.fromReader(Context, (model: Model) => {
        projected += 1
        return { todos: model.todos }
      }),
      messages: AppAgent.messages,
    })
    const Buttons = TodoAgent.parts(Counted, {
      create: Agent.part({ label: 'New', role: 'button', invokes: Message.RequestedCreateTodo }),
    })
    const { host } = hostOver(modelWith({ todos: [milk] }))
    Effect.runSync(TodoAgent.bind({ definition: Counted, host, parts: Buttons }).parts.list)
    expect(projected).toBe(0)
  })

  it('refuses two occurrences with one key', () => {
    const { runtime } = bound(modelWith({ todos: [milk, { ...eggs, id: 't1' }] }))
    expect(() => list(runtime)).toThrow('two occurrences keyed "t1"')
  })

  it('answers Ambiguous for a shared label, never the first', () => {
    const { runtime } = bound(modelWith({ todos: [milk, eggs] }))
    const found = (label: string) => Effect.runSync(runtime.parts.find({ label }))

    const titles = found('Title')
    expect(titles._tag).toBe('Ambiguous')
    expect(
      Agent.Found.$match(titles, {
        One: () => [],
        None: () => [],
        Ambiguous: ({ parts }) => idsOf(parts),
      }),
    ).toEqual(['rename:t1', 'rename:t2'])
    expect(
      Agent.Found.$match(found('Delete Eggs'), {
        One: ({ part }) => idsOf([part]),
        None: () => [],
        Ambiguous: () => [],
      }),
    ).toEqual(['remove:t2'])
    expect(found('Nothing')._tag).toBe('None')
  })

  it('sends no Message while listing or finding', async () => {
    const observed: Array<unknown> = []
    const headless = Agent.headless({
      init: () => ({ model: modelWith({ todos: [milk] }) }),
      update: (model: Model, _message: Message) => ({ model }),
    })
    const stop = headless.host.observe(message => void observed.push(message))
    try {
      const runtime = TodoAgent.bind({
        definition: AppAgent,
        host: { ...headless.host, principal: () => ({ canRename: true }) },
        parts: AppParts,
      })
      await Effect.runPromise(runtime.parts.list)
      await Effect.runPromise(runtime.parts.find({ label: 'Delete Milk' }))
      expect(observed).toEqual([])
    } finally {
      stop()
      await headless.dispose()
    }
  })

  it('adds no way to act: what a part names still meets availability and authorize', async () => {
    const { state, runtime } = bound(modelWith({ todos: [milk] }), { canRename: false })
    const listed = list(runtime)
    const named = (id: string) =>
      Option.getOrThrow(listed.find(part => part.id === id)!.capability).name

    const refused = await Effect.runPromise(
      Effect.flip(runtime.messages.dispatchUnknown(named('rename'), { id: 't1', title: 'x' })),
    )
    expect(refused._tag).toBe('AgentAuthorizationError')

    state.model = emptyModel
    const gone = await Effect.runPromise(
      Effect.flip(runtime.messages.dispatchUnknown(named('remove'), { id: 't1' })),
    )
    expect(gone._tag).toBe('AgentCapabilityUnavailableError')
    expect(state.dispatched).toEqual([])
  })

  it('refuses at run time what the types refuse', () => {
    expect(() =>
      TodoAgent.parts(AppAgent, {
        // @ts-expect-error not exposed
        load: Agent.part({ label: 'Load', role: 'button', invokes: Message.FailedToLoadTodos }),
      }),
    ).toThrow('"load" names a capability this definition does not expose')
    expect(() =>
      TodoAgent.parts(AppAgent, {
        // @ts-expect-error not projected
        selected: Agent.part({ label: 'Selected', role: 'status', field: 'selectedTodoId' }),
      }),
    ).toThrow('"selected" reads "selectedTodoId", which the definition\'s context does not project')

    const Bare = TodoAgent.make({
      messages: TodoAgent.expose(Message, { ClearedSelection: 'Clear' }),
    })
    expect(() =>
      // Erased: the types refuse it (`parts.test-d.ts`), and this is what a cast meets.
      TodoAgent.parts(Bare, {
        rows: Agent.part({
          role: 'row',
          each: (context: Model) => context.todos,
          key: todo => todo.id,
          label: 'Row',
        }),
      } as never),
    ).toThrow('"rows" is repeated over a context this definition does not declare')
  })

  it('binds only to the definition it was declared for', () => {
    const Other = TodoAgent.make({ context: AppAgent.context, messages: AppAgent.messages })
    const { host } = hostOver(emptyModel)
    expect(() => TodoAgent.bind({ definition: Other, host, parts: AppParts })).toThrow(
      'the parts were declared for another definition',
    )
    expect(() => Agent.toManifest(Other, AppParts)).toThrow('another definition')
  })

  it('lists nothing for a runtime bound without parts', () => {
    const { host } = hostOver(modelWith({ todos: [milk] }))
    const runtime = TodoAgent.bind({ definition: AppAgent, host })
    expect(runtime.parts.ids).toEqual([])
    expect(Effect.runSync(runtime.parts.list)).toEqual([])
  })

  it('shows the parts in the manifest', () => {
    expect(Agent.toManifest(AppAgent, AppParts).parts).toEqual([
      { id: 'todos', role: 'list', label: 'Todos', field: 'todos', repeated: false },
      {
        id: 'create',
        role: 'button',
        label: 'New todo',
        capability: 'requested_create_todo',
        repeated: false,
      },
      {
        id: 'clear',
        role: 'button',
        label: 'Clear',
        capability: 'cleared_selection',
        repeated: false,
      },
      { id: 'remove', role: 'button', capability: 'requested_delete_todo', repeated: true },
      {
        id: 'rename',
        role: 'textbox',
        label: 'Title',
        capability: 'requested_rename_todo',
        repeated: true,
      },
    ])
    expect(Agent.toManifest(AppAgent).parts).toBeUndefined()
  })

  it('marks the drawn control with its id and occurrence', () => {
    const marks = (attributes: Parameters<typeof inertHtml.div>[0]) =>
      inertHtml.div(attributes, [])?.data?.attrs
    expect(marks(AppParts.attributes(inertHtml, 'create'))).toEqual({ 'data-fk-part': 'create' })
    expect(marks(AppParts.attributes(inertHtml, 'remove', 't1'))).toEqual({
      'data-fk-part': 'remove',
      'data-fk-part-key': 't1',
    })
  })
})
