/**
 * What the swipeable row's `update` decides: how a release opens, closes or
 * runs an action, what the keyboard's Messages and a press on an action do, and
 * the Model it hands back when nothing changes.
 */
import { Option } from 'effect'
import { SwipeActions } from 'foldkit-primitives/interaction'
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, it } from 'vitest'
import { Message, Row, initial, update, type Model } from '../src/swipe/app.js'
import { SwipeRow } from '../src/swipe/view.js'

const WIDTH = 400
// Each side's actions are 30% of the row: 120px.
const grabbed = (): Model => update(initial().model, Message.Grabbed({ width: WIDTH })).model

const release = (model: Model, deltaX: number, velocityX = 0): Model =>
  update(model, Message.LetGo({ deltaX, velocityX, completed: true })).model

const opened = (model: Model, side: SwipeActions.Side): Model =>
  update(model, Row.wrapper.make(SwipeActions.Message.Opened({ side }))).model

describe('a released swipe', () => {
  it.each([
    ['past half of the end actions opens them', -80, 0, Option.some('end')],
    ['short of half closes', -40, 0, Option.none()],
    ['past half of the start actions opens them', 80, 0, Option.some('start')],
    ['a quick flick opens even a short swipe', -40, -1, Option.some('end')],
    ['a flick the other way closes a long swipe', -80, 1, Option.none()],
  ])('%s', (_name, deltaX, velocityX, expected) => {
    expect(release(grabbed(), deltaX, velocityX).row.open).toEqual(expected)
  })

  it('runs the first action of a side from a swipe past three quarters of the row, and closes the row', () => {
    const toEnd = release(grabbed(), -320)
    expect(Option.getOrNull(toEnd.done)).toBe('archive')
    expect(Option.isNone(toEnd.row.open)).toBe(true)
    expect(Option.getOrNull(release(grabbed(), 320).done)).toBe('pin')
  })

  it('reads a swipe from where the row rested: an open row dragged back past half closes', () => {
    const open = opened(grabbed(), 'end')
    expect(release(open, 80).row.open).toEqual(Option.none())
    expect(release(open, 20).row.open).toEqual(Option.some('end'))
  })

  it('drops the offset, and leaves the row where it rested, when the swipe is cancelled', () => {
    const open = opened(grabbed(), 'end')
    const dragging = update(open, Message.Dragged({ deltaX: 30 })).model
    expect(Option.getOrNull(dragging.offset)).toBe(-120 + 30)
    // Let go, this distance would close the row: a cancelled swipe is not let go.
    const cancelled = update(
      dragging,
      Message.LetGo({ deltaX: 100, velocityX: 0, completed: false }),
    ).model
    expect(Option.isNone(cancelled.offset)).toBe(true)
    expect(cancelled.row.open).toEqual(Option.some('end'))
  })

  it('draws no offset before a swipe has said how wide the row is', () => {
    const start = initial().model
    expect(update(start, Message.Dragged({ deltaX: 30 })).model).toBe(start)
  })
})

describe('the actions and the keyboard', () => {
  it('a press on an action records it and closes the row', () => {
    const open = opened(grabbed(), 'end')
    const acted = update(open, Message.Acted({ action: 'delete' })).model
    expect(Option.getOrNull(acted.done)).toBe('delete')
    expect(Option.isNone(acted.row.open)).toBe(true)
  })

  it('a new swipe forgets the last action', () => {
    const acted = update(grabbed(), Message.Acted({ action: 'pin' })).model
    expect(Option.isSome(acted.done)).toBe(true)
    expect(Option.isNone(update(acted, Message.Grabbed({ width: WIDTH })).model.done)).toBe(true)
  })

  it('focus leaving closes an open row and changes nothing for a closed one', () => {
    const closed = grabbed()
    expect(update(closed, Message.FocusLeft()).model).toBe(closed)
    expect(Option.isNone(update(opened(closed, 'start'), Message.FocusLeft()).model.row.open)).toBe(
      true,
    )
  })
})

describe('the row drawn', () => {
  const drawn = (model: Model) => Inert.draw(SwipeRow, model)
  const inertGroups = (model: Model) =>
    Inert.byRole(drawn(model), 'group')
      .filter(group => Inert.value(group, 'aria-label')?.toString().endsWith('actions'))
      .map(group => Inert.value(group, 'inert'))

  it('keeps the actions behind a closed row out of reach, and frees only the open side', () => {
    expect(inertGroups(initial().model).every(value => value === true)).toBe(true)
    const [start, end] = inertGroups(opened(grabbed(), 'end'))
    expect(start).toBe(true)
    expect(end).not.toBe(true)
  })

  it('says what was done', () => {
    const acted = update(grabbed(), Message.Acted({ action: 'archive' })).model
    expect(Inert.text(drawn(acted))).toContain('Archived')
    expect(Inert.text(drawn(initial().model))).toContain('Nothing done yet.')
  })
})
