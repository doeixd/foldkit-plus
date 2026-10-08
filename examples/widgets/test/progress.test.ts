import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Message, TOTAL, initial, update } from '../src/progress/app.js'
import { Progress, runDemo } from '../src/progress/view.js'

describe('update flows', () => {
  it('starts at 34 of a known total', () => {
    expect(initial.sent).toBe(34)
    expect(initial.known).toBe(true)
  })

  it('clamps to the total', () => {
    expect(update(initial, Message.SetSent({ sent: 200 })).model.sent).toBe(TOTAL)
    expect(update(initial, Message.SetSent({ sent: -5 })).model.sent).toBe(0)
  })

  it('losing the total is a change, repeating it is not', () => {
    const lost = update(initial, Message.SetKnown({ known: false }))
    expect(lost.model.known).toBe(false)
    expect(update(lost.model, Message.SetKnown({ known: false })).model).toBe(lost.model)
  })
})

describe('view structure', () => {
  it('draws the bar with value and bounds', () => {
    const page = Inert.draw(Progress, initial)
    const bar = Inert.byTag(page, 'progress')[0]
    expect(Inert.value(bar, 'value')).toBe('34')
    expect(Inert.value(bar, 'max')).toBe(String(TOTAL))
    expect(Inert.text(page)).toContain('34 of 100 MB')
  })

  it('omits the value while the total is unknown', () => {
    const page = Inert.draw(Progress, { ...initial, known: false })
    const bar = Inert.byTag(page, 'progress')[0]
    expect(Inert.value(bar, 'value')).toBeUndefined()
    expect(Inert.text(page)).toContain('Sending…')
  })
})

describe('demo', () => {
  it('traces clamping and the lost total', () => {
    expect(runDemo()).toEqual([
      'start: sent=34',
      'send 200: sent=100 (clamped)',
      'total lost: known=false',
    ])
  })
})
