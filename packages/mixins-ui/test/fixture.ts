import { expect } from 'vitest'
import type { Attribute, ChildAttribute, Html, HtmlBuilder } from 'foldkit/html'
import { Scene } from 'foldkit/test'
import {
  Attributes,
  Diagnostics,
  SlotView,
  type MixinValue,
  type SlotAttributes,
  type StaticMixin,
} from 'foldkit-mixins'
import type { Standard, Values } from 'foldkit-mixins/theme'

/**
 * The knobs at which the scales are their nominal sizes: 36px rungs, 6px
 * corners, durations as written, full shadows. A test of a mechanism measured
 * at them pins these, so the default theme's look (#255) does not move it.
 */
export const unitKnobs = {
  shape: { density: 1, radius: 1 },
  motion: { scale: 1 },
  shadow: { strength: 100 },
} as const satisfies Values<Standard>

export type TestMessage = { readonly _tag: 'Clicked' } | { readonly _tag: 'Other' }

export type Mixins = ReadonlyArray<
  MixinValue<TestMessage> | MixinValue<never> | StaticMixin<TestMessage>
>

export const h = SlotView.inertBuilder<TestMessage>()

type SceneStep<Message> = Parameters<typeof Scene.scene<0, Message, Message>>[1]

/**
 * A Scene over a stateless view: each Message it sends comes back as the
 * OutMessage, so `Scene.expectOutMessage` says what an interaction sent.
 */
export const sends = <Message>(
  view: (h: HtmlBuilder<Message>) => Html,
  ...steps: Array<SceneStep<Message>>
): void =>
  Scene.scene<0, Message, Message>(
    { update: (model, message) => ({ model, outMessage: message }), view: (_, h) => view(h) },
    Scene.given(0),
    ...steps,
  )

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
