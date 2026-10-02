/**
 * The undo history, as `foldkit-primitives`' `History` keeps it: a stroke is
 * one step, and a thumbnail jumps several steps at once.
 */
import { Option } from 'effect'
import { click, expect as expectView, given as givenView, role, scene } from 'foldkit/scene'
import { given, message, model, story } from 'foldkit/story'
import { describe, expect, test } from 'vitest'

import { MAX_HISTORY } from '../src/constant.js'
import { Message } from '../src/message.js'
import type { Model } from '../src/model.js'
import { update } from '../src/update.js'
import { view } from '../src/view/index.js'
import { pageInput } from '../src/view/view.js'
import { emptyModel } from './fixtures.js'

/** The Messages of a stroke painting cell (x, 0) alone. */
const strokeAt = (x: number): ReadonlyArray<Message> => [
  Message.PressedCell({ x, y: 0 }),
  Message.ReleasedMouse(),
]

/** Cell (x, 0) painted in a stroke of its own, as story steps. */
const stroke = (x: number) => strokeAt(x).map(next => message(next))

/** Which of the first row's cells are painted. */
const paintedRow = (current: Model): ReadonlyArray<boolean> =>
  (current.history.present[0] ?? []).map(Option.isSome)

describe('the history', () => {
  test('a stroke pressed without the last one released is a step of its own', () => {
    story(
      update,
      given(emptyModel),
      message(Message.PressedCell({ x: 0, y: 0 })),
      message(Message.EnteredCell({ x: 1, y: 0 })),
      // The release happened outside the window, so none arrived.
      message(Message.PressedCell({ x: 2, y: 0 })),
      message(Message.EnteredCell({ x: 3, y: 0 })),
      message(Message.ReleasedMouse()),
      message(Message.ClickedUndo()),
      model(current => {
        expect(paintedRow(current)).toEqual([true, true, false, false])
        expect(current.history.past).toHaveLength(1)
      }),
    )
  })

  test('an undo mid-stroke makes the cells painted after it a step of their own', () => {
    story(
      update,
      given(emptyModel),
      message(Message.PressedCell({ x: 0, y: 0 })),
      message(Message.ClickedUndo()),
      message(Message.EnteredCell({ x: 1, y: 0 })),
      model(current => {
        expect(paintedRow(current)).toEqual([false, true, false, false])
        expect(current.history.future).toEqual([])
      }),
      message(Message.ClickedUndo()),
      model(current => {
        expect(paintedRow(current)).toEqual([false, false, false, false])
      }),
    )
  })

  test('keeps the latest steps, as many as MAX_HISTORY', () => {
    const steps = Array.from({ length: MAX_HISTORY + 5 }, (_, index) => stroke(index % 4)).flat()
    story(
      update,
      given(emptyModel),
      ...steps,
      model(current => {
        expect(current.history.past).toHaveLength(MAX_HISTORY)
      }),
    )
  })

  test.each([
    {
      entry: 'Back 1',
      step: Message.ClickedHistoryStep({ stepIndex: 2 }),
      row: [true, true, false, false],
    },
    {
      entry: 'Back 3',
      step: Message.ClickedHistoryStep({ stepIndex: 0 }),
      row: [false, false, false, false],
    },
  ])('$entry undoes back to that step', ({ step, row }) => {
    story(
      update,
      given(emptyModel),
      ...stroke(0),
      ...stroke(1),
      ...stroke(2),
      message(step),
      model(current => {
        expect(paintedRow(current)).toEqual(row)
      }),
      // Every step undone is one redo away, in order.
      message(Message.ClickedRedoStep({ stepIndex: 0 })),
      model(current => {
        expect(paintedRow(current).filter(Boolean)).toHaveLength(row.filter(Boolean).length + 1)
      }),
    )
  })

  test.each([
    { entry: 'Forward 1', stepIndex: 0, row: [true, false, false, false] },
    { entry: 'Forward 3', stepIndex: 2, row: [true, true, true, false] },
  ])('$entry redoes up to that step', ({ stepIndex, row }) => {
    story(
      update,
      given(emptyModel),
      ...stroke(0),
      ...stroke(1),
      ...stroke(2),
      message(Message.ClickedHistoryStep({ stepIndex: 0 })),
      message(Message.ClickedRedoStep({ stepIndex })),
      model(current => {
        expect(paintedRow(current)).toEqual(row)
      }),
    )
  })

  // One stroke painted: one step to undo, none to redo.
  const painted = [Message.PressedCell({ x: 0, y: 0 }), Message.ReleasedMouse()].reduce(
    (current, next) => update(current, next).model,
    emptyModel,
  )

  test.each([
    ['an undo step past the last', painted, Message.ClickedHistoryStep({ stepIndex: 1 })],
    ['an undo step before the first', painted, Message.ClickedHistoryStep({ stepIndex: -1 })],
    ['a redo step', painted, Message.ClickedRedoStep({ stepIndex: 0 })],
    ['Undo', emptyModel, Message.ClickedUndo()],
    ['Redo', painted, Message.ClickedRedo()],
  ])('%s that is not there changes nothing', (_, current, step) => {
    expect(update(current, step).model).toBe(current)
  })
})

describe('the page', () => {
  test('a stroke keeps every value the history panel reads, so the panel is not drawn per cell', () => {
    const pressed = update(emptyModel, Message.PressedCell({ x: 0, y: 0 })).model
    const dragged = update(pressed, Message.EnteredCell({ x: 1, y: 0 })).model
    const [before, after] = [pageInput(pressed), pageInput(dragged)]

    expect(dragged.history.present).not.toBe(pressed.history.present)
    for (const read of ['past', 'future', 'shownGrid', 'gridSize', 'theme'] as const) {
      expect(after[read]).toBe(before[read])
    }
  })
})

describe('the history panel', () => {
  // Four strokes, two of them undone: Forward 2, Forward 1, Current, Back 1, Back 2.
  const midway = [
    ...[0, 1, 2, 3].flatMap(strokeAt),
    Message.ClickedUndo(),
    Message.ClickedUndo(),
  ].reduce<Model>((current, next) => update(current, next).model, emptyModel)

  test.each([
    { entry: 'Back 2', reached: 'Forward 4' },
    { entry: 'Forward 2', reached: 'Back 4' },
  ])('clicking $entry jumps to that step, leaving $reached', ({ entry, reached }) => {
    scene(
      { update, view },
      givenView(midway),
      click(role('button', { name: entry })),
      expectView(role('button', { name: reached })).toExist(),
    )
  })
})
