/**
 * The Sheet's Model: where a release comes to rest (`settle`), what a drag
 * does to the Model, a press on the handle stepping through the points, the
 * points `init` refuses, and the damping past fully open. And two facts of
 * its recipe's CSS a browser cannot show as plainly.
 */
import { Option } from 'effect'
import { Style } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import { DialogSlots } from '../src/dialog.js'
import { Sheet as SheetRecipe } from '../src/recipes/sheet.js'
import * as Sheet from '../src/sheet.js'
import * as Animation from '@foldkit/ui/animation'
import * as UiDialog from '@foldkit/ui/dialog'

const css = Style.forSlots(DialogSlots)(SheetRecipe({})).css

describe('settle', () => {
  const size = 400
  it.each([
    // One point: a slow drag under a quarter comes back, past it goes away.
    { points: [1], at: 0, delta: 90, velocity: 0, dismissible: true, rests: Option.some(0) },
    { points: [1], at: 0, delta: 110, velocity: 0, dismissible: true, rests: Option.none() },
    // A flick goes away however short; up, it stays.
    { points: [1], at: 0, delta: 10, velocity: 0.5, dismissible: true, rests: Option.none() },
    { points: [1], at: 0, delta: -10, velocity: -0.5, dismissible: true, rests: Option.some(0) },
    // Not dismissible: back to the lowest whatever the drag.
    { points: [1], at: 0, delta: 300, velocity: 1, dismissible: false, rests: Option.some(0) },
    { points: [1], at: 0, delta: 300, velocity: 0, dismissible: false, rests: Option.some(0) },
    // Two points: a flick down from the top rests at the lower, not away.
    { points: [0.5, 1], at: 1, delta: 20, velocity: 0.5, dismissible: true, rests: Option.some(0) },
    // A flick up from the lower goes to the top.
    {
      points: [0.5, 1],
      at: 0,
      delta: -20,
      velocity: -0.5,
      dismissible: true,
      rests: Option.some(1),
    },
    // Slow: the nearest point, from the top 120px down (nearer 200 than 0).
    { points: [0.5, 1], at: 1, delta: 120, velocity: 0, dismissible: true, rests: Option.some(0) },
    { points: [0.5, 1], at: 1, delta: 80, velocity: 0, dismissible: true, rests: Option.some(1) },
    // From the lower, a quarter of what shows (50px of 200) takes it away.
    { points: [0.5, 1], at: 0, delta: 49, velocity: 0, dismissible: true, rests: Option.some(0) },
    { points: [0.5, 1], at: 0, delta: 50, velocity: 0, dismissible: true, rests: Option.none() },
    // A flick down past the lower point goes away.
    { points: [0.5, 1], at: 1, delta: 260, velocity: 0.5, dismissible: true, rests: Option.none() },
    // Its own thresholds: 0.5 px/ms is no flick to a sheet that asks 1, and
    // half of what shows is what a share of 0.5 takes it away by.
    {
      points: [0.5, 1],
      at: 1,
      delta: 80,
      velocity: 0.5,
      dismissible: true,
      flickSpeed: 1,
      rests: Option.some(1),
    },
    {
      points: [0.5, 1],
      at: 0,
      delta: 50,
      velocity: 0,
      dismissible: true,
      closeShare: 0.5,
      rests: Option.some(0),
    },
  ])(
    '$points at $at, $delta px at $velocity px/ms (dismissible $dismissible)',
    ({ rests, ...release }) => {
      expect(
        Sheet.settle({
          flickSpeed: Sheet.FLICK_SPEED,
          closeShare: Sheet.CLOSE_SHARE,
          ...release,
          size,
        }),
      ).toEqual(rests)
    },
  )
})

describe('init', () => {
  it('takes its swipe, from the panel by default', () => {
    const sheet = Sheet.init({ id: 's', swipe: { flickSpeed: 1, closeShare: 0.5 } })
    expect([sheet.swipeFrom, sheet.flickSpeed, sheet.closeShare]).toEqual(['panel', 1, 0.5])
    expect(Sheet.init({ id: 's', swipe: { from: 'handle' } }).swipeFrom).toBe('handle')
  })

  it.each([{ flickSpeed: 0 }, { flickSpeed: Number.NaN }, { closeShare: 0 }, { closeShare: 1.5 }])(
    'refuses a swipe of %o',
    swipe => {
      expect(() => Sheet.init({ id: 's', swipe })).toThrow(/swipe\./)
    },
  )
})

const opened = () => Sheet.open(Sheet.init({ id: 's', points: [0.5, 1] })).model
const grabbed = () => Sheet.update(opened(), Sheet.Message.Grabbed({ size: 400 })).model

