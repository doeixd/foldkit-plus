/**
 * What the board's `update` decides, with no page: a lasso and a click write
 * the one Selection, a Shift lasso keeps what was selected, Escape puts it
 * back, and the count is announced once per change, whichever path made it.
 */
import { Option } from 'effect'
import { Selection } from 'foldkit-primitives/interaction'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { Message, Picks, announcementOf, initial, update, type Model } from '../src/spatial/app.js'
import { runDemo } from '../src/spatial/demo.js'
import { SelectableBoard } from '../src/spatial/view.js'
import { pageStylesheet } from '../src/style.js'

const run = (model: Model, ...messages: ReadonlyArray<Message>): Model =>
  messages.reduce((current, message) => update(current, message).model, model)

const click = (id: string): Message => Picks.wrapper.make(Selection.Message.Activated({ id }))

const selected = (model: Model) => model.picks.selected
const rect = { x: 0, y: 0, width: 10, height: 10 }

describe('the lasso', () => {
  it('replaces the selection with the cards it touches, as it changes, and ends with none being dragged', () => {
    const start = run(initial().model, click('a'))
    const dragging = run(
      start,
      Message.LassoStarted({ additive: false }),
      Message.LassoChanged({ rect, ids: ['c', 'e'], additive: false }),
    )
    expect(selected(dragging)).toEqual(['c', 'e'])
    expect(Option.getOrThrow(dragging.lasso).rect).toEqual(rect)
    const ended = run(dragging, Message.LassoEnded({ ids: ['c'], additive: false }))
    expect(selected(ended)).toEqual(['c'])
    expect(Option.isNone(ended.lasso)).toBe(true)
  })

  it('adds to what was selected before it when it began additive', () => {
    const ended = run(
      initial().model,
      click('a'),
      Message.LassoStarted({ additive: true }),
      Message.LassoChanged({ rect, ids: ['c'], additive: true }),
      Message.LassoChanged({ rect, ids: ['c', 'a', 'e'], additive: true }),
      Message.LassoEnded({ ids: ['e'], additive: true }),
    )
    expect(selected(ended)).toEqual(['a', 'e'])
  })

  it('puts back what was selected before when it is cancelled', () => {
    const cancelled = run(
      initial().model,
      click('a'),
      Message.LassoStarted({ additive: false }),
      Message.LassoChanged({ rect, ids: ['c', 'e'], additive: false }),
      Message.LassoCancelled(),
    )
    expect(selected(cancelled)).toEqual(['a'])
    expect(Option.isNone(cancelled.lasso)).toBe(true)
  })

  it('hands back the Model it was given when no lasso is open', () => {
    const model = initial().model
    for (const message of [
      Message.LassoChanged({ rect, ids: ['c'], additive: false }),
      Message.LassoEnded({ ids: ['c'], additive: false }),
      Message.LassoCancelled(),
    ])
      expect(update(model, message).model).toBe(model)
  })
})

describe('the announcement', () => {
  const said = (model: Model) => Option.fromNullishOr(model.live.pending?.message)

  it('reads the count after a click and after a lasso alike', () => {
    expect(said(run(initial().model, click('a')))).toEqual(Option.some('1 selected'))
    const lassoed = run(
      initial().model,
      Message.LassoStarted({ additive: false }),
      Message.LassoChanged({ rect, ids: ['c', 'e', 'f'], additive: false }),
    )
    expect(said(lassoed)).toEqual(Option.some('3 selected'))
  })

  it('reads nothing again for a lasso that changes its rectangle but not the cards', () => {
    const first = run(
      initial().model,
      Message.LassoStarted({ additive: false }),
      Message.LassoChanged({ rect, ids: ['c'], additive: false }),
    )
    const generation = first.live.generation
    const again = run(
      first,
      Message.LassoChanged({ rect: { ...rect, width: 20 }, ids: ['c'], additive: false }),
    )
    expect(again.live.generation).toBe(generation)
    expect(Option.getOrThrow(again.lasso).rect.width).toBe(20)
  })

  it('reads that nothing is selected after a clear, and not before there was a selection', () => {
    const model = initial().model
    expect(update(model, Message.ClearedSelection()).model).toBe(model)
    const cleared = run(model, click('a'), Message.ClearedSelection())
    expect(said(cleared)).toEqual(Option.some(announcementOf(0)))
    expect(selected(cleared)).toEqual([])
  })
})

describe('the view', () => {
  it('draws only Slots, with the lasso only while one is open', () => {
    const lassoed = run(
      initial().model,
      Message.LassoStarted({ additive: false }),
      Message.LassoChanged({ rect, ids: ['c'], additive: false }),
    )
    for (const model of [initial().model, lassoed]) {
      const tree = Inert.draw(SelectableBoard, model)
      expect(Inert.unslotted(tree, { inside: ['live'] })).toEqual([])
      expect(Inert.fixedInline(tree)).toEqual([])
      expect(Inert.missingTokens(tree, pageStylesheet)).toEqual([])
    }
    const options = (model: Model) =>
      Inert.byRole(Inert.draw(SelectableBoard, model), 'option').length
    expect(options(initial().model)).toBe(6)
    const lassos = (model: Model) => Inert.bySlot(Inert.draw(SelectableBoard, model), 'lasso')
    expect(lassos(initial().model)).toHaveLength(0)
    expect(lassos(lassoed)).toHaveLength(1)
  })
})

describe('the demo trace', () => {
  it('prints both paths ending in one selection', () => {
    expect(runDemo()).toEqual([
      'cards: Alpha, Bravo, Charlie, Delta, Echo, Foxtrot',
      'a click on c: selected c; says 1 selected',
      'a lasso over c and e: selected c, e; says 2 selected',
      'escape mid-lasso: selected c, e; says 2 selected',
    ])
  })
})
