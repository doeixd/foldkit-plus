import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Selection } from 'foldkit-primitives/interaction'
import { Sel } from '../src/command/app.js'
import { Message, initial, update } from '../src/palette/app.js'
import { Palette, runDemo } from '../src/palette/view.js'

describe('update flows', () => {
  it('starts closed with nothing run', () => {
    expect(initial.model.open).toBe(false)
    expect(initial.model.lastRan).toBe(null)
  })

  it('opening, picking, and running', () => {
    const opened = update(initial.model, Message.Opened({})).model
    expect(opened.open).toBe(true)
    const picked = update(
      opened,
      Sel.wrapper.make(Selection.Message.Activated({ id: 'new-folder' })),
    ).model
    expect(picked.open).toBe(false)
    expect(picked.lastRan).toBe('New folder')
  })

  it('re-picking the running command runs nothing new', () => {
    const opened = update(initial.model, Message.Opened({})).model
    const picked = update(
      opened,
      Sel.wrapper.make(Selection.Message.Activated({ id: 'rename' })),
    ).model
    expect(picked.lastRan).toBe('Rename')
    const again = update(
      { ...opened, palettePick: picked.palettePick },
      Sel.wrapper.make(Selection.Message.Activated({ id: 'rename' })),
    ).model
    expect(again.open).toBe(true)
    expect(again.lastRan).toBe(null)
  })
})

describe('view structure', () => {
  it('draws the trigger and, open, the modal panel with its matches', () => {
    const closed = Inert.draw(Palette, initial.model)
    expect(Inert.byTag(closed, 'button').map(button => Inert.text(button))).toEqual(['Commands'])
    expect(Inert.byTag(closed, 'input')).toHaveLength(0)
    const opened = Inert.draw(Palette, update(initial.model, Message.Opened({})).model)
    const dialogs = Inert.byTag(opened, 'div').filter(div => Inert.value(div, 'role') === 'dialog')
    expect(dialogs).toHaveLength(1)
    expect(Inert.value(dialogs[0], 'aria-modal')).toBe('true')
    expect(Inert.byTag(opened, 'input')).toHaveLength(1)
    expect(
      Inert.byTag(opened, 'div').filter(div => Inert.value(div, 'role') === 'option'),
    ).toHaveLength(6)
  })

  it('names the run after it happens', () => {
    const picked = update(
      update(initial.model, Message.Opened({})).model,
      Sel.wrapper.make(Selection.Message.Activated({ id: 'delete' })),
    ).model
    expect(Inert.text(Inert.draw(Palette, picked))).toContain('Ran: Delete.')
  })
})

describe('demo', () => {
  it('traces opening and running', () => {
    expect(runDemo()).toEqual([
      'start: open=false ran=null',
      'opened: open=true',
      'picked new-folder: open=false ran=New folder',
    ])
  })
})
