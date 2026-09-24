/**
 * Delegated dispatch: the page answers an event from its markers, before the
 * application has booted.
 *
 * One capture-phase listener per event type sits at the root, so events that
 * do not bubble (`focus`, `blur`) are caught, and it runs before anything
 * Foldkit attaches later. On an event it walks from the target to the root
 * and, for every marker of that event on the way, dispatches each binding the
 * marker names, in order, the way Foldkit's own handler would: a hole is
 * filled from the event, `OnClick`'s options are honoured, `OnSubmit`
 * prevents the default. A marker token the page could not name (`*`) means
 * the live page does something here the page cannot describe, so the walk
 * ends and `onUnnamed` is told; what to do then is the caller's, and Phase C
 * makes it boot.
 */
import { Result, Schema } from 'effect'
import type { KeyboardModifiers } from 'foldkit/html'
import type { EncodedBinding } from './index.js'
import { BINDING_ATTRIBUTE, EVENT_OF, UNNAMED_HANDLER } from './resumable.js'

/** A binding decoded from the page: its Message is one of the application's. */
export interface DecodedBinding {
  readonly attribute: string
  readonly event: string
  readonly message: unknown
  readonly hole?: ReadonlyArray<string> | undefined
  readonly depth?: number | undefined
  readonly options?: unknown
}

/**
 * The page's bindings, decoded through the application's Message Schema, and
 * every marker in `root` checked against them. A page whose markers name a
 * binding it does not carry, or whose entry is not one of the application's
 * Messages, is refused whole, with the reason.
 */
export const decodeBindings = (
  Message: Schema.Top | undefined,
  encoded: ReadonlyArray<EncodedBinding>,
  root: ParentNode,
  allowed: ReadonlySet<string>,
): Result.Result<ReadonlyArray<DecodedBinding>, string> => {
  if (encoded.length > 0 && Message === undefined) {
    return Result.fail(
      'the page has bindings and the plan has no Message Schema to decode them with',
    )
  }
  const decode =
    Message === undefined
      ? undefined
      : Schema.decodeUnknownResult(Message as Schema.Codec<unknown, unknown>)
  const bindings: Array<DecodedBinding> = []
  for (const [index, entry] of encoded.entries()) {
    const event = EVENT_OF[entry.attribute]
    if (event === undefined) {
      return Result.fail(
        `binding ${index} is for "${entry.attribute}", which is no event attribute`,
      )
    }
    const message = decode!(entry.message)
    if (Result.isFailure(message)) {
      return Result.fail(
        `binding ${index} does not decode as a Message: ${message.failure.message}`,
      )
    }
    const tag = (message.success as { readonly _tag?: unknown })._tag
    if (typeof tag !== 'string' || !allowed.has(tag)) {
      return Result.fail(
        `binding ${index} dispatches ${typeof tag === 'string' ? tag : 'an untagged Message'}, which no active Surface lists in its messages`,
      )
    }
    bindings.push({
      attribute: entry.attribute,
      event,
      message: message.success,
      ...(entry.hole === undefined ? {} : { hole: entry.hole }),
      ...(entry.depth === undefined ? {} : { depth: entry.depth }),
      ...(entry.options === undefined ? {} : { options: entry.options }),
    })
  }
  for (const element of Array.from(root.querySelectorAll('*'))) {
    for (const attribute of element.getAttributeNames()) {
      if (!attribute.startsWith(BINDING_ATTRIBUTE)) continue
      for (const token of (element.getAttribute(attribute) ?? '').split(' ')) {
        if (token === UNNAMED_HANDLER) continue
        const ordinal = Number(token)
        if (!Number.isInteger(ordinal) || bindings[ordinal] === undefined) {
          return Result.fail(`the marker ${attribute}="${token}" names no binding the page carries`)
        }
      }
    }
  }
  return Result.succeed(bindings)
}

/** Foldkit's reading of an input's value: a control's `value`, else a host's text. */
const inputValue = (target: EventTarget | null): string => {
  if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
    return target.value
  }
  if (target instanceof HTMLSelectElement) return target.value
  if (target instanceof HTMLElement) return target.innerText ?? target.textContent ?? ''
  return ''
}

