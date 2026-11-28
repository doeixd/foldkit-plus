import { Option, Result, Schema } from 'effect'
import { Eq, Expr, Path, Transition, Verdict } from '@doeixd/metakit'
import * as Machine from '@doeixd/metakit/machine'
import { describe, expect, it } from 'vitest'
import { Can, CanRefusal, initialRemoteModel, storeRowPath } from '../src/index.js'
import { entityKey } from '../src/store.js'

const QuoteRow = Schema.Struct({
  name: Schema.String,
  available: Schema.Boolean,
  price: Schema.Int,
})
type QuoteRow = typeof QuoteRow.Type

describe('Remote storeRowPath & Can.withMachine (Phase 3 Bout 3.6)', () => {
  it('reads a held Remote entity row through storeRowPath inside a metakit expression and transition guard', () => {
    const base = initialRemoteModel
    const populated = {
      ...base,
      entities: {
        [entityKey('Quote', 'acme.com')]: {
          values: { name: 'acme.com', available: true, price: 12 },
          present: new Set(['name', 'available', 'price']),
          stale: new Set<string>(),
          unavailable: new Set<string>(),
          tombstone: false,
          updatedAt: 100,
          oldestAt: 100,
          windows: {},
        },
      },
    }

    const model = { remote: populated, added: false }
    const quotePath = storeRowPath<typeof model, QuoteRow>(
      { dependency: ['remote'] },
      'Quote',
      'acme.com',
    )

    expect(quotePath.segments).toEqual([
      'remote',
      'entities',
      entityKey('Quote', 'acme.com'),
      'values',
    ])
    expect(Option.getOrUndefined(Path.get(quotePath, model))).toEqual({
      name: 'acme.com',
      available: true,
      price: 12,
    })

    // Evaluate a field inside the held row directly through metakit Expr.
    const availablePath = Path.make<typeof model, boolean>([...quotePath.segments, 'available'])
    expect(Expr.evaluate(Eq.is(availablePath, true), model)).toBe(true)

    const AppModel = Schema.Struct({ remote: Schema.Any, added: Schema.Boolean })
    const AddIfAvailable = Transition.make({
      state: AppModel,
      input: Schema.Struct({}),
      when: () => Eq.is(Path.make(['state', ...quotePath.segments, 'available']), true),
      apply: ({ state }) => [Transition.set(state.added, true)],
    })

    const stepped = Transition.step(AddIfAvailable, model, {})
    expect(Result.isSuccess(stepped)).toBe(true)
    if (Result.isSuccess(stepped)) {
      expect(stepped.success.state.added).toBe(true)
    }

    // When the entity row is absent, the guard refuses.
    const emptyModel = { remote: base, added: false }
    expect(Result.isFailure(Transition.step(AddIfAvailable, emptyModel, {}))).toBe(true)
  })

  it('combines Data.can with a metakit Machine guard verdict via Can.withMachine', () => {
    const State = Schema.Struct({ locked: Schema.Boolean })
    const M = Machine.make({
      state: State,
      transitions: {
        Edit: Transition.make({
          state: State,
          input: Schema.Struct({}),
          when: ({ state }) => Eq.is(state.locked, false),
          apply: () => [],
        }),
      },
    })

    const lockedVerdict = Machine.canDispatch(M, 'Edit', { state: { locked: true } })
    const unlockedVerdict = Machine.canDispatch(M, 'Edit', { state: { locked: false } })

    // Allowed by Remote + False in Machine => False(Unmet).
    const refused = Can.withMachine(Verdict.True(), lockedVerdict)
    expect(Verdict.isFalse(refused)).toBe(true)
    if (Verdict.isFalse(refused)) {
      expect(Option.getOrUndefined(refused.witness)).toEqual(CanRefusal.Unmet({}))
    }

    // Allowed by Remote + True in Machine => True.
    expect(Verdict.isTrue(Can.withMachine(Verdict.True(), unlockedVerdict))).toBe(true)

    // Unknown from Remote + False in Machine => False(Unmet) (Machine still refuses).
    expect(Verdict.isFalse(Can.withMachine(Can.undecided(['row not held']), lockedVerdict))).toBe(
      true,
    )

    // Forbidden from Remote stays Forbidden even when Machine is True.
    const forbidden = Verdict.False(
      Option.some(CanRefusal.Forbidden({ reason: Option.some('no role') })),
    )
    expect(Can.withMachine(forbidden, unlockedVerdict)).toBe(forbidden)
  })
})
