import { Clock, Duration, Effect, Option, Schema } from 'effect'
import { Attr, Capability, Event, Slot, Slots, SlotView, type NamedStyle } from 'foldkit-mixins'
import * as Command from 'foldkit/command'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { defineMessageUnion } from 'foldkit/message'
import { modifyFields } from 'foldkit/struct'
import type { Return } from 'foldkit/update'
import type { MixinList } from './resolve.js'

/**
 * A timer after Zag's: a countdown from a `duration`, or a stopwatch counting
 * up (to a `duration` if it has one), with start, pause, resume, reset and
 * restart. The display is `role="timer"`, its `item`s the hours, minutes and
 * seconds (or the `units` asked for), each in a Slot of its own.
 *
 * ```text
 * button -> Pressed -> Stamp (reads the clock) -> Acted -> elapsed, since
 *                            Tick (waits, reads the clock) -> Ticked -> elapsed
 * ```
 *
 * The time counted is this Model, which the application keeps and folds with
 * `update`; nothing ticks outside it. A press reads the clock in a Command
 * before it acts, and each tick is a Command that waits for the display's
 * next change and reads the clock again, so the time counted is the clock's,
 * however late a tick lands, and a pause keeps every millisecond. The clock
 * is Effect's, so a test drives a whole run with TestClock. Each start
 * counts a new `turn`, and a tick of an older one is dropped.
 *
 * The root carries `data-state` (`idle`, `running`, `paused`, `done`) and,
 * with a `duration`, `--fk-timer-progress`: 0 to 1 of it counted.
 */
export const TimerSlots = Slots.define({
  root: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  label: Slot.make({ capability: Capability.Container }),
  /** The display, `role="timer"`. */
  area: Slot.make({ capability: Capability.Container, attributes: [Attr.Role] }),
  /** One unit of the time; `data-unit` names it. */
  item: Slot.make({ capability: Capability.Container }),
  separator: Slot.make({ capability: Capability.Container }),
  controls: Slot.make({ capability: Capability.Container }),
  /** A press that starts, pauses, resumes, resets or restarts; `data-action` names it. */
  action: Slot.make({
    capability: Capability.Interactive,
    events: [Event.Click],
    attributes: [Attr.AriaDisabled],
  }),
})

export const Action = Schema.Literals(['start', 'pause', 'resume', 'reset', 'restart'])
export type Action = typeof Action.Type

export const Model = Schema.Struct({
  /** Prefixes every id the timer draws; unique on the page. */
  id: Schema.String,
  /** Counts down from `duration` rather than up from 0. */
  countdown: Schema.Boolean,
  /** Milliseconds a countdown starts from, or a stopwatch stops at; a stopwatch may have none. */
  duration: Schema.OptionFromNullOr(Schema.Number),
  /** Milliseconds between the display's changes: 1000 for seconds, 10 for hundredths. */
  interval: Schema.Number,
  /** Milliseconds counted up to `since`. */
  elapsed: Schema.Number,
  /** The clock's time the count runs from while running; none while it stands. */
  since: Schema.OptionFromNullOr(Schema.Number),
  /** Counts the starts; a tick answers only to the latest. */
  turn: Schema.Number,
})
export type Model = typeof Model.Type

const positive = (name: string, value: number) => {
  if (!(value > 0 && Number.isFinite(value)))
    throw new Error(`Timer.init: ${name} must be positive and finite, got ${value}`)
  return value
}

/** A countdown from `duration` milliseconds, or a stopwatch (to `duration`, if given). */
export const init = (
  options: { readonly id: string; readonly interval?: number | undefined } & (
    | { readonly countdown: true; readonly duration: number }
    | { readonly countdown?: false | undefined; readonly duration?: number | undefined }
  ),
): Model => ({
  id: options.id,
  countdown: options.countdown === true,
  duration: Option.map(Option.fromNullishOr(options.duration), ms => positive('duration', ms)),
  interval: positive('interval', options.interval ?? 1000),
  elapsed: 0,
  since: Option.none(),
  turn: 0,
})

export const Message = defineMessageUnion({
  /** A control was pressed; `update` reads the clock before it acts. */
  Pressed: { action: Action },
  /** The clock's time of a press, which `update` acts on. */
  Acted: { action: Action, at: Schema.Number },
  /** A tick of `turn` landed at the clock's `at`. */
  Ticked: { turn: Schema.Number, at: Schema.Number },
})
export type Message = typeof Message.Type

export const Phase = Schema.Literals(['idle', 'running', 'paused', 'done'])
export type Phase = typeof Phase.Type

const reached = (model: Model, elapsed: number) =>
  Option.match(model.duration, { onNone: () => false, onSome: limit => elapsed >= limit })

