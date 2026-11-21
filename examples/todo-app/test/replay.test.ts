/**
 * The derived `update` (`foldkit-surface/declared`) against the hand-written
 * one it replaced (`handWrittenUpdate.ts`), over long seeded random Message
 * sequences: the same Models, the same no-ops, and the same Commands. Where
 * the hand-written `update` minted a new todo's id and time in a Command, the
 * derived one is supplied them and sends them on in the `SubmittedTodo` fact:
 * the fact carries the supplied values, and the rest of it is the same.
 */
import { Effect, Option } from 'effect'
import { fromString } from 'foldkit/url'
import { Declared } from 'foldkit-surface/declared'
import { describe, expect, it } from 'vitest'
import { initialModel, Message, type Model, todoCommands } from '../src/app.js'
import { App, todoMachine } from '../src/surface.js'
import { handWrittenMachine, makeUpdate } from './handWrittenUpdate.js'

/** A small seeded generator (mulberry32), so a failing sequence reproduces. */
const seeded = (seed: number) => {
  let state = seed >>> 0
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0
    let t = state
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const ids = ['a', 'b', 'c']
const titles = ['Milk', ' Eggs ', '', '  ', 'Tea']
const url = Option.getOrThrow(fromString('http://localhost/todos?filter=active'))

const messageFrom = (random: () => number): Message => {
  const pick = <A>(values: ReadonlyArray<A>): A => values[Math.floor(random() * values.length)]!
  const makers: ReadonlyArray<() => Message> = [
    () =>
      Message.SubmittedTodo({
        id: pick(ids),
        title: pick(titles),
        createdAt: Math.floor(random() * 10),
      }),
    () => Message.ToggledTodo({ id: pick(ids) }),
    () => Message.RenamedTodo({ id: pick(ids), title: pick(titles) }),
    () => Message.PrioritySet({ id: pick(ids), priority: pick(['low', 'normal', 'high']) }),
    () => Message.DeletedTodo({ id: pick(ids) }),
    () =>
      Message.RestoredTodo({
        todo: { id: pick(ids), title: 'Back', completed: false, priority: 'low', createdAt: 3 },
      }),
    () => Message.ClearedCompleted(),
    () => Message.RenamedList({ title: pick(titles) }),
    () => Message.DraftChanged({ value: pick(titles) }),
    () => Message.DraftSubmitted(),
    () =>
      random() < 0.5
        ? Message.RequestedTodo({ title: pick(titles) })
        : Message.RequestedTodo({ title: pick(titles), requestId: `call-${pick(ids)}` }),
    () => Message.FilterSelected({ filter: pick(['all', 'active', 'completed']) }),
    () => Message.EditingStarted({ id: pick(ids) }),
    () => Message.EditDraftChanged({ value: pick(titles) }),
    () => Message.EditingCommitted(),
    () => Message.EditingSubmitted(),
    () => Message.EditingStopped(),
    () => Message.DeleteRequested({ id: pick(ids) }),
    () => Message.UndoRequested(),
    () => Message.UndoExpired({ id: pick(ids) }),
    () => Message.OfflineSet({ offline: random() < 0.5 }),
    () => Message.SyncStatusChanged({ pending: Math.floor(random() * 3), failed: random() < 0.5 }),
    () => Message.CompletedFocus(),
    () => Message.UrlChanged({ url }),
  ]
  return pick(makers)()
}

type Command = { readonly name: string; readonly effect: Effect.Effect<Message> }

/**
 * What a Command does, as far as a test can read it without a DOM or a timer:
 * the Message a fact or a rename sends, and a new todo's fact without the id
 * and time, which the hand-written `update` minted when its Command ran.
 */
const described = (command: Command): unknown => {
  if (command.name !== 'MintTodo' && command.name !== 'foldkit-sync/fact') {
    return command.name === 'Rename'
      ? { name: command.name, sends: Effect.runSync(command.effect) }
      : { name: command.name }
  }
  const sent = Effect.runSync(command.effect)
  if (sent._tag !== 'SubmittedTodo') return { name: 'fact', sends: sent }
  const { id: _id, createdAt: _createdAt, ...rest } = sent
  return { name: 'new todo', sends: rest }
}

describe('the derived update against the hand-written one', () => {
  it('gives the same Models, no-ops and Commands over seeded random Message sequences', () => {
    const handWritten = makeUpdate(handWrittenMachine)
    let clock = 1_000
    let last = Option.none<{ readonly id: string; readonly now: number }>()
    const newTodo = () => {
      const supplied = { id: `todo-${clock}`, now: clock++ }
      last = Option.some(supplied)
      return supplied
    }
    const derived = Declared.of(App, todoMachine, {
      commands: todoCommands,
      supply: { DraftSubmitted: newTodo, RequestedTodo: newTodo },
    })

    let steps = 0
    let submitted = 0
    for (let seed = 1; seed <= 40; seed++) {
      const random = seeded(seed)
      let model: Model = initialModel
      for (let i = 0; i < 250; i++) {
        const message = messageFrom(random)
        const where = `seed ${seed}, step ${i}, ${message._tag}`
        last = Option.none()
        const expected = handWritten(model, message)
        const actual = derived.step(model, message)
        expect(actual.model, where).toEqual(expected.model)
        expect(actual.model === model, where).toBe(expected.model === model)
        const actualCommands = actual.commands ?? []
        expect(actualCommands.map(described), where).toEqual(
          (expected.commands ?? []).map(described),
        )
        // The derived fact carries what this step was supplied.
        for (const command of actualCommands) {
          if (command.name !== 'foldkit-sync/fact') continue
          const sent = Effect.runSync(command.effect)
          if (sent._tag !== 'SubmittedTodo') continue
          submitted++
          expect({ id: sent.id, now: sent.createdAt }, where).toEqual(Option.getOrThrow(last))
        }
        model = actual.model
        steps++
      }
    }
    expect(steps).toBe(10_000)
    // The sequences reach the case the two differ in.
    expect(submitted).toBeGreaterThan(100)
  })
})
