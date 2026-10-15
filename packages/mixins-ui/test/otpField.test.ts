/**
 * OtpField as markup and as filtering: one input the cells only mirror, the
 * code kept to its pattern and length, and the cell the next character goes
 * in marked for its caret.
 */
import { Scene } from 'foldkit/test'
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { OtpField, OtpFieldSlots, Patterns, Recipes } from '../src/index.js'
import { h, message } from './fixture.js'

const style = Style.forSlots(OtpFieldSlots)(Recipes.OtpField({}))
const drawn = (value: string, groups?: ReadonlyArray<number>) =>
  OtpField.view(
    {
      label: 'Sign-in code',
      value,
      onChange: () => message('Clicked'),
      ...(groups === undefined ? {} : { groups }),
      style,
    },
    h,
  )
const cells = (value: string) =>
  Inert.all(drawn(value)).filter(node => Inert.value(node, 'data-filled') !== undefined)

describe('OtpField.kept', () => {
  it.each([
    ['keeps digits and drops the rest', '12-34 56', 6, 'digits', '123456'],
    ['stops at the length', '1234567890', 6, 'digits', '123456'],
    ['keeps letters when alphanumeric', 'ab-12', 4, 'alphanumeric', 'ab12'],
  ] as const)('%s', (_, text, length, pattern, after) => {
    expect(OtpField.kept(text, length, pattern)).toBe(after)
  })
})

describe('OtpField.view', () => {
  it('meets the one-time code pattern', () => {
    expect(A11y.validate(Patterns.OtpField, OtpFieldSlots)).toEqual([])
  })

  it('is one named input a phone can fill, over cells hidden from a reader', () => {
    const [input] = Inert.byTag(drawn('12'), 'input')
    expect(Inert.value(input, 'aria-label')).toBe('Sign-in code')
    expect(Inert.value(input, 'autocomplete')).toBe('one-time-code')
    expect(Inert.value(input, 'maxLength')).toBe(6)
    const groups = Inert.all(drawn('12')).filter(
      node => Inert.value(node, 'aria-hidden') === 'true',
    )
    expect(groups.length).toBeGreaterThan(0)
  })

  it('shows each character in its cell and marks the next one', () => {
    const drawnCells = cells('12')
    expect(drawnCells.map(cell => Inert.text(cell))).toEqual(['1', '2', '', '', '', ''])
    expect(drawnCells.map(cell => Inert.value(cell, 'data-next') !== undefined)).toEqual([
      false,
      false,
      true,
      false,
      false,
      false,
    ])
  })

  it('fills the cells it shows, and keeps the caret on the last cell of a full code', () => {
    expect(cells('12').map(cell => Inert.value(cell, 'data-filled'))).toEqual([
      'true',
      'true',
      'false',
      'false',
      'false',
      'false',
    ])
    expect(cells('123456').map(cell => Inert.value(cell, 'data-next') !== undefined)).toEqual([
      false,
      false,
      false,
      false,
      false,
      true,
    ])
  })

  it('asks a phone for its number pad for digits, and a keyboard otherwise', () => {
    const inputMode = (pattern: 'digits' | 'alphanumeric') =>
      Inert.value(
        Inert.byTag(
          OtpField.view({ label: 'Code', value: '', onChange: () => message('Other'), pattern }, h),
          'input',
        )[0],
        'inputmode',
      )
    expect(inputMode('digits')).toBe('numeric')
    expect(inputMode('alphanumeric')).toBe('text')
  })

  it('takes no input while disabled', () => {
    const [input] = Inert.byTag(
      OtpField.view(
        { label: 'Code', value: '', onChange: () => message('Other'), disabled: true },
        h,
      ),
      'input',
    )
    expect(Inert.value(input, 'disabled')).toBe(true)
    expect(input?.data?.on?.['input']).toBeUndefined()
  })

  it('sends what was typed kept to its pattern and length', () => {
    Scene.scene<string, string>(
      {
        update: (_code, code) => ({ model: code }),
        view: (code, h) =>
          h.div(
            [],
            [
              OtpField.view({ label: 'Code', value: code, length: 4, onChange: next => next }, h),
              h.output([], [code]),
            ],
          ),
      },
      Scene.given(''),
      Scene.type(Scene.label('Code'), '1a2-345'),
      Scene.expect(Scene.selector('output')).toHaveText('1234'),
    )
  })

  it('puts a separator between its runs, and refuses runs that miss its length', () => {
    const separators = Inert.all(drawn('', [3, 3])).filter(
      node => Inert.value(node, 'aria-hidden') === 'true' && Inert.children(node).length === 0,
    )
    expect(separators).toHaveLength(1)
    expect(() => drawn('', [3, 2])).toThrow(/do not add up/)
  })
})
