import { describe, expect, it } from 'vitest'
import type { HtmlBuilder } from 'foldkit/html'
import {
  Attr,
  Attributes,
  Behavior,
  Capability,
  Event,
  Mixin,
  SlotView,
  Style,
  type ContributionContext,
} from '../src/index.js'
import { DiagnosticError } from '../src/diagnostics.js'
import { FieldSlots } from './fixture.js'
import { h, mount, type TestMessage } from './resolverFixture.js'

interface FieldInput {
  readonly invalid: boolean
}

const codeOf = (f: () => unknown): string => {
  try {
    f()
  } catch (error) {
    if (error instanceof DiagnosticError) return error.diagnostic.code
    throw error
  }
  throw new Error('expected to throw')
}

const tagOf = Attributes.tagOf

const Validation = Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>(
  {
    input: Behavior.slot({
      requires: { capability: Capability.TextInput, attributes: [Attr.AriaInvalid] },
      attributes: ({
        input,
        h,
      }: {
        readonly input: FieldInput
        readonly h: HtmlBuilder<TestMessage>
      }) => [h.AriaInvalid(input.invalid)],
    }),
  },
  { name: 'Validation' },
)

const context = (invalid: boolean): ContributionContext<TestMessage> => ({
  input: { invalid },
  h,
})

describe('Behavior', () => {
  it('builds attributes from the view input and h', () => {
    const builders = SlotView.buildersFor(FieldSlots, [Validation.mixin], context(true))
    const aria = builders.input.attrs().find(attribute => tagOf(attribute) === 'AriaInvalid')
    expect(aria).toMatchObject({ value: true })
    expect(builders.label.attrs()).toEqual([])
  })

  it('passes the item context through to per-item attributes and the mount', () => {
    const seen: Array<unknown> = []
    const Rows = Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
      input: Behavior.slot({
        attributes: ({ h, item }) =>
          item === undefined
            ? []
            : [h.Tabindex(item.index === 0 ? 0 : -1), h.Id(item.id ?? String(item.index))],
        mount: (_input, item) => {
          seen.push(item)
          return mount('row')
        },
      }),
    })
    const builders = SlotView.buildersFor(FieldSlots, [Rows.mixin], context(false))
    const first = builders.input.attrs([], { index: 0, id: 'a', count: 2 })
    const second = builders.input.attrs([], { index: 1, id: 'b', count: 2 })
    expect(Attributes.find(first, 'Tabindex')?.value).toBe(0)
    expect(Attributes.find(second, 'Tabindex')?.value).toBe(-1)
    expect(Attributes.find(second, 'Id')?.value).toBe('b')
    expect(seen).toEqual([
      { index: 0, id: 'a', count: 2 },
      { index: 1, id: 'b', count: 2 },
    ])
  })

  it('resolves with no item when the view passes none', () => {
    const Rows = Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
      input: Behavior.slot({
        attributes: ({ h, item }) => (item === undefined ? [h.Role('none')] : [h.Role('row')]),
        mount: (_input, item) => mount(item === undefined ? 'bare' : 'item'),
      }),
    })
    const builders = SlotView.buildersFor(FieldSlots, [Rows.mixin], context(false))
    const attributes = builders.input.attrs()
    expect(Attributes.find(attributes, 'Role')?.value).toBe('none')
    expect(Attributes.find(attributes, 'OnMount')).toBeDefined()
  })

  it('contributes nothing for a slot with no attributes or mount', () => {
    const Noop = Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
      root: Behavior.slot({ requires: { capability: Capability.Container } }),
    })
    expect(Noop.mixin.contributions.root).toBeUndefined()
  })

  it('composes with a Style on the same view', () => {
    const FieldStyle = Style.forSlots(FieldSlots)({ input: Style.class('field-input') })
    const builders = SlotView.buildersFor(
      FieldSlots,
      [FieldStyle.mixin, Validation.mixin],
      context(false),
    )
    const attributes = builders.input.attrs()
    expect(attributes.map(tagOf)).toContain('Class')
    expect(attributes.some(attribute => tagOf(attribute) === 'AriaInvalid')).toBe(true)
  })

  it('attaches to a SlotView and renders through the view h', () => {
    const View = SlotView.define(
      FieldSlots,
      (_input: FieldInput, slots, h: HtmlBuilder<TestMessage>) => h.input(slots.input.attrs()),
    ).pipe(Behavior.attach(Validation))
    expect(View({ invalid: true }, h)).toBeDefined()
  })

  it('rejects an unknown slot', () => {
    expect(
      codeOf(() =>
        Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
          missing: Behavior.slot({}),
        } as never),
      ),
    ).toBe('mixins:unknown-slot')
  })

  it('rejects a hidden slot', () => {
    expect(
      codeOf(() =>
        Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
          internals: Behavior.slot({}),
        } as never),
      ),
    ).toBe('mixins:hidden-slot')
  })

  it('rejects a capability the slot does not satisfy', () => {
    expect(
      codeOf(() =>
        Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
          root: Behavior.slot({ requires: { capability: Capability.TextInput } }),
        }),
      ),
    ).toBe('mixins:capability-mismatch')
  })

  it('rejects an event the slot does not publish', () => {
    expect(
      codeOf(() =>
        Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
          input: Behavior.slot({ requires: { events: [Event.Click] } }),
        }),
      ),
    ).toBe('mixins:unsupported-event')
  })

  it('rejects an attribute the slot does not publish', () => {
    expect(
      codeOf(() =>
        Behavior.forSlots(FieldSlots)<FieldInput, TestMessage>({
          input: Behavior.slot({ requires: { attributes: [Attr.Role] } }),
        }),
      ),
    ).toBe('mixins:unsupported-attribute')
  })

  it('composes deferred contributions without evaluating them', () => {
    const merged = Mixin.compose(Validation.mixin)
    const contribution = merged.contributions.input
    expect(typeof contribution).toBe('function')
  })
})
