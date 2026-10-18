/**
 * Toasts, in two layers.
 *
 * The adapter (`ToastSlots`' `container` and `entry`, `resolve`, `toView`)
 * styles the fork of `@foldkit/ui`'s Toast (`ToastView`, `./toastView.ts`),
 * whose Model and `update` stay upstream's, for an application whose toasts
 * hold a payload of its own.
 *
 * The component (`init`, `show`, `settle`, `dismiss`, `update`, `view`) is
 * a stack after Sonner: toasts of a `Type` with its icon, a title, a
 * description and an action, newest in front. Collapsed, the ones behind
 * peek out under the front one, smaller; pointing at the stack or focusing
 * into it spreads them out, each at its own measured height. Each counts
 * down its duration (4 seconds by default) only while it is among the
 * `max` shown (3) and nothing holds the stack: the pointer on it, focus in
 * it, or the page hidden. Holding keeps what is left, as Sonner does, and
 * the count goes on from there. A `loading` toast waits until `settle`
 * turns it into the outcome, which is how a promise toast goes from loading
 * to success or error: the application runs the work as a Command and
 * settles the toast with its result. A swipe toward the stack's edge, or
 * the close button, or Escape inside a toast dismisses it; an action
 * dismisses it and sends `Acted`. What a toast says is announced from two
 * live regions beside the stack, politely, and an error assertively, so a
 * loading toast settling to an error is heard at once.
 */
import * as Animation from '@foldkit/ui/animation'
import { Clock, Duration, Effect, Match, Option, Queue, Schema, Stream } from 'effect'
import {
  Attr,
  Capability,
  Event,
  Slot,
  Slots,
  SlotView,
  type NamedStyle,
  type SlotAttributes,
} from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import * as Mount from 'foldkit/mount'
import { defineTaggedUnion } from 'foldkit/schema'
import { modifyFields } from 'foldkit/struct'
import type { ReturnWithOutMessage } from 'foldkit/update'
import { Move, MoveEnded, MoveStarted, Moved } from 'foldkit-primitives/dom'
import { buildersOf, type MixinList, type ResolveContext } from './resolve.js'
import type { ToastEntryRender, ToastRenderInfo } from './toastView.js'

/**
 * Toast is a nested Submodel: one live-region `container` plus an `entry`
 * per toast. The resolver runs once per bundle and each base attribute
 * passes through by identity.
 *
 * Entries own hover and (when swipe is configured) pointer handlers, none
 * of which has an Event token — but the resolver still refuses a second
 * owner by event name. The dismiss control is drawn by the consumer's
 * `entryToView` and is not a slot: its `dismiss` bundle passes through
 * inside the entry's content.
 *
 * The component draws the rest: the stack's `list`, each toast's `icon`,
 * its `body` (`title` and `description`, where a swipe starts), its
 * `action` and `close` buttons, and the `status` and `alert` live regions.
 */
export const ToastSlots = Slots.define({
  container: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role],
  }),
  entry: Slot.make({
    capability: Capability.Container,
    attributes: [Attr.Role],
  }),
  list: Slot.make({ capability: Capability.Container }),
  /** The type's mark, with `data-type`, hidden from assistive technology. */
  icon: Slot.make({ capability: Capability.Container }),
  body: Slot.make({ capability: Capability.Container }),
  title: Slot.make({ capability: Capability.Container }),
  description: Slot.make({ capability: Capability.Container }),
  action: Slot.make({ capability: Capability.Interactive, events: [Event.Click] }),
  close: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaLabel],
  }),
  status: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  alert: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
})

export type ResolvedToastEntry<Message> = Omit<ToastEntryRender, 'attributes'> & {
  readonly attributes: SlotAttributes<Message>
}

export type ResolvedToast<Message> = Omit<ToastRenderInfo, 'container' | 'entries'> & {
  readonly container: SlotAttributes<Message>
  readonly entries: ReadonlyArray<ResolvedToastEntry<Message>>
}

/** Resolves the toast's container and every entry. */
export const resolve = <Input, Message>(
  render: ToastRenderInfo,
  mixins: MixinList<Message>,
  context: ResolveContext<Input, Message>,
): ResolvedToast<Message> => {
  const builders = buildersOf(ToastSlots, mixins, context)
  return {
    id: render.id,
    container: builders.container.attrs(render.container),
    entries: render.entries.map(entry => ({
      id: entry.id,
      attributes: builders.entry.attrs(entry.attributes),
      content: entry.content,
    })),
  }
}

