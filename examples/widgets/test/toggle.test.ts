import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Message, initial, update } from '../src/toggle/app.js'
import { Toggle, runDemo } from '../src/toggle/view.js'

describe('update flows', () => {
  it('starts off', () => {
    expect(initial.on).toBe(false)
  })

  it('toggles on and back off', () => {
    const on = update(initial, Message.Toggled()).model
    expect(on.on).toBe(true)
    expect(update(on, Message.Toggled()).model.on).toBe(false)
  })
})

describe('view structure', () => {
  it('says its state in aria-pressed and text', () => {
    const off = Inert.byLabel(Inert.draw(Toggle, initial), 'Mute')[0]
    expect(Inert.value(off, 'aria-pressed')).toBe('false')
    expect(Inert.text(off)).toBe('Mute')
    const on = Inert.byLabel(
      Inert.draw(Toggle, update(initial, Message.Toggled()).model),
      'Mute',
    )[0]
    expect(Inert.value(on, 'aria-pressed')).toBe('true')
    expect(Inert.text(on)).toBe('Muted')
  })
})

describe('demo', () => {
  it('traces off to on', () => {
    expect(runDemo()).toEqual(['start: on=false', 'toggled: on=true'])
  })
})
