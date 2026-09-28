// @vitest-environment jsdom
/**
 * The game in the real runtime, with the stylesheet installed as `entry.ts`
 * installs it. A lazy row memoizes only under a runtime frame, so this is
 * where "a tick redraws only the rows it changed" can be checked: a
 * dynamic Mixin on the cell Slot counts the cells actually drawn.
 */
import { Runtime } from 'foldkit'
import type { HtmlBuilder } from 'foldkit/html'
import { Mixin, SlotView, Style } from 'foldkit-mixins'
import { afterEach, expect, test, vi } from 'vitest'

import { GAME } from '../src/constants.js'
import { Snake } from '../src/domain/index.js'
import { Board, Message, Model, update, view } from '../src/main.js'
import { stylesheet } from '../src/style.js'

afterEach(() => {
  vi.unstubAllGlobals()
  document.head.replaceChildren()
  document.body.replaceChildren()
})

/** Installs the stylesheet and the container, as `index.html` and `entry.ts` do. */
const start = (): HTMLElement => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
  Style.install(stylesheet)
  const container = document.createElement('div')
  container.id = 'root'
  document.body.append(container)
  return container
}

// No random apple and no clock: each tick comes from a click, so what is
// drawn between two renders is known.
const initial: Model = {
  snake: Snake.create({ x: 10, y: 10 }),
  apple: { x: 15, y: 15 },
  direction: 'Right',
  nextDirection: 'Right',
  gameState: 'Playing',
  points: 0,
  highScore: 0,
}

const click = (id: string): void => {
  const button = document.getElementById(id)
  if (button === null) throw new Error(`no #${id}`)
  button.click()
}

const cellsOf = (): ReadonlyArray<string | null> =>
  Array.from(document.querySelectorAll('[data-cell]'), cell => cell.getAttribute('data-cell'))

test('a tick redraws only the rows it changed', async () => {
  const container = start()
  let drawnCells = 0
  // A cell drawn inside a row passes no item; the memo's own comparison does.
  const counting = Mixin.dynamic('CountDrawnCells', {
    cell: ({ item }) => {
      if (item === undefined) drawnCells++
      return {}
    },
  })
  const CountedBoard = Board.pipe(SlotView.attach(counting))
  const countedView = (model: Model, h: HtmlBuilder<Message>) => ({
    title: '',
    body: h.div(
      [],
      [
        CountedBoard(model, h),
        h.button([h.Id('tick'), h.OnClick(Message.TickedClock())], ['Tick']),
        h.button(
          [
            h.Id('apple'),
            h.OnClick(Message.CompletedGenerateApplePosition({ position: { x: 5, y: 5 } })),
          ],
          ['Move the apple'],
        ),
      ],
    ),
  })
  Runtime.run(
    Runtime.makeApplication({
      Model,
      init: () => ({ model: initial }),
      update,
      view: countedView,
      container,
    }),
  )

  await vi.waitFor(() => expect(cellsOf()).toHaveLength(GAME.GRID_SIZE * GAME.GRID_SIZE))
  expect(drawnCells).toBe(GAME.GRID_SIZE * GAME.GRID_SIZE)

  // The first change after mounting draws every row again: each row's memo
  // learns only on its first draw which Slots it uses.
  click('tick')
  await vi.waitFor(() => expect(cellsOf()[10 * GAME.GRID_SIZE + 11]).toBe('Head'))

  // The snake moves along row 10: that row alone is drawn again.
  drawnCells = 0
  click('tick')
  await vi.waitFor(() => expect(cellsOf()[10 * GAME.GRID_SIZE + 12]).toBe('Head'))
  expect(drawnCells).toBe(GAME.GRID_SIZE)

  // The apple moves from row 15 to row 5: both rows are drawn again.
  drawnCells = 0
  click('apple')
  await vi.waitFor(() => expect(cellsOf()[5 * GAME.GRID_SIZE + 5]).toBe('Apple'))
  expect(drawnCells).toBe(2 * GAME.GRID_SIZE)
})

test('the application draws the page with the CSS of every class on it', async () => {
  const container = start()
  Runtime.run(
    Runtime.makeApplication({
      Model,
      init: () => ({ model: initial }),
      update,
      view,
      container,
    }),
  )

  await vi.waitFor(() => expect(document.title).toBe('Snake | 0 pts'))
  expect(document.querySelector('h1')?.textContent).toBe('Snake Game')

  const css = Array.from(document.querySelectorAll('style'))
    .map(style => style.textContent)
    .join('')
  const drawn = Array.from(document.querySelectorAll('[class]')).flatMap(element =>
    Array.from(element.classList),
  )
  expect(drawn.length).toBeGreaterThan(0)
  expect(drawn.filter(className => !css.includes(`.${className}`))).toEqual([])
})
