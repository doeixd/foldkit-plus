/**
 * Segmented as a transition and as markup: what a press leaves pressed, one
 * at a time or several, and the pressed buttons the view draws for it.
 */
import { describe, expect, it } from 'vitest'
import { A11y, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Patterns, Recipes, Segmented, SegmentedSlots } from '../src/index.js'
import { h, message } from './fixture.js'

describe('Segmented.toggled', () => {
  it.each([
    ['moves a single choice', ['day'], 'week', {}, ['week']],
    ['keeps a single choice pressed when it is pressed again', ['day'], 'day', {}, ['day']],
    ['lets an optional one go', ['day'], 'day', { optional: true }, []],
    ['adds to several', ['bold'], 'italic', { multiple: true }, ['bold', 'italic']],
    ['takes one of several away', ['bold', 'italic'], 'bold', { multiple: true }, ['italic']],
  ] as const)('%s', (_, pressed, value, options, after) => {
    expect(Segmented.toggled<string>(pressed, value, options)).toEqual(after)
  })
})

describe('Segmented.view', () => {
  const style = Style.forSlots(SegmentedSlots)(Recipes.Segmented({}))
  const drawn = () =>
    Segmented.view(
      {
        label: 'Text style',
        options: [
          { value: 'bold', label: 'Bold' },
          { value: 'italic', label: 'Italic' },
          { value: 'strike', label: 'Strike', disabled: true },
        ],
        pressed: ['bold', 'italic'],
        onPress: () => message('Clicked'),
        style,
      },
      h,
    )

  it('meets the segmented pattern', () => {
    expect(A11y.validate(Patterns.Segmented, SegmentedSlots)).toEqual([])
  })

  it('draws a named group of pressed buttons, several on at once', () => {
    const group = drawn()
    expect(Inert.value(group, 'role')).toBe('group')
    expect(Inert.value(group, 'aria-label')).toBe('Text style')
    const buttons = Inert.byTag(group, 'button')
    expect(buttons.map(button => Inert.value(button, 'aria-pressed'))).toEqual([
      'true',
      'true',
      'false',
    ])
    expect(buttons.map(button => Inert.value(button, 'data-label'))).toEqual([
      'Bold',
      'Italic',
      'Strike',
    ])
  })

  it('sends a press from an enabled option and none from a disabled one', () => {
    const [bold, , strike] = Inert.byTag(drawn(), 'button')
    expect(bold?.data?.on?.['click']).toBeTypeOf('function')
    expect(Inert.value(strike, 'disabled')).toBeDefined()
    expect(strike?.data?.on?.['click']).toBeUndefined()
  })
})
