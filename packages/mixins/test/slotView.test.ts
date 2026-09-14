import { describe, expect, it } from 'vitest'
import type { HtmlBuilder } from 'foldkit/html'
import { Attributes, Mixin, SlotView, type SlotAttributes } from '../src/index.js'
import { DiagnosticError } from '../src/diagnostics.js'
import { FieldSlots } from './fixture.js'
import { h, type TestMessage } from './resolverFixture.js'

interface FieldInput {
  readonly label: string
}

const FieldView = SlotView.define(
  FieldSlots,
  (input: FieldInput, slots, h: HtmlBuilder<TestMessage>) =>
    h.div(slots.root.attrs(), [
      h.span(slots.label.attrs(), [input.label]),
      h.input(slots.input.attrs()),
    ]),
  { name: 'Field' },
)

const classValue = (attributes: SlotAttributes<TestMessage>): string | undefined =>
  Attributes.find(attributes, 'Class')?.value

const hasTag = (attributes: SlotAttributes<TestMessage>, tag: Attributes.Tag): boolean =>
  Attributes.find(attributes, tag) !== undefined

const vnodeData = (value: unknown): Record<string, unknown> =>
  (value as { readonly data?: Record<string, unknown> }).data ?? {}

const context = { input: { label: 'x' }, h }

describe('SlotView', () => {
  it('folds a Mixin into the addressed slot only', () => {
    const Decoration = Mixin.make<TestMessage>('Decoration', {
      root: { classes: ['field'] },
      input: { classes: ['field-input'] },
    })
    const builders = SlotView.buildersFor(FieldSlots, [Decoration], context)
    expect(classValue(builders.root.attrs())).toBe('field')
    expect(classValue(builders.input.attrs())).toBe('field-input')
    expect(classValue(builders.label.attrs())).toBeUndefined()
  })

  it('extends base attributes rather than replacing them', () => {
    const Decoration = Mixin.make<TestMessage>('Decoration', { root: { classes: ['field'] } })
    const builders = SlotView.buildersFor(FieldSlots, [Decoration], context)
    const attributes = builders.root.attrs([h.Class('base'), h.Role('group')])
    expect(classValue(attributes)).toBe('base field')
    expect(hasTag(attributes, 'Role')).toBe(true)
  })

  it('merges multiple attachments in order', () => {
    const A = Mixin.make<TestMessage>('A', { root: { classes: ['a'] } })
    const B = Mixin.make<TestMessage>('B', { root: { classes: ['b'] } })
    const builders = SlotView.buildersFor(FieldSlots, [A, B], context)
    expect(classValue(builders.root.attrs())).toBe('a b')
  })

  it('attach returns a new view without mutating the original', () => {
    const Decoration = Mixin.make<TestMessage>('Decoration', { root: { classes: ['field'] } })
    const styled = FieldView.pipe(SlotView.attach(Decoration))
    expect(FieldView.mixins).toHaveLength(0)
    expect(styled.mixins).toHaveLength(1)
    expect(styled).not.toBe(FieldView)
    expect(styled.name).toBe('Field')
  })

  it('renders the attached class into ordinary Foldkit markup', () => {
    const Decoration = Mixin.make<TestMessage>('Decoration', { root: { classes: ['field'] } })
    const html = FieldView.pipe(SlotView.attach(Decoration))({ label: 'Name' }, h)
    expect(vnodeData(html).class).toMatchObject({ field: true })
  })

  it('forMessages defines a view that renders and attaches like define', () => {
    const Decoration = Mixin.make<TestMessage>('Decoration', { root: { classes: ['field'] } })
    const view = SlotView.forMessages<TestMessage>()
      .define(
        FieldSlots,
        (input: FieldInput, slots, h) => h.div(slots.root.attrs(), [input.label]),
        { name: 'Curried' },
      )
      .pipe(SlotView.attach(Decoration))
    expect(view.name).toBe('Curried')
    expect(vnodeData(view({ label: 'Name' }, h)).class).toMatchObject({ field: true })
  })

  it('throws when an attached Mixin conflicts with the view base', () => {
    const Steal = Mixin.make<TestMessage>('Steal', {
      input: { attributes: [h.OnClick({ _tag: 'Clicked' })] },
    })
    const View = SlotView.define(
      FieldSlots,
      (_input: FieldInput, slots, h: HtmlBuilder<TestMessage>) =>
        h.input(slots.input.attrs([h.OnClick({ _tag: 'Other' })])),
    ).pipe(SlotView.attach(Steal))
    expect(() => View({ label: 'x' }, h)).toThrow(DiagnosticError)
  })
})
