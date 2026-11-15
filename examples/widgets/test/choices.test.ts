// @vitest-environment jsdom

import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { Message, initial, update } from '../src/choices/app.js'
import { island } from '../src/choices/island.js'
import { Choices } from '../src/choices/view.js'

describe('update', () => {
  it('returns the Model it was given for a choice already made and a step already taken', () => {
    expect(update(initial, Message.PickedSize({ value: initial.size })).model).toBe(initial)
    expect(update(initial, Message.Slid({ value: initial.live })).model).toBe(initial)
  })

  it('keeps one size', () => {
    expect(update(initial, Message.PickedSize({ value: 'l' })).model.size).toBe('l')
  })

  it('turns each style on and off, in the order pressed', () => {
    const toggle = (value: string, model = initial) =>
      update(model, Message.ToggledStyle({ value })).model
    const both = toggle('italic', toggle('bold'))
    expect(both.styles).toEqual(['bold', 'italic'])
    expect(toggle('bold', both).styles).toEqual(['italic'])
  })

  it('counts every step of the live value and holds the committed one until a commit', () => {
    const stepped = update(
      update(initial, Message.Slid({ value: 60 })).model,
      Message.Slid({ value: 70 }),
    ).model
    expect([stepped.live, stepped.moves, stepped.committed, stepped.commits]).toEqual([
      70, 2, 50, 0,
    ])
    const committed = update(stepped, Message.Committed({ value: 70 })).model
    expect([committed.live, committed.committed, committed.commits]).toEqual([70, 70, 1])
  })
})

describe('the drawn controls', () => {
  it('draws the readout from the Model, the live value apart from the committed one', () => {
    const slid = update(initial, Message.Slid({ value: 61 })).model
    Scene.scene(
      { update, view: Choices },
      Scene.given(slid),
      Scene.expect(Scene.text('Live: 61 (steps 1)')).toExist(),
      Scene.expect(Scene.text('Committed: 50 (commits 0)')).toExist(),
      Scene.expect(Scene.text('Styles: none')).toExist(),
    )
  })

  it('draws a radio group beside a group of pressed buttons', () => {
    Scene.scene(
      { update, view: Choices },
      Scene.given(initial),
      Scene.expect(Scene.role('radiogroup', { name: 'Size' })).toExist(),
      Scene.expect(Scene.role('group', { name: 'Text style' })).toExist(),
      Scene.click(Scene.role('radio', { name: 'Large' })),
      Scene.expect(Scene.text('Size: l')).toExist(),
      Scene.click(Scene.role('button', { name: 'Bold' })),
      Scene.expect(Scene.text('Styles: bold')).toExist(),
    )
  })
})

describe('trace', () => {
  it('replays the section’s Messages', () => {
    expect(island.runDemo()).toEqual([
      'start: size=m styles=none live=50/0 committed=50/0',
      'picked large: size=l styles=none live=50/0 committed=50/0',
      'toggled bold, italic, bold: size=l styles=italic live=50/0 committed=50/0',
      'dragged to 70: size=l styles=italic live=70/2 committed=50/0',
      'let go: size=l styles=italic live=70/2 committed=70/1',
    ])
  })
})
