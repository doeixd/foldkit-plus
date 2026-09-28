/**
 * What `update` costs on a 16 by 16 canvas: a stroke, a drag, a fill, undo
 * and redo over a history, and a sequence of strokes. Upstream's
 * `main.bench.ts`, run by `pnpm bench` from the repository root.
 */
import { modifyFields } from 'foldkit/struct'
import { History } from 'foldkit-primitives/state'
import { describe, test } from 'vitest'

import { createEmptyGrid } from '../src/grid.js'
import { Message } from '../src/message.js'
import { initialModel } from '../src/mirror.js'
import type { Model } from '../src/model.js'
import { update } from '../src/update.js'

const GRID_SIZE = 16

const startModel: Model = modifyFields(initialModel, {
  history: () => History.start(createEmptyGrid(GRID_SIZE)),
  gridSize: () => GRID_SIZE,
})

const dispatch = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce<Model>((currentModel, message) => update(currentModel, message).model, model)

const buildHistoryModel = (steps: number): Model => {
  let model = startModel
  for (let i = 0; i < steps; i++) {
    const x = i % GRID_SIZE
    const y = Math.floor(i / GRID_SIZE) % GRID_SIZE
    model = dispatch(model, Message.PressedCell({ x, y }), Message.ReleasedMouse())
  }
  return model
}

// Vitest 5 hands `bench` to a test as a context fixture; this keeps each case one line.
const benchmark = (name: string, run: () => unknown) =>
  test(name, async ({ bench }) => {
    await bench(name, run).run()
  })

describe('update: single operations', () => {
  benchmark('brush stroke (press + release)', () =>
    dispatch(startModel, Message.PressedCell({ x: 5, y: 5 }), Message.ReleasedMouse()),
  )

  benchmark('brush drag (5 cells)', () =>
    dispatch(
      startModel,
      Message.PressedCell({ x: 0, y: 0 }),
      Message.EnteredCell({ x: 1, y: 0 }),
      Message.EnteredCell({ x: 2, y: 0 }),
      Message.EnteredCell({ x: 3, y: 0 }),
      Message.EnteredCell({ x: 4, y: 0 }),
      Message.ReleasedMouse(),
    ),
  )

  benchmark('flood fill (empty grid)', () =>
    dispatch(modifyFields(startModel, { tool: () => 'Fill' }), Message.PressedCell({ x: 0, y: 0 })),
  )
})

describe('update: undo/redo with history', () => {
  const modelWith10Steps = buildHistoryModel(10)
  const modelWith30Steps = buildHistoryModel(30)

  benchmark('undo (10 history entries)', () => dispatch(modelWith10Steps, Message.ClickedUndo()))

  benchmark('undo (30 history entries)', () => dispatch(modelWith30Steps, Message.ClickedUndo()))

  benchmark('5x undo then 5x redo', () => {
    let model = modelWith10Steps
    for (let i = 0; i < 5; i++) {
      model = update(model, Message.ClickedUndo()).model
    }
    for (let i = 0; i < 5; i++) {
      model = update(model, Message.ClickedRedo()).model
    }
  })
})

describe('update: paint sequence (16x16 grid)', () => {
  benchmark('paint 50 random cells', () => {
    let model = startModel
    for (let i = 0; i < 50; i++) {
      const x = (i * 7 + 3) % GRID_SIZE
      const y = (i * 11 + 5) % GRID_SIZE
      model = dispatch(model, Message.PressedCell({ x, y }), Message.ReleasedMouse())
    }
  })

  benchmark('paint 50 cells with mirror mode', () => {
    let model: Model = modifyFields(startModel, { mirrorMode: () => 'Both' })
    for (let i = 0; i < 50; i++) {
      const x = (i * 7 + 3) % GRID_SIZE
      const y = (i * 11 + 5) % GRID_SIZE
      model = dispatch(model, Message.PressedCell({ x, y }), Message.ReleasedMouse())
    }
  })
})
