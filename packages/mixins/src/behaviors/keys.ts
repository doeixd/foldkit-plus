/**
 * One owner for a slot's `keydown`, built from named routes. A route says
 * which presses it takes (typed chords, the printable characters, or a
 * predicate) and which Message a press means; `behavior` folds the routes into
 * the one handler the resolver allows per event. Two routes that declare the
 * same chord are refused when the Behavior is defined, unless `first` gives one
 * precedence: nothing chains at run time, and one press sends at most one
 * Message.
 *
 * Policies, from Foldkit's handlers: no route sees a key of an IME
 * composition; a handled press is default-prevented and an unhandled one is
 * untouched; propagation is never stopped, so an ancestor that should yield
 * reads `defaultPrevented`; a held key runs its route on every repeat, since a
 * handler is not told `repeat` (guard a once-only route in `update`).
 *
 * A chord matches the `key` a press reports, which a modifier can change:
 * Shift+a reports 'A' (write `chord('A')`), and on macOS Alt changes it too
 * (Alt+a reports 'å'), so `chord('a', { alt: true })` does not fire there.
 *
 * Two attachments that both write `keydown` on one slot still fail
 * `mixins:event-conflict`; fold their keys into one `behavior` instead.
 * Observing a key without owning it is a Subscription
 * (`foldkit-primitives/events`), not a route.
 */
import { Data, Option } from 'effect'
import type { HtmlBuilder, KeyboardModifiers } from 'foldkit/html'
import * as Behavior from '../behavior.js'
import { DiagnosticError } from '../diagnostics.js'
import * as Event from '../event.js'
import type { SlotItem } from '../slotItem.js'
import * as SlotView from '../slotView.js'
import { idSelector } from './id-selector.js'

/** The named key values of the UI Events specification a route may take, modifiers aside. */
const NAMED_KEYS = [
  'Enter',
  'Tab',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
  'ArrowUp',
  'End',
  'Home',
  'PageDown',
  'PageUp',
  'Backspace',
  'Clear',
  'Copy',
  'CrSel',
  'Cut',
  'Delete',
  'EraseEof',
  'ExSel',
  'Insert',
  'Paste',
  'Redo',
  'Undo',
  'Accept',
  'Again',
  'Attn',
  'Cancel',
  'ContextMenu',
  'Escape',
  'Execute',
  'Find',
  'Finish',
  'Help',
  'Pause',
  'Play',
  'Props',
  'Select',
  'ZoomIn',
  'ZoomOut',
  'BrightnessDown',
  'BrightnessUp',
  'Eject',
  'LogOff',
  'Power',
  'PowerOff',
  'PrintScreen',
  'Hibernate',
  'Standby',
  'WakeUp',
  'CapsLock',
  'NumLock',
  'ScrollLock',
  'MediaPlayPause',
  'MediaStop',
  'MediaTrackNext',
  'MediaTrackPrevious',
  'AudioVolumeDown',
  'AudioVolumeUp',
  'AudioVolumeMute',
  'F1',
  'F2',
  'F3',
  'F4',
  'F5',
  'F6',
  'F7',
  'F8',
  'F9',
  'F10',
  'F11',
  'F12',
  'F13',
  'F14',
  'F15',
  'F16',
  'F17',
  'F18',
  'F19',
  'F20',
] as const

export type NamedKey = (typeof NAMED_KEYS)[number]

const named: ReadonlySet<string> = new Set(NAMED_KEYS)

/** A modifier is a chord's option: its own press sets its own flag, so as a key it would never match. */
const MODIFIER_KEYS: ReadonlySet<string> = new Set(['Shift', 'Control', 'Alt', 'Meta'])

/** Names older browsers and habit use, to say which name was meant. */
const ALIASES: Readonly<Record<string, string>> = {
  Esc: 'Escape',
  Up: 'ArrowUp',
  Down: 'ArrowDown',
  Left: 'ArrowLeft',
  Right: 'ArrowRight',
  Del: 'Delete',
  Return: 'Enter',
  Space: ' ',
  Spacebar: ' ',
}

/**
 * `K` when it is one character or a named key, else the named keys, so a
 * misspelt name is refused where it is written and the editor lists the names.
 */
export type KeyName<K extends string> = string extends K
  ? K
  : K extends NamedKey
    ? K
    : K extends `${string}${infer Rest}`
      ? Rest extends ''
        ? K
        : NamedKey
      : NamedKey

/** One code point: what a press of a character key reports as its `key`. */
const isCharacter = (key: string): boolean => {
  const first = key.codePointAt(0)
  return first !== undefined && key.length === (first > 0xffff ? 2 : 1)
}

