import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Message, SECTIONS, initial, update } from '../src/accordion/app.js'
import { Accordion, runDemo } from '../src/accordion/view.js'

describe('update flows', () => {
  it('starts shut', () => {
    expect(initial.open).toBe(null)
  })

  it('opens one section and closes it again', () => {
    const open = update(initial, Message.ToggledSection({ id: 'team' })).model
    expect(open.open).toBe('team')
    expect(update(open, Message.ToggledSection({ id: 'team' })).model.open).toBe(null)
  })

  it('opening another replaces the open one', () => {
    const open = update(initial, Message.ToggledSection({ id: 'team' })).model
    expect(update(open, Message.ToggledSection({ id: 'keys' })).model.open).toBe('keys')
  })
})

describe('view structure', () => {
  it('names each content from its trigger and draws only the open body', () => {
    const shut = Inert.draw(Accordion, initial)
    expect(Inert.byTag(shut, 'button')).toHaveLength(SECTIONS.length)
    expect(Inert.text(shut)).not.toContain('Invite, remove')
    const open = Inert.draw(
      Accordion,
      update(initial, Message.ToggledSection({ id: 'team' })).model,
    )
    const trigger = Inert.byLabel(open, 'Team')[0]
    expect(Inert.value(trigger, 'aria-expanded')).toBe('true')
    expect(Inert.value(trigger, 'aria-controls')).toBe('team-content')
    expect(Inert.text(open)).toContain('Invite, remove')
    expect(Inert.value(Inert.byLabel(open, 'Billing')[0], 'aria-expanded')).toBe('false')
  })
})

describe('demo', () => {
  it('traces open and close', () => {
    expect(runDemo()).toEqual([
      'start: open=null',
      'opened team: open=team',
      'closed team: open=null',
    ])
  })
})