/** The toast's `toView`: `draw` receives its bundles with `mixins` applied. */
export const toView =
  <Message>(
    mixins: MixinList<Message>,
    context: ResolveContext<unknown, Message>,
    draw: (resolved: ResolvedToast<Message>) => Html,
  ) =>
  (render: ToastRenderInfo): Html =>
    draw(resolve(render, mixins, context))

/** What a toast says about itself: its icon, and whether it is announced politely. */
export const Type = Schema.Literals(['default', 'info', 'success', 'warning', 'error', 'loading'])
export type Type = typeof Type.Type

/** Where the stack stands: a corner or the middle of the top or bottom edge. */
export const Position = Schema.Literals([
  'top-start',
  'top-center',
  'top-end',
  'bottom-start',
  'bottom-center',
  'bottom-end',
])
export type Position = typeof Position.Type

/** A button on a toast: its words, and the value `Acted` sends back. */
export const Action = Schema.Struct({ label: Schema.String, value: Schema.String })
export type Action = typeof Action.Type

/**
 * Where a toast's countdown is. Starting and stopping read the clock in a
 * Command, so each waits for it: `Starting` until it is read, `Running`
 * since then.
 */
const Countdown = defineTaggedUnion({
  Stopped: {},
  Starting: {},
  Running: { since: Schema.Number },
})

/** A swipe under way: the axis it took once it moved, and how far, in pixels. */
const Swipe = Schema.Struct({
  axis: Schema.Literals(['none', 'x', 'y']),
  x: Schema.Number,
  y: Schema.Number,
})

export const Entry = Schema.Struct({
  id: Schema.String,
  type: Type,
  title: Schema.String,
  description: Schema.Option(Schema.String),
  action: Schema.Option(Action),
  /** Its whole duration in milliseconds; none while it waits to be dismissed or settled. */
  duration: Schema.Option(Schema.Number),
  /** What is left of it. */
  remaining: Schema.Number,
  countdown: Countdown,
  /** Counts the countdown's starts and stops, so a clock read or a timeout from before does nothing. */
  version: Schema.Number,
  animation: Animation.Model,
  swipe: Schema.Option(Swipe),
  /** It was swiped away, along the axis of its last swipe. */
  swiped: Schema.Boolean,
})
export type Entry = typeof Entry.Type

export const Model = Schema.Struct({
  id: Schema.String,
  position: Position,
  /** The page's direction, so a swipe toward the edge is toward the right one. */
  direction: Schema.Literals(['ltr', 'rtl']),
  /** A toast's duration unless it gives one. */
  duration: Schema.Number,
  /** How many show at once; the rest wait behind them, not counting down. */
  max: Schema.Number,
  /** How far a swipe goes before it dismisses, in pixels. */
  threshold: Schema.Number,
  /** Newest first. */
  entries: Schema.Array(Entry),
  next: Schema.Number,
  /**
   * What holds the stack: the mouse on it, a finger or a pen on it, focus in it, the page
   * hidden. A finger holds the countdown and does not spread the stack: one spread as a tap
   * landed moved what it was tapping on.
   */
  pointer: Schema.Boolean,
  touch: Schema.Boolean,
  focus: Schema.Boolean,
  hidden: Schema.Boolean,
})
export type Model = typeof Model.Type

/** A fact about what holds the stack, from `Hold`. */
const Holder = Schema.Literals(['pointer', 'touch', 'focus', 'hidden'])
const HeldFact = Schema.TaggedStruct('HeldFact', {
  by: Holder,
  on: Schema.Boolean,
})

export const Message = defineMessageUnion({
  /** The close button, or Escape inside the toast. */
  Dismissed: { id: Schema.String },
  PressedAction: { id: Schema.String },
  /** The pointer, focus or the page's being hidden, holding the stack or letting it go. */
  Held: { by: Holder, on: Schema.Boolean },
  StartedClock: { id: Schema.String, version: Schema.Number, at: Schema.Number },
  StoppedClock: { id: Schema.String, version: Schema.Number, elapsed: Schema.Number },
  TimedOut: { id: Schema.String, version: Schema.Number },
  Swiped: { id: Schema.String, fact: Schema.Union([MoveStarted, Moved, MoveEnded]) },
  GotAnimation: { id: Schema.String, message: Animation.Message },
})
export type Message = typeof Message.Type

