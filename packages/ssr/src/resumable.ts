/**
 * The resumable builder: the application's `h`, whose event attributes say, in
 * the server's markup, which Message each element causes.
 *
 * A Foldkit handler is a Message value (`h.OnClick(Message.Liked({ id }))`), so
 * for most events that is already data. The events that carry a value
 * (`OnInput`, `OnChange`, `OnKeyDown`, `OnKeyUp`) take a closure only to put
 * the value into a Message field; this builder also takes the Message's own
 * constructor there, a Message with a hole, and fills the hole the same way.
 *
 * During the server's renders each binding gets an ordinal, recorded in render
 * order, and its element a `data-foldkit-plus-on-<event>` attribute naming it.
 * In the browser the builder marks nothing: it is the application's `h`, with
 * the hole forms turned into the closures Foldkit expects.
 */
import type { Schema } from 'effect'
import type { Attribute, HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import { current, type Binding } from './context.js'

/** The attribute prefix of an element's binding marker. */
export const BINDING_ATTRIBUTE = 'data-foldkit-plus-on-'

/** The DOM event of each event attribute whose binding can be marked. */
const EVENTS: Readonly<Record<string, string>> = {
  OnClick: 'click',
  OnDoubleClick: 'dblclick',
  OnMouseDown: 'mousedown',
  OnMouseUp: 'mouseup',
  OnMouseEnter: 'mouseenter',
  OnMouseLeave: 'mouseleave',
  OnMouseOver: 'mouseover',
  OnMouseOut: 'mouseout',
  OnMouseMove: 'mousemove',
  OnFocus: 'focus',
  OnBlur: 'blur',
  OnSubmit: 'submit',
  OnReset: 'reset',
  OnInput: 'input',
  OnChange: 'change',
  OnKeyDown: 'keydown',
  OnKeyUp: 'keyup',
}

declare const invalid: unique symbol

/** A compile-time failure that names its cause. */
export interface Invalid<Message extends string> {
  readonly [invalid]: Message
}

type IsUnion<T, U = T> = T extends unknown ? ([U] extends [T] ? false : true) : never

/** A Message constructor from `defineMessageUnion`: a tagged Schema that can be called. */
type AnyMemberSchema = Schema.Top & { readonly fields: Schema.Struct.Fields }

/** The Message a member makes. */
type Made<M> = M extends { readonly Type: infer T } ? T : never

/** The fields a member's event may be given fixed: all but `_tag`. */
type Fixable<M> = Partial<Omit<Made<M>, '_tag'>>

/** The fields of a member the event fills: those neither `_tag` nor fixed. */
type Rest<M, Fixed> = Omit<Made<M>, '_tag' | keyof Fixed>

type ProducesMessage<M, Message> = [Made<M>] extends [Message]
  ? unknown
  : Invalid<"the member is not one of this view's Messages">

type TextHoleCheck<M, Fixed> = [keyof Rest<M, Fixed>] extends [never]
  ? Invalid<'the member has no field left for the event to fill'>
  : true extends IsUnion<keyof Rest<M, Fixed>>
    ? Invalid<'the member leaves more than one field for the event to fill: fix the others'>
    : Rest<M, Fixed>[keyof Rest<M, Fixed>] extends string
      ? string extends Rest<M, Fixed>[keyof Rest<M, Fixed>]
        ? unknown
        : Invalid<'the field the event fills must be a string'>
      : Invalid<'the field the event fills must be a string'>

type KeyHoleCheck<M, Fixed> = [keyof Rest<M, Fixed>] extends ['key' | 'modifiers']
  ? ['key' | 'modifiers'] extends [keyof Rest<M, Fixed>]
    ? unknown
    : Invalid<'the member must leave exactly key and modifiers for the event to fill'>
  : Invalid<'the member must leave exactly key and modifiers for the event to fill'>

/** `OnInput` and `OnChange`: a closure, or a member whose one string field the event fills. */
export interface TextHole<Message> {
  (toMessage: (value: string) => Message): Attribute<Message>
  <M extends AnyMemberSchema, const Fixed extends Fixable<M> = {}>(
    member: M & ProducesMessage<M, Message> & TextHoleCheck<M, Fixed>,
    fixed?: Fixed,
  ): Attribute<Message>
}

/** `OnKeyDown` and `OnKeyUp`: a closure, or a member whose `key` and `modifiers` the event fills. */
export interface KeyHole<Message> {
  (toMessage: (key: string, modifiers: KeyboardModifiers) => Message): Attribute<Message>
  <M extends AnyMemberSchema, const Fixed extends Fixable<M> = {}>(
    member: M & ProducesMessage<M, Message> & KeyHoleCheck<M, Fixed>,
    fixed?: Fixed,
  ): Attribute<Message>
}

export type ResumableBuilder<Message> = Omit<
  HtmlBuilder<Message>,
  'OnInput' | 'OnChange' | 'OnKeyDown' | 'OnKeyUp'
> & {
  readonly OnInput: TextHole<Message>
  readonly OnChange: TextHole<Message>
  readonly OnKeyDown: KeyHole<Message>
  readonly OnKeyUp: KeyHole<Message>
}

type AnyMember = ((value: Record<string, unknown>) => unknown) & {
  readonly fields: Readonly<Record<string, unknown>>
}

const isMember = (value: unknown): value is AnyMember =>
  typeof value === 'function' && typeof (value as { fields?: unknown }).fields === 'object'

const tagOf = (member: AnyMember): string => {
  const literal = (member.fields as { _tag?: { ast?: { literal?: unknown } } })._tag?.ast?.literal
  return typeof literal === 'string' ? literal : 'the member'
}

/** The fields a member leaves for the event to fill, given what is fixed. */
const holeOf = (member: AnyMember, fixed: object): ReadonlyArray<string> =>
  Object.keys(member.fields).filter(field => field !== '_tag' && !(field in fixed))

const NO_MODIFIERS: KeyboardModifiers = {
  shiftKey: false,
  ctrlKey: false,
  altKey: false,
  metaKey: false,
}

/** Each hole-form attribute, with its Message filled by a placeholder and the fields the event fills. */
const holes = new WeakMap<
  object,
  { readonly template: unknown; readonly hole: ReadonlyArray<string> }
>()

const isTagged = (value: unknown): value is { readonly _tag: string } & Record<string, unknown> =>
  typeof value === 'object' &&
  value !== null &&
  typeof (value as { _tag?: unknown })._tag === 'string'

const builders = new WeakMap<object, unknown>()

/**
 * The resumable builder for a view's `h`. Use it in place of `h`; it has the
 * same elements and attributes, and the hole forms of the four value events.
 */
export const builder = <Message>(h: HtmlBuilder<Message>): ResumableBuilder<Message> => {
  const cached = builders.get(h)
  if (cached !== undefined) return cached as ResumableBuilder<Message>
  const source = h as unknown as Record<string, unknown>
  const attribute = source.Attribute as (name: string, value: string) => unknown

  /** The attributes with a marker for each binding, while the server renders. */
  const mark = (tag: string, attributes: ReadonlyArray<unknown>): ReadonlyArray<unknown> => {
    const now = current()
    if (now?.mode !== 'collect' && now?.mode !== 'replay') return attributes
    const id = attributes.find(item => isTagged(item) && item._tag === 'Id') as
      { readonly value: string } | undefined
    const element = id === undefined ? tag : `${tag}#${id.value}`
    // One binding per event on an element: Foldkit keeps the last handler.
    const byEvent = new Map<string, Binding>()
    for (const item of attributes) {
      if (!isTagged(item)) continue
      const event = EVENTS[item._tag]
      if (event === undefined) continue
      const recorded = holes.get(item)
      if ('message' in item) {
        byEvent.set(event, {
          event,
          element,
          message: item.message,
          ...(item.options === undefined ? {} : { options: item.options }),
        })
      } else if (recorded !== undefined) {
        byEvent.set(event, { event, element, message: recorded.template, hole: recorded.hole })
      }
    }
    if (byEvent.size === 0) return attributes
    const markers = [...byEvent.values()].map(binding => {
      const ordinal = now.bindings.length
      now.bindings.push(binding)
      return attribute(`${BINDING_ATTRIBUTE}${binding.event}`, String(ordinal))
    })
    return [...attributes, ...markers]
  }

  const textHole =
    (name: string) =>
    (given: unknown, fixed: Record<string, unknown> = {}): unknown => {
      const make = source[name] as (toMessage: (value: string) => unknown) => object
      if (!isMember(given)) return make(given as (value: string) => unknown)
      const hole = holeOf(given, fixed)
      if (hole.length !== 1) {
        throw new Error(
          `Resume.builder: ${name}(${tagOf(given)}) leaves ${hole.length === 0 ? 'no field' : hole.join(', ')} for the event to fill; it must leave one string field`,
        )
      }
      const [field] = hole as [string]
      const made = make(value => given({ ...fixed, [field]: value }))
      holes.set(made, { template: given({ ...fixed, [field]: '' }), hole })
      return made
    }

  const keyHole =
    (name: string) =>
    (given: unknown, fixed: Record<string, unknown> = {}): unknown => {
      const make = source[name] as (
        toMessage: (key: string, modifiers: KeyboardModifiers) => unknown,
      ) => object
      if (!isMember(given)) {
        return make(given as (key: string, modifiers: KeyboardModifiers) => unknown)
      }
      const hole = holeOf(given, fixed)
      if (hole.length !== 2 || !hole.includes('key') || !hole.includes('modifiers')) {
        throw new Error(
          `Resume.builder: ${name}(${tagOf(given)}) leaves ${hole.join(', ') || 'no field'} for the event to fill; it must leave exactly key and modifiers`,
        )
      }
      const made = make((key, modifiers) => given({ ...fixed, key, modifiers }))
      holes.set(made, { template: given({ ...fixed, key: '', modifiers: NO_MODIFIERS }), hole })
      return made
    }

  const wrapped: Record<string, unknown> = {}
  for (const [name, value] of Object.entries(source)) {
    if (name === 'OnInput' || name === 'OnChange') wrapped[name] = textHole(name)
    else if (name === 'OnKeyDown' || name === 'OnKeyUp') wrapped[name] = keyHole(name)
    else if (name === 'keyed') {
      const keyed = value as (tag: string) => (key: PropertyKey, ...rest: Array<unknown>) => unknown
      wrapped[name] =
        (tag: string) =>
        (key: PropertyKey, attributes: ReadonlyArray<unknown> = [], ...rest: Array<unknown>) =>
          keyed(tag)(key, mark(tag, attributes), ...rest)
    } else if (name !== 'submodel' && /^[a-z]/.test(name) && typeof value === 'function') {
      const element = value as (
        attributes: ReadonlyArray<unknown>,
        ...rest: Array<unknown>
      ) => unknown
      wrapped[name] = (attributes: ReadonlyArray<unknown>, ...rest: Array<unknown>) =>
        element(mark(name, attributes), ...rest)
    } else wrapped[name] = value
  }
  builders.set(h, wrapped)
  return wrapped as unknown as ResumableBuilder<Message>
}
