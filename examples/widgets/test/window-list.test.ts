/**
 * The window list island: its names are a thousand distinct keys, a reading
 * of the viewport moves the rows drawn, and one equal to the last keeps the
 * Model. The go-to form's number reveals a row only when it names one, and a
 * find the list reports reaches the page's Commands. Its Scene resolves the
 * list's Mount through the island's Message.
 */
import { WindowList } from 'foldkit-mixins-ui'
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { Message, NAMES, initial, update, type Model } from '../src/window-list/app.js'
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

const went = (row: string) => {
  const typed = update(initial, Message.ChangedRow({ text: row })).model
  return { typed, ...update(typed, Message.WentToRow()) }
}

describe('go to a row', () => {
  it('reveals the row before the number typed, centred, through the list', () => {
    const { typed, model, commands } = went('700')
    expect(model).toBe(typed)
    expect(commands?.map(command => [command.name, command.args])).toEqual([
      ['WindowList.Reveal', { id: initial.list.id, index: 699, align: 'center' }],
    ])
  })

  it.each(['', '0', '1001', '1.5', 'abc'])('does nothing for %j', row => {
    const { typed, model, commands } = went(row)
    expect(model).toBe(typed)
    expect(commands ?? []).toEqual([])
  })

  it('reveals the first and the last row', () => {
    expect(went('1').commands?.[0]?.args).toMatchObject({ index: 0 })
    expect(went('1000').commands?.[0]?.args).toMatchObject({ index: 999 })
  })

  it('keeps the Model for the text it already holds', () => {
    const typed: Model = update(initial, Message.ChangedRow({ text: '7' })).model
    expect(update(typed, Message.ChangedRow({ text: '7' })).model).toBe(typed)
  })

  it('passes the commands of the list up: a find reveals the row it matched', () => {
    const found = update(
      initial,
      Message.GotList({ message: WindowList.Message.Found({ index: 600 }) }),
    )
    expect(found.commands?.map(command => [command.name, command.args])).toEqual([
      ['WindowList.Reveal', { id: initial.list.id, index: 600, align: 'center' }],
    ])
  })
})

describe('the island', () => {
  it('keeps the row typed into the go-to field in the Model', () => {
    Scene.scene(
      { update, view: WindowListIsland },
      Scene.given(initial),
      Scene.Mount.resolveAll(
        WindowList.resolveTrack(
          message => Message.GotList({ message }),
          WindowList.Message.Placed({ top: 0, height: 800 }),
        ),
      ),
      Scene.type(Scene.label('Go to row'), '700'),
      Scene.expect(Scene.label('Go to row')).toHaveValue('700'),
    )
  })

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
  it('traces a scroll down the page, and a go-to row that names one and one that does not', () => {
    expect(runDemo()).toEqual([
      'start: rows 0-30',
      'scrolled 20000px down: rows 495-525',
      'went to row 700: 1 reveal',
      'went to row 1200: 0 reveal',
    ])
  })
})