export const OutMessage = defineMessageUnion({
  /** A toast's action was pressed: the toast and the action's value. The toast leaves. */
  Acted: { id: Schema.String, value: Schema.String },
})
export type OutMessage = typeof OutMessage.Type

export interface InitOptions {
  /** Default `'bottom-end'`. */
  readonly position?: Position | undefined
  /** Default `'ltr'`: a toast at the end swipes away to the right. */
  readonly direction?: 'ltr' | 'rtl' | undefined
  /** A toast's duration in milliseconds unless it gives one. Default 4000, Sonner's. */
  readonly duration?: number | undefined
  /** How many show at once. Default 3. */
  readonly max?: number | undefined
  /** How far a swipe goes before it dismisses, in pixels. Default 45, Sonner's. */
  readonly threshold?: number | undefined
}

/** An empty stack. */
export const init = (id: string, options: InitOptions = {}): Model => ({
  id,
  position: options.position ?? 'bottom-end',
  direction: options.direction ?? 'ltr',
  duration: options.duration ?? 4000,
  max: options.max ?? 3,
  threshold: options.threshold ?? 45,
  entries: [],
  next: 0,
  pointer: false,
  touch: false,
  focus: false,
  hidden: false,
})

/** What a toast says, for `show` and `settle`. */
export interface ToastInput {
  /** Default `'default'`. */
  readonly type?: Type | undefined
  readonly title: string
  readonly description?: string | undefined
  readonly action?: Action | undefined
  /**
   * Milliseconds it shows for, or `'sticky'` to wait for a dismissal. Default
   * the stack's duration, and sticky for a `loading` toast.
   */
  readonly duration?: number | 'sticky' | undefined
}

const StartClock = Command.define('StartToastClock', {
  args: { id: Schema.String, version: Schema.Number },
  messages: [Message.StartedClock],
  execute: ({ id, version }) =>
    Effect.map(Clock.currentTimeMillis, at => Message.StartedClock({ id, version, at })),
})

const StopClock = Command.define('StopToastClock', {
  args: { id: Schema.String, version: Schema.Number, since: Schema.Number },
  messages: [Message.StoppedClock],
  execute: ({ id, version, since }) =>
    Effect.map(Clock.currentTimeMillis, at =>
      Message.StoppedClock({ id, version, elapsed: at - since }),
    ),
})

const Wait = Command.define('WaitForToast', {
  args: { id: Schema.String, version: Schema.Number, milliseconds: Schema.Number },
  messages: [Message.TimedOut],
  execute: ({ id, version, milliseconds }) =>
    Effect.sleep(Duration.millis(milliseconds)).pipe(Effect.as(Message.TimedOut({ id, version }))),
})

type Commands = ReadonlyArray<Command.Command<Message>>
type Return = ReturnWithOutMessage<Model, Message, OutMessage>

const isLeaving = (entry: Entry): boolean =>
  entry.animation.transitionState === 'LeaveStart' ||
  entry.animation.transitionState === 'LeaveAnimating'

const withEntries = (model: Model, entries: ReadonlyArray<Entry>): Model =>
  entries === model.entries ? model : modifyFields(model, { entries: () => entries })

const replaced = (model: Model, next: Entry): Model =>
  withEntries(
    model,
    model.entries.map(entry => (entry.id === next.id ? next : entry)),
  )

const entryOf = (model: Model, id: string): Option.Option<Entry> =>
  Option.fromNullishOr(model.entries.find(entry => entry.id === id))

const ofAnimation = (id: string, commands: ReadonlyArray<Command.Command<Animation.Message>>) =>
  Command.mapMessages(commands, message => Message.GotAnimation({ id, message }))

/** The ones counting down: shown among the first `max`, with a duration, while nothing holds the stack. */
const counting = (model: Model): ReadonlySet<string> => {
  if (model.pointer || model.touch || model.focus || model.hidden) return new Set()
  const shown = model.entries.filter(entry => !isLeaving(entry)).slice(0, model.max)
  return new Set(shown.filter(entry => Option.isSome(entry.duration)).map(entry => entry.id))
}

/**
 * Every countdown started or stopped to agree with `counting`; the same
 * Model when each already does. Run after every change.
 */
