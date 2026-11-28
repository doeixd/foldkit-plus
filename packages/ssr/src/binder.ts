/**
 * `foldkit-ssr/binder` (Phase 6, Bouts 6.5–6.7): answers declared presses
 * before the Foldkit runtime loads, writes DOM anchors as text/attributes/
 * hidden/order, and hands over its updated Model and queued Messages to
 * `SSR.hydrate` once the runtime wakes.
 */
import { Option, Result, Schema } from 'effect'
import { type Expr, Transition } from '@doeixd/metakit'
import { covers } from '@doeixd/metakit/graph/match'
import { ANCHOR_ATTRIBUTE, type Bindings, type BindingValue } from './binding.js'
export { ANCHOR_ATTRIBUTE, Binding, type Bindings, type BindingValue } from './binding.js'
import { offerBinder } from './handoff.js'
import { BINDER_TOUCHED_ATTRIBUTE, FOLDKIT_APP_ATTRIBUTE } from './marks.js'
export { BINDER_TOUCHED_ATTRIBUTE } from './marks.js'

/** Attribute naming the Message tag an element dispatches. */
export const BINDER_MESSAGE_ATTRIBUTE = 'data-fk-msg' as const

/** Attribute carrying the JSON-encoded payload for `data-fk-msg` (optional; defaults to `{}`). */
export const BINDER_PAYLOAD_ATTRIBUTE = 'data-fk-payload' as const

/** Attribute naming a child element's key inside an `Order`-bound container. */
export const BINDER_KEY_ATTRIBUTE = 'data-fk-key' as const

const markTouchedAttribute = (el: Element, attrName: string): void => {
  const existing = el.getAttribute(BINDER_TOUCHED_ATTRIBUTE)
  if (existing === null || existing === '') {
    el.setAttribute(BINDER_TOUCHED_ATTRIBUTE, attrName)
    return
  }
  const names = existing.split(/\s+/).filter(Boolean)
  if (!names.includes(attrName)) {
    names.push(attrName)
    el.setAttribute(BINDER_TOUCHED_ATTRIBUTE, names.join(' '))
  }
}

/** Any declared `Transition` over `Model`, regardless of its `Input`, `Emit`, or `Supplied` types. */
export interface BinderTransitionLike<Model> {
  readonly _tag: 'Transition'
  readonly stateSchema: Option.Option<Schema.Codec<Model, Model>>
  readonly suppliedSchema?: Option.Option<Schema.Top> | undefined
  readonly writes: ReadonlyArray<{ readonly target: ReadonlyArray<string> }>
  readonly emits: ReadonlyArray<unknown>
}

export interface BinderTransition<Model, Tag extends string = string> {
  readonly tag: Tag
  /** Schema that decodes the element's untrusted payload before the transition runs. */
  readonly schema: Schema.Top
  /** Declared transition to step against the current Model. */
  readonly transition: BinderTransitionLike<Model>
  /** Optional foreign operation implementations for `Transition.step`. */
  readonly foreign?: Expr.ReaderOptions['foreign'] | undefined
}

export interface BinderManifest<Model, Tag extends string = string, Keys extends string = string> {
  readonly transitions: Readonly<Record<Tag, BinderTransition<Model, Tag>>>
  readonly bindings: Bindings<Model, Keys>
  /** DOM event types to delegate on `root` (defaults to `['click']`). */
  readonly events?: ReadonlyArray<string> | undefined
}

export interface BinderEnvelope<Model> {
  readonly model: Model
  readonly root?: Element | undefined
}

