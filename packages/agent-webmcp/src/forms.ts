import { Agent } from 'foldkit-agent'
import { Effect, Option } from 'effect'
import type { Attribute, HtmlBuilder } from 'foldkit/html'
import type { ToolResult } from './webmcp.js'

/**
 * One capability drawn as a WebMCP declarative tool: a form whose `toolname`
 * and `tooldescription`, and whose fields' `name` and `toolparamdescription`,
 * come from the agent contract, so the form and the registered tool cannot
 * disagree. `register({ forms })` answers its agent submissions.
 */
export interface FormTool<Name extends string = string, Input = unknown> {
  readonly name: Name
  /** The form's attributes: `toolname`, `tooldescription`, and `toolautosubmit` when asked. */
  readonly form: <Message>(h: HtmlBuilder<Message>) => ReadonlyArray<Attribute<Message>>
  /**
   * A field's attributes: `name`, the input's key, and `toolparamdescription`
   * when the input's Schema describes it.
   */
  readonly field: <Message>(
    key: keyof Input & string,
    h: HtmlBuilder<Message>,
  ) => ReadonlyArray<Attribute<Message>>
  /** The input's keys, which an agent's submission is read from. */
  readonly keys: ReadonlyArray<string>
}

/** The description a property of the input's JSON Schema carries, if any. */
const describedBy = (property: unknown): Option.Option<string> =>
  typeof property === 'object' &&
  property !== null &&
  'description' in property &&
  typeof property.description === 'string'
    ? Option.some(property.description)
    : Option.none()

/**
 * Draws the capability `name` of an agent contract as a declarative tool: see
 * the README's "Forms as declarative tools". It throws for a name the contract
 * does not expose, or whose input is not an object of fields, which no form
 * could fill.
 */
export const formTool = <
  ByName extends Record<string, unknown>,
  const Name extends keyof ByName & string,
>(
  definition: Agent.Definition<any, any, any, ByName, any>,
  name: Name,
  options: { readonly autosubmit?: boolean } = {},
): FormTool<Name, ByName[Name]> => {
  const descriptor = Agent.messages(definition).find(each => each.name === name)
  if (descriptor === undefined)
    throw new Error(`AgentWebMcp.formTool: the contract exposes no capability "${name}"`)
  const properties = descriptor.inputSchema['properties']
  if (
    descriptor.inputSchema['type'] !== 'object' ||
    typeof properties !== 'object' ||
    properties === null
  )
    throw new Error(
      `AgentWebMcp.formTool: "${name}" takes no object of fields, which no form can fill`,
    )
  const fields = new Map(
    Object.entries(properties).map(([key, property]) => [key, describedBy(property)] as const),
  )
  return {
    name,
    keys: [...fields.keys()],
    form: h => [
      h.Attribute('toolname', name),
      h.Attribute('tooldescription', descriptor.description),
      ...(options.autosubmit === true ? [h.Attribute('toolautosubmit', '')] : []),
    ],
    field: (key, h) => {
      const described = fields.get(key)
      if (described === undefined)
        throw new Error(`AgentWebMcp.formTool: "${name}" has no field "${key}"`)
      return [
        // An attribute, not `h.Name`, which Foldkit sets only in the browser:
        // a server-rendered form names its fields too.
        h.Attribute('name', key),
        ...Option.match(described, {
          onNone: () => [],
          onSome: description => [h.Attribute('toolparamdescription', description)],
        }),
      ]
    },
  }
}

/** Whether this browser draws forms as tools: its `SubmitEvent` says when an agent submitted. */
export const declarativeTools = (): boolean =>
  typeof SubmitEvent !== 'undefined' && 'agentInvoked' in SubmitEvent.prototype

/**
 * Answers an agent's submission of a form tool on `root`: in the capture phase,
 * before the application's own submit handler, the form's fields named by the
 * input are dispatched as the capability through `dispatch`, and the result
 * goes back through `respondWith`. A person's submission is left alone.
 */
export const answerForms = (
  root: Document,
  forms: ReadonlyArray<FormTool>,
  dispatch: (name: string, input: unknown) => Promise<ToolResult>,
): (() => void) => {
  const byName = new Map(forms.map(form => [form.name, form]))
  const onSubmit = (event: Event) => {
    // `agentInvoked` and `respondWith` are what a declarative WebMCP browser adds to the event.
    const form = event.target
    if (!('agentInvoked' in event) || event.agentInvoked !== true) return
    if (!(form instanceof HTMLFormElement) || !('respondWith' in event)) return
    const { respondWith } = event
    if (typeof respondWith !== 'function') return
    const tool = byName.get(form.getAttribute('toolname') ?? '')
    if (tool === undefined) return
    event.preventDefault()
    event.stopImmediatePropagation()
    // Text, as a form submits it; a field the input does not name is not read.
    const data = new FormData(form)
    const input: Record<string, string> = Object.create(null)
    for (const key of tool.keys) {
      const value = data.get(key)
      if (typeof value === 'string') input[key] = value
    }
    respondWith.call(event, dispatch(tool.name, input))
  }
  root.addEventListener('submit', onSubmit, { capture: true })
  return () => root.removeEventListener('submit', onSubmit, { capture: true })
}

/** Text a tool returns, which an agent reads. */
const textResult = (text: string, isError = false): ToolResult => ({
  content: [{ type: 'text', text }],
  isError,
})

/** Dispatches a capability for an agent, with the result as a tool returns it; it never rejects. */
export const dispatchFor =
  (agent: Agent.AgentRuntime<any, any, any, any, any>, invocationId: () => string) =>
  async (name: string, input: unknown, signal?: AbortSignal): Promise<ToolResult> => {
    try {
      // WebMCP hands the page a promise-returning callback, so this is the
      // edge where Effect meets the browser, not a run inside a service.
      const result = await Effect.runPromise(
        Effect.result(
          // The tool name and payload both come off the wire.
          agent.messages.dispatchUnknown(name, input, {
            id: invocationId(),
            transport: 'webmcp',
            signal,
          }),
        ),
      )
      // Every agent failure carries a message written for this audience.
      if (result._tag === 'Failure') return textResult(result.failure.message, true)
      // A declared completion contract has already resolved by the time
      // dispatch returns, so a failed completion is a failed tool call.
      const summary = Agent.summarize(result.success)
      return textResult(summary.text, !summary.ok)
    } catch {
      // `Effect.result` captures expected failures but not defects, and a
      // rejected tool promise is not something a calling agent can act on.
      // Report it as a tool error without leaking the application's internals.
      return textResult(`Capability "${name}" failed unexpectedly`, true)
    }
  }
