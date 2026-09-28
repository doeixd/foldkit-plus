// @vitest-environment jsdom
/**
 * The editor on the real runtime, its canvas kept in a store the way
 * `entry.ts` keeps it in localStorage: a reload is a second runtime reading
 * the same store. A lazy row memoizes only under a runtime frame, so this is
 * also where "a stroke redraws only the rows it paints" can be checked.
 */
import { KeyValueStore } from 'effect/unstable/persistence'
import type { HtmlBuilder } from 'foldkit/html'
import * as Runtime from 'foldkit/runtime'
import { Mixin, SlotView } from 'foldkit-mixins'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { EMPTY_COLOR } from '../src/constant.js'
import { Flags, Message, Model, flags, init, subscriptions, update, view } from '../src/main.js'
import { PALETTE_THEMES } from '../src/palette.js'
import { stylesheet } from '../src/style.js'
import { Canvas } from '../src/view/canvas.js'
import { emptyModel } from './fixtures.js'

const [firstColor] = PALETTE_THEMES[0].colors

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) =>
    setTimeout(() => callback(performance.now()), 0),
  )
  vi.stubGlobal('cancelAnimationFrame', clearTimeout)
})

const running: Array<() => void> = []

const stop = (): void => {
  for (const dispose of running.splice(0)) dispose()
  document.head.replaceChildren()
  document.body.replaceChildren()
}

afterEach(() => {
  stop()
  vi.unstubAllGlobals()
  window.localStorage.clear()
})

/** The editor as `entry.ts` runs it: the stylesheet, Flags from the store, every Subscription. */
const mountEditor = (): void => {
  const styles = document.createElement('style')
  styles.textContent = stylesheet
  document.head.append(styles)
  const container = document.createElement('div')
  container.id = 'pixel-art-runtime'
  document.body.append(container)
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      Flags,
      flags,
      init,
      update,
      view: (model: Model, h: HtmlBuilder<Message>) => view(model, h).body,
      subscriptions,
      container,
      resources: KeyValueStore.layerStorage(() => window.localStorage),
    }),
  )
  running.push(() => handle.dispose())
}

/** The canvas's cells, row by row: the colored elements outside the history's thumbnails. */
const cells = (): ReadonlyArray<HTMLElement> =>
  Array.from(document.querySelectorAll<HTMLElement>('[style*="--pixel-color"]')).filter(
    cell => cell.closest('[data-entry]') === null,
  )

const cellAt = (size: number, x: number, y: number): HTMLElement => {
  const cell = cells()[y * size + x]
  if (cell === undefined) throw new Error(`no cell at ${x}, ${y}`)
  return cell
}

const colorAt = (size: number, x: number, y: number): string =>
  cellAt(size, x, y).style.getPropertyValue('--pixel-color')

const mouse = (target: EventTarget, type: string): void => {
  target.dispatchEvent(new MouseEvent(type, { bubbles: type !== 'mouseenter' }))
}

const key = (init: KeyboardEventInit): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, ...init }))
}

const buttonNamed = (name: string): HTMLButtonElement => {
  const found = Array.from(document.querySelectorAll('button')).find(button =>
    button.textContent?.startsWith(name),
  )
  if (found === undefined) throw new Error(`no ${name} button`)
  return found
}

test('a stroke is one undo step, and Ctrl+Z takes all of it back', async () => {
  mountEditor()
  await vi.waitFor(() => expect(cells()).toHaveLength(16 * 16))

  mouse(cellAt(16, 1, 1), 'mouseenter')
  mouse(cellAt(16, 1, 1), 'mousedown')
  mouse(cellAt(16, 2, 1), 'mouseenter')
  mouse(cellAt(16, 2, 2), 'mouseenter')
  mouse(document, 'mouseup')
  await vi.waitFor(() => expect(colorAt(16, 2, 2)).toBe(firstColor))
  expect(colorAt(16, 1, 1)).toBe(firstColor)
  expect(colorAt(16, 2, 1)).toBe(firstColor)
  expect(buttonNamed('Undo').getAttribute('aria-disabled')).not.toBe('true')

  key({ key: 'z', ctrlKey: true })
  await vi.waitFor(() => expect(colorAt(16, 1, 1)).toBe(EMPTY_COLOR))
  expect(colorAt(16, 2, 1)).toBe(EMPTY_COLOR)
  expect(colorAt(16, 2, 2)).toBe(EMPTY_COLOR)
  expect(buttonNamed('Undo').getAttribute('aria-disabled')).toBe('true')
})