/** Where the timer is: never started (or reset), counting, held, or at its `duration`. */
export const phase = (model: Model): Phase => {
  if (Option.isSome(model.since)) return 'running'
  if (reached(model, model.elapsed)) return 'done'
  return model.elapsed === 0 ? 'idle' : 'paused'
}

/** The milliseconds the display shows: those left of a countdown, those counted of a stopwatch. */
export const shown = (model: Model): number =>
  model.countdown
    ? Math.max(0, Option.getOrElse(model.duration, () => 0) - model.elapsed)
    : model.elapsed

/** Reads the clock for a press, so the time counted is the clock's from the moment it acts. */
export const Stamp = Command.define('Timer.Stamp', {
  args: { action: Action },
  messages: [Message.Acted],
  execute: ({ action }) =>
    Clock.currentTimeMillis.pipe(Effect.map(at => Message.Acted({ action, at }))),
})

/** Waits `milliseconds`, then says the clock's time for `turn`. */
export const Tick = Command.define('Timer.Tick', {
  args: { turn: Schema.Number, milliseconds: Schema.Number },
  messages: [Message.Ticked],
  execute: ({ turn, milliseconds }) =>
    Effect.sleep(Duration.millis(milliseconds)).pipe(
      Effect.andThen(Clock.currentTimeMillis),
      Effect.map(at => Message.Ticked({ turn, at })),
    ),
})

/**
 * The wait until the display next changes: the next whole `interval` of the
 * time shown (a countdown's left, so its seconds turn as a second runs out),
 * and never past the `duration`.
 */
const untilChange = (model: Model): number => {
  const left = Option.getOrElse(model.duration, () => Infinity) - model.elapsed
  const into = model.countdown ? left % model.interval : model.elapsed % model.interval
  const step = model.countdown ? into || model.interval : model.interval - into
  return Math.max(1, Math.min(step, left))
}

/** The count running from `at` as a new turn, its first tick waited for. */
const runFrom = (model: Model, at: number, elapsed: number): Return<Model, Message> => {
  const turn = model.turn + 1
  const next = modifyFields(model, {
    elapsed: () => elapsed,
    since: () => Option.some(at),
    turn: () => turn,
  })
  return { model: next, commands: [Tick({ turn, milliseconds: untilChange(next) })] }
}

/** The time counted to `at`, held at the `duration`. */
const countedTo = (model: Model, since: number, at: number) => {
  const elapsed = model.elapsed + Math.max(0, at - since)
  return Option.match(model.duration, {
    onNone: () => elapsed,
    onSome: limit => Math.min(elapsed, limit),
  })
}

/** The count standing at `elapsed`; a new turn, so no tick still waiting acts. */
const standing = (model: Model, elapsed: number): Model =>
  modifyFields(model, {
    elapsed: () => elapsed,
    since: () => Option.none(),
    turn: () => model.turn + 1,
  })

const acted = (model: Model, action: Action, at: number): Return<Model, Message> => {
  const now = phase(model)
  switch (action) {
    case 'start':
      return now === 'idle' ? runFrom(model, at, 0) : { model }
    case 'resume':
      return now === 'paused' ? runFrom(model, at, model.elapsed) : { model }
    case 'restart':
      return runFrom(model, at, 0)
    case 'pause':
      return Option.match(model.since, {
        onNone: () => ({ model }),
        onSome: since => ({ model: standing(model, countedTo(model, since, at)) }),
      })
    case 'reset':
      return now === 'idle' ? { model } : { model: standing(model, 0) }
  }
}

/** The timer after `message`; the same Model when nothing changes. */
export const update = (model: Model, message: Message): Return<Model, Message> =>
  Message.match(message, {
    Pressed: ({ action }) => ({ model, commands: [Stamp({ action })] }),
    Acted: ({ action, at }) => acted(model, action, at),
    Ticked: ({ turn, at }) =>
      turn !== model.turn
        ? { model }
        : Option.match(model.since, {
            onNone: () => ({ model }),
            onSome: since => {
              const elapsed = countedTo(model, since, at)
              return reached(model, elapsed)
                ? { model: standing(model, elapsed) }
                : runFrom(model, at, elapsed)
            },
          }),
  })

// ---------------------------------------------------------------- the time in parts

export const Unit = Schema.Literals(['days', 'hours', 'minutes', 'seconds', 'milliseconds'])
export type Unit = typeof Unit.Type

const order: ReadonlyArray<Unit> = ['days', 'hours', 'minutes', 'seconds', 'milliseconds']
const lengthOf: Record<Unit, number> = {
  days: 86_400_000,
  hours: 3_600_000,
  minutes: 60_000,
  seconds: 1000,
  milliseconds: 1,
}

export interface TimePart {
  readonly unit: Unit
  readonly value: number
  /** The value as the display writes it: two digits, three for milliseconds. */
  readonly text: string
}

