/**
 * The durable Messages replay as `todoMachine`'s transitions (`fromMachine` in
 * `src/sync.ts`): the replica and the mount hold the machine's footprints and
 * take its live step, and a rename the transition refuses never becomes a
 * durable Message.
 */
import { Effect, Option } from 'effect'
import { afterEach, describe, expect, it } from 'vitest'
import { initialModel, Message } from '../src/app.js'
import { declared, todoMachine } from '../src/surface.js'
import { contract, footprints, liveModel } from '../src/sync.js'
import { closeStorages, openReplica } from './helpers.js'

afterEach(closeStorages)

describe('the durable transitions', () => {
  it('declare a footprint for every durable Message, from the machine', () => {
    const present = Option.getOrThrow(Option.fromUndefinedOr(footprints))
    expect(Object.keys(present).sort()).toEqual([...contract.messages].sort())
    for (const [tag, expected] of Object.entries(todoMachine.footprints)) {
      if (contract.messages.includes(tag))
        expect(present[tag]?.writes, tag).toEqual(expected.writes)
    }
  })

  it('give the live Model for a durable Message, and none for a local one', () => {
    const added = Option.getOrThrow(
      liveModel(initialModel, Message.SubmittedTodo({ id: 'a', title: 'Milk', createdAt: 1 })),
    )
    expect(added.todos.map(todo => todo.title)).toEqual(['Milk'])
    // Refused by its guard: the Model it was given.
    expect(Option.getOrThrow(liveModel(added, Message.RenamedList({ title: '  ' })))).toBe(added)
    expect(liveModel(added, Message.DraftChanged({ value: 'x' }))).toEqual(Option.none())
  })

  it('refuse a blank list title at submit, as the transition does', async () => {
    const replica = await openReplica('blank')
    try {
      const error = await Effect.runPromise(
        Effect.flip(replica.submit(Message.RenamedList({ title: '  ' }))),
      )
      expect(error._tag).toBe('ReplayError')
      expect(Effect.runSync(replica.pending)).toEqual([])
    } finally {
      await Effect.runPromise(replica.close)
    }
  })

  it('are sent for a rename the guard accepts, and not for one it refuses', () => {
    const sent = (title: string) =>
      (declared.step(initialModel, Message.ListRenameRequested({ title })).commands ?? []).map(
        command => Effect.runSync(command.effect),
      )
    expect(sent('  Groceries ')).toEqual([Message.RenamedList({ title: 'Groceries' })])
    expect(sent('  ')).toEqual([])
    expect(declared.step(initialModel, Message.ListRenameRequested({ title: '' })).model).toBe(
      initialModel,
    )
  })
})
