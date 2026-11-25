/**
 * `foldkit-ssr/binder` (Phase 6, Bouts 6.5–6.7): answers declared presses
 * before the Foldkit runtime loads, writes DOM anchors as text/attributes/
 * hidden/order, and hands over its updated Model and queued Messages to
 * `SSR.hydrate` once the runtime wakes.
 */
import { Option, Result, Schema } from 'effect'
import { type Expr, Transition } from 'metakit'
import { covers } from 'metakit/graph/match'
import { ANCHOR_ATTRIBUTE, type Bindings, type BindingValue } from './binding.js'
export { ANCHOR_ATTRIBUTE, Binding, type Bindings, type BindingValue } from './binding.js'
import { offerBinder } from './handoff.js'
import { FOLDKIT_APP_ATTRIBUTE } from './marks.js'

/** Attribute naming the Message tag an element dispatches. */
export const BINDER_MESSAGE_ATTRIBUTE = 'data-fk-msg' as const

/** Attribute carrying the JSON-encoded payload for `data-fk-msg` (optional; defaults to `{}`). */
export const BINDER_PAYLOAD_ATTRIBUTE = 'data-fk-payload' as const

/** Attribute naming a child element's key inside an `Order`-bound container. */
export const BINDER_KEY_ATTRIBUTE = 'data-fk-key' as const

/** Marker written on controls the binder updated, so `KeepTyped` preserves them across hydration. */
export const BINDER_TOUCHED_ATTRIBUTE = 'data-fk-binder-touched' as const

/** Any declared `Transition` over `Model`, regardless of its `Input`, `Emit`, or `Supplied` types. */
export interface BinderTransitionLike<Model> {
  readonly _tag: 'Transition'
  readonly stateSchema: Option.Option<Schema.Codec<Model, Model>>
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
  /** Receives invalid-payload refusal messages (defaults to `console.warn`). */
  readonly onInvalidPayload?: ((message: string) => void) | undefined
  /** If true, also calls `wake()` when the browser becomes idle. */
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

const isUnsafeAttributeValue = (name: string, value: string): boolean =>
  URL_ATTRIBUTES.has(name.toLowerCase()) && isUnsafeUrl(value)

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

/** Whether every path `transition` writes is covered by at least one bound anchor's reads. */
export const canAnswerLocally = <Model, Keys extends string>(
  transition: BinderTransitionLike<Model>,
  bindings: Bindings<Model, Keys>,
): boolean => {
  if (transition.emits.length > 0) return false
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
            el.setAttribute(BINDER_TOUCHED_ATTRIBUTE, '')
          }
        } else if (isUnsafeAttributeValue(value.name, value.value)) {
          break
        } else if (el.getAttribute(value.name) !== value.value) {
          el.setAttribute(value.name, value.value)
          el.setAttribute(BINDER_TOUCHED_ATTRIBUTE, '')
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

  const handleEvent = (event: Event): void => {
    if (stopped || root === undefined) return
    const el = findMessageElement(event.target, root)
    if (el === null) return
    const tag = el.getAttribute(BINDER_MESSAGE_ATTRIBUTE)
    if (tag === null || tag === '') return

    if (!Object.hasOwn(options.manifest.transitions, tag)) {
      triggerWake()
      return
    }
    const entry = (
      options.manifest.transitions as Readonly<Record<string, BinderTransition<Model, Tag>>>
    )[tag]!

    const rawPayload = el.getAttribute(BINDER_PAYLOAD_ATTRIBUTE)
    let parsed: unknown = {}
    if (rawPayload !== null && rawPayload !== '') {
      try {
        parsed = JSON.parse(rawPayload)
      } catch (error) {
        const issue = error instanceof Error ? error.message : String(error)
        reportInvalid(formatInvalidPayload(tag, issue))
        return
      }
      if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
        reportInvalid(formatInvalidPayload(tag, 'expected a JSON object payload'))
        return
      }
      if (hasForbiddenKey(parsed)) {
        reportInvalid(formatInvalidPayload(tag, 'payload contains a forbidden prototype key'))
        return
      }
    }

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

    // If the runtime is already waking, queue the decoded Message so it runs
    // once in order after hand-over rather than racing with hydration.
    if (didWake) {
      queue.push(messagePayload)
      event.preventDefault()
      event.stopImmediatePropagation()
      return
    }

    if (!canAnswerLocally(entry.transition, options.manifest.bindings)) {
      queue.push(messagePayload)
      event.preventDefault()
      event.stopImmediatePropagation()
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
    if (Result.isFailure(stepped)) {
      // Guard refused: no state change, no wake.
      return
    }

    currentModel = stepped.success.state
    didMutate = true
    const values = options.manifest.bindings.evaluate(currentModel)
    applyAnchors(root, values)
    event.preventDefault()
    event.stopImmediatePropagation()
  }

  const stop = (): void => {
    if (stopped) return
    stopped = true
    cancelIdle?.()
    cancelIdle = undefined
    if (root !== undefined) {
      for (const type of events) {
        root.removeEventListener(type, handleEvent, true)
      }
    }
  }

  if (root !== undefined) {
    for (const type of events) {
      root.addEventListener(type, handleEvent, true)
    }
  }

  offerBinder({
    take: () => {
      stop()
      return {
        model: currentModel,
        mutated: didMutate,
        queued: queue.splice(0),
      }
    },
  })

  if (options.idleWake === true) {
    if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
      const id = window.requestIdleCallback(triggerWake)
      cancelIdle = () => window.cancelIdleCallback(id)
    } else {
      const id = setTimeout(triggerWake, 0)
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
