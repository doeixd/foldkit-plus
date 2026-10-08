import { describe, expect, it } from 'vitest'
import { Option } from 'effect'
import { Inert } from 'foldkit-mixins/testing'
import { LENGTH, Message, codeOf, initial, update } from '../src/otp-field/app.js'
import { OtpField, backspaceOf, runDemo } from '../src/otp-field/view.js'

const filled = (): ReturnType<typeof update>['model'] => {
  let model = initial.model
  for (let index = 0; index < LENGTH; index += 1) {
    model = update(model, Message.CellTyped({ index, char: String(index + 1) })).model
  }
  return model
}

describe('update flows', () => {
  it('starts empty and incomplete', () => {
    expect(initial.model.cells).toEqual(['', '', '', '', '', ''])
    expect(codeOf(initial.model)).toBe(null)
  })

  it('takes the last typed digit, digits only', () => {
    const model = update(initial.model, Message.CellTyped({ index: 2, char: 'ab7' })).model
    expect(model.cells[2]).toBe('7')
    expect(update(initial.model, Message.CellTyped({ index: 2, char: 'x' })).model).toBe(
      initial.model,
    )
    expect(update(initial.model, Message.CellTyped({ index: 9, char: '1' })).model).toBe(
      initial.model,
    )
  })

  it('completes when every cell holds a digit', () => {
    expect(codeOf(filled())).toBe('123456')
    const five = update(filled(), Message.CellCleared({ index: 5 })).model
    expect(codeOf(five)).toBe(null)
  })

  it('clears one cell', () => {
    expect(update(filled(), Message.CellCleared({ index: 0 })).model.cells[0]).toBe('')
  })
})

describe('view structure', () => {
  it('draws six labelled cells and the status', () => {
    const page = Inert.draw(OtpField, initial.model)
    const inputs = Inert.byTag(page, 'input')
    expect(inputs).toHaveLength(LENGTH)
    expect(Inert.value(inputs[0], 'aria-label')).toBe('Digit 1')
    expect(Inert.text(page)).toContain('Enter all six digits.')
    expect(Inert.text(Inert.draw(OtpField, filled()))).toContain('Code complete: 123456.')
  })

  it('Backspace in an empty cell clears the previous one and moves focus there', () => {
    const one = update(initial.model, Message.CellTyped({ index: 0, char: '4' })).model
    expect(backspaceOf(one, 1)).toEqual(
      Option.some({
        focusSelector: '[id="digit-1"]',
        message: Message.CellCleared({ index: 0 }),
      }),
    )
    expect(Option.isNone(backspaceOf(one, 0))).toBe(true)
    expect(backspaceOf(one, 2)).toEqual(
      Option.some({
        focusSelector: '[id="digit-2"]',
        message: Message.CellCleared({ index: 1 }),
      }),
    )
    const page = Inert.draw(OtpField, one)
    for (const cell of Inert.byTag(page, 'input')) {
      expect(
        (cell as { readonly data?: { readonly on?: { readonly keydown?: unknown } } })?.data?.on
          ?.keydown,
      ).toBeTypeOf('function')
    }
  })
})

describe('demo', () => {
  it('traces typing and clearing', () => {
    expect(runDemo()).toEqual([
      'start: cells=,,,,, code=null',
      'typed 42: cells=4,2,,,, code=null',
      'cleared second: cells=4,,,,, code=null',
    ])
  })
})
