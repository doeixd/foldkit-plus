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

/**
 * The DOM event each of Foldkit's event attributes listens to, read from
 * Foldkit's own attribute table (0.163). `OnCustomEvent` names its event in
 * its payload, and `OnMount` and `OnUnmount` listen to none.
 */
export const EVENT_OF: Readonly<Record<string, string>> = {
  OnClick: 'click',
  OnDoubleClick: 'dblclick',
  OnMouseDown: 'mousedown',
  OnMouseUp: 'mouseup',
  OnMouseEnter: 'mouseenter',
  OnMouseLeave: 'mouseleave',
  OnMouseOver: 'mouseover',
  OnMouseOut: 'mouseout',
  OnMouseMove: 'mousemove',
  OnPointerMove: 'pointermove',
  OnPointerLeave: 'pointerleave',
  OnPointerDown: 'pointerdown',
  OnPointerUp: 'pointerup',
  OnKeyDown: 'keydown',
  OnKeyDownPreventDefault: 'keydown',
  OnKeyDownSelf: 'keydown',
  OnKeyDownSelfPreventDefault: 'keydown',
  OnKeyDownFocus: 'keydown',
  OnKeyUp: 'keyup',
  OnKeyUpPreventDefault: 'keyup',
  OnKeyPress: 'keypress',
  OnFocus: 'focus',
  OnBlur: 'blur',
  OnFocusEnter: 'focusin',
  OnFocusLeave: 'focusout',
  OnInput: 'input',
  OnChange: 'change',
  OnBeforeInput: 'beforeinput',
  OnBeforeInputPreventDefault: 'beforeinput',
  OnFileChange: 'change',
  OnSubmit: 'submit',
  OnReset: 'reset',
  OnScroll: 'scroll',
  OnWheel: 'wheel',
  OnCopy: 'copy',
  OnCut: 'cut',
  OnPaste: 'paste',
  OnPastePreventDefault: 'paste',
  OnCopyText: 'copy',
  OnCutText: 'cut',
  OnCancel: 'cancel',
  OnCancelPreventDefault: 'cancel',
  OnToggle: 'toggle',
  OnContextMenu: 'contextmenu',
  OnDragStart: 'dragstart',
  OnDrag: 'drag',
  OnDragEnd: 'dragend',
  OnDragEnter: 'dragenter',
  OnDragLeave: 'dragleave',
  OnDragOver: 'dragover',
  OnDrop: 'drop',
  OnDropFiles: 'drop',
  OnTouchStart: 'touchstart',
  OnTouchEnd: 'touchend',
  OnTouchMove: 'touchmove',
  OnTouchCancel: 'touchcancel',
  OnAnimationStart: 'animationstart',
  OnAnimationEnd: 'animationend',
  OnAnimationIteration: 'animationiteration',
  OnTransitionEnd: 'transitionend',
  OnLoad: 'load',
  OnError: 'error',
  OnPlay: 'play',
  OnPause: 'pause',
  OnEnded: 'ended',
  OnTimeUpdate: 'timeupdate',
  OnVolumeChange: 'volumechange',
  OnSelect: 'select',
}

/**
 * The attributes whose binding the page can describe: a Message value, or one
 * of the hole forms this builder records. Any other handler still runs on the
 * live page, so its event is marked `*`: the page does something there it
 * cannot name, and a dispatcher that ran only the named bindings would do less.
 */
const MARKABLE: ReadonlySet<string> = new Set([
  'OnClick',
  'OnDoubleClick',
  'OnMouseDown',
  'OnMouseUp',
  'OnMouseEnter',
  'OnMouseLeave',
  'OnMouseOver',
  'OnMouseOut',
  'OnMouseMove',
  'OnFocus',
  'OnBlur',
  'OnSubmit',
  'OnReset',
  'OnInput',
  'OnChange',
  'OnKeyDown',
  'OnKeyUp',
])

/** The token in a marker for a handler the page cannot describe. */
export const UNNAMED_HANDLER = '*'

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

