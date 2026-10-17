/**
 * The timer as a Model, as a run on TestClock, and as markup. The Model: a
 * press reads the clock before it acts, each act allowed only from its
 * phase, a pause keeps the time to the millisecond, a tick of an older turn
 * dropped, and the count held at its duration. The run: a countdown driven
 * by its own Commands on Effect's clock, ticking as each second runs out and
 * done at its end. The markup: a group around `role="timer"`, a Slot per
 * unit, and the press that goes on beside reset.
 */
import { Effect, Fiber, Option } from 'effect'
import { TestClock } from 'effect/testing'
import { describe, expect, it } from 'vitest'
import { A11y, Attr, Capability, Event, SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Theme } from 'foldkit-mixins/theme'
import * as Timer from '../src/timer.js'
import { TimerSlots } from '../src/timer.js'
import { Timer as Recipe } from '../src/recipes/timer.js'
import { message, type TestMessage } from './fixture.js'

/** The pattern `patterns.ts` takes for the timer: a named group, a timer, and its presses. */
const pattern = A11y.pattern({
  root: { capability: Capability.Container, attributes: [Attr.Role] },
  label: { capability: Capability.Container },
  area: { capability: Capability.Container, attributes: [Attr.Role] },
  action: { capability: Capability.Interactive, events: [Event.Click], optional: true },
})

const { Message } = Timer
const countdown = Timer.init({ id: 'tea', countdown: true, duration: 180_000 })
const stopwatch = Timer.init({ id: 'lap', interval: 10 })

const step = (model: Timer.Model, sent: Timer.Message) => Timer.update(model, sent).model
const acted = (model: Timer.Model, action: Timer.Action, at: number) =>
  step(model, Message.Acted({ action, at }))
/** The Tick a Return asks for, as its args. */
const tickOf = (result: ReturnType<typeof Timer.update>) =>
  (result.commands ?? []).map(command => [command.name, command.args])

describe('Timer.update', () => {
  it('reads the clock for a press, and changes nothing until it has', () => {
    const pressed = Timer.update(countdown, Message.Pressed({ action: 'start' }))
    expect(pressed.model).toBe(countdown)
    expect(tickOf(pressed)).toEqual([['Timer.Stamp', { action: 'start' }]])
  })

  it('starts from the clock, its first tick at the next second to run out', () => {
    const started = Timer.update(countdown, Message.Acted({ action: 'start', at: 5000 }))
    expect(Timer.phase(started.model)).toBe('running')
    expect(started.model.since).toEqual(Option.some(5000))
    expect(tickOf(started)).toEqual([['Timer.Tick', { turn: 1, milliseconds: 1000 }]])
  })

  it('counts what the clock says, however late a tick lands, and waits for the next change', () => {
    const running = acted(countdown, 'start', 0)
    const late = Timer.update(running, Message.Ticked({ turn: 1, at: 1300 }))
    expect(late.model.elapsed).toBe(1300)
    // 178.7s left: the display turns when 178s are, 700ms on.
    expect(tickOf(late)).toEqual([['Timer.Tick', { turn: 2, milliseconds: 700 }]])
    const watch = Timer.update(acted(stopwatch, 'start', 0), Message.Ticked({ turn: 1, at: 13 }))
    expect(tickOf(watch)).toEqual([['Timer.Tick', { turn: 2, milliseconds: 7 }]])
  })

  it('keeps every millisecond through a pause, and resumes from it', () => {
    const paused = acted(acted(countdown, 'start', 1000), 'pause', 3456)
    expect([Timer.phase(paused), paused.elapsed, paused.since]).toEqual([
      'paused',
      2456,
      Option.none(),
    ])
    const resumed = acted(paused, 'resume', 10_000)
    expect(step(resumed, Message.Ticked({ turn: resumed.turn, at: 10_544 })).elapsed).toBe(3000)
  })

  it('drops a tick of an older turn, and one that lands while the timer stands', () => {
    const first = acted(countdown, 'start', 0)
    const again = acted(acted(first, 'pause', 500), 'resume', 600)
    expect(step(again, Message.Ticked({ turn: first.turn, at: 1000 }))).toBe(again)
    const paused = acted(first, 'pause', 500)
    expect(step(paused, Message.Ticked({ turn: paused.turn, at: 1000 }))).toBe(paused)
  })

  it('holds the count at its duration and is done, asking for no more ticks', () => {
    const running = acted(countdown, 'start', 0)
    const end = Timer.update(running, Message.Ticked({ turn: running.turn, at: 200_000 }))
    expect([Timer.phase(end.model), end.model.elapsed, Timer.shown(end.model)]).toEqual([
      'done',
      180_000,
      0,
    ])
    expect(end.commands ?? []).toEqual([])
    const target = Timer.init({ id: 'lap', duration: 2000 })
    expect(
      Timer.phase(step(acted(target, 'start', 0), Message.Ticked({ turn: 1, at: 2000 }))),
    ).toBe('done')
  })

  it.each([
    ['start', 'running', 'running'],
    ['start', 'paused', 'paused'],
    ['start', 'done', 'done'],
    ['pause', 'idle', 'idle'],
    ['resume', 'running', 'running'],
    ['resume', 'idle', 'idle'],
    ['reset', 'idle', 'idle'],
  ] as const)('%s from %s keeps the Model', (action, from, phase) => {
    const states = {
      idle: countdown,
      running: acted(countdown, 'start', 0),
      paused: acted(acted(countdown, 'start', 0), 'pause', 100),
      done: step(acted(countdown, 'start', 0), Message.Ticked({ turn: 1, at: 180_000 })),
    }
    const model = states[from]
    expect(Timer.phase(model)).toBe(phase)
    expect(acted(model, action, 999)).toBe(model)
  })

  it('resets to idle from any other phase, and restarts from any', () => {
    const paused = acted(acted(countdown, 'start', 0), 'pause', 100)
    const reset = acted(paused, 'reset', 200)
    expect([Timer.phase(reset), reset.elapsed]).toEqual(['idle', 0])
    const restarted = acted(paused, 'restart', 300)
    expect([Timer.phase(restarted), restarted.elapsed, restarted.since]).toEqual([
      'running',
      0,
      Option.some(300),
    ])
  })

  it('refuses a duration or interval that cannot count', () => {
    expect(() => Timer.init({ id: 'x', countdown: true, duration: 0 })).toThrow(/duration/)
    expect(() => Timer.init({ id: 'x', interval: Number.NaN })).toThrow(/interval/)
  })
})

