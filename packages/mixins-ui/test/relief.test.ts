/**
 * Every control that draws a field's chrome reads the theme's field relief,
 * and every faced button its raised one, so one token set (`Theme.relief`)
 * gives a whole form its depth. The browser test shows how it draws.
 */
import { Style } from 'foldkit-mixins'
import { describe, expect, it } from 'vitest'
import {
  ButtonSlots,
  CascadeSelectSlots,
  CheckboxSlots,
  ComboboxSlots,
  DatePickerSlots,
  InputCopySlots,
  InputSlots,
  ListboxSlots,
  NumberFieldSlots,
  OtpFieldSlots,
  PaginationSlots,
  RadioGroupSlots,
  Recipes,
  SelectSlots,
  TagsInputSlots,
  TextareaSlots,
} from '../src/index.js'

const FIELD = 'var(--fk-shadow-field)'

describe('relief', () => {
  it.each([
    ['Input', Style.forSlots(InputSlots)(Recipes.Input({})).css],
    ['Textarea', Style.forSlots(TextareaSlots)(Recipes.Textarea({})).css],
    ['Select', Style.forSlots(SelectSlots)(Recipes.Select({})).css],
    ['Listbox', Style.forSlots(ListboxSlots)(Recipes.Listbox({})).css],
    ['Combobox', Style.forSlots(ComboboxSlots)(Recipes.Combobox({})).css],
    ['DatePicker', Style.forSlots(DatePickerSlots)(Recipes.DatePicker({})).css],
    ['NumberField', Style.forSlots(NumberFieldSlots)(Recipes.NumberField({})).css],
    ['TagsInput', Style.forSlots(TagsInputSlots)(Recipes.TagsInput({})).css],
    ['OtpField', Style.forSlots(OtpFieldSlots)(Recipes.OtpField({})).css],
    ['CascadeSelect', Style.forSlots(CascadeSelectSlots)(Recipes.CascadeSelect({})).css],
    ['InputCopy', Style.forSlots(InputCopySlots)(Recipes.InputCopy({})).css],
    ['Pagination', Style.forSlots(PaginationSlots)(Recipes.Pagination({})).css],
    ['Checkbox', Style.forSlots(CheckboxSlots)(Recipes.Checkbox({})).css],
    ['RadioGroup', Style.forSlots(RadioGroupSlots)(Recipes.RadioGroup({})).css],
  ])('sinks the field of a %s', (_, css) => {
    expect(css).toContain(`box-shadow:${FIELD}`)
  })

  it.each([
    ['solid', true],
    ['outline', true],
    ['primary', true],
    ['ghost', false],
    ['icon', false],
  ] as const)('raises a %s button: %s', (variant, raised) => {
    const css = Style.forSlots(ButtonSlots)(Recipes.Button({ variant })).css
    expect(css.includes('box-shadow:var(--fk-shadow-raised)')).toBe(raised)
    expect(css.includes('box-shadow:var(--fk-shadow-pressed)')).toBe(raised)
  })
})