/**
 * A builder a view is given: Foldkit's `HtmlBuilder`, or a Surface renderer's,
 * which leaves out Foldkit's phantom key. Its Message is what `OnClick` takes.
 */
export type AnyBuilder = {
  readonly OnClick: (message: never, ...rest: ReadonlyArray<never>) => unknown
}

/** The Message a builder's handlers make. */
export type MessageOf<Builder> = Builder extends {
  readonly OnClick: (message: infer Message, ...rest: ReadonlyArray<never>) => unknown
}
  ? Message
  : never

/**
 * The resumable builder for a view whose Messages are `Message`: its elements
 * and attributes, and the hole forms of the four value events. One shape
 * whether it wraps a view's `HtmlBuilder` or a Surface renderer's builder, so a
 * helper typed with it takes either; Foldkit's phantom Message key, which only
 * the first has, is left out of both.
 */
export type ResumableBuilder<Message> = Omit<
  HtmlBuilder<Message>,
  (keyof HtmlBuilder<never> & symbol) | 'OnInput' | 'OnChange' | 'OnKeyDown' | 'OnKeyUp'
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
export const builder = <Builder extends AnyBuilder>(
  h: Builder,
): ResumableBuilder<MessageOf<Builder>> => {
  const cached = builders.get(h)
  if (cached !== undefined) return cached as ResumableBuilder<MessageOf<Builder>>
  const source = h as unknown as Record<string, unknown>
  const attribute = source.Attribute as (name: string, value: string) => unknown

  /** The attributes with a marker for each binding, while the server renders. */
  const mark = (tag: string, attributes: ReadonlyArray<unknown>): ReadonlyArray<unknown> => {
    const now = current()
    if (now?.mode !== 'collect' && now?.mode !== 'replay') return attributes
    const id = attributes.find(item => isTagged(item) && item._tag === 'Id') as
      { readonly value: string } | undefined
    const element = id === undefined ? tag : `${tag}#${id.value}`
    // Foldkit chains every handler of an event, in the order the attributes
    // come, so a marker lists every binding of its event in that order.
    const tokens = new Map<string, Array<string>>()
    for (const item of attributes) {
      if (!isTagged(item)) continue
      const event =
        item._tag === 'OnCustomEvent' && typeof item.name === 'string'
          ? item.name
          : EVENT_OF[item._tag]
      if (event === undefined) continue
      // Recorded for the refusal; the render does not survive it.
      if (now.mode === 'collect' && now.region !== undefined) {
        now.inStatic.push({ region: now.region, element, event })
      }
      const recorded = holes.get(item)
      const binding: Binding | undefined = !MARKABLE.has(item._tag)
        ? undefined
        : 'message' in item
          ? {
              attribute: item._tag,
              event,
              element,
              message: item.message,
              ...(item.options === undefined ? {} : { options: item.options }),
            }
          : recorded === undefined
            ? undefined
            : {
                attribute: item._tag,
                event,
                element,
                message: recorded.template,
                hole: recorded.hole,
              }
      const list = tokens.get(event) ?? []
      tokens.set(event, list)
      if (binding === undefined) {
        list.push(UNNAMED_HANDLER)
      } else {
        list.push(String(now.bindings.length))
        now.bindings.push(binding)
      }
    }
    if (tokens.size === 0) return attributes
    const markers = [...tokens].map(([event, list]) =>
      attribute(`${BINDING_ATTRIBUTE}${event}`, list.join(' ')),
    )
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
  return wrapped as unknown as ResumableBuilder<MessageOf<Builder>>
}

/**
 * A view or renderer written against the resumable builder, as one that takes
 * the builder it is given: `Surface.rootView(Page, params, Resume.view(render))`,
 * `SurfaceView.define`, or an application's own view.
 */
export const view =
  <Model, Builder extends AnyBuilder, Out>(
    render: (model: Model, rh: ResumableBuilder<MessageOf<Builder>>) => Out,
  ) =>
  (model: Model, h: Builder): Out =>
    render(model, builder(h))
