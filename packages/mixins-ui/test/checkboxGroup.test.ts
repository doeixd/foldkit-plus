/**
 * CheckboxGroup as markup and as a transition: a fieldset named by its
 * legend, each option the APG's checkbox named by its label, and what a press
 * leaves checked. What pressing a label does on a page is the browser test.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { CheckboxGroup, CheckboxGroupSlots, Patterns, Recipes } from '../src/index.js'
import { h, message } from './fixture.js'

const style = Style.forSlots(CheckboxGroupSlots)(Recipes.CheckboxGroup({}))
const drawn = () =>
  CheckboxGroup.view(
    {
      id: 'alerts',
      legend: 'Send me',
      options: [
        { value: 'mentions', label: 'Mentions', description: 'When someone names you.' },
        { value: 'digest', label: 'A weekly digest' },
        { value: 'sales', label: 'Offers', disabled: true },
      ],
      checked: ['digest'],
      onToggle: () => message('Clicked'),
      style,
    },
    h,
  )

const options = [
  { value: 'mentions', label: 'Mentions' },
  { value: 'digest', label: 'Digest' },
  { value: 'offers', label: 'Offers', disabled: true },
] as const

describe('CheckboxGroup.toggled', () => {
  it.each([
    ['checks an unchecked one', ['a'], 'b', ['a', 'b']],
    ['unchecks a checked one, keeping the rest in order', ['a', 'b', 'c'], 'b', ['a', 'c']],
  ] as const)('%s', (_, checked, value, after) => {
    expect(CheckboxGroup.toggled<string>(checked, value)).toEqual(after)
  })
})

describe('CheckboxGroup.coverage', () => {
  it.each([
    ['none', [], 'none'],
    ['some', ['mentions'], 'some'],
    ['all, ignoring one that cannot be checked', ['mentions', 'digest', 'offers'], 'all'],
  ] as const)('%s', (_, checked, state) => {
    expect(CheckboxGroup.coverage(options, checked)).toBe(state)
  })

  it('checks every option that can be, or none', () => {
    expect(CheckboxGroup.setEnabled(options, true)).toEqual(['mentions', 'digest'])
    expect(CheckboxGroup.setEnabled(options, false)).toEqual([])
  })
})

describe('CheckboxGroup.view', () => {
  it('meets the checkbox group pattern', () => {
    expect(A11y.validate(Patterns.CheckboxGroup, CheckboxGroupSlots)).toEqual([])
  })

  it('is a fieldset named by its legend, of checkboxes named by their labels', () => {
    const group = drawn()
    expect(group?.sel).toBe('fieldset')
    expect(Inert.text(Inert.byTag(group, 'legend')[0])).toBe('Send me')
    const boxes = Inert.byTag(group, 'button')
    const labels = Inert.byTag(group, 'label')
    expect(boxes.map(box => Inert.value(box, 'role'))).toEqual(['checkbox', 'checkbox', 'checkbox'])
    expect(boxes.map(box => Inert.value(box, 'aria-checked'))).toEqual(['false', 'true', 'false'])
    expect(labels.map(label => Inert.value(label, 'for'))).toEqual(
      boxes.map(box => Inert.value(box, 'id')),
    )
  })

  it('describes an option by its description, and sends nothing from a disabled one', () => {
    const [mentions, , sales] = Inert.byTag(drawn(), 'button')
    const [description] = Inert.byTag(drawn(), 'p')
    expect(Inert.value(mentions, 'aria-describedby')).toBe(Inert.value(description, 'id'))
    expect(mentions?.data?.on?.['click']).toBeTypeOf('function')
    expect(Inert.value(sales, 'aria-disabled')).toBe('true')
    expect(sales?.data?.on?.['click']).toBeUndefined()
  })

  it('names its error and is invalid while one is showing', () => {
    const group = CheckboxGroup.view(
      {
        id: 'alerts',
        legend: 'Send me',
        options: [{ value: 'mentions', label: 'Mentions' }],
        checked: [],
        onToggle: () => message('Clicked'),
        error: 'Pick at least one.',
        style,
      },
      h,
    )
    const [error] = Inert.byTag(group, 'p')
    expect(Inert.text(error)).toBe('Pick at least one.')
    expect(Inert.value(group, 'aria-invalid')).toBe('true')
    expect(Inert.value(group, 'aria-describedby')).toBe(Inert.value(error, 'id'))
  })
})
