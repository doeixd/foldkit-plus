import { describe, expect, it } from 'vitest'
import { Attr, Resolver, Slot, type SlotAttributes } from '../src/index.js'
import { DiagnosticError } from '../src/diagnostics.js'
import { h, type TestMessage } from './resolverFixture.js'

const codeOf = (f: () => unknown): string => {
  try {
    f()
  } catch (error) {
    if (error instanceof DiagnosticError) return error.diagnostic.code
    throw error
  }
  throw new Error('expected resolve to throw')
}

type Write = readonly [string, Attr.AttrToken, SlotAttributes<TestMessage>[number]]

// Each token beside the builder that writes it, so a protected token is
// refused through the attribute the widget really draws.
const written: ReadonlyArray<Write> = [
  ['AriaChecked', Attr.AriaChecked, h.AriaChecked(true)],
  ['AriaLabelledby', Attr.AriaLabelledby, h.AriaLabelledBy('label')],
  ['AriaControls', Attr.AriaControls, h.AriaControls('panel')],
  ['AriaReadonly', Attr.AriaReadonly, h.AriaReadonly(true)],
  ['AriaRequired', Attr.AriaRequired, h.AriaRequired(true)],
  ['AriaCurrent', Attr.AriaCurrent, h.AriaCurrent('page')],
  ['AriaValuenow', Attr.AriaValuenow, h.AriaValuenow(3)],
]

describe('Attr tokens a Slot can protect', () => {
  it.each(written)('refuses Attr.%s on a slot that protects it', (_name, token, attribute) => {
    const { protected: protection } = Slot.make({
      protected: { events: [], attributes: [token], style: [] },
    })
    expect(
      codeOf(() =>
        Resolver.resolve([], [{ attributes: [attribute] }], {
          slot: 'root',
          protected: protection,
        }),
      ),
    ).toBe('mixins:protected-attribute')
    expect(Resolver.resolve([], [{ attributes: [attribute] }])).toHaveLength(1)
  })
})