/** Folds `model` through its Commands on TestClock, `clock` milliseconds on, a millisecond a step. */
const runFor = (from: Timer.Model, sent: Timer.Message, clock: number) =>
  Effect.runPromise(
    Effect.gen(function* () {
      let model = from
      const seen: Array<string> = []
      let pending: Array<Fiber.Fiber<Timer.Message>> = []
      const apply = function* (message: Timer.Message) {
        const result = Timer.update(model, message)
        model = result.model
        for (const command of result.commands ?? [])
          pending.push(yield* Effect.forkChild(command.effect))
      }
      yield* apply(sent)
      for (let tick = 0; tick <= clock; tick += 1) {
        yield* Effect.yieldNow
        const done = pending.filter(fiber => fiber.pollUnsafe() !== undefined)
        pending = pending.filter(fiber => !done.includes(fiber))
        for (const fiber of done) {
          const message = yield* Fiber.join(fiber)
          yield* apply(message)
          seen.push(
            Timer.partsOf(Timer.shown(model), ['minutes', 'seconds'], model.countdown)
              .map(part => part.text)
              .join(':'),
          )
        }
        yield* TestClock.adjust('1 millis')
      }
      return { model, seen }
    }).pipe(Effect.provide(TestClock.layer())),
  )

describe('Timer on Effect’s clock', () => {
  it('counts a countdown down a second at a time and is done at its end', async () => {
    const short = Timer.init({ id: 'egg', countdown: true, duration: 3000 })
    const { model, seen } = await runFor(short, Message.Pressed({ action: 'start' }), 4000)
    // The press's stamp, then a tick as each second runs out.
    expect(seen).toEqual(['00:03', '00:02', '00:01', '00:00'])
    expect(Timer.phase(model)).toBe('done')
  })
})

describe('Timer.partsOf', () => {
  it.each([
    [3_723_004, ['hours', 'minutes', 'seconds'], false, '01:02:03'],
    [3_723_004, ['minutes', 'seconds'], false, '62:03'],
    [3_723_004, ['seconds', 'milliseconds'], false, '3723:004'],
    [90_061_000, ['days', 'hours', 'minutes'], false, '01:01:01'],
    [2_001, ['minutes', 'seconds'], true, '00:03'],
    [2_000, ['minutes', 'seconds'], true, '00:02'],
    [-5, ['seconds'], false, '00'],
  ] as const)('writes %s ms in %j (up %s) as %s', (ms, units, up, text) => {
    expect(
      Timer.partsOf(ms, units, up)
        .map(part => part.text)
        .join(':'),
    ).toBe(text)
  })
})

