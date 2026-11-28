/**
 * `foldkit-mixins-form/declared`: a form drawn from `Declared.of(form)`. The
 * constraints become the inputs' attributes, the `CalendarDay` and `Decimal`
 * controls of `foldkit-form/metakit` are drawn as a date input and an amount
 * input, and a rule over several keys is shown where a key's own errors are.
 * The form view itself knows none of it.
 */
import { Option, Schema } from 'effect'
import { Form } from 'foldkit-form'
import { SlotView, Style } from 'foldkit-mixins'
import { InputSlots } from 'foldkit-mixins-ui'
import { Inert, type Node } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { DeclaredView } from '../src/declared.js'
import { FormView } from '../src/index.js'
import * as UiForm from '../src/ui.js'
import { after, declared, stay, Stay, type StayModel } from './declaredFixture.js'

const byId = (root: Html, id: string): Node | undefined =>
  Inert.all(root).find(node => node.data?.props?.id === id)
const attrs = (node: Node | undefined) => ({ ...node?.data?.props, ...node?.data?.attrs })

const whole = FormView.fields(stay.form, stay.options).view
const drawn = (model: StayModel, view = whole): Html =>
  view({ model, errors: [], canSubmit: true }, SlotView.inertBuilder())

const clash = after(
  Stay.Message.Changed({ key: 'arrives', value: '2026-03-05' }),
  Stay.Message.Changed({ key: 'leaves', value: '2026-03-01' }),
)

describe('The renderers of the declared controls', () => {
  it('draws a CalendarDay key as a date input holding its draft', () => {
    const root = drawn(after(Stay.Message.Changed({ key: 'arrives', value: '2026-03-05' })))
    const arrives = byId(root, 'Stay-arrives')
    expect(arrives?.sel).toBe('input')
    expect(attrs(arrives)).toMatchObject({ type: 'date', value: '2026-03-05' })
  })

  it('draws a Money key as a text input with the decimal keypad', () => {
    const deposit = byId(drawn(Stay.initial), 'Stay-deposit')
    expect(deposit?.sel).toBe('input')
    expect(attrs(deposit)).toMatchObject({ type: 'text', inputmode: 'decimal' })
  })

  it('takes bounds, step and keypad from the declared constraints', () => {
    const root = drawn(Stay.initial)
    expect(attrs(byId(root, 'Stay-arrives'))).toMatchObject({ type: 'date', min: '2026-01-01' })
    expect(attrs(byId(root, 'Stay-leaves'))).toMatchObject({ type: 'date', max: '2026-12-31' })
    expect(attrs(byId(root, 'Stay-deposit'))).toMatchObject({
      min: '0.01',
      max: '10000.00',
      step: '0.01',
      inputmode: 'decimal',
    })
    // A side the declaration leaves open is not written.
    expect(attrs(byId(root, 'Stay-arrives'))['max']).toBeUndefined()
  })

  it('lets the attrs a caller gives for a key win over the declared ones', () => {
    const own = DeclaredView.of(Stay, declared, {
      attrs: { deposit: { max: '500.00', inputMode: 'numeric' }, note: { placeholder: 'Any' } },
    })
    const root = drawn(Stay.initial, FormView.fields(own.form, own.options).view)
    expect(attrs(byId(root, 'Stay-deposit'))).toMatchObject({
      min: '0.01',
      max: '500.00',
      step: '0.01',
      inputmode: 'numeric',
    })
    // A key with nothing declared keeps what the caller gave it.
    expect(attrs(byId(root, 'Stay-note'))).toMatchObject({ placeholder: 'Any' })
  })

  it('draws a number key with its declared bounds, on the text input a number is', () => {
    const Party = Form.make(
      'Party',
      Form.input(
        Schema.Struct({
          guests: Schema.Int.check(Schema.isGreaterThan(0), Schema.isLessThan(11)),
          host: Schema.String,
        }),
      ),
    )
    const party = DeclaredView.of(
      Party,
      {
        field: Party.field,
        // Nothing is declared of `host`.
        constraints: {
          guests: {
            attributes: {
              inputMode: Option.some('numeric'),
              min: Option.some('1'),
              max: Option.some('10'),
              step: Option.some('1'),
            },
          },
        },
      },
      { attrs: { host: { placeholder: 'Who invites' } } },
    )
    const view = FormView.fields(party.form, party.options).view
    const root = view(
      { model: Party.initial, errors: [], canSubmit: true },
      SlotView.inertBuilder(),
    )
    expect(attrs(byId(root, 'Party-guests'))).toMatchObject({
      type: 'text',
      inputmode: 'numeric',
      min: '1',
      max: '10',
      step: '1',
    })
    expect(attrs(byId(root, 'Party-host'))).toMatchObject({ placeholder: 'Who invites' })
    // The plain form view writes none of them.
    const plain = FormView.define(Party)(
      { model: Party.initial, errors: [], canSubmit: true },
      SlotView.inertBuilder(),
    )
    const bare = attrs(byId(plain, 'Party-guests'))
    expect([bare['min'], bare['max'], bare['step']]).toEqual([undefined, undefined, undefined])
  })

  it('is drawn under the Input component’s Slot over UiForm.renderers', () => {
    const ui = DeclaredView.of(Stay, declared, {
      renderers: UiForm.renderers<typeof Stay.Message.Type>({
        input: Style.forSlots(InputSlots)({ input: Style.class('ui-input') }),
      }),
    })
    const root = drawn(Stay.initial, FormView.fields(ui.form, ui.options).view)
    for (const [id, type] of [
      ['Stay-arrives', 'date'],
      ['Stay-deposit', 'text'],
      // A kind the declarations do not touch is drawn by the renderers given too.
      ['Stay-note', 'text'],
    ] as const) {
      const node = byId(root, id)
      expect([node?.sel, attrs(node)['type'], Inert.classes(node)]).toEqual([
        'input',
        type,
        ['ui-input'],
      ])
    }
    expect(attrs(byId(root, 'Stay-arrives'))['min']).toBe('2026-01-01')
  })

  it('refuses renderers that have no Text or Number to draw with', () => {
    expect(() => DeclaredView.of(Stay, declared, { renderers: {} })).toThrow(
      'DeclaredView: the renderers it is given have no "Text" to draw with',
    )
  })

  it('leaves the declared kinds without a renderer in a form view not given them', () => {
    expect(() => drawn(Stay.initial, FormView.define(Stay))).toThrow()
  })
})

