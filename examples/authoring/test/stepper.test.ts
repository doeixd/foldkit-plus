/**
 * What the stepper's `update` decides: a step moves the value by the stride of
 * its count, the value stays inside its bounds, and a step that reaches a
 * bound tells its placement to stop.
 */
import { Repeat } from 'foldkit-primitives/interaction'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import {
  FAST_STRIDE,
  Less,
  MAX,
  MIN,
  More,
  START,
  initial,
  strideOf,
  update,
  type Model,
} from '../src/stepper/app.js'
import { NumberStepper } from '../src/stepper/view.js'

const press = (model: Model, placement: typeof More | typeof Less): ReturnType<typeof update> =>
  update(
    model,
    placement.wrapper.make(
      Repeat.Message.PointerDown({ pointerId: 1, button: 0, pointerType: 'mouse' }),
    ),
  )

const elapse = (model: Model, placement: typeof More | typeof Less) => {
  const held = placement === More ? model.more : model.less
  return update(
    model,
    placement.wrapper.make(Repeat.Message.Elapsed({ generation: held.generation })),
  )
}

const names = (step: ReturnType<typeof update>): ReadonlyArray<string> =>
  (step.commands ?? []).map(command => command.name)

describe('the stepper', () => {
  it('steps by one at first and by a stride once the hold has run on', () => {
    expect([1, 5, 6, 40].map(strideOf)).toEqual([1, 1, FAST_STRIDE, FAST_STRIDE])
    let { model } = press(initial().model, More)
    expect(model.value).toBe(START + 1)
    // Steps 2 to 5 move one each, step 6 the stride.
    for (let count = 2; count <= 5; count += 1) model = elapse(model, More).model
    expect(model.value).toBe(START + 5)
    model = elapse(model, More).model
    expect(model.value).toBe(START + 5 + FAST_STRIDE)
  })

  it('keeps the value inside its bounds, and tells the placement to stop on reaching one', () => {
    const nearMax = { ...initial().model, value: MAX - 2 }
    let step = press(nearMax, More)
    expect(step.model.value).toBe(MAX - 1)
    expect(names(step)).not.toContain('StopRepeat')
    step = elapse(step.model, More)
    expect(step.model.value).toBe(MAX)
    expect(names(step)).toContain('StopRepeat')

    const nearMin = { ...initial().model, value: MIN + 1 }
    step = press(nearMin, Less)
    expect(step.model.value).toBe(MIN)
    expect(names(step)).toContain('StopRepeat')
  })

  it('does not step past a bound with a stride that overshoots it', () => {
    let { model } = press({ ...initial().model, value: MAX - 3 }, More)
    for (let count = 2; count <= 6; count += 1) model = elapse(model, More).model
    expect(model.value).toBe(MAX)
  })

  it('stops a hold that has reached the bound, so its later steps move nothing', () => {
    const atMax = press({ ...initial().model, value: MAX - 1 }, More)
    const stopped = update(atMax.model, More.wrapper.make(Repeat.Message.Stopped()))
    expect(stopped.model.more.stopped).toBe(true)
    // `Stopped` is the placement's own Message: the value is not the placement's to change.
    expect(stopped.model.value).toBe(MAX)
    expect(elapse(stopped.model, More).model).toBe(stopped.model)
  })

  it('a button holds only its own press', () => {
    const { model } = press(initial().model, More)
    expect(model.more.holding).toBe(true)
    expect(model.less.holding).toBe(false)
  })

  it('draws the value, and the bound a button cannot pass as aria-disabled', () => {
    const at = (value: number) => Inert.draw(NumberStepper, { ...initial().model, value })
    const disabled = (value: number) =>
      Inert.byTag(at(value), 'button').map(button => Inert.value(button, 'aria-disabled'))
    expect(Inert.text(at(START))).toContain(String(START))
    expect(disabled(START)).toEqual(['false', 'false'])
    expect(disabled(MIN)).toEqual(['true', 'false'])
    expect(disabled(MAX)).toEqual(['false', 'true'])
    // Disabled while held, a button would not hear its own release.
    const held = press({ ...initial().model, value: MAX - 1 }, More).model
    expect(
      Inert.value(Inert.byTag(Inert.draw(NumberStepper, held), 'button')[1], 'aria-disabled'),
    ).toBe('false')
  })
})