/**
 * `milliseconds` in `units`, largest first: the largest holds what a larger
 * unit left out would (90 minutes with no hours), and the smallest is rounded
 * up when `up` (a countdown shows 1 second until the last one has run out).
 */
export const partsOf = (
  milliseconds: number,
  units: ReadonlyArray<Unit>,
  up = false,
): ReadonlyArray<TimePart> => {
  const shownUnits = order.filter(unit => units.includes(unit))
  const smallest = lengthOf[shownUnits[shownUnits.length - 1] ?? 'milliseconds']
  let left = (up ? Math.ceil : Math.floor)(Math.max(0, milliseconds) / smallest) * smallest
  return shownUnits.map(unit => {
    const value = Math.floor(left / lengthOf[unit])
    left -= value * lengthOf[unit]
    return { unit, value, text: String(value).padStart(unit === 'milliseconds' ? 3 : 2, '0') }
  })
}

// ---------------------------------------------------------------- the view

/** The words a timer's presses say; each has an English default. */
export interface TimerLabels {
  readonly start: string
  readonly pause: string
  readonly resume: string
  readonly reset: string
  readonly restart: string
}

const defaultLabels: TimerLabels = {
  start: 'Start',
  pause: 'Pause',
  resume: 'Resume',
  reset: 'Reset',
  restart: 'Restart',
}

export interface TimerView<Message> {
  readonly model: Model
  /** Lifts the timer's own Messages into the application's. */
  readonly onMessage: (message: typeof Message.Type) => NoInfer<Message>
  /** What is timed, shown and naming the timer. */
  readonly label: string
  /** The units shown, in any order; default hours, minutes and seconds. */
  readonly units?: ReadonlyArray<Unit> | undefined
  /** Drawn between units; default `:`. */
  readonly separator?: string | undefined
  /** Draws the presses; default true. Without them, the application sends `Pressed` itself. */
  readonly controls?: boolean | undefined
  readonly labels?: Partial<TimerLabels> | undefined
  /** A style of `TimerSlots`, for the look. */
  readonly style?: NamedStyle<typeof TimerSlots> | undefined
  /** Mixins beside the style. */
  readonly mixins?: MixinList<Message> | undefined
}

/** The press beside reset, by phase: what the timer does next. */
const primaryOf: Record<Phase, Action> = {
  idle: 'start',
  running: 'pause',
  paused: 'resume',
  done: 'restart',
}

export const view = <Outer>(options: TimerView<Outer>, h: HtmlBuilder<Outer>): Html => {
  const builders = SlotView.buildersFor(
    TimerSlots,
    [...(options.style === undefined ? [] : [options.style.mixin]), ...(options.mixins ?? [])],
    { input: undefined, h },
  )
  const { model, onMessage: lift } = options
  const now = phase(model)
  const labels = { ...defaultLabels, ...options.labels }
  const labelId = `${model.id}-label`
  const parts = partsOf(
    shown(model),
    options.units ?? ['hours', 'minutes', 'seconds'],
    model.countdown,
  )
  const separator = options.separator ?? ':'
  const progress = Option.map(model.duration, limit => String(Math.min(1, model.elapsed / limit)))

  const press = (action: Action, enabled: boolean) =>
    h.button(
      builders.action.attrs([
        // One element for the primary press whatever it says, so the focus stays on it.
        h.Key(action === 'reset' ? 'reset' : 'primary'),
        h.Type('button'),
        h.DataAttribute('action', action),
        // Not `disabled`, which would drop the focus of the press that just reset it.
        ...(enabled ? [h.OnClick(lift(Message.Pressed({ action })))] : [h.AriaDisabled(true)]),
      ]),
      [labels[action]],
    )

  return h.div(
    builders.root.attrs([
      h.Role('group'),
      h.AriaLabelledBy(labelId),
      h.DataAttribute('state', now),
      ...Option.match(progress, {
        onNone: () => [],
        onSome: share => [h.Style({ '--fk-timer-progress': share })],
      }),
    ]),
    [
      h.span(builders.label.attrs([h.Id(labelId)]), [options.label]),
      h.div(
        builders.area.attrs([h.Role('timer'), h.AriaLabelledBy(labelId)]),
        parts.flatMap((part, place) => [
          ...(place === 0
            ? []
            : [h.span(builders.separator.attrs([h.Key(`${part.unit}-separator`)]), [separator])]),
          h.span(builders.item.attrs([h.Key(part.unit), h.DataAttribute('unit', part.unit)]), [
            part.text,
          ]),
        ]),
      ),
      ...(options.controls === false
        ? []
        : [
            h.div(builders.controls.attrs(), [
              press(primaryOf[now], true),
              press('reset', now !== 'idle'),
            ]),
          ]),
    ],
  )
}
