/**
 * Test fixtures for the resolver. `h` is the inert builder typed for a real
 * Message universe, so event attributes can be constructed without a live
 * Foldkit runtime. See docs/design/mixins-DESIGN.md.
 */
import { Stream } from 'effect'
import type { Attribute, ChildAttribute } from 'foldkit/html'
import type { MountAction } from 'foldkit/mount'
import { SlotView } from '../src/index.js'

export type TestMessage = { readonly _tag: 'Clicked' } | { readonly _tag: 'Other' }

export const h = SlotView.inertBuilder<TestMessage>()

export const mount = (name: string): MountAction<TestMessage> => ({
  name,
  f: () => Stream.empty,
})

/** A branded value with the shape `childAttributes` produces, without a runtime. */
export const fakeChild = (inner: Attribute<TestMessage> | undefined): ChildAttribute =>
  ({
    __childAttribute: true,
    attribute: inner,
    dispatch: () => {},
    resolveUnmount: () => () => {},
    boundaryMappers: [],
  }) as unknown as ChildAttribute