const reconciled = (result: Return): Return => {
  const counts = counting(result.model)
  const steps = result.model.entries.map((entry): { entry: Entry; commands: Commands } => {
    const should = counts.has(entry.id)
    const version = entry.version + 1
    return Countdown.match(entry.countdown, {
      Stopped: () =>
        should
          ? {
              entry: modifyFields(entry, {
                countdown: () => Countdown.Starting(),
                version: () => version,
              }),
              commands: [StartClock({ id: entry.id, version })],
            }
          : { entry, commands: [] },
      Starting: () =>
        should
          ? { entry, commands: [] }
          : {
              entry: modifyFields(entry, {
                countdown: () => Countdown.Stopped(),
                version: () => version,
              }),
              commands: [],
            },
      Running: ({ since }) =>
        should
          ? { entry, commands: [] }
          : {
              entry: modifyFields(entry, {
                countdown: () => Countdown.Stopped(),
                version: () => version,
              }),
              commands: [StopClock({ id: entry.id, version, since })],
            },
    })
  })
  const changed = steps.some((step, index) => step.entry !== result.model.entries[index])
  return changed
    ? {
        ...result,
        model: withEntries(
          result.model,
          steps.map(step => step.entry),
        ),
        commands: [...(result.commands ?? []), ...steps.flatMap(step => step.commands)],
      }
    : result
}

/** A toast leaving: its animation hidden, its countdown stopped by the reconcile after. */
const leave = (model: Model, entry: Entry, swiped = false): Return => {
  if (isLeaving(entry)) return { model }
  const result = Animation.hide(entry.animation)
  return {
    model: replaced(
      model,
      modifyFields(entry, { animation: () => result.model, swiped: () => swiped }),
    ),
    commands: ofAnimation(entry.id, result.commands ?? []),
  }
}

const durationOf = (model: Model, input: ToastInput): Option.Option<number> => {
  const duration = input.duration ?? (input.type === 'loading' ? 'sticky' : model.duration)
  return duration === 'sticky' ? Option.none() : Option.some(duration)
}

/** A new toast in front of the stack, and its id, for `settle` and `dismiss`. */
export const show = (model: Model, input: ToastInput): Return & { readonly id: string } => {
  const id = `${model.id}-${model.next}`
  const shown = Animation.show(Animation.init({ id, isShowing: false }))
  const duration = durationOf(model, input)
  const entry: Entry = {
    id,
    type: input.type ?? 'default',
    title: input.title,
    description: Option.fromNullishOr(input.description),
    action: Option.fromNullishOr(input.action),
    duration,
    remaining: Option.getOrElse(duration, () => 0),
    countdown: Countdown.Stopped(),
    version: 0,
    animation: shown.model,
    swipe: Option.none(),
    swiped: false,
  }
  const result = reconciled({
    model: modifyFields(model, {
      entries: entries => [entry, ...entries],
      next: next => next + 1,
    }),
    commands: ofAnimation(id, shown.commands ?? []),
  })
  return { ...result, id }
}

/**
 * The toast `id` says something else and counts down afresh: a loading
 * toast's outcome. A toast already gone, or leaving, is left as it is.
 */
export const settle = (model: Model, id: string, input: ToastInput): Return =>
  Option.match(
    Option.filter(entryOf(model, id), entry => !isLeaving(entry)),
    {
      onNone: () => ({ model }),
      onSome: entry => {
        const duration = durationOf(model, input)
        return reconciled({
          model: replaced(
            model,
            modifyFields(entry, {
              type: () => input.type ?? 'default',
              title: () => input.title,
              description: () => Option.fromNullishOr(input.description),
              action: () => Option.fromNullishOr(input.action),
              duration: () => duration,
              remaining: () => Option.getOrElse(duration, () => 0),
              // A running countdown is for what it said before.
              countdown: () => Countdown.Stopped(),
              version: version => version + 1,
            }),
          ),
        })
      },
    },
  )

/** The toast `id` leaving. */
export const dismiss = (model: Model, id: string): Return =>
  Option.match(entryOf(model, id), {
    onNone: () => ({ model }),
    onSome: entry => reconciled(leave(model, entry)),
  })

/** How far a swipe goes the wrong way, as a share of the pointer's travel: it gives, a little. */
const RESISTANCE = 0.2
/** How far the pointer moves before a swipe takes an axis. */
const SLOP = 4