export interface Modifiers {
  readonly shift?: boolean
  readonly ctrl?: boolean
  readonly alt?: boolean
  readonly meta?: boolean
}

/**
 * One gesture a route declares. A `Chord` names a key and its modifiers,
 * matched exactly; `shift` is `'any'` only for a character chord that did not
 * state it, since the character a press produces already carries the shift
 * (`'?'` is Shift+/ on one layout and a plain key on another).
 */
export type Gesture = Data.TaggedEnum<{
  Chord: {
    readonly key: string
    readonly shift: boolean | 'any'
    readonly ctrl: boolean
    readonly alt: boolean
    readonly meta: boolean
  }
  Printable: {}
  Where: { readonly predicate: (key: string, modifiers: KeyboardModifiers) => boolean }
}>

export type Chord = Data.TaggedEnum.Value<Gesture, 'Chord'>

const Gesture = Data.taggedEnum<Gesture>()

const fail = (
  code: 'mixins:unknown-key' | 'mixins:key-conflict',
  message: string,
  details: Readonly<Record<string, unknown>>,
  slot: Option.Option<string> = Option.none(),
): never => {
  throw new DiagnosticError({
    source: 'mixins',
    code,
    severity: 'error',
    message,
    ...Option.match(slot, { onNone: () => ({}), onSome: name => ({ slot: name }) }),
    details,
  })
}

/**
 * A key with its modifiers, each `false` unless given, except that a
 * character chord that does not state `shift` takes the character however it
 * was typed. A `key` longer than one character must be a named key of the UI
 * Events specification (`Keys.chord('Esc')` throws `mixins:unknown-key`), and
 * `shift: true` on a lowercase letter throws it too: write `chord('A')`.
 */
export const chord = <const K extends string>(
  key: KeyName<K>,
  modifiers: Modifiers = {},
): Chord => {
  if (!isCharacter(key) && !named.has(key)) {
    const meant = Option.fromNullishOr(
      Object.hasOwn(ALIASES, key)
        ? ALIASES[key]
        : NAMED_KEYS.find(name => name.toLowerCase() === key.toLowerCase()),
    )
    fail(
      'mixins:unknown-key',
      MODIFIER_KEYS.has(key)
        ? `"${key}" is a modifier: give it as the chord's option, as in Keys.chord('a', { ${key === 'Control' ? 'ctrl' : key.toLowerCase()}: true })`
        : `"${key}" is neither one character nor a named key of the UI Events specification${Option.match(
            meant,
            { onNone: () => '', onSome: name => `; did you mean "${name}"?` },
          )}`,
      { key },
    )
  }
  const upper = key.toUpperCase()
  if (modifiers.shift === true && upper !== key && isCharacter(upper)) {
    fail(
      'mixins:unknown-key',
      `Shift+${key} reports the key "${upper}", so this chord would fire only under CapsLock: write Keys.chord('${upper}', { shift: true }), or Keys.chord('${upper}') to take it however it was typed`,
      { key },
    )
  }
  return Gesture.Chord({
    key,
    shift: modifiers.shift ?? (isCharacter(key) ? 'any' : false),
    ctrl: modifiers.ctrl ?? false,
    alt: modifiers.alt ?? false,
    meta: modifiers.meta ?? false,
  })
}

/** Any one character pressed with no `ctrl`, `alt` or `meta`; Shift allowed. It overlaps every character chord that holds none of the three. */
export const printable: Gesture = Gesture.Printable()

/**
 * A gesture no declaration describes. A `where` route is asked only after the
 * declared route for the press, if any, has declined, and the `where` routes
 * in list order: two predicates are not claimed disjoint.
 */
export const where = (predicate: (key: string, modifiers: KeyboardModifiers) => boolean): Gesture =>
  Gesture.Where({ predicate })

const FOCUS = Symbol.for('foldkit-mixins.keys.focus')

/** An answer that also moves focus, in the handler, to the element with this id. */
export interface Focus<Message> {
  readonly [FOCUS]: true
  readonly id: string
  readonly message: Message
}

/** Sends `message` and focuses the element whose id is `id` (any id: it is matched as an attribute, not a CSS `#id`). */
export const focus = <Message>(id: string, message: Message): Focus<Message> =>
  Object.freeze({ [FOCUS]: true as const, id, message })

const isFocus = <Message>(answer: Message | Focus<Message>): answer is Focus<Message> =>
  typeof answer === 'object' && answer !== null && Object.hasOwn(answer, FOCUS)

export interface Press<Input> {
  readonly key: string
  readonly modifiers: KeyboardModifiers
  readonly input: Input
  /** Present when the slot is rendered once per item. */
  readonly item?: SlotItem
}

export interface Route<Input, Message> {
  readonly name: string
  readonly on: ReadonlyArray<Gesture>
  readonly handle: (press: Press<Input>) => Option.Option<Message | Focus<Message>>
}

