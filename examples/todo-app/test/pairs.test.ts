// @vitest-environment jsdom
/**
 * The order of the application's Messages: which pairs of its transitions
 * overlap, which `Transition.commutes` decides, and the walk each other pair
 * has (`pairs.obligations.ts`, which declares and walks them).
 */
import { Verdict } from '@doeixd/metakit'
import * as Pairs from '@doeixd/metakit/pairs'
import * as Temporal from '@doeixd/metakit/temporal'
import { describe, expect, it } from 'vitest'
import { todoMachine } from '../src/surface.js'
import './pairs.obligations.js'

const pairs = Pairs.pairs(todoMachine)
const mine = () => {
  const report = Temporal.registry.report()
  const owned = <T extends { readonly owner: string }>(rows: ReadonlyArray<T>) =>
    rows.filter(({ owner }) => owner === 'todo-app')
  return {
    open: owned(report.open),
    discharged: owned(report.discharged),
    decided: owned(report.decided),
    refuted: owned(report.refuted),
  }
}

describe('the pairs of the todo machine', () => {
  it('lists each overlapping pair once, the declared and the opaque transitions together', () => {
    const tags = Object.keys(todoMachine.transitions)
    expect(pairs.length).toBeGreaterThan(tags.length)
    expect(new Set(pairs.map(({ name }) => name)).size).toBe(pairs.length)
    expect(tags).toContain('UrlChanged')
  })

  it('decides the pairs `commutes` can and asks a walk for every other', () => {
    const decided = pairs.filter(({ verdict }) => Verdict.isTrue(verdict))
    expect(decided.map(({ name, why }) => [name, why])).toEqual([
      [
        'ClearedCompleted/ClearedCompleted',
        'a removeWhere and a removeWhere of "todos": no element can refuse either',
      ],
    ])
    expect(Pairs.owed(todoMachine)).toHaveLength(pairs.length - decided.length)
  })

  it('leaves a toggle and a rename, which edit different fields of a todo, out as disjoint', () => {
    const names = pairs.map(({ name }) => name)
    expect(names).not.toContain('ToggledTodo/RenamedTodo')
    expect(names).toContain('ToggledTodo/ClearedCompleted')
  })

  it('asks a walk of every pair with an opaque step, undecided', () => {
    const opaque = pairs.filter(({ over }) =>
      over.some(tag => tag === 'UrlChanged' || tag === 'MirrorRestored'),
    )
    expect(opaque.length).toBeGreaterThan(0)
    expect(opaque.every(({ verdict }) => !Verdict.isTrue(verdict))).toBe(true)
  })
})

describe('the walks of the todo machine', () => {
  it('discharges every undecided pair and leaves none open', () => {
    const { open, discharged, decided, refuted } = mine()
    expect(open).toEqual([])
    expect(discharged.map(({ obligation }) => obligation.name)).toEqual(
      Pairs.owed(todoMachine).map(({ name }) => name),
    )
    expect(decided.map(({ name }) => name)).toEqual(['ClearedCompleted/ClearedCompleted'])
    expect(refuted).toEqual([])
  })

  it('shows a toggle and a clear of completed todos give another state in one order', () => {
    const found = mine().discharged.find(
      ({ obligation }) => obligation.name === 'ToggledTodo/ClearedCompleted',
    )
    expect(found?.discharge.answer).toBe('order-matters')
    expect(Temporal.WalkResult.$is('Broken')(found!.discharge.result)).toBe(true)
  })

  it('shows two toggles of one todo commute though the rule cannot say so', () => {
    const found = mine().discharged.find(
      ({ obligation }) => obligation.name === 'ToggledTodo/ToggledTodo',
    )
    expect(found?.discharge.answer).toBeUndefined()
    expect(found?.discharge.result).toEqual(Temporal.WalkResult.Held({ seed: 1, runs: 100 }))
  })
})
