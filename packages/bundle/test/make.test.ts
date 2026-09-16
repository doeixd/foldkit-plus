import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { describe, expect, it } from 'vitest'
import { Bundle } from '../src/index.js'

describe('Bundle.make(name, spec)', () => {
  it('names the bundle and keeps the spec', () => {
    const Message = defineMessageUnion({ Toggled: {} })
    const Toggle = Bundle.make('Toggle', {
      Model: Schema.Struct({ on: Schema.Boolean }),
      Message,
      init: () => ({ model: { on: false } }),
      update: model => ({ model: { on: !model.on } }),
    })
    expect(Toggle.name).toBe('Toggle')
    expect(Toggle.update({ on: false }, Message.Toggled(), undefined)).toEqual({
      model: { on: true },
    })
    expect(Bundle.isBundle(Toggle)).toBe(true)
  })
})
