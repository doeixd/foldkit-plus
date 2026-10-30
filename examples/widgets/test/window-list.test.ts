/**
 * The window list island: its names are a thousand distinct keys, a reading
 * of the viewport moves the rows drawn, and one equal to the last keeps the
 * Model. Its Scene resolves the list's Mount through the island's Message.
 */
import { WindowList } from 'foldkit-mixins-ui'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { Message, NAMES, initial, update } from '../src/window-list/app.js'
import { WindowListIsland, runDemo } from '../src/window-list/view.js'

const placed = (top: number) =>
  Message.GotList({ message: WindowList.Message.Placed({ top, height: 800 }) })

describe('update flows', () => {
  it('names a thousand rows, each once', () => {
    expect(new Set(NAMES).size).toBe(1000)
  })

  it('draws the rows the viewport is over, and keeps the Model for the same reading', () => {
    const scrolled = update(initial, placed(4000)).model
    expect(WindowList.windowOf(scrolled.list, NAMES)).toEqual({ start: 95, end: 125 })
    expect(update(scrolled, placed(4000)).model).toBe(scrolled)
  })
})

describe('the island', () => {
  it('draws the rows the Mount reports the window over, and counts them', () => {
    Scene.scene(
      { update, view: WindowListIsland },
      Scene.given(initial),
      Scene.Mount.resolveAll(
        WindowList.resolveTrack(
          message => Message.GotList({ message }),
          WindowList.Message.Placed({ top: 20_000, height: 800 }),
        ),
      ),
      Scene.expect(Scene.text('1000 names, 30 drawn')).toExist(),
      Scene.expect(Scene.text(NAMES[495]!)).toExist(),
      Scene.expect(Scene.text(NAMES[0]!)).toBeAbsent(),
    )
  })
})

describe('demo', () => {
  it('traces a scroll down the page', () => {
    expect(runDemo()).toEqual(['start: rows 0-30', 'scrolled 20000px down: rows 495-525'])
  })
})
