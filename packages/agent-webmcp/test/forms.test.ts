// @vitest-environment jsdom
/**
 * Form tools: the attributes come from the contract, an agent's submission of
 * the form is answered as its tool call through `respondWith` before the
 * application's own handler, a person's submission is left alone, and a
 * browser that draws forms as tools is not also given the imperative tool.
 */
import { Agent } from 'foldkit-agent'
import { Schema } from 'effect'
import { inertHtml } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { afterEach, describe, expect, it } from 'vitest'
import { AgentWebMcp } from '../src/index.js'
import type { ModelContext, ToolDescriptor } from '../src/webmcp.js'

const Message = defineMessageUnion({
  RequestedTodo: { title: Schema.String, note: Schema.String },
  ClearedAll: {},
  Searched: { query: Schema.String },
})
type Message = typeof Message.Type

const TodoAgent = Agent.forModel<{}>()
const AppAgent = TodoAgent.make({
  messages: TodoAgent.expose(Message, {
    RequestedTodo: Agent.variant({
      name: 'add_todo',
      description: 'Add a todo',
      input: Schema.Struct({
        title: Schema.String.annotate({ description: 'What the todo says' }),
        note: Schema.String,
      }),
      toMessage: input => input,
    }),
    ClearedAll: { name: 'clear_all', description: 'Delete every todo' },
    // An input that is one string, not an object of fields.
    Searched: Agent.variant({
      name: 'search',
      description: 'Find todos',
      input: Schema.String,
      toMessage: query => ({ query }),
    }),
  }),
})

const AddTodo = AgentWebMcp.formTool(AppAgent, 'add_todo')

/** Each attribute a list of them sets, by name, as the DOM will hold it. */
const attributesOf = (attributes: Parameters<typeof inertHtml.div>[0]) => {
  const node = inertHtml.div(attributes, [])
  return { ...node?.data?.attrs, ...node?.data?.props }
}

describe('AgentWebMcp.formTool', () => {
  it('names the form and its fields from the contract', () => {
    expect(attributesOf(AddTodo.form(inertHtml))).toEqual({
      toolname: 'add_todo',
      tooldescription: 'Add a todo',
    })
    expect(
      attributesOf(
        AgentWebMcp.formTool(AppAgent, 'add_todo', { autosubmit: true }).form(inertHtml),
      ),
    ).toMatchObject({ toolautosubmit: '' })
    expect(attributesOf(AddTodo.field('title', inertHtml))).toEqual({
      name: 'title',
      toolparamdescription: 'What the todo says',
    })
    // A field the Schema does not describe is named and nothing more.
    expect(attributesOf(AddTodo.field('note', inertHtml))).toEqual({ name: 'note' })
  })

  it('refuses a capability no form could fill, a name not exposed, and a field not in its input', () => {
    expect(() => AgentWebMcp.formTool(AppAgent, 'search')).toThrow('no object of fields')
    // No input is a form of no fields, a button alone.
    expect(AgentWebMcp.formTool(AppAgent, 'clear_all').keys).toEqual([])
    // @ts-expect-error a name the contract does not expose
    expect(() => AgentWebMcp.formTool(AppAgent, 'add')).toThrow('no capability "add"')
    // @ts-expect-error a field the input does not have
    expect(() => AddTodo.field('due', inertHtml)).toThrow('no field "due"')
  })
})

/** Stands in for `document.modelContext`, keeping what is registered. */
class FakeModelContext implements ModelContext {
  readonly tools: Array<ToolDescriptor> = []
  registerTool = (tool: ToolDescriptor): void => {
    this.tools.push(tool)
  }
}

/** A form drawn for `add_todo` on the page, with a field its input does not name. */
const drawForm = () => {
  const form = document.createElement('form')
  form.setAttribute('toolname', 'add_todo')
  for (const [name, value] of [
    ['title', 'Buy milk'],
    ['note', 'Oat'],
    ['extra', 'not read'],
  ] as const) {
    const input = document.createElement('input')
    input.name = name
    input.value = value
    form.append(input)
  }
  document.body.append(form)
  return form
}

/**
 * A submit event as a declarative browser sends it, by an agent or a person:
 * both have `respondWith`, and only `agentInvoked` tells them apart.
 */
const submit = (form: HTMLFormElement, agent: boolean) => {
  const event = new SubmitEvent('submit', { bubbles: true, cancelable: true })
  const responses: Array<Promise<unknown>> = []
  Object.assign(event, {
    agentInvoked: agent,
    respondWith: (result: Promise<unknown>) => responses.push(result),
  })
  form.dispatchEvent(event)
  return { event, responses }
}

const setUp = () => {
  const dispatched: Array<Message> = []
  const modelContext = new FakeModelContext()
  const agent = TodoAgent.bind({
    definition: AppAgent,
    host: { model: () => ({}), dispatch: (message: Message) => void dispatched.push(message) },
  })
  const form = drawForm()
  // The application's own handler, as Foldkit's `OnSubmit` is.
  const handled: Array<Event> = []
  form.addEventListener('submit', event => handled.push(event))
  const registration = AgentWebMcp.register({ agent, modelContext, forms: [AddTodo] })
  return { dispatched, modelContext, form, handled, registration }
}

afterEach(() => {
  document.body.innerHTML = ''
  Reflect.deleteProperty(SubmitEvent.prototype, 'agentInvoked')
})

describe('AgentWebMcp.register with forms', () => {
  it('answers an agent’s submission as the tool call, before the application’s handler', async () => {
    const { dispatched, form, handled, registration } = setUp()
    const { event, responses } = submit(form, true)
    expect(event.defaultPrevented).toBe(true)
    expect(handled).toEqual([])
    const [response] = responses
    expect(await response).toMatchObject({ isError: false })
    // The fields the input names, as text; `extra` is not read.
    expect(dispatched).toEqual([Message.RequestedTodo({ title: 'Buy milk', note: 'Oat' })])

    // A person's submission is the application's.
    expect(submit(form, false).responses).toEqual([])
    expect(handled).toHaveLength(1)
    expect(dispatched).toHaveLength(1)

    // Unregistered, an agent's submission is no longer answered.
    registration.unregister()
    expect(submit(form, true).responses).toEqual([])
    expect(handled).toHaveLength(2)
  })

  it('leaves a form for another tool to the application', () => {
    const { dispatched, form, handled } = setUp()
    form.setAttribute('toolname', 'other')
    expect(submit(form, true).responses).toEqual([])
    expect(handled).toHaveLength(1)
    expect(dispatched).toEqual([])
  })

  it('registers a form’s capability too only where the browser does not draw forms as tools', async () => {
    const without = setUp()
    await without.registration.refresh()
    expect(without.modelContext.tools.map(tool => tool.name)).toEqual([
      'add_todo',
      'clear_all',
      'search',
    ])
    without.registration.unregister()

    Object.defineProperty(SubmitEvent.prototype, 'agentInvoked', {
      value: false,
      configurable: true,
    })
    expect(AgentWebMcp.declarativeTools()).toBe(true)
    const declarative = setUp()
    await declarative.registration.refresh()
    expect(declarative.modelContext.tools.map(tool => tool.name)).toEqual(['clear_all', 'search'])
    declarative.registration.unregister()
  })
})
