/**
 * SwipeActions: what a release means (a share of the actions, a flick, a full
 * swipe), in both reading directions, and the keys that do the same without a
 * pointer: an arrow opens, the opposite arrow or Escape closes, and a press
 * that would change nothing is left to the page.
 */
import { Option, Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Behaviors } from 'foldkit-mixins'
import { Bundle } from 'foldkit-bundle'
import { describe, expect, it } from 'vitest'
import { SwipeActions } from '../src/interaction/index.js'

const args: SwipeActions.Args = { fullSwipe: 0.6, flick: 0.3, full: true }
const closed: SwipeActions.Model = { open: Option.none() }
const openOn = (side: SwipeActions.Side): SwipeActions.Model => ({ open: Option.some(side) })
const release = (overrides: Partial<SwipeActions.Release>): SwipeActions.Release => ({
  deltaX: 0,
  velocityX: 0,
  rowWidth: 300,
  startWidth: 80,
  endWidth: 80,
  rtl: false,
  ...overrides,
})
const decide = (model: SwipeActions.Model, overrides: Partial<SwipeActions.Release>) =>
  SwipeActions.decide(model, release(overrides), args)
const open = (side: SwipeActions.Side) => ({ _tag: 'Open', side })

describe('SwipeActions.decide', () => {
  it.each([
    ['past half of the actions opens the side the row moved toward', 50, 0, open('start')],
    ['short of half closes', 30, 0, { _tag: 'Close' }],
    ['the other direction opens the other side', -50, 0, open('end')],
    ['a flick opens even a short pull', 10, 0.5, open('start')],
    ['a flick the other way closes even a long pull', 70, -0.5, { _tag: 'Close' }],
    ['a long swipe runs the first action', 200, 0, { _tag: 'Full', side: 'start' }],
    ['no movement closes', 0, 0, { _tag: 'Close' }],
  ])('%s', (_name, deltaX, velocityX, expected) => {
    expect(decide(closed, { deltaX, velocityX })).toEqual(expected)
  })

  it('a side with no actions never opens, and a long swipe there runs nothing', () => {
    expect(decide(closed, { deltaX: 90, startWidth: 0 })).toEqual({ _tag: 'Close' })
    expect(decide(closed, { deltaX: 250, startWidth: 0 })).toEqual({ _tag: 'Close' })
  })

  it('without full swipe a long swipe only opens', () => {
    expect(SwipeActions.decide(closed, release({ deltaX: 250 }), { ...args, full: false })).toEqual(
      open('start'),
    )
  })

  it('an open row is measured from where it rests', () => {
    // Open on start (80px), pulled back 50px: 30px shown, less than half, so it closes.
    expect(decide(openOn('start'), { deltaX: -50 })).toEqual({ _tag: 'Close' })
    expect(decide(openOn('start'), { deltaX: -20 })).toEqual(open('start'))
    // Pulling the other way through the middle opens the other side.
    expect(decide(openOn('start'), { deltaX: -130 })).toEqual(open('end'))
  })

  it('right to left swaps which way each side opens', () => {
    expect(decide(closed, { deltaX: -50, rtl: true })).toEqual(open('start'))
    expect(decide(closed, { deltaX: 50, rtl: true })).toEqual(open('end'))
    expect(decide(closed, { deltaX: 0.5, velocityX: -0.5, rtl: true })).toEqual({ _tag: 'Close' })
  })
})

describe('SwipeActions placement', () => {
  const Swipe = Bundle.declare(SwipeActions.bundle, 'swipe')
  const Model = Schema.Struct({ ...Swipe.fields, ran: Schema.Array(SwipeActions.FullSwiped) })
  type Model = typeof Model.Type
  const Message = defineMessageUnion({ ...Swipe.cases })
  const placed = Bundle.parent({ Model, Message }).at(Swipe, {
    args,
    onOut: out => (model: Model) => ({ model: { ...model, ran: [...model.ran, out] } }),
  })
  const fresh: Model = { swipe: closed, ran: [] }
  const send = (model: Model, message: SwipeActions.Message) =>
    Option.getOrThrow(placed.update(model, Swipe.wrapper.make(message))).model
  const M = SwipeActions.Message

  it('opens, closes, and does nothing twice', () => {
    const opened = send(fresh, M.Opened({ side: 'start' }))
    expect(opened.swipe).toEqual(openOn('start'))
    expect(send(opened, M.Opened({ side: 'start' })).swipe).toBe(opened.swipe)
    expect(send(opened, M.Closed()).swipe).toEqual(closed)
    expect(send(fresh, M.Closed())).toBe(fresh)
  })

  it('a release decides, and a full swipe closes the row and reports its side', () => {
    expect(send(fresh, M.Released(release({ deltaX: 60 }))).swipe).toEqual(openOn('start'))
    const full = send(fresh, M.Released(release({ deltaX: -250 })))
    expect(full.swipe).toEqual(closed)
    expect(full.ran).toEqual([SwipeActions.FullSwiped.make({ side: 'end' })])
  })

  it('a release that changes nothing returns the Model it was given', () => {
    expect(send(fresh, M.Released(release({ deltaX: 10 })))).toBe(fresh)
  })
})

describe('SwipeActions.keys', () => {
  type Input = { readonly open: Option.Option<SwipeActions.Side> }
  const route = (rtl: boolean) =>
    SwipeActions.keys<Input, string>({
      open: input => input.open,
      rtl,
      toMessage: message => message._tag,
    })
  const press = (rtl: boolean, key: string, openSide: Option.Option<SwipeActions.Side>) =>
    Behaviors.Keys.answer([route(rtl)])({
      key,
      modifiers: { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false },
      input: { open: openSide },
    })

  it('the arrow toward the end opens the start side, and the other the end side', () => {
    expect(press(false, 'ArrowRight', Option.none())).toEqual(Option.some('Opened'))
    expect(press(false, 'ArrowLeft', Option.none())).toEqual(Option.some('Opened'))
  })

  it('the opened side is the one the arrow reveals, in each reading direction', () => {
    const answered = (rtl: boolean, key: string) =>
      SwipeActions.keys<Input, SwipeActions.Message>({
        open: () => Option.none(),
        rtl,
        toMessage: message => message,
      }).handle({
        key,
        modifiers: { shiftKey: false, ctrlKey: false, altKey: false, metaKey: false },
        input: { open: Option.none() },
      })
    expect(answered(false, 'ArrowRight')).toEqual(
      Option.some(SwipeActions.Message.Opened({ side: 'start' })),
    )
    expect(answered(false, 'ArrowLeft')).toEqual(
      Option.some(SwipeActions.Message.Opened({ side: 'end' })),
    )
    expect(answered(true, 'ArrowRight')).toEqual(
      Option.some(SwipeActions.Message.Opened({ side: 'end' })),
    )
    expect(answered(true, 'ArrowLeft')).toEqual(
      Option.some(SwipeActions.Message.Opened({ side: 'start' })),
    )
  })

  it('the opposite arrow closes an open side, and the same arrow is left alone', () => {
    expect(press(false, 'ArrowLeft', Option.some('start'))).toEqual(Option.some('Closed'))
    expect(press(false, 'ArrowRight', Option.some('start'))).toEqual(Option.none())
    expect(press(false, 'ArrowRight', Option.some('end'))).toEqual(Option.some('Closed'))
  })

  it('Escape closes an open row, and reaches the page on a closed one', () => {
    expect(press(false, 'Escape', Option.some('end'))).toEqual(Option.some('Closed'))
    expect(press(false, 'Escape', Option.none())).toEqual(Option.none())
  })
})