const modifiersOf = (event: KeyboardEvent): KeyboardModifiers => ({
  shiftKey: event.shiftKey,
  ctrlKey: event.ctrlKey,
  altKey: event.altKey,
  metaKey: event.metaKey,
})

/** The Message a binding dispatches for this event: its own, with the hole filled. */
const messageFor = (binding: DecodedBinding, event: Event): unknown => {
  if (binding.hole === undefined) return binding.message
  const fill = (template: Readonly<Record<string, unknown>>): unknown => {
    if (binding.event === 'input' || binding.event === 'change') {
      const [field] = binding.hole ?? []
      return { ...template, [field ?? 'value']: inputValue(event.target) }
    }
    if (event instanceof KeyboardEvent) {
      return { ...template, key: event.key, modifiers: modifiersOf(event) }
    }
    return template
  }
  // The hole's fields sit inside each placement wrapper's `message`.
  const inside = (template: Readonly<Record<string, unknown>>, depth: number): unknown =>
    depth === 0
      ? fill(template)
      : {
          ...template,
          message: inside(template.message as Readonly<Record<string, unknown>>, depth - 1),
        }
  return inside(binding.message as Readonly<Record<string, unknown>>, binding.depth ?? 0)
}

/** What `OnClick` declares beside its Message. */
interface ClickOptions {
  readonly defaultAction?: 'Allow' | 'Prevent'
  readonly propagation?: 'Bubble' | 'Stop'
  readonly focusSelector?: string
}

/**
 * What the markers make of one event: the Messages its bindings dispatch, in
 * the order the live page would, and, when the walk met a handler the page
 * could not name, that element. An answer with `unnamed` is incomplete: the
 * live page would do more than its Messages say.
 */
export interface Answer {
  readonly event: Event
  readonly messages: ReadonlyArray<unknown>
  readonly unnamed?: Element | undefined
}

export interface ListenOptions {
  readonly bindings: ReadonlyArray<DecodedBinding>
  readonly onAnswer: (answer: Answer) => void
}

/**
 * Listens at `root` for every event the bindings name, and answers each from
 * the markers. Returns what removes the listeners.
 */
export const listen = (root: Element, options: ListenOptions): (() => void) => {
  // The bindings name most events; a marker whose handlers the page could not
  // name is `*` alone, so the markers themselves say the rest.
  const events = new Set(options.bindings.map(binding => binding.event))
  for (const element of [root, ...Array.from(root.querySelectorAll('*'))]) {
    for (const { name } of Array.from(element.attributes)) {
      if (name.startsWith(BINDING_ATTRIBUTE)) events.add(name.slice(BINDING_ATTRIBUTE.length))
    }
  }
  const handler = (event: Event) => {
    const type = event.type
    const attribute = `${BINDING_ATTRIBUTE}${type}`
    const messages: Array<unknown> = []
    for (const node of event.composedPath()) {
      if (!(node instanceof Element)) continue
      const tokens = node.getAttribute(attribute)
      // Foldkit chains an element's handlers in one listener, so a Stop among
      // them keeps the event from other elements, not from its siblings.
      let stopped = false
      if (tokens !== null) {
        for (const token of tokens.split(' ')) {
          if (token === UNNAMED_HANDLER) {
            options.onAnswer({ event, messages, unnamed: node })
            return
          }
          const binding = options.bindings[Number(token)]
          if (binding === undefined) continue
          if (binding.attribute === 'OnSubmit') event.preventDefault()
          if (binding.attribute === 'OnClick') {
            const click = (binding.options ?? {}) as ClickOptions
            if (click.defaultAction === 'Prevent') event.preventDefault()
            if (click.propagation === 'Stop') event.stopPropagation()
            if (click.focusSelector !== undefined) {
              const focusTarget = document.querySelector(click.focusSelector)
              if (focusTarget instanceof HTMLElement) focusTarget.focus()
            }
            if (click.propagation === 'Stop') stopped = true
          }
          messages.push(messageFor(binding, event))
        }
      }
      if (stopped || node === root) break
    }
    options.onAnswer({ event, messages })
  }
  for (const type of events) root.addEventListener(type, handler, true)
  return () => {
    for (const type of events) root.removeEventListener(type, handler, true)
  }
}