/** Which way along each axis is toward the stack's edge: 1, -1, or 0 for either way. */
const towardEdge = (model: Model): { readonly x: number; readonly y: number } => {
  const end = model.direction === 'rtl' ? -1 : 1
  const x = Match.value(model.position).pipe(
    Match.whenOr('top-end', 'bottom-end', () => end),
    Match.whenOr('top-start', 'bottom-start', () => -end),
    Match.whenOr('top-center', 'bottom-center', () => 0),
    Match.exhaustive,
  )
  return { x, y: model.position.startsWith('bottom') ? 1 : -1 }
}

/** The axis a swipe takes: none until it has moved, then the one it moved further along. */
const axisOf = (
  swipe: typeof Swipe.Type,
  deltaX: number,
  deltaY: number,
): (typeof Swipe.Type)['axis'] => {
  if (swipe.axis !== 'none' || Math.max(Math.abs(deltaX), Math.abs(deltaY)) < SLOP)
    return swipe.axis
  return Math.abs(deltaX) > Math.abs(deltaY) ? 'x' : 'y'
}

/** A pointer's travel along an axis, allowed toward the edge and resisted away from it. */
const allowed = (travel: number, toward: number): number =>
  toward === 0 || Math.sign(travel) === toward ? travel : travel * RESISTANCE

const swiped = (model: Model, entry: Entry, fact: (typeof Message.Swiped.Type)['fact']): Return =>
  Match.valueTags(fact, {
    MoveStarted: () => ({
      model: replaced(
        model,
        modifyFields(entry, { swipe: () => Option.some({ axis: 'none' as const, x: 0, y: 0 }) }),
      ),
    }),
    Moved: ({ deltaX, deltaY }) =>
      Option.match(entry.swipe, {
        onNone: () => ({ model }),
        onSome: swipe => {
          const toward = towardEdge(model)
          const axis = axisOf(swipe, deltaX, deltaY)
          const next = {
            axis,
            x: axis === 'x' ? allowed(deltaX, toward.x) : 0,
            y: axis === 'y' ? allowed(deltaY, toward.y) : 0,
          }
          return {
            model: replaced(model, modifyFields(entry, { swipe: () => Option.some(next) })),
          }
        },
      }),
    MoveEnded: ({ completed }) =>
      Option.match(entry.swipe, {
        onNone: () => ({ model }),
        onSome: swipe => {
          const toward = towardEdge(model)
          const far = (travel: number, edge: number) =>
            Math.abs(travel) >= model.threshold && (edge === 0 || Math.sign(travel) === edge)
          const away =
            completed &&
            ((swipe.axis === 'x' && far(swipe.x, toward.x)) ||
              (swipe.axis === 'y' && far(swipe.y, toward.y)))
          // Swiped away, the toast keeps its last offset, which its exit carries on.
          return away
            ? leave(model, entry, true)
            : { model: replaced(model, modifyFields(entry, { swipe: () => Option.none() })) }
        },
      }),
  })