export interface BinderOptions<Model, Tag extends string = string, Keys extends string = string> {
  readonly manifest: BinderManifest<Model, Tag, Keys>
  readonly envelope: BinderEnvelope<Model>
  /** Loads the Foldkit runtime chunk. Called at most once. */
  readonly wake: () => Promise<void>
  /** Optional lazy transition loaders keyed by Message tag (Phase 7, Bouts 7.4–7.5). */
  readonly chunks?: Readonly<
    Record<
      string,
      () => Promise<
        BinderTransition<Model, string> | { readonly default: BinderTransition<Model, string> }
      >
    >
  >
  /** Maximum milliseconds to wait for a lazy chunk on press (defaults to 3000). */
  readonly chunkTimeoutMs?: number | undefined
  /** Called when a non-form control's chunk fails after one retry. */
  readonly onChunkFailed?:
    | ((info: { readonly tag: string; readonly element: Element; readonly error: unknown }) => void)
    | undefined
  /** Receives invalid-payload refusal messages (defaults to `console.warn`). */
  readonly onInvalidPayload?: ((message: string) => void) | undefined
  /** If true, also calls `wake()` (and prefetches on-screen lazy chunks) when idle. */
  readonly idleWake?: boolean | undefined
}

export interface BinderHandle<Model> {
  /** Current Model after every binder-answered transition. */
  readonly model: () => Model
  /** Messages queued while the runtime was loading (each drained once on hand-over). */
  readonly queued: () => ReadonlyArray<unknown>
  /** True once `wake` has been triggered. */
  readonly woke: () => boolean
  /** True once the binder has answered at least one transition locally. */
  readonly mutated: () => boolean
  /** Detach delegated listeners. */
  readonly stop: () => void
}

const UNSAFE_ELEMENTS: ReadonlySet<string> = new Set([
  'script',
  'style',
  'iframe',
  'object',
  'embed',
  'base',
])

const URL_ATTRIBUTES: ReadonlySet<string> = new Set([
  'href',
  'xlink:href',
  'src',
  'action',
  'data',
  'poster',
  'background',
  'cite',
  'ping',
  'srcset',
])

const ALLOWED_URL_SCHEMES: ReadonlySet<string> = new Set(['http:', 'https:', 'mailto:', 'tel:'])

const isUnsafeElement = (el: Element): boolean => UNSAFE_ELEMENTS.has(el.localName.toLowerCase())

const isUnsafeAttribute = (name: string): boolean => {
  const lower = name.toLowerCase()
  return (
    lower.startsWith('on') ||
    lower === 'srcdoc' ||
    lower === 'formaction' ||
    lower === 'style' ||
    lower === 'is'
  )
}

const isUnsafeUrl = (raw: string): boolean => {
  // Strip ASCII control characters and whitespace that browsers ignore before schemes.
  const cleaned = raw.replace(/[\u0000-\u0020\u007f]+/g, '')
  const schemeMatch = /^([a-zA-Z][a-zA-Z0-9+.-]*:)/.exec(cleaned)
  if (schemeMatch === null) return false
  return !ALLOWED_URL_SCHEMES.has(schemeMatch[1]!.toLowerCase())
}

const isUnsafeAttributeValue = (name: string, value: string): boolean => {
  const lower = name.toLowerCase()
  if (!URL_ATTRIBUTES.has(lower)) return false
  if (lower === 'srcset') {
    for (const candidate of value.split(',')) {
      const url = candidate.trim().split(/\s+/)[0]
      if (url !== undefined && url !== '' && isUnsafeUrl(url)) return true
    }
    return false
  }
  if (lower === 'ping') {
    for (const url of value.trim().split(/\s+/)) {
      if (url !== '' && isUnsafeUrl(url)) return true
    }
    return false
  }
  return isUnsafeUrl(value)
}

const FORBIDDEN_KEYS: ReadonlySet<string> = new Set(['__proto__', 'constructor', 'prototype'])

const hasForbiddenKey = (value: unknown): boolean => {
  if (value === null || typeof value !== 'object') return false
  if (Array.isArray(value)) return value.some(hasForbiddenKey)
  for (const key of Object.keys(value)) {
    if (FORBIDDEN_KEYS.has(key)) return true
    if (hasForbiddenKey((value as Record<string, unknown>)[key])) return true
  }
  return false
}

const hasSuppliedFields = <Model>(transition: BinderTransitionLike<Model>): boolean => {
  const sup = transition.suppliedSchema
  if (sup === undefined || !Option.isOption(sup) || Option.isNone(sup)) return false
  const schema = sup.value as { readonly fields?: Record<string, unknown> }
  return schema.fields !== undefined && Object.keys(schema.fields).length > 0
}

