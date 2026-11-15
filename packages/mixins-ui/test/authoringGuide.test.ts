// @vitest-environment jsdom
/**
 * The guide's chip filter with no page: what `update` decides, what the view
 * draws inert, that the assembly meets its pattern and draws only Slots, and
 * that a page's route on a key the filter takes is refused.
 */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'
import { A11y, Behaviors, SlotView } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Selection } from 'foldkit-primitives/interaction'
import { PresenceMessage } from 'foldkit-primitives/motion'
import {
  CHIPS,
  ChipPattern,
  FilterChips,
  GotPresence,
  Message,
  Picks,
  chipFilter,
  initialOf,
  labelsOf,
  update,
  type Model,
} from './authoringGuide.js'
const h = SlotView.inertBuilder<Message>()

const start = initialOf('f', CHIPS).model
const activate = (model: Model, id: string) =>
  update(model, Picks.wrapper.make(Selection.Message.Activated({ id }))).model

/** Runs a chip's exit to its end: the `Hidden` fact its timer would send. */
const exited = (model: Model, id: string) => {
  const placed = model.presence[id]
  if (placed === undefined) throw new Error(`no presence for ${id}`)
  return update(
    model,
    GotPresence.make(id, PresenceMessage.Hidden({ generation: placed.generation })),
  ).model
}

describe('update', () => {
  it('starts a removed chip leaving, keeps it until its exit ends, then drops it and its pick', () => {
    const picked = activate(start, 'f-mine')
    const leaving = update(picked, Message.Removed({ id: 'f-mine' }))
    expect(leaving.model.presence['f-mine']?.phase).toBe('hiding')
    expect(leaving.commands?.length).toBe(1)
    expect(labelsOf(leaving.model)).toEqual(['Open', 'Mine', 'Urgent', 'Stale'])
    const gone = exited(leaving.model, 'f-mine')
    expect(labelsOf(gone)).toEqual(['Open', 'Urgent', 'Stale'])
    expect(gone.picks.selected).toEqual([])
    expect(Object.hasOwn(gone.presence, 'f-mine')).toBe(false)
  })

  it('keeps a chip when a Hidden fact of an older exit arrives', () => {
    const leaving = update(start, Message.Removed({ id: 'f-mine' })).model
    const stale = update(
      leaving,
      GotPresence.make('f-mine', PresenceMessage.Hidden({ generation: 0 })),
    ).model
    expect(labelsOf(stale)).toEqual(['Open', 'Mine', 'Urgent', 'Stale'])
  })

  it('removes every picked chip, and leaves a chip already leaving to its exit', () => {
    const picked = activate(activate(start, 'f-open'), 'f-stale')
    const leaving = update(picked, Message.RemovedPicked())
    expect(leaving.model.presence['f-open']?.phase).toBe('hiding')
    expect(leaving.model.presence['f-stale']?.phase).toBe('hiding')
    expect(leaving.model.presence['f-mine']?.phase).toBe('shown')
    const again = update(leaving.model, Message.Removed({ id: 'f-open' }))
    expect(again.model).toBe(leaving.model)
    expect(again.commands ?? []).toEqual([])
  })

  it('returns the Model it was given for a chip it does not hold', () => {
    expect(update(start, Message.Removed({ id: 'other-open' })).model).toBe(start)
    expect(update(start, Message.RemovedPicked()).model).toBe(start)
  })
})

describe('the view', () => {
  it('is a multiselectable listbox of chips with their state, and a remove button only while some are picked', () => {
    const picked = activate(start, 'f-urgent')
    const drawn = FilterChips(picked, h)
    const [list] = Inert.byTag(drawn, 'ul')
    expect(Inert.value(list, 'role')).toBe('listbox')
    expect(Inert.value(list, 'aria-label')).toBe('Filters')
    expect(Inert.value(list, 'aria-multiselectable')).toBe('true')
    const chips = Inert.byTag(drawn, 'li')
    expect(chips.map(chip => Inert.value(chip, 'id'))).toEqual([
      'f-open',
      'f-mine',
      'f-urgent',
      'f-stale',
    ])
    expect(chips.map(chip => Inert.value(chip, 'aria-selected'))).toEqual([
      'false',
      'false',
      'true',
      'false',
    ])
    expect(Inert.byTag(drawn, 'button')).toHaveLength(1)
    expect(Inert.byTag(FilterChips(start, h), 'button')).toHaveLength(0)
  })

  it('draws a leaving chip inert, so it takes no press or focus while it fades', () => {
    const leaving = update(start, Message.Removed({ id: 'f-mine' })).model
    const chips = Inert.byTag(FilterChips(leaving, h), 'li')
    expect(chips.map(chip => Inert.value(chip, 'data-presence'))).toEqual([
      'shown',
      'hiding',
      'shown',
      'shown',
    ])
  })

  it('meets its pattern, and names what supplies each obligation', () => {
    expect(A11y.check(ChipPattern, FilterChips)).toEqual([])
    expect(SlotView.describe(FilterChips).conforms.length).toBe(1)
  })

  it('refuses a page route on a key the filter already takes, naming both', () => {
    const stray = Behaviors.Keys.route<Model, Message>('Stray', {
      on: [Behaviors.Keys.chord('Delete')],
      handle: () => Option.none(),
    })
    expect(() => chipFilter({ label: 'Filters', routes: [stray] })).toThrow(
      /Remove.*Stray|Stray.*Remove/,
    )
  })
})
