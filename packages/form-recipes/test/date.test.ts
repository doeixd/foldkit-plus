/**
 * `FieldRecipes.date`: a `CalendarDate` key edited as `YYYY-MM-DD`, through a
 * real form: what a fill shows, what a typed draft submits, the partial and
 * empty drafts, and the display.
 */
import { Option, Schema } from 'effect'
import { Form } from 'foldkit-form'
import { CalendarDate, CalendarDateFromIsoString, make } from 'foldkit/calendar'
import { describe, expect, it } from 'vitest'
import { FieldRecipes } from '../src/index.js'

const recipe = FieldRecipes.date()
const due = (schema: Schema.Top) =>
  Form.make('Task', Form.input(Schema.Struct({ due: schema as typeof CalendarDate })), {
    inputs: { due: recipe.control },
  })

/** The form after typing `draft` into the key and validating it. */
const typed = (form: ReturnType<typeof due>, draft: string) =>
  form.bundle.update(
    form.bundle.update(form.initial, form.Message.Changed({ key: 'due', value: draft }), undefined)
      .model,
    form.Message.ValidatedAll(),
    undefined,
  ).model

const errorOf = (form: ReturnType<typeof due>, draft: string) => {
  const field = form.field(typed(form, draft), 'due')
  return field._tag === 'Invalid' ? field.errors : []
}

describe('FieldRecipes.date', () => {
  it('fills a stored date as the text a date input writes', () => {
    const form = due(CalendarDate)
    expect(form.fill(form.initial, { due: make(2026, 3, 5) }).model.fields.due.value).toBe(
      '2026-03-05',
    )
  })

  it.each([
    ['a date struct', CalendarDate],
    ['a date stored as ISO text', CalendarDateFromIsoString],
  ])('submits what was typed as a CalendarDate, for %s', (_, schema) => {
    const form = due(schema)
    expect(form.engine.value(typed(form, '2026-10-26'))).toEqual({ due: make(2026, 10, 26) })
  })

  it.each(['2026-1', '2026-10-2', '26/10/2026', '10/26/2026', '2026-02-30', '2026-13-01'])(
    'reads %s as no date, and says so',
    draft => expect(errorOf(due(CalendarDate), draft)).toEqual(['Enter a date']),
  )

  it('says a required date left empty is required, and a typed one is not', () => {
    expect(errorOf(due(CalendarDate), '')).toEqual(['Required'])
    expect(errorOf(due(CalendarDate), '2026-02')).toEqual(['Enter a date'])
  })

  it('submits nothing for an optional one left empty', () => {
    const form = due(Schema.OptionFromNullOr(CalendarDate))
    expect(form.engine.value(typed(form, ''))).toEqual({ due: Option.none() })
    expect(form.engine.value(typed(form, '2024-02-29'))).toEqual({
      due: Option.some(make(2024, 2, 29)),
    })
  })

  it('refuses to fill what is not a date, naming the key', () => {
    const form = due(CalendarDate)
    expect(() => form.fill(form.initial, { due: '2026-10-26' as never })).toThrow(
      /"due".*CalendarDate/,
    )
  })

  it('shows every date of a leap year and the years around it back as itself', () => {
    const { parse, format } = recipe.control
    const misread: Array<string> = []
    for (let at = Date.UTC(2023, 0, 1); at < Date.UTC(2026, 0, 1); at += 86_400_000) {
      const day = new Date(at)
      const date = make(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate())
      const text = format!(date, recipe.control.data)
      if (JSON.stringify(parse!(text, recipe.control.data)) !== JSON.stringify(date))
        misread.push(text)
    }
    expect(misread).toEqual([])
  })

  it('reads in a list in the locale it is given', () => {
    expect(recipe.display.text(make(2026, 3, 5), {})).toBe('Mar 5, 2026')
    expect(FieldRecipes.date({ locale: 'de' }).display.text(make(2026, 3, 5), {})).toBe(
      '05.03.2026',
    )
  })
})
