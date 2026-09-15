import { expect } from 'vitest'
import type { Attribute, ChildAttribute } from 'foldkit/html'
import {
  Attributes,
  Diagnostics,
  SlotView,
  type MixinValue,
  type SlotAttributes,
  type StaticMixin,
} from 'foldkit-mixins'

export type TestMessage = { readonly _tag: 'Clicked' } | { readonly _tag: 'Other' }

export type Mixins = ReadonlyArray<
  MixinValue<TestMessage> | MixinValue<never> | StaticMixin<TestMessage>
>

export const h = SlotView.inertBuilder<TestMessage>()

export const message = (tag: TestMessage['_tag']): TestMessage => ({ _tag: tag })

export const tagsOf = <Message>(attributes: SlotAttributes<Message>): ReadonlyArray<string> =>
  attributes.map(attribute => Attributes.tagOf(attribute) ?? 'Child')

export const attributeOf = Attributes.find

export const classValue = <Message>(attributes: SlotAttributes<Message>): string | undefined =>
  Attributes.find(attributes, 'Class')?.value

export const holds = <Message>(
  attributes: SlotAttributes<Message>,
  child: SlotAttributes<Message>[number],
): boolean => attributes.includes(child)

/** Every base child survives resolution in the resolved bundle. */
export const preserves = <Message>(
  base: ReadonlyArray<SlotAttributes<Message>[number]>,
  resolved: SlotAttributes<Message>,
): void => {
  for (const child of base) expect(holds(resolved, child)).toBe(true)
}

export const diagnosticFrom = (run: () => void): Diagnostics.Diagnostic | undefined => {
  try {
    run()
    return undefined
  } catch (error) {
    if (error instanceof Diagnostics.DiagnosticError) return error.diagnostic
    throw error
  }
}

/** A branded value with the shape `childAttributes` produces, without a runtime. */
export const fakeChild = (inner: Attribute<TestMessage> | undefined): ChildAttribute =>
  ({
    __childAttribute: true,
    attribute: inner,
    dispatch: () => {},
    resolveUnmount: () => () => {},
    boundaryMappers: [],
  }) as unknown as ChildAttribute