/** A named route: the presses it takes, and the Message (or focus move) each means. */
export const route = <Input, Message>(
  name: string,
  spec: {
    readonly on: readonly [Gesture, ...ReadonlyArray<Gesture>]
    readonly handle: (press: Press<Input>) => Option.Option<Message | Focus<Message>>
  },
): Route<Input, Message> => Object.freeze({ name, on: spec.on, handle: spec.handle })

const gestureMatches = (gesture: Gesture, key: string, modifiers: KeyboardModifiers): boolean =>
  Gesture.$match(gesture, {
    Chord: chord =>
      chord.key === key &&
      (chord.shift === 'any' || chord.shift === modifiers.shiftKey) &&
      chord.ctrl === modifiers.ctrlKey &&
      chord.alt === modifiers.altKey &&
      chord.meta === modifiers.metaKey,
    Printable: () =>
      isCharacter(key) && !modifiers.ctrlKey && !modifiers.altKey && !modifiers.metaKey,
    Where: ({ predicate }) => predicate(key, modifiers),
  })

const routeMatches = <Input, Message>(
  candidate: Route<Input, Message>,
  key: string,
  modifiers: KeyboardModifiers,
): boolean => candidate.on.some(gesture => gestureMatches(gesture, key, modifiers))

/**
 * Two routes as one, named `a>b`: a press either takes asks `a` first, and `b`
 * only when `a` does not take the press or declines it. The way to let two
 * routes declare one chord.
 */
export const first = <Input, Message>(
  a: Route<Input, Message>,
  b: Route<Input, Message>,
): Route<Input, Message> =>
  Object.freeze({
    name: `${a.name}>${b.name}`,
    on: [...a.on, ...b.on],
    handle: (press: Press<Input>) => {
      for (const inner of [a, b]) {
        if (!routeMatches(inner, press.key, press.modifiers)) continue
        const answer = inner.handle(press)
        if (Option.isSome(answer)) return answer
      }
      return Option.none()
    },
  })

const isDeclared = (gesture: Gesture): boolean => !Gesture.$is('Where')(gesture)

const plainCharacter = (chord: Chord): boolean =>
  isCharacter(chord.key) && !chord.ctrl && !chord.alt && !chord.meta

/** The press two declared gestures both take, described, or none. */
const overlap = (left: Gesture, right: Gesture): Option.Option<string> =>
  Gesture.$match(left, {
    Where: () => Option.none(),
    Printable: () =>
      Gesture.$match(right, {
        Where: () => Option.none(),
        Printable: () => Option.some('printable'),
        Chord: chord => (plainCharacter(chord) ? Option.some(describe(chord)) : Option.none()),
      }),
    Chord: chord =>
      Gesture.$match(right, {
        Where: () => Option.none(),
        Printable: () => (plainCharacter(chord) ? Option.some(describe(chord)) : Option.none()),
        Chord: other =>
          chord.key === other.key &&
          chord.ctrl === other.ctrl &&
          chord.alt === other.alt &&
          chord.meta === other.meta &&
          (chord.shift === 'any' || other.shift === 'any' || chord.shift === other.shift)
            ? Option.some(describe(chord.shift === 'any' ? other : chord))
            : Option.none(),
      }),
  })

/** `Ctrl+Alt+Shift+Meta+key`, Space for `' '`. */
export const describe = (chord: Chord): string =>
  [
    ...(chord.ctrl ? ['Ctrl'] : []),
    ...(chord.alt ? ['Alt'] : []),
    ...(chord.shift === true ? ['Shift'] : []),
    ...(chord.meta ? ['Meta'] : []),
    chord.key === ' ' ? 'Space' : chord.key,
  ].join('+')

const refuseOverlaps = <Input, Message>(
  routes: ReadonlyArray<Route<Input, Message>>,
  slot: Option.Option<string>,
): void => {
  routes.forEach((left, index) => {
    for (const right of routes.slice(index + 1)) {
      for (const a of left.on.filter(isDeclared)) {
        for (const b of right.on.filter(isDeclared)) {
          Option.match(overlap(a, b), {
            onNone: () => {},
            onSome: pressed =>
              fail(
                'mixins:key-conflict',
                `two routes take ${pressed === 'printable' ? 'every printable key' : `"${pressed}"`}${Option.match(slot, { onNone: () => '', onSome: name => ` on slot "${name}"` })}: "${left.name}" and "${right.name}"; wrap them in Keys.first(a, b) to give one precedence`,
                {
                  ...Option.match(slot, { onNone: () => ({}), onSome: name => ({ slot: name }) }),
                  event: 'keydown',
                  chord: pressed,
                  contributors: [left.name, right.name],
                },
                slot,
              ),
          })
        }
      }
    }
  })
}

