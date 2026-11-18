// @vitest-environment jsdom
/** The Field shell: a label naming the control, its mark, a description, errors and orientation. */
import type { Html } from 'foldkit/html'
import { describe, expect, it } from 'vitest'
import { SlotView, Style } from 'foldkit-mixins'
import { Inert } from 'foldkit-mixins/testing'
import { Field, FieldSlots, Recipes } from '../src/index.js'

const h = SlotView.inertBuilder<never>()
const style = Style.forSlots(FieldSlots)(Recipes.Field({}))
const control = h.input([h.Id('email')])
interface Extra {
  readonly required?: boolean
  readonly description?: string
  readonly errors?: ReadonlyArray<string>
  readonly orientation?: 'vertical' | 'horizontal'
  readonly labelAside?: Html
  readonly words?: Partial<Field.FieldWords>
}
const drawn = (extra: Extra = {}) =>
  Field.view({ id: 'email', label: 'Email', control, style, ...extra }, h)
const optional = () =>
  Field.view({ id: 'email', label: 'Email', control, style, optional: true }, h)

describe('Field.view', () => {
  it('names the control through the label, and holds it as drawn', () => {
    const tree = drawn()
    expect(Inert.value(Inert.byTag(tree, 'label')[0], 'for')).toBe('email')
    expect(Inert.byTag(tree, 'input')).toHaveLength(1)
  })

  it('draws a required mark hidden from a reader, or an optional one that is read', () => {
    const marked = (tree: Html) =>
      Inert.byTag(tree, 'span').find(span => Inert.value(span, 'data-kind') !== undefined)
    const required = marked(drawn({ required: true }))
    expect(Inert.text(required!)).toBe('*')
    expect(Inert.value(required!, 'aria-hidden')).toBe('true')
    const optionalMark = marked(optional())
    expect(Inert.text(optionalMark!)).toBe('(optional)')
    expect(Inert.value(optionalMark!, 'aria-hidden')).toBeUndefined()
    expect(marked(drawn())).toBeUndefined()
    expect(Inert.text(marked(drawn({ required: true, words: { required: '!' } }))!)).toBe('!')
  })

  it('says its description and errors under the control, with ids the control can point at', () => {
    const tree = drawn({ description: 'We reply here.', errors: ['Not an address', 'Too long'] })
    expect(Inert.value(Inert.byTag(tree, 'p')[0], 'id')).toBe(Field.descriptionId('email'))
    const [errors] = Inert.byTag(tree, 'ul')
    expect(Inert.value(errors!, 'id')).toBe(Field.errorsId('email'))
    expect(Inert.value(errors!, 'role')).toBe('alert')
    expect(Inert.byTag(errors!, 'li').map(item => Inert.text(item))).toEqual([
      'Not an address',
      'Too long',
    ])
    expect(Inert.byTag(drawn(), 'ul')).toHaveLength(0)
    expect(Inert.byTag(drawn(), 'p')).toHaveLength(0)
  })

  it('links only what is drawn', () => {
    const ids = (shown: { description?: boolean; errors?: boolean }) =>
      Field.describedBy(h, 'email', shown).map(attribute =>
        attribute._tag === 'AriaDescribedBy' ? attribute.value : '',
      )
    expect(ids({})).toEqual([])
    expect(ids({ description: true })).toEqual(['email-description'])
    expect(ids({ description: true, errors: true })).toEqual(['email-description email-errors'])
  })

  it('marks an invalid shell and its orientation, and puts labelAside beside the label', () => {
    const root = (extra: Extra) => drawn(extra)
    expect(Inert.value(root({}), 'data-orientation')).toBe('vertical')
    expect(Inert.value(root({ orientation: 'horizontal' }), 'data-orientation')).toBe('horizontal')
    expect(Inert.value(root({}), 'data-invalid')).toBeUndefined()
    expect(Inert.value(root({ errors: ['No'] }), 'data-invalid')).toBeDefined()
    expect(Inert.text(drawn({ labelAside: h.span([], ['Forgot?']) }))).toContain('Forgot?')
  })
})
