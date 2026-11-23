import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Transition } from 'metakit'

describe('Transition.emit reserves the emitted record tag', () => {
  it('refuses a payload field named _tag', () => {
    expect(() => {
      // @ts-expect-error the record's own _tag is its first argument
      Transition.emit('Saved', { _tag: 'Draft' })
    }).toThrow(/reserves the field name "_tag"/)
  })

  it('keeps an ordinary payload, a nested _tag included', () => {
    const emitted = Transition.emit('Saved', { draft: { _tag: 'Draft' } })
    expect(emitted.tag).toBe('Saved')
    expect(emitted.fields.map(([name]) => name)).toEqual(['draft'])
  })

  it('refuses a hand-built emission when the transition is made', () => {
    const legitimate = Transition.emit('Saved', { draft: 1 })
    const forged = {
      ...legitimate,
      fields: [['_tag', legitimate.fields[0]![1]] as const],
    }
    expect(() =>
      Transition.make({
        state: Schema.Struct({}),
        input: Schema.Struct({}),
        apply: () => [],
        // Deliberately hand-built: an adapter assembling fields dynamically reaches make this way.
        emits: () => [forged as never],
      }),
    ).toThrow(/reserves the field name "_tag"/)
  })
})
