/**
 * A slot named like an `Object.prototype` member that the base bundles leave
 * out resolves to no attributes: `pnpm mutate packages/mixins-ui/test/protoKey.mutations.ts`.
 */
import { describe, expect, it } from 'vitest'
import { Capability, Slot, Slots } from 'foldkit-mixins'
import { resolve as resolveUi } from '../src/index.js'
import { h } from './fixture.js'

const keys: ReadonlyArray<string> = ['__proto__', 'constructor', 'toString']

describe.each(keys)('a slot named %s', key => {
  it('resolves to no attributes when the base leaves it out', () => {
    const slots = Slots.define({ [key]: Slot.make({ capability: Capability.Container }) })
    const resolved: Readonly<Record<string, unknown>> = resolveUi(slots, [], {
      input: undefined,
      h,
    })({})
    expect(Object.hasOwn(resolved, key)).toBe(true)
    expect(resolved[key]).toEqual([])
  })
})
