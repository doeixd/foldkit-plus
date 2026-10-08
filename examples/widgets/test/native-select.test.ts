import { describe, expect, it } from 'vitest'
import { Inert } from 'foldkit-mixins/testing'
import { Message, initial, update } from '../src/native-select/app.js'
import { NativeSelect, runDemo } from '../src/native-select/view.js'

describe('update flows', () => {
  it('starts by email', () => {
    expect(initial.value).toBe('email')
  })

  it('takes a listed channel', () => {
    expect(update(initial, Message.SetValue({ value: 'phone' })).model.value).toBe('phone')
  })

  it('refuses an unlisted channel with the Model untouched', () => {
    const refused = update(initial, Message.SetValue({ value: 'pager' }))
    expect(refused.model).toBe(initial)
  })
})

describe('view structure', () => {
  it('draws every channel with the chosen one valued', () => {
    const page = Inert.draw(NativeSelect, initial)
    const field = Inert.byTag(page, 'select')[0]
    expect(Inert.value(field, 'value')).toBe('email')
    expect(Inert.byTag(page, 'option')).toHaveLength(3)
    expect(Inert.text(page)).toContain('Chosen: email.')
  })
})

describe('demo', () => {
  it('traces picking and refusing', () => {
    expect(runDemo()).toEqual([
      'start: value=email',
      'picked phone: value=phone',
      'picked pager: value=phone (refused)',
    ])
  })
})
