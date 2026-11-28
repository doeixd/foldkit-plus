/**
 * Two replicas of the todo list's durable subset, in both orders, against the
 * real journal: what `convergence` reads from the declaration, and the walks
 * that discharge it (`sync.obligations.ts` declares and runs them).
 */
import * as Temporal from '@doeixd/metakit/temporal'
import { describe, expect, it } from 'vitest'
import { read } from './sync.obligations.js'

const mine = () => {
  const report = Temporal.registry.report()
  const owned = <T extends { readonly owner: string }>(rows: ReadonlyArray<T>) =>
    rows.filter(({ owner }) => owner === 'todo-app/sync')
  return {
    open: owned(report.open),
    discharged: owned(report.discharged),
    decided: owned(report.decided),
    refuted: owned(report.refuted),
  }
}

const possible = read.pairs.filter(({ rebase }) => rebase === 'possible')
const never = read.pairs.filter(({ rebase }) => rebase === 'never')

describe('what a rebase can change in the todo list', () => {
  it('reads every durable Message the contract declares', () => {
    expect(read.redelivery.map(({ tag }) => tag).sort()).toEqual([
      'ClearedCompleted',
      'DeletedTodo',
      'PrioritySet',
      'RenamedList',
      'RenamedTodo',
      'RestoredTodo',
      'SubmittedTodo',
      'ToggledTodo',
    ])
  })

  it('says a rebase never changes what two clears showed, with the rule that decides it', () => {
    expect(never.map(({ name, why }) => [name, why])).toEqual([
      [
        'ClearedCompleted/ClearedCompleted',
        'a removeWhere and a removeWhere of "todos": no element can refuse either',
      ],
    ])
  })

  it('says a rebase possibly changes what the other pairs showed, and why the rule cannot say', () => {
    expect(possible.length).toBeGreaterThan(20)
    expect(possible.every(({ why }) => why.length > 0)).toBe(true)
    expect(possible.map(({ name }) => name)).toContain('ToggledTodo/ClearedCompleted')
    expect(possible.map(({ name }) => name)).toContain('RenamedList/RenamedList')
  })

  it('says a copy of a Message that only sets, inserts, removes or patches from the input is harmless, and a toggle’s is removed by its id', () => {
    const copies = Object.fromEntries(read.redelivery.map(({ tag, copy }) => [tag, copy]))
    expect(copies).toEqual({
      SubmittedTodo: 'harmless',
      RestoredTodo: 'harmless',
      ToggledTodo: 'removed by id',
      RenamedTodo: 'harmless',
      PrioritySet: 'harmless',
      DeletedTodo: 'harmless',
      ClearedCompleted: 'harmless',
      RenamedList: 'harmless',
    })
  })
})

describe('the walks of two replicas of the todo list', () => {
  it('discharges every pair that may rebase and every copy, and leaves none open', () => {
    const { open, discharged } = mine()
    expect(open).toEqual([])
    expect(discharged.map(({ obligation }) => obligation.name).sort()).toEqual(
      [
        ...possible.map(({ name }) => `rebase ${name}`),
        ...read.redelivery.map(({ tag }) => `redelivery ${tag}`),
      ].sort(),
    )
  })

  it('has every replica converge in every order walked', () => {
    for (const { obligation, discharge } of mine().discharged) {
      expect([obligation.name, discharge.result._tag]).toEqual([obligation.name, 'Held'])
    }
  })

  it('checks the pair that never rebases by its walk, and finds no order that changes the document', () => {
    const { decided, refuted } = mine()
    expect(decided.map(({ name }) => name)).toEqual(['rebase ClearedCompleted/ClearedCompleted'])
    expect(refuted).toEqual([])
    expect(
      decided.every(({ checked }) => checked._tag === 'Some' && checked.value._tag === 'Held'),
    ).toBe(true)
  })

  it('finds the order matters for these pairs, and the replicas converge on it', () => {
    const matters = mine()
      .discharged.filter(({ discharge }) => discharge.answer === 'order-matters')
      .map(({ obligation }) => obligation.name)
    expect(matters.sort()).toEqual(
      [
        'SubmittedTodo/SubmittedTodo',
        'SubmittedTodo/RestoredTodo',
        'SubmittedTodo/ToggledTodo',
        'SubmittedTodo/RenamedTodo',
        'SubmittedTodo/PrioritySet',
        'SubmittedTodo/DeletedTodo',
        'SubmittedTodo/ClearedCompleted',
        'RestoredTodo/RestoredTodo',
        'RestoredTodo/ToggledTodo',
        'RestoredTodo/RenamedTodo',
        'RestoredTodo/PrioritySet',
        'RestoredTodo/DeletedTodo',
        'RestoredTodo/ClearedCompleted',
        'ToggledTodo/ClearedCompleted',
        'RenamedTodo/RenamedTodo',
        'PrioritySet/PrioritySet',
        'RenamedList/RenamedList',
      ]
        .map(pair => `rebase ${pair}`)
        .sort(),
    )
  })

  it('finds no order that changes the document for these pairs the rule cannot prove commute', () => {
    const plain = mine()
      .discharged.filter(
        ({ obligation, discharge }) =>
          obligation.name.startsWith('rebase ') && discharge.answer === undefined,
      )
      .map(({ obligation }) => obligation.name)
    expect(plain.sort()).toEqual(
      [
        'ToggledTodo/ToggledTodo',
        'ToggledTodo/DeletedTodo',
        'RenamedTodo/DeletedTodo',
        'RenamedTodo/ClearedCompleted',
        'PrioritySet/DeletedTodo',
        'PrioritySet/ClearedCompleted',
        'DeletedTodo/DeletedTodo',
        'DeletedTodo/ClearedCompleted',
      ]
        .map(pair => `rebase ${pair}`)
        .sort(),
    )
  })

  it('lists each overlapping pair once, as never or possible', () => {
    expect(new Set(read.pairs.map(({ name }) => name)).size).toBe(read.pairs.length)
    expect(read.pairs.length).toBe(possible.length + never.length)
  })
})