describe('update', () => {
  it('opens at its opening point', () => {
    const model = Sheet.init({ id: 's', points: [0.25, 0.5, 1], opensAt: 2 })
    expect(Sheet.open(model).model.at).toBe(2)
    expect(Sheet.isOpen(Sheet.open(model).model)).toBe(true)
  })

  it('opens again at its opening point, wherever it last rested', () => {
    const stepped = Sheet.update(
      grabbed(),
      Sheet.Message.Released({ delta: 0, velocity: 0, completed: true }),
    ).model
    expect(stepped.at).toBe(1)
    expect(Sheet.open(Sheet.close(stepped).model).model.at).toBe(0)
  })

  it('a drag records the panel’s size and follows the delta; the same delta is a no-op', () => {
    const model = Sheet.update(grabbed(), Sheet.Message.Dragged({ delta: 30 })).model
    expect(model.drag).toEqual(Option.some({ size: 400, delta: 30 }))
    expect(Sheet.update(model, Sheet.Message.Dragged({ delta: 30 })).model).toBe(model)
  })

  it('a move with no drag running changes nothing', () => {
    const model = opened()
    expect(Sheet.update(model, Sheet.Message.Dragged({ delta: 30 })).model).toBe(model)
    expect(
      Sheet.update(model, Sheet.Message.Released({ delta: 0, velocity: 0, completed: true })).model,
    ).toBe(model)
  })

  it('a press that barely moves steps to the next point, round to the first', () => {
    const press = Sheet.Message.Released({ delta: 2, velocity: 0, completed: true })
    const up = Sheet.update(grabbed(), press).model
    expect([up.at, Option.isNone(up.drag)]).toEqual([1, true])
    const round = Sheet.update(Sheet.update(up, Sheet.Message.Grabbed({ size: 400 })).model, press)
    expect(round.model.at).toBe(0)
  })

  it('a cancelled drag comes back to where it rested', () => {
    const model = Sheet.update(grabbed(), Sheet.Message.Dragged({ delta: 300 })).model
    const next = Sheet.update(
      model,
      Sheet.Message.Released({ delta: 300, velocity: 2, completed: false }),
    )
    expect([next.model.at, Option.isNone(next.model.drag), Sheet.isOpen(next.model)]).toEqual([
      0,
      true,
      true,
    ])
  })

  it('a release that goes away closes the Dialog and says so', () => {
    const next = Sheet.update(
      grabbed(),
      Sheet.Message.Released({ delta: 300, velocity: 1, completed: true }),
    )
    expect(Sheet.isOpen(next.model)).toBe(false)
    expect(next.outMessage?._tag).toBe('Closed')
  })

  // A finger that grabs the panel as it slides in meets the Dialog's own Messages, an
  // animation ending among them: the drag was dropped, and the Swipe, still holding the
  // pointer, took no new press until it was let go.
  it('a drag outlives a Dialog Message that leaves it open, and not its closing', () => {
    const before = grabbed()
    const painted = UiDialog.Message.GotAnimationMessage({
      message: Animation.Message.CompletedWaitForPaint({
        generation: before.dialog.animation.transitionGeneration,
      }),
    })
    const kept = Sheet.update(before, Sheet.Message.GotDialog({ message: painted })).model
    // The Dialog moved on, open: what the drag must outlive.
    expect(kept.dialog).not.toBe(before.dialog)
    expect(Option.isSome(kept.drag)).toBe(true)
    const closed = Sheet.update(
      kept,
      Sheet.Message.GotDialog({ message: UiDialog.Message.RequestedClose() }),
    ).model
    expect([Sheet.isOpen(closed), Option.isNone(closed.drag)]).toEqual([false, true])
  })
})

describe('init', () => {
  it.each([
    { points: [] },
    { points: [1, 0.5] },
    { points: [0, 1] },
    { points: [0.5, 1.2] },
    { points: [0.5, 1], opensAt: 2 },
  ])('refuses $points opening at $opensAt', config => {
    expect(() => Sheet.init({ id: 's', ...config })).toThrow(/Sheet s/)
  })
})

describe('dragged', () => {
  it('draws a drag as it is, and damps one past fully open', () => {
    const model = Sheet.init({ id: 's' })
    expect(Sheet.dragged(model, { size: 400, delta: 30 })).toBe(30)
    expect(Sheet.dragged(model, { size: 400, delta: -100 })).toBeCloseTo(-8 * (Math.log(101) - 2))
    // A little past is no move at all.
    expect(Sheet.dragged(model, { size: 400, delta: -5 })).toBeCloseTo(0)
  })
})

describe('the recipe', () => {
  it('writes no shorthand that the sorted rule would put after its longhands', () => {
    expect(css).not.toMatch(/@layer variants\{[^}]*(border-width|border-radius):/)
  })

  it('slides on the Dialog transition, which the travel knob stills', () => {
    expect(css).toContain('calc(var(--fk-motion-slow) * var(--fk-knob-travel))')
  })
})
