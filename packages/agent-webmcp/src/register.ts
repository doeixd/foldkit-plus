import { Agent } from 'foldkit-agent'
import { Effect } from 'effect'
import { answerForms, declarativeTools, dispatchFor, type FormTool } from './forms.js'
import { type ModelContext, type ToolDescriptor, pageModelContext } from './webmcp.js'

/** A live WebMCP registration. */
export interface Registration {
  /** Re-reads availability from the current Model and reconciles registrations. */
  readonly refresh: () => Promise<void>
  /** Unregisters every tool and stops following the Model. */
  readonly unregister: () => void
  /** The capability names currently registered with WebMCP. */
  readonly registered: () => ReadonlyArray<string>
}

export interface RegisterOptions<Model, Context_, Principal, ByName, ByTag> {
  /** The agent contract bound to a live Foldkit Runtime. */
  readonly agent: Agent.AgentRuntime<Model, Context_, Principal, ByName, ByTag>
  /** Defaults to `pageModelContext()`: `document.modelContext`, or the older `navigator.modelContext`. */
  readonly modelContext?: ModelContext | undefined
  /** Unregisters everything when aborted. */
  readonly signal?: AbortSignal | undefined
  /**
   * Follow the live Model and reconcile registrations as `available(model)`
   * changes. Defaults to `true`, and is inert unless the host supports
   * subscription.
   */
  readonly followModel?: boolean | undefined
  /** Supplies an invocation id. Defaults to `crypto.randomUUID()`. */
  readonly invocationId?: (() => string) | undefined
  /**
   * Reports a failure from a reconcile that no caller is awaiting -- the
   * initial registration, or one triggered by a Model change.
   */
  readonly onError?: ((error: unknown) => void) | undefined
  /**
   * Capabilities the page draws as forms (`formTool`). An agent's submission
   * of one is answered as its tool call would be. In a browser that draws
   * forms as tools these are not registered too, as the form is the tool.
   */
  readonly forms?: ReadonlyArray<FormTool<keyof ByName & string>> | undefined
}

/**
 * Projects an agent contract into `document.modelContext.registerTool(...)`.
 *
 * Each currently available capability becomes one tool: the capability name
 * becomes the tool name, the variant description becomes the description, the
 * derived JSON Schema becomes `inputSchema`, and `execute` validates its input
 * and dispatches into the same live Foldkit Runtime the human is using.
 *
 * Tool availability is itself a projection of Model state. When
 * `available(model)` changes, registrations are reconciled: capabilities that
 * are gone have their registration signal aborted, and capabilities that have
 * appeared are registered.
 *
 * @example
 * ```ts
 * const registration = AgentWebMcp.register({ agent: agentRuntime })
 * ```
 */
export const register = <Model, Context_, Principal, ByName, ByTag>(
  options: RegisterOptions<Model, Context_, Principal, ByName, ByTag>,
): Registration => {
  const modelContext = options.modelContext ?? pageModelContext()
  if (modelContext === undefined) {
    throw new Error(
      'WebMCP is unavailable: no document.modelContext or navigator.modelContext. Pass an explicit modelContext to register().',
    )
  }

  const { agent } = options
  const dispatch = dispatchFor(agent, options.invocationId ?? Agent.newInvocationId)
  const forms = options.forms ?? []
  // Drawn as forms where the browser makes them tools, so registered only elsewhere.
  const asForms = new Set<string>(declarativeTools() ? forms.map(form => form.name) : [])
  const stopAnswering =
    forms.length === 0 || typeof document === 'undefined'
      ? () => {}
      : answerForms(document, forms, dispatch)

  /** One AbortController per registered tool: aborting it unregisters that tool. */
  const controllers = new Map<string, AbortController>()
  let disposed = false

  const toolFor = (
    name: string,
    description: string,
    inputSchema: Record<string, unknown>,
  ): { readonly controller: AbortController; readonly tool: ToolDescriptor } => {
    const controller = new AbortController()
    const execute = (input: unknown, context: { readonly signal?: AbortSignal | undefined }) =>
      dispatch(name, input, context.signal)
    return { controller, tool: { name, description, inputSchema, execute } }
  }

  const runReconcile = async (): Promise<void> => {
    if (disposed) return

    const available = await Effect.runPromise(agent.messages.available)
    const wanted = new Map(
      available.flatMap(descriptor =>
        asForms.has(descriptor.name) ? [] : [[descriptor.name, descriptor] as const],
      ),
    )

    // Unregister capabilities the Model no longer offers.
    for (const [name, controller] of [...controllers]) {
      if (!wanted.has(name)) {
        controller.abort()
        controllers.delete(name)
      }
    }

    // Register capabilities that have appeared.
    let failure: unknown
    for (const [name, descriptor] of wanted) {
      // unregister() can land while an await above is pending. Nothing more is
      // registered after that.
      if (disposed) return
      if (controllers.has(name)) continue

      const { controller, tool } = toolFor(name, descriptor.description, descriptor.inputSchema)

      try {
        // The signal goes in the options bag: aborting it is what unregisters
        // the tool.
        await modelContext.registerTool(tool, { signal: controller.signal })
      } catch (error) {
        // Nothing was registered, so nothing is recorded and nothing to abort.
        failure ??= error
        continue
      }

      // Disposal can also land while this registration is in flight, in which
      // case the tool is already registered and has to be taken back.
      if (disposed) {
        controller.abort()
        return
      }

      // Recorded only once the browser has accepted it.
      controllers.set(name, controller)
    }

    if (failure !== undefined) throw failure
  }

  /**
   * Reconciles are serialized.
   *
   * A capability is recorded only once the browser has accepted it, so two
   * overlapping reconciles would both see it as missing and register it twice.
   */
  let queue: Promise<void> = Promise.resolve()

  const reconcile = (): Promise<void> => {
    const next = queue.then(runReconcile, runReconcile)
    queue = next.then(
      () => {},
      () => {},
    )
    return next
  }

  let unsubscribe: () => void = () => {}

  const unregister = (): void => {
    disposed = true
    for (const controller of controllers.values()) controller.abort()
    controllers.clear()
    unsubscribe()
    stopAnswering()
  }

  /**
   * Reconciles without a caller to await the result. A rejection here would
   * otherwise become an unhandled rejection, so it is reported through
   * `onError` and the registration is left as it was.
   */
  const reconcileInBackground = (): void => {
    reconcile().catch(error => {
      options.onError?.(error)
    })
  }

  reconcileInBackground()

  if (options.followModel !== false) {
    unsubscribe = agent.subscribe(reconcileInBackground)
  }

  if (options.signal?.aborted === true) {
    // An already-aborted signal never fires its listener.
    unregister()
  } else {
    options.signal?.addEventListener('abort', unregister, { once: true })
  }

  return {
    refresh: reconcile,
    unregister,
    registered: () => [...controllers.keys()],
  }
}