export interface Options<Slots, Input, Message> {
  readonly slot: keyof Behavior.BehaviorSpec<Slots, Input, Message> & string
  readonly routes: ReadonlyArray<Route<Input, Message>>
  /** The attachment's name, which `SlotView.detach` and `replace` address. Default `'Keys'`. */
  readonly name?: string
}

/** Asks routes no two of which declare one press; `answer` and `behavior` refuse the rest first. */
const answerOf =
  <Input, Message>(routes: ReadonlyArray<Route<Input, Message>>) =>
  (press: Press<Input>): Option.Option<Message | Focus<Message>> => {
    const takes = (gesture: Gesture) =>
      isDeclared(gesture) && gestureMatches(gesture, press.key, press.modifiers)
    const owner = Option.fromNullishOr(routes.find(candidate => candidate.on.some(takes)))
    const answered = Option.flatMap(owner, candidate => candidate.handle(press))
    if (Option.isSome(answered)) return answered
    for (const candidate of routes) {
      if (Option.isSome(owner) && owner.value === candidate) continue
      const taken = candidate.on.some(
        gesture =>
          Gesture.$is('Where')(gesture) && gestureMatches(gesture, press.key, press.modifiers),
      )
      if (!taken) continue
      const given = candidate.handle(press)
      if (Option.isSome(given)) return given
    }
    return Option.none()
  }

/**
 * What a press means to `routes`, asked as `behavior` asks it: the one
 * declared route that takes the press, then, if it declines or none does, each
 * route with a `where` that takes it, in list order. The first `Some` ends the
 * press. Throws `mixins:key-conflict` when two routes declare one press.
 */
export const answer = <Input, Message>(
  routes: ReadonlyArray<Route<Input, Message>>,
): ((press: Press<Input>) => Option.Option<Message | Focus<Message>>) => {
  refuseOverlaps(routes, Option.none())
  return answerOf(routes)
}

const build = <Slots, Input, Message>(
  slots: Slots,
  options: Options<Slots, Input, Message>,
): Behavior.NamedBehavior<Slots, Input, Message> => {
  refuseOverlaps(options.routes, Option.some(options.slot))
  const answer = answerOf(options.routes)
  return Behavior.forSlots(slots)<Input, Message>(
    {
      [options.slot]: Behavior.slot({
        requires: { events: [Event.KeyDown] },
        attributes: ({
          input,
          h,
          item,
        }: {
          readonly input: Input
          readonly h: HtmlBuilder<Message>
          readonly item?: SlotItem
        }) => [
          h.OnKeyDownFocus((key, modifiers) =>
            Option.map(
              answer({ key, modifiers, input, ...(item === undefined ? {} : { item }) }),
              given =>
                isFocus(given)
                  ? { focusSelector: idSelector(given.id), message: given.message }
                  : // `:not(*)` matches nothing: the press is handled and focus stays.
                    { focusSelector: ':not(*)', message: given },
            ),
          ),
        ],
      }),
      // Keyed by a value the caller chose; `forSlots` checks the key exists.
    } as unknown as Behavior.BehaviorSpec<Slots, Input, Message>,
    { name: options.name ?? 'Keys' },
  )
}

/**
 * One Behavior owning `slot`'s `keydown`, folded from `routes`. It requires
 * the slot to publish `keydown`, and a slot that protects `keydown` refuses it
 * like any Mixin. Throws `mixins:key-conflict` when two routes declare one
 * press.
 *
 * @example
 * ```ts
 * const Search = SlotView.over(SearchSlots)<SearchInput, Message>()
 * const SearchKeys = Keys.behavior(Search)({
 *   slot: 'input',
 *   routes: [
 *     Keys.route('EscapeClears', {
 *       on: [Keys.chord('Escape')],
 *       handle: ({ input }) => (input.query === '' ? Option.none() : Option.some(Message.Cleared())),
 *     }),
 *   ],
 * })
 * ```
 */
export function behavior<Slots, Input, Message>(
  bound: SlotView.Bound<Slots, Input, Message>,
): (options: Options<Slots, Input, Message>) => Behavior.NamedBehavior<Slots, Input, Message>
export function behavior<Slots>(
  slots: SlotView.Unbound<Slots>,
): <Input, Message>(
  options: Options<Slots, Input, Message>,
) => Behavior.NamedBehavior<Slots, Input, Message>
export function behavior<Slots, Input, Message>(
  target: Slots | SlotView.Bound<Slots, Input, Message>,
) {
  const slots = SlotView.boundSlots(target)
  return (options: Options<Slots, Input, Message>) => build(slots, options)
}