/** Whether every path `transition` writes is covered by at least one bound anchor's reads. */
export const canAnswerLocally = <Model, Keys extends string>(
  transition: BinderTransitionLike<Model>,
  bindings: Bindings<Model, Keys>,
): boolean => {
  if (transition.emits.length > 0) return false
  if (hasSuppliedFields(transition)) return false
  if (transition.writes.length === 0) return true
  if (Option.isNone(bindings.reads)) return false
  const boundReads = bindings.reads.value
  for (const write of transition.writes) {
    if (!boundReads.some(read => covers(read, write.target))) {
      return false
    }
  }
  return true
}

/** Write evaluated binding values to anchored elements under `root` (text only, never HTML). */
export const applyAnchors = <Keys extends string>(
  root: Element,
  values: Readonly<Record<Keys, BindingValue>>,
): void => {
  const anchors = Array.from(root.querySelectorAll(`[${ANCHOR_ATTRIBUTE}]`))
  for (const el of anchors) {
    if (isUnsafeElement(el)) continue
    const key = el.getAttribute(ANCHOR_ATTRIBUTE)
    if (key === null || !Object.hasOwn(values, key)) continue
    const value = (values as Readonly<Record<string, BindingValue>>)[key]!
    switch (value._tag) {
      case 'Text': {
        if (el.textContent !== value.text) {
          el.textContent = value.text
        }
        break
      }
      case 'Attribute': {
        if (isUnsafeAttribute(value.name)) break
        if (value.value === null) {
          if (el.hasAttribute(value.name)) {
            el.removeAttribute(value.name)
            markTouchedAttribute(el, value.name)
          }
        } else if (isUnsafeAttributeValue(value.name, value.value)) {
          break
        } else if (el.getAttribute(value.name) !== value.value) {
          el.setAttribute(value.name, value.value)
          markTouchedAttribute(el, value.name)
        }
        break
      }
      case 'Shown': {
        if (value.shown) {
          el.removeAttribute('hidden')
        } else {
          el.setAttribute('hidden', '')
        }
        break
      }
      case 'Order': {
        const byKey = new Map<string, Element>()
        for (const child of Array.from(el.children)) {
          const childKey = child.getAttribute(BINDER_KEY_ATTRIBUTE)
          if (childKey !== null) byKey.set(childKey, child)
        }
        for (const orderedKey of value.keys) {
          const child = byKey.get(orderedKey)
          if (child !== undefined) el.appendChild(child)
        }
        break
      }
    }
  }
}

const formatInvalidPayload = (tag: string, issue: string): string =>
  `[foldkit-ssr/binder] the element's "${tag}" payload did not decode: ${issue}; nothing was sent.`

const findMessageElement = (target: EventTarget | null, root: Element): Element | null => {
  let current: Element | null =
    target instanceof Element ? target : target instanceof Node ? target.parentElement : null
  while (current !== null) {
    if (current.hasAttribute(BINDER_MESSAGE_ATTRIBUTE)) return current
    if (current === root) return null
    current = current.parentElement
  }
  return null
}

/**
 * Start the delegated binder on a server-drawn page.
 *
 * Answers declared Messages with no emitted record whose written paths are all
 * bound, writing anchored elements directly. Invalid payloads are dropped and
 * reported without waking the runtime. Any undeclared Message, or any Message
 * that emits a Command or writes an unbound path, triggers `wake()` and is
 * queued once for the runtime to replay on hand-over.
 */