type More = Partial<Timer.TimerView<TestMessage>>
const style = Style.forSlots(TimerSlots)(Recipe({}))
const Shown = SlotView.forMessages<TestMessage>().define(TimerSlots, (more: More, _, h) =>
  Timer.view(
    { model: countdown, label: 'Tea', onMessage: () => message('Clicked'), style, ...more },
    h,
  ),
)
const drawn = (more: More = {}) => Inert.draw(Shown, more)
const pressesOf = (more: More = {}) =>
  Inert.bySlot(drawn(more), 'action').map(press => [
    Inert.value(press, 'data-action'),
    Inert.text(press),
    Inert.value(press, 'aria-disabled'),
  ])

describe('Timer.view', () => {
  it('meets the timer pattern', () => {
    expect(A11y.validate(pattern, TimerSlots)).toEqual([])
  })

  it('is a group around a timer, both named by the label', () => {
    const shown = drawn()
    const [group] = Inert.byRole(shown, 'group')
    const [timer] = Inert.byRole(shown, 'timer')
    const [label] = Inert.bySlot(shown, 'label')
    expect(Inert.value(group, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    expect(Inert.value(timer, 'aria-labelledby')).toBe(Inert.value(label, 'id'))
    expect(Inert.text(timer)).toBe('00:03:00')
    expect(Inert.value(group, 'data-state')).toBe('idle')
  })

  it('shows a countdown’s second until it has run out, and a stopwatch’s once it has', () => {
    const into = (model: Timer.Model) =>
      step(acted(model, 'start', 0), Message.Ticked({ turn: 1, at: 1300 }))
    expect(Inert.text(Inert.byRole(drawn({ model: into(countdown) }), 'timer')[0])).toBe('00:02:59')
    expect(Inert.text(Inert.byRole(drawn({ model: into(stopwatch) }), 'timer')[0])).toBe('00:00:01')
  })

  it('draws a Slot per unit asked for, named, with separators between', () => {
    const shown = drawn({ units: ['seconds', 'minutes'], separator: '.' })
    expect(Inert.bySlot(shown, 'item').map(item => Inert.value(item, 'data-unit'))).toEqual([
      'minutes',
      'seconds',
    ])
    expect(Inert.bySlot(shown, 'separator').map(item => Inert.text(item))).toEqual(['.'])
    expect(Inert.unslotted(shown)).toEqual([])
  })

  it('offers the press that goes on beside reset, reset held while there is nothing to reset', () => {
    expect(pressesOf()).toEqual([
      ['start', 'Start', undefined],
      ['reset', 'Reset', 'true'],
    ])
    expect(pressesOf({ model: acted(countdown, 'start', 0) })).toEqual([
      ['pause', 'Pause', undefined],
      ['reset', 'Reset', undefined],
    ])
    const paused = acted(acted(countdown, 'start', 0), 'pause', 10)
    expect(pressesOf({ model: paused, labels: { resume: 'Go on' } })[0]).toEqual([
      'resume',
      'Go on',
      undefined,
    ])
    const done = step(acted(countdown, 'start', 0), Message.Ticked({ turn: 1, at: 180_000 }))
    expect(pressesOf({ model: done })[0]?.[0]).toBe('restart')
    const [reset] = Inert.bySlot(drawn(), 'action').slice(1)
    expect(reset?.data?.on).toBeUndefined()
    expect(Inert.bySlot(drawn({ controls: false }), 'action')).toEqual([])
  })

  it('sets what is counted of a duration on the root, and none for a stopwatch without one', () => {
    const half = step(acted(countdown, 'start', 0), Message.Ticked({ turn: 1, at: 90_000 }))
    expect(
      Inert.style(Inert.byRole(drawn({ model: half }), 'group')[0])['--fk-timer-progress'],
    ).toBe('0.5')
    expect(
      Inert.style(Inert.byRole(drawn({ model: stopwatch }), 'group')[0])['--fk-timer-progress'],
    ).toBeUndefined()
  })

  it('reads only tokens the theme declares', () => {
    const theme = Theme.compose(
      Theme.tokens,
      Theme.oklch({ accent: { h: 260, c: 0.15, l: '55%' } }),
    )
    const tiled = Style.forSlots(TimerSlots)(Recipe({ look: 'tiles', progress: 'bar' }))
    expect(
      Inert.missingTokens(drawn({ style: tiled }), Style.stylesheet(Theme.root(theme))),
    ).toEqual([])
  })
})