/** The stack after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return =>
  reconciled(
    Message.match(message, {
      Dismissed: ({ id }) =>
        Option.match(entryOf(model, id), {
          onNone: () => ({ model }),
          onSome: entry => leave(model, entry),
        }),
      PressedAction: ({ id }) =>
        Option.match(
          Option.flatMap(entryOf(model, id), entry =>
            Option.map(entry.action, action => ({ entry, action })),
          ),
          {
            onNone: () => ({ model }),
            onSome: ({ entry, action }) => ({
              ...leave(model, entry),
              outMessage: OutMessage.Acted({ id, value: action.value }),
            }),
          },
        ),
      Held: ({ by, on }) =>
        model[by] === on
          ? { model }
          : {
              model: Match.value(by).pipe(
                Match.when('pointer', () => modifyFields(model, { pointer: () => on })),
                Match.when('touch', () => modifyFields(model, { touch: () => on })),
                Match.when('focus', () => modifyFields(model, { focus: () => on })),
                Match.when('hidden', () => modifyFields(model, { hidden: () => on })),
                Match.exhaustive,
              ),
            },
      StartedClock: ({ id, version, at }) =>
        Option.match(
          Option.filter(
            entryOf(model, id),
            entry => entry.version === version && Countdown.guards.Starting(entry.countdown),
          ),
          {
            onNone: () => ({ model }),
            onSome: entry => ({
              model: replaced(
                model,
                modifyFields(entry, { countdown: () => Countdown.Running({ since: at }) }),
              ),
              commands: [Wait({ id, version, milliseconds: entry.remaining })],
            }),
          },
        ),
      StoppedClock: ({ id, version, elapsed }) =>
        Option.match(
          Option.filter(entryOf(model, id), entry => entry.version === version),
          {
            onNone: () => ({ model }),
            onSome: entry => ({
              model: replaced(
                model,
                modifyFields(entry, {
                  remaining: remaining => Math.max(0, remaining - elapsed),
                }),
              ),
            }),
          },
        ),
      TimedOut: ({ id, version }) =>
        Option.match(
          Option.filter(
            entryOf(model, id),
            entry => entry.version === version && Countdown.guards.Running(entry.countdown),
          ),
          {
            onNone: () => ({ model }),
            onSome: entry => leave(model, entry),
          },
        ),
      Swiped: ({ id, fact }) =>
        Option.match(
          Option.filter(entryOf(model, id), entry => !isLeaving(entry)),
          {
            onNone: () => ({ model }),
            onSome: entry => swiped(model, entry, fact),
          },
        ),
      GotAnimation: ({ id, message }) =>
        Option.match(entryOf(model, id), {
          onNone: () => ({ model }),
          onSome: entry => {
            const result = Animation.update(entry.animation, message)
            const commands = ofAnimation(id, result.commands ?? [])
            const next =
              result.model === entry.animation
                ? model
                : replaced(model, modifyFields(entry, { animation: () => result.model }))
            return Option.match(Option.fromNullishOr(result.outMessage), {
              onNone: () => ({ model: next, commands }),
              onSome: out =>
                Animation.OutMessage.match(out, {
                  StartedLeaveAnimating: () => ({
                    model: next,
                    commands: [
                      ...commands,
                      ...ofAnimation(id, [Animation.defaultLeaveCommand(result.model)]),
                    ],
                  }),
                  TransitionedOut: () => ({
                    model: withEntries(
                      next,
                      next.entries.filter(each => each.id !== id),
                    ),
                    commands,
                  }),
                }),
            })
          },
        }),
    }),
  )

/** How soon after a finger's press a focus coming into the stack is that press's own. */
const TAP_FOCUS_MS = 1000

/**
 * What holds the stack, as a Mount on its container: the mouse, or a finger or a pen,
 * entering and leaving it, focus coming into it (not a tap's) and going out of it, and the
 * page hidden and shown. Opened on a hidden page, it says so at once.
 */
export const Hold = Mount.defineStream('ToastHold', {
  messages: [HeldFact],
  execute: ({ element }) =>
    Stream.callback<typeof HeldFact.Type>(queue =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const owner = element.ownerDocument
          const offer = (by: (typeof HeldFact.Type)['by'], on: boolean) =>
            Queue.offerUnsafe(queue, HeldFact.make({ by, on }))
          const pointer = (event: globalThis.Event) =>
            event instanceof PointerEvent && event.pointerType !== 'mouse' ? 'touch' : 'pointer'
          // When a finger last pressed in it: the focus a tap gives a button (Android does) is
          // the tap's, and spreading the stack then moved the button from under the finger.
          let touchedAt = Number.NEGATIVE_INFINITY
          const listeners: ReadonlyArray<
            readonly [EventTarget, string, (event: globalThis.Event) => void]
          > = [
            [
              element,
              'pointerdown',
              event => {
                if (pointer(event) === 'touch') touchedAt = event.timeStamp
              },
            ],
            [element, 'pointerenter', event => offer(pointer(event), true)],
            [element, 'pointerleave', event => offer(pointer(event), false)],
            [
              element,
              'focusin',
              event => {
                if (event.timeStamp - touchedAt > TAP_FOCUS_MS) offer('focus', true)
              },
            ],
            [
              element,
              'focusout',
              event => {
                // Focus moving between two of its toasts stays in it.
                const to = event instanceof FocusEvent ? event.relatedTarget : null
                if (!(to instanceof Node && element.contains(to))) offer('focus', false)
              },
            ],
            [owner, 'visibilitychange', () => offer('hidden', owner.visibilityState === 'hidden')],
          ]
          for (const [target, type, listener] of listeners) target.addEventListener(type, listener)
          if (owner.visibilityState === 'hidden') offer('hidden', true)
          return listeners
        }),
        listeners =>
          Effect.sync(() => {
            for (const [target, type, listener] of listeners)
              target.removeEventListener(type, listener)
          }),
      ),
    ),
})