test('B, F and E choose the tool', async () => {
  mountEditor()
  const checkedTool = () =>
    document.querySelector('[role="radio"][aria-checked="true"]')?.textContent
  await vi.waitFor(() => expect(checkedTool()).toBe('BrushB'))

  // The keyboard Subscription starts after the first frame: press until it listens.
  await vi.waitFor(() => {
    key({ key: 'f' })
    expect(checkedTool()).toBe('FillF')
  })
  key({ key: 'e' })
  await vi.waitFor(() => expect(checkedTool()).toBe('EraserE'))
  key({ key: 'b' })
  await vi.waitFor(() => expect(checkedTool()).toBe('BrushB'))
})

test('a canvas painted before a reload is there after it', async () => {
  mountEditor()
  await vi.waitFor(() => expect(cells()).toHaveLength(16 * 16))
  mouse(cellAt(16, 3, 4), 'mousedown')
  mouse(document, 'mouseup')
  await vi.waitFor(
    () => expect(window.localStorage.getItem('pixel-art-canvas')).toContain('Some'),
    {
      timeout: 100,
    },
  )
  stop()

  mountEditor()
  await vi.waitFor(() => expect(cells()).toHaveLength(16 * 16))
  expect(colorAt(16, 3, 4)).toBe(firstColor)
  expect(colorAt(16, 4, 3)).toBe(EMPTY_COLOR)
})

test('the editor draws the page with the CSS of every class on it', async () => {
  mountEditor()
  await vi.waitFor(() => expect(cells()).toHaveLength(16 * 16))

  const css = Array.from(document.querySelectorAll('style'))
    .map(style => style.textContent)
    .join('')
  const drawn = Array.from(document.querySelectorAll('[class]')).flatMap(element =>
    Array.from(element.classList),
  )
  expect(drawn.length).toBeGreaterThan(0)
  expect(drawn.filter(className => !css.includes(`.${className}`))).toEqual([])
})

test('a stroke redraws only the rows it paints', async () => {
  const container = document.createElement('div')
  container.id = 'pixel-art-canvas'
  document.body.append(container)
  let drawnCells = 0
  // A cell drawn inside a row passes no item; the memo's own comparison does.
  const counting = Mixin.dynamic('CountDrawnCells', {
    cell: ({ item }) => {
      if (item === undefined) drawnCells++
      return {}
    },
  })
  const CountedCanvas = Canvas.pipe(SlotView.attach(counting))
  const handle = Runtime.embed(
    Runtime.makeElement({
      Model,
      init: () => ({ model: emptyModel }),
      update,
      view: (model: Model, h: HtmlBuilder<Message>) => CountedCanvas(model, h),
      container,
    }),
  )
  running.push(() => handle.dispose())
  await vi.waitFor(() => expect(cells()).toHaveLength(16))

  // The first change after mounting draws every row again: each row's memo
  // learns only on its first draw which Slots it uses.
  mouse(cellAt(4, 1, 2), 'mouseenter')
  await vi.waitFor(() => expect(colorAt(4, 1, 2)).toBe(firstColor))

  // Pressing where the preview was paints row 2, and dragging on paints row
  // 0: those two rows alone are drawn again.
  drawnCells = 0
  mouse(cellAt(4, 1, 2), 'mousedown')
  mouse(cellAt(4, 1, 0), 'mouseenter')
  await vi.waitFor(() => expect(colorAt(4, 1, 0)).toBe(firstColor))
  expect(drawnCells).toBe(2 * 4)
})
