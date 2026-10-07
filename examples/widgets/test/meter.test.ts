import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Message, QUOTA, initial, update } from '../src/meter/app.js'
import { Meter, runDemo } from '../src/meter/view.js'

describe('update flows', () => {
  it('starts at 62', () => {
    expect(initial.used).toBe(62)
  })

  it('clamps to the quota', () => {
    expect(update(initial, Message.SetUsed({ used: 200 })).model.used).toBe(QUOTA)
    expect(update(initial, Message.SetUsed({ used: -5 })).model.used).toBe(0)
  })
})

describe('view structure', () => {
  it('draws the meter with value and bounds', () => {
    const page = Inert.draw(Meter, initial)
    const meter = Inert.byTag(page, 'meter')[0]
    expect(Inert.value(meter, 'value')).toBe('62')
    expect(Inert.value(meter, 'max')).toBe(String(QUOTA))
    expect(Inert.text(page)).toContain('62 of 100 GB')
  })
})

describe('demo', () => {
  it('traces clamping', () => {
    expect(runDemo()).toEqual(['start: used=62', 'set 200: used=100 (clamped)'])
  })
})