/**
 * The stack's heights, as a Mount on its list: each toast gets
 * `--fk-toast-offset`, the heights of the toasts in front of it, and the
 * list `--fk-toast-front` and `--fk-toast-total`, the front toast's height
 * and all of theirs, for a recipe to stack and spread them. A toast is
 * measured at the height of what it holds, which a collapsed one is
 * clipped to the front's. It measures again as toasts come, go and change
 * size or words.
 */
export const Stack = Mount.defineStream('ToastStack', {
  messages: [Schema.Never],
  execute: ({ element }) =>
    Stream.callback<never>(() =>
      Effect.acquireRelease(
        Effect.sync(() => {
          const view = element.ownerDocument.defaultView
          const list = view !== null && element instanceof view.HTMLElement ? element : null
          const itemsOf = () =>
            [...element.children].filter(
              (child): child is HTMLElement => view !== null && child instanceof view.HTMLElement,
            )
          const natural = (item: HTMLElement) =>
            item.scrollHeight + (item.offsetHeight - item.clientHeight)
          const measure = () => {
            const items = itemsOf()
            let offset = 0
            for (const item of items) {
              item.style.setProperty('--fk-toast-offset', `${offset}px`)
              if (!item.hasAttribute('data-waiting') && !item.hasAttribute('data-leave'))
                offset += natural(item)
            }
            const front = items.find(item => !item.hasAttribute('data-leave'))
            list?.style.setProperty(
              '--fk-toast-front',
              `${front === undefined ? 0 : natural(front)}px`,
            )
            list?.style.setProperty('--fk-toast-total', `${offset}px`)
          }
          // Both made before either observes: a constructor that throws leaves nothing attached.
          const sizes = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure)
          const changes = new MutationObserver(() => {
            for (const item of itemsOf()) sizes?.observe(item)
            measure()
          })
          changes.observe(element, {
            childList: true,
            subtree: true,
            characterData: true,
            attributeFilter: ['data-leave', 'data-waiting'],
          })
          for (const item of itemsOf()) sizes?.observe(item)
          measure()
          return { sizes, changes }
        }),
        ({ sizes, changes }) =>
          Effect.sync(() => {
            changes.disconnect()
            sizes?.disconnect()
          }),
      ),
    ),
})

/** Off the screen and in the accessibility tree: what the live regions hold is heard, not seen. */
const unseen = {
  position: 'absolute',
  inlineSize: '1px',
  blockSize: '1px',
  margin: '-1px',
  padding: '0',
  overflow: 'hidden',
  clipPath: 'inset(50%)',
  whiteSpace: 'nowrap',
  border: '0',
}

export interface ToastViewOptions<ParentMessage> {
  readonly model: Model
  readonly onMessage: (message: Message) => NoInfer<ParentMessage>
  /** The stack's landmark name. Default "Notifications". */
  readonly label?: string | undefined
  /** The close button's name. Default "Dismiss". */
  readonly closeLabel?: string | undefined
  /** Spread out whether or not anything holds the stack, as Sonner's `expand`. */
  readonly expand?: boolean | undefined
  /** A drawing for a type's icon in place of the recipe's, such as a Spinner for `loading`. */
  readonly icons?: Partial<Record<Type, Html>> | undefined
  /** A style of `ToastSlots` (`Recipes.Toast`). */
  readonly style?: NamedStyle<typeof ToastSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<ParentMessage> | undefined
}

/** What a toast says, read aloud: its title and its description. */
const spoken = (entry: Entry): string =>
  Option.match(entry.description, {
    onNone: () => entry.title,
    onSome: description => `${entry.title}. ${description}`,
  })