describe('A rule over several keys beside its keys', () => {
  const errorOf = (root: Html, key: string) => {
    const node = byId(root, `Stay-${key}-error`)
    return node === undefined ? undefined : Inert.text(node)
  }

  it('shows nothing for the rule when the form is read through its own field', () => {
    const own = FormView.fields(Stay, stay.options).view
    const root = drawn(clash, own)
    expect(errorOf(root, 'leaves')).toBeUndefined()
    expect(attrs(byId(root, 'Stay-leaves'))).toMatchObject({ 'aria-invalid': 'false' })
  })

  it('shows its message beside each key it reads, with the key marked invalid and described by it', () => {
    const root = drawn(clash)
    for (const key of ['arrives', 'leaves']) {
      expect(errorOf(root, key)).toBe('Leave after you arrive')
      expect(attrs(byId(root, `Stay-${key}`))).toMatchObject({
        'aria-invalid': 'true',
        'aria-describedby': `Stay-${key}-error`,
      })
    }
    // A key the rule does not read is left alone.
    expect(errorOf(root, 'note')).toBeUndefined()
    expect(attrs(byId(root, 'Stay-note'))).toMatchObject({ 'aria-invalid': 'false' })
  })

  it('goes once the values satisfy the rule', () => {
    const fixed = after(
      Stay.Message.Changed({ key: 'arrives', value: '2026-03-05' }),
      Stay.Message.Changed({ key: 'leaves', value: '2026-03-09' }),
    )
    const root = drawn(fixed)
    expect(errorOf(root, 'leaves')).toBeUndefined()
    expect(attrs(byId(root, 'Stay-leaves'))).toMatchObject({ 'aria-invalid': 'false' })
  })

  it('reaches the whole-form view of FormView.define, given the field view', () => {
    const view = FormView.define(stay.form, { field: FormView.field(stay.form, stay.options) })
    expect(errorOf(drawn(clash, view), 'arrives')).toBe('Leave after you arrive')
  })

  it('reaches a single key drawn in a layout of the caller’s own', () => {
    const fields = FormView.fields(stay.form, stay.options)
    const control = Stay.controls.find(each => each.key === 'leaves')!
    const html = fields.field(
      control,
      clash,
      'Stay-leaves',
      SlotView.inertBuilder<typeof Stay.Message.Type>(),
    )
    expect(Inert.text(byId(html, 'Stay-leaves-error')!)).toBe('Leave after you arrive')
  })
})