export const start = <Model, Tag extends string = string, Keys extends string = string>(
  options: BinderOptions<Model, Tag, Keys>,
): BinderHandle<Model> => {
  const root =
    options.envelope.root ??
    (typeof document !== 'undefined'
      ? (document.querySelector(`[${FOLDKIT_APP_ATTRIBUTE}]`) ?? undefined)
      : undefined)

  let currentModel: Model = options.envelope.model
  let didWake = false
  let didMutate = false
  let stopped = false
  const queue: Array<unknown> = []
  const events = options.manifest.events ?? ['click']
  const reportInvalid =
    options.onInvalidPayload ??
    ((msg: string) => {
      console.warn(msg)
    })

  let cancelIdle: (() => void) | undefined
  const loadedChunks = new Map<string, BinderTransition<Model, string>>()
  const inflightChunks = new Map<string, Promise<BinderTransition<Model, string>>>()
  const pendingPresses = new Set<Element>()
  const pendingOrder: Array<{
    readonly tag: string
    readonly el: Element
    readonly rawPayload: Record<string, unknown>
  }> = []
  let drainingOrder = false
  const chunkTimeoutMs = options.chunkTimeoutMs ?? 3000

  const parsePayload = (el: Element, tag: string): Record<string, unknown> | undefined => {
    const rawPayload = el.getAttribute(BINDER_PAYLOAD_ATTRIBUTE)
    if (rawPayload === null || rawPayload === '') return {}
    let parsed: unknown
    try {
      parsed = JSON.parse(rawPayload)
    } catch (error) {
      const issue = error instanceof Error ? error.message : String(error)
      reportInvalid(formatInvalidPayload(tag, issue))
      return undefined
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      reportInvalid(formatInvalidPayload(tag, 'expected a JSON object payload'))
      return undefined
    }
    if (hasForbiddenKey(parsed)) {
      reportInvalid(formatInvalidPayload(tag, 'payload contains a forbidden prototype key'))
      return undefined
    }
    return parsed as Record<string, unknown>
  }

  const submitFormFallback = (form: HTMLFormElement, el: Element): void => {
    if (typeof form.requestSubmit === 'function') {
      try {
        form.requestSubmit(el instanceof HTMLElement ? el : undefined)
        return
      } catch {
        // jsdom throws Not implemented for requestSubmit; fall back to submit().
      }
    }
    form.submit()
  }

  const loadChunk = (tag: string): Promise<BinderTransition<Model, string>> | undefined => {
    const existing = loadedChunks.get(tag)
    if (existing !== undefined) return Promise.resolve(existing)
    const inflight = inflightChunks.get(tag)
    if (inflight !== undefined) return inflight
    const chunks = options.chunks
    if (chunks === undefined || !Object.hasOwn(chunks, tag)) return undefined
    const loader = chunks[tag]!
    const promise = loader().then(
      mod => {
        const entry = 'default' in mod ? mod.default : mod
        loadedChunks.set(tag, entry)
        inflightChunks.delete(tag)
        return entry
      },
      err => {
        inflightChunks.delete(tag)
        throw err
      },
    )
    inflightChunks.set(tag, promise)
    return promise
  }

  const withTimeout = <A>(promise: Promise<A>, ms: number): Promise<A> =>
    new Promise<A>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`chunk load timed out after ${ms}ms`)), ms)
      promise.then(
        val => {
          clearTimeout(timer)
          resolve(val)
        },
        err => {
          clearTimeout(timer)
          reject(err)
        },
      )
    })

  const prefetchFromEvent = (event: Event): void => {
    if (stopped || root === undefined || options.chunks === undefined) return
    const el = findMessageElement(event.target, root)
    if (el === null) return
    const tag = el.getAttribute(BINDER_MESSAGE_ATTRIBUTE)
    if (tag !== null && tag !== '') {
      void loadChunk(tag)?.catch(() => undefined)
    }
  }

  const applyResolvedEntry = (
    entry: BinderTransition<Model, string>,
    tag: string,
    parsed: Record<string, unknown>,
    event?: Event,
  ): void => {
    const decoded = Schema.decodeUnknownResult(entry.schema as Schema.Codec<unknown, unknown>)(
      parsed,
    )
    if (Result.isFailure(decoded)) {
      reportInvalid(formatInvalidPayload(tag, decoded.failure.message))
      return
    }

    const messagePayload =
      typeof decoded.success === 'object' &&
      decoded.success !== null &&
      !Array.isArray(decoded.success)
        ? { ...(decoded.success as Readonly<Record<string, unknown>>), _tag: tag }
        : { _tag: tag }

    if (queue.length > 0) {
      queue.push(messagePayload)
      event?.preventDefault()
      event?.stopImmediatePropagation()
      return
    }

    if (!canAnswerLocally(entry.transition, options.manifest.bindings)) {
      queue.push(messagePayload)
      event?.preventDefault()
      event?.stopImmediatePropagation()
      triggerWake()
      return
    }

    const stepped = Transition.step(
      entry.transition as unknown as Transition.Transition<Model, unknown, unknown, unknown>,
      currentModel,
      decoded.success,
      undefined,
      entry.foreign === undefined ? undefined : { foreign: entry.foreign },
    )
    if (Result.isFailure(stepped)) return

    currentModel = stepped.success.state
    didMutate = true
    const values = options.manifest.bindings.evaluate(
      currentModel,
      entry.foreign === undefined ? undefined : { foreign: entry.foreign },
    )
    if (root !== undefined) applyAnchors(root, values)
    event?.preventDefault()
    event?.stopImmediatePropagation()
  }

  const triggerWake = (): void => {
    if (stopped || didWake) return
    didWake = true
    void options.wake().catch(() => {
      // Never wedge the binder on a transient chunk-load failure: allow local
      // transitions to keep working and a subsequent press to retry waking.
      didWake = false
      queue.length = 0
    })
  }

  const resolveEagerEntry = (tag: string): BinderTransition<Model, string> | undefined => {
    if (Object.hasOwn(options.manifest.transitions, tag)) {
      return (
        options.manifest.transitions as Readonly<Record<string, BinderTransition<Model, Tag>>>
      )[tag]!
    }
    return loadedChunks.get(tag)
  }

  const drainPendingOrder = (): void => {
    if (stopped || drainingOrder) return
    const next = pendingOrder[0]
    if (next === undefined) return
    const eager = resolveEagerEntry(next.tag)
    if (eager !== undefined) {
      pendingOrder.shift()
      pendingPresses.delete(next.el)
      applyResolvedEntry(eager, next.tag, next.rawPayload)
      drainPendingOrder()
      return
    }
    if (options.chunks === undefined || !Object.hasOwn(options.chunks, next.tag)) {
      pendingOrder.shift()
      pendingPresses.delete(next.el)
      queue.push({ ...next.rawPayload, _tag: next.tag })
      triggerWake()
      drainPendingOrder()
      return
    }
    drainingOrder = true
    const attemptLoad = () => {
      const p = loadChunk(next.tag)
      if (p === undefined) return Promise.reject(new Error(`missing chunk for "${next.tag}"`))
      return withTimeout(p, chunkTimeoutMs)
    }
    const handleFailure = (error: unknown) => {
      pendingOrder.shift()
      pendingPresses.delete(next.el)
      drainingOrder = false
      if (stopped) return
      const form = next.el.closest('form')
      if (form !== null) {
        submitFormFallback(form, next.el)
      } else {
        next.el.setAttribute('aria-disabled', 'true')
        next.el.setAttribute('data-fk-chunk-failed', next.tag)
        options.onChunkFailed?.({ tag: next.tag, element: next.el, error })
      }
      drainPendingOrder()
    }
    void attemptLoad().then(
      entry => {
        pendingOrder.shift()
        pendingPresses.delete(next.el)
        drainingOrder = false
        if (!stopped) {
          applyResolvedEntry(entry, next.tag, next.rawPayload)
          drainPendingOrder()
        }
      },
      firstError => {
        if (stopped) {
          pendingOrder.shift()
          pendingPresses.delete(next.el)
          drainingOrder = false
          return
        }
        // Form controls release immediately to browser submission; non-form controls retry once.
        if (next.el.closest('form') !== null) {
          handleFailure(firstError)
          return
        }
        void attemptLoad().then(
          entry => {
            pendingOrder.shift()
            pendingPresses.delete(next.el)
            drainingOrder = false
            if (!stopped) {
              applyResolvedEntry(entry, next.tag, next.rawPayload)
              drainPendingOrder()
            }
          },
          retryError => handleFailure(retryError),
        )
      },
    )
  }

  const handleEvent = (event: Event): void => {
    if (stopped || root === undefined) return
    const el = findMessageElement(event.target, root)
    if (el === null) return
    if (el.getAttribute('aria-disabled') === 'true') {
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }
    const tag = el.getAttribute(BINDER_MESSAGE_ATTRIBUTE)
    if (tag === null || tag === '') return

    const parsed = parsePayload(el, tag)
    if (parsed === undefined) return

    // If any lazy chunk press is currently in flight, serialize subsequent
    // presses behind it in strict FIFO order (ignoring duplicate clicks on the
    // same in-flight control).
    if (pendingOrder.length > 0) {
      event.preventDefault()
      event.stopImmediatePropagation()
      if (pendingPresses.has(el)) return
      pendingPresses.add(el)
      pendingOrder.push({ tag, el, rawPayload: parsed })
      return
    }

    const eager = resolveEagerEntry(tag)
    if (eager !== undefined) {
      applyResolvedEntry(eager, tag, parsed, event)
      return
    }

    if (options.chunks !== undefined && Object.hasOwn(options.chunks, tag)) {
      event.preventDefault()
      event.stopImmediatePropagation()
      pendingPresses.add(el)
      pendingOrder.push({ tag, el, rawPayload: parsed })
      drainPendingOrder()
      return
    }

    // Undeclared Message: queue once for the runtime to replay on hand-over and wake.
    queue.push({ ...parsed, _tag: tag })
    event.preventDefault()
    event.stopImmediatePropagation()
    triggerWake()
  }

  const INTENT_EVENTS = ['pointerover', 'focusin', 'touchstart'] as const

  const stop = (): void => {
    if (stopped) return
    stopped = true
    cancelIdle?.()
    cancelIdle = undefined
    if (root !== undefined) {
      for (const type of events) {
        root.removeEventListener(type, handleEvent, true)
      }
      if (options.chunks !== undefined) {
        for (const type of INTENT_EVENTS) {
          root.removeEventListener(type, prefetchFromEvent, true)
        }
      }
    }
  }

  if (root !== undefined) {
    for (const type of events) {
      root.addEventListener(type, handleEvent, true)
    }
    if (options.chunks !== undefined) {
      for (const type of INTENT_EVENTS) {
        root.addEventListener(type, prefetchFromEvent, true)
      }
    }
  }

  offerBinder({
    take: () => {
      stop()
      // Flush any presses still waiting on lazy chunks into `queued` in FIFO order
      // so `SSR.hydrate` replays them once rather than dropping them on hand-over.
      for (const item of pendingOrder.splice(0)) {
        pendingPresses.delete(item.el)
        queue.push({ ...item.rawPayload, _tag: item.tag })
      }
      return {
        model: currentModel,
        mutated: didMutate,
        queued: queue.splice(0),
      }
    },
  })

  if (options.idleWake === true) {
    const onIdle = (): void => {
      if (stopped) return
      if (root !== undefined && options.chunks !== undefined) {
        for (const el of root.querySelectorAll(`[${BINDER_MESSAGE_ATTRIBUTE}]`)) {
          const tag = el.getAttribute(BINDER_MESSAGE_ATTRIBUTE)
          if (tag !== null && tag !== '') void loadChunk(tag)?.catch(() => undefined)
        }
      }
      triggerWake()
    }
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(onIdle)
      cancelIdle = () => window.cancelIdleCallback(id)
    } else {
      const id = setTimeout(onIdle, 0)
      cancelIdle = () => clearTimeout(id)
    }
  }

  return {
    model: () => currentModel,
    queued: () => [...queue],
    woke: () => didWake,
    mutated: () => didMutate,
    stop,
  }
}

export const Binder = {
  start,
  canAnswerLocally,
  applyAnchors,
}