export const view = <ParentMessage>(
  options: ToastViewOptions<ParentMessage>,
  h: HtmlBuilder<ParentMessage>,
): Html => {
  const builders = SlotView.buildersFor(
    ToastSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model, onMessage } = options
  const staying = model.entries.filter(entry => !isLeaving(entry))
  const shown = new Set(staying.slice(0, model.max).map(entry => entry.id))
  const expanded = options.expand === true || model.pointer || model.focus
  const newest = (polite: boolean) =>
    Option.match(Option.fromNullishOr(staying.find(entry => (entry.type !== 'error') === polite)), {
      onNone: () => [],
      onSome: entry => [spoken(entry)],
    })
  const toast = (entry: Entry, index: number) => {
    const swipe = Option.getOrElse(entry.swipe, () => ({ axis: 'none' as const, x: 0, y: 0 }))
    const waiting = !isLeaving(entry) && !shown.has(entry.id)
    const icon = options.icons?.[entry.type]
    return h.keyed('li')(
      entry.id,
      builders.entry.attrs([
        h.Id(entry.id),
        h.DataAttribute('type', entry.type),
        h.Style({
          '--fk-toast-index': String(index),
          '--fk-toast-swipe-x': `${swipe.x}px`,
          '--fk-toast-swipe-y': `${swipe.y}px`,
        }),
        ...(Option.isSome(entry.swipe) ? [h.DataAttribute('swiping', '')] : []),
        ...(entry.swiped ? [h.DataAttribute('swiped', swipe.axis)] : []),
        // Behind the ones shown, waiting its turn: neither seen nor reached.
        ...(waiting ? [h.DataAttribute('waiting', ''), h.Inert(true)] : []),
        ...Match.value(entry.animation.transitionState).pipe(
          Match.when('EnterStart', () => [
            h.DataAttribute('closed', ''),
            h.DataAttribute('enter', ''),
          ]),
          Match.when('EnterAnimating', () => [h.DataAttribute('enter', '')]),
          Match.when('LeaveStart', () => [h.DataAttribute('leave', '')]),
          Match.when('LeaveAnimating', () => [
            h.DataAttribute('closed', ''),
            h.DataAttribute('leave', ''),
          ]),
          Match.orElse(() => []),
        ),
        h.OnKeyDownPreventDefault(key =>
          key === 'Escape'
            ? Option.some(onMessage(Message.Dismissed({ id: entry.id })))
            : Option.none(),
        ),
      ]),
      [
        ...(entry.type === 'default' && icon === undefined
          ? []
          : [
              h.span(
                builders.icon.attrs([h.AriaHidden(true), h.DataAttribute('type', entry.type)]),
                icon === undefined ? [] : [icon],
              ),
            ]),
        h.div(
          builders.body.attrs([
            h.OnMount(
              Mount.mapMessage(Move(), fact => onMessage(Message.Swiped({ id: entry.id, fact }))),
            ),
          ]),
          [
            h.div(builders.title.attrs(), [entry.title]),
            ...Option.match(entry.description, {
              onNone: () => [],
              onSome: description => [h.div(builders.description.attrs(), [description])],
            }),
          ],
        ),
        ...Option.match(entry.action, {
          onNone: () => [],
          onSome: action => [
            h.button(
              builders.action.attrs([
                h.Type('button'),
                h.OnClick(onMessage(Message.PressedAction({ id: entry.id }))),
              ]),
              [action.label],
            ),
          ],
        }),
        h.button(
          builders.close.attrs([
            h.Type('button'),
            h.AriaLabel(options.closeLabel ?? 'Dismiss'),
            h.OnClick(onMessage(Message.Dismissed({ id: entry.id }))),
          ]),
          [],
        ),
      ],
    )
  }
  return h.section(
    builders.container.attrs([
      h.Id(model.id),
      h.Role('region'),
      h.AriaLabel(options.label ?? 'Notifications'),
      h.DataAttribute('position', model.position),
      h.Dir(model.direction),
      ...(expanded ? [h.DataAttribute('expanded', '')] : []),
      h.OnMount(Mount.mapMessage(Hold(), ({ by, on }) => onMessage(Message.Held({ by, on })))),
    ]),
    [
      h.ol(
        builders.list.attrs([
          // Where the recipe stacks the toasts; a fork's, outside it, flow.
          h.DataAttribute('stack', ''),
          h.Style({ '--fk-toast-count': String(Math.min(staying.length, model.max)) }),
          h.OnMount(Stack()),
        ]),
        model.entries.map(toast),
      ),
      // Always drawn, so the regions are in the page before what they announce.
      h.div(builders.status.attrs([h.Role('status'), h.Style(unseen)]), newest(true)),
      h.div(builders.alert.attrs([h.Role('alert'), h.Style(unseen)]), newest(false)),
    ],
  )
}
