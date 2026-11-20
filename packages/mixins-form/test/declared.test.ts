/**
 * The renderers for the `CalendarDay` and `Decimal` controls of
 * `foldkit-form/metakit`, and a form drawn from `Declared.of(form)`: the
 * constraints become the inputs' attributes, and a rule over several keys is
 * shown where a key's own errors are.
 */
import { SlotView, Style } from 'foldkit-mixins'
import { InputSlots } from 'foldkit-mixins-ui'
import { Inert, type Node } from 'foldkit-mixins/testing'
import type { Html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { FormView } from '../src/index.js'
import * as UiForm from '../src/ui.js'
import { after, declared, Stay, type StayModel } from './declaredFixture.js'

const byId = (root: Html, id: string): Node | undefined =>
  Inert.all(root).find(node => node.data?.props?.id === id)
const attrs = (node: Node | undefined) => ({ ...node?.data?.props, ...node?.data?.attrs })

const drawn = (model: StayModel, view = FormView.define(Stay)): Html =>
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

  it('takes bounds, step and keypad from the declared constraints, and not otherwise', () => {
    const plain = drawn(Stay.initial)
    for (const id of ['Stay-arrives', 'Stay-deposit']) {
      const node = attrs(byId(plain, id))
      expect([node['min'], node['max'], node['step']]).toEqual([undefined, undefined, undefined])
    }

    const root = drawn(Stay.initial, FormView.define(Stay, { declared }))
    expect(attrs(byId(root, 'Stay-arrives'))).toMatchObject({ type: 'date', min: '2026-01-01' })
    expect(attrs(byId(root, 'Stay-leaves'))).toMatchObject({ type: 'date', max: '2026-12-31' })
    expect(attrs(byId(root, 'Stay-deposit'))).toMatchObject({
      min: '0.01',
      max: '10000.00',
      step: '0.01',
      inputmode: 'decimal',
    })
  })

  it('lets the attrs a caller gives for a key win over the declared ones', () => {
    const view = FormView.fields(Stay, {
      declared,
      attrs: { deposit: { max: '500.00', inputMode: 'numeric' } },
    }).view
    const deposit = attrs(byId(drawn(Stay.initial, view), 'Stay-deposit'))
    expect(deposit).toMatchObject({
      min: '0.01',
      max: '500.00',
      step: '0.01',
      inputmode: 'numeric',
    })
  })

  it('is drawn under the Input component’s Slot by UiForm.renderers', () => {
    const view = FormView.define(Stay, {
      declared,
      renderers: UiForm.renderers<typeof Stay.Message.Type>({
        input: Style.forSlots(InputSlots)({ input: Style.class('ui-input') }),
      }),
    })
    const root = drawn(Stay.initial, view)
    for (const [id, type] of [
      ['Stay-arrives', 'date'],
      ['Stay-deposit', 'text'],
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

  it('is replaced by a renderer the caller passes under the kind', () => {
    const view = FormView.define(Stay, {
      renderers: { CalendarDay: ({ h, state }) => h.span(state, ['own']) },
    })
    expect(byId(drawn(Stay.initial, view), 'Stay-arrives')?.sel).toBe('span')
  })
})

describe('A rule over several keys beside its keys', () => {
  const errorOf = (root: Html, key: string) => {
    const node = byId(root, `Stay-${key}-error`)
    return node === undefined ? undefined : Inert.text(node)
  }

  it('shows nothing for the rule when the form is read through its own field', () => {
    const root = drawn(clash)
    expect(errorOf(root, 'leaves')).toBeUndefined()
    expect(attrs(byId(root, 'Stay-leaves'))).toMatchObject({ 'aria-invalid': 'false' })
  })

  it('shows its message beside each key it reads, with the key marked invalid and described by it', () => {
    const root = drawn(clash, FormView.define(Stay, { declared }))
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
    const root = drawn(fixed, FormView.define(Stay, { declared }))
    expect(errorOf(root, 'leaves')).toBeUndefined()
    expect(attrs(byId(root, 'Stay-leaves'))).toMatchObject({ 'aria-invalid': 'false' })
  })

  it('reaches the whole-form view, which FormView.fields draws', () => {
    const view = FormView.fields(Stay, { declared }).view
    expect(errorOf(drawn(clash, view), 'arrives')).toBe('Leave after you arrive')
  })

  it('reaches a single key drawn in a layout of the caller’s own', () => {
    const fields = FormView.fields(Stay, { declared })
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
