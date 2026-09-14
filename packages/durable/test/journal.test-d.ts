/**
 * Compile-time expectations for `Journal.define`. This file is type-checked,
 * not executed; every `@ts-expect-error` must stay an error.
 */
import { Effect } from 'effect'
import { Journal, JournalService, type JournalOptions } from '../src/index.js'

type Equals<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false

interface Operation {
  readonly id: string
}
interface Snapshot {
  readonly ids: ReadonlyArray<string>
}
interface Principal {
  readonly actorId: string
}
interface OtherOperation {
  readonly amount: number
}

const TodoJournal = Journal.define<Operation, Snapshot, Principal>('app/TodoJournal')

declare const options: JournalOptions<Operation, Snapshot, Principal>
declare const otherOptions: JournalOptions<OtherOperation, Snapshot, Principal>

const served = Effect.gen(function* () {
  return yield* TodoJournal.tag
})
type Served = typeof served extends Effect.Effect<infer A, infer _E, infer _R> ? A : never
type Requires = typeof served extends Effect.Effect<infer _A, infer _E, infer R> ? R : never

// The tag yields the journal the definition declares, and requires that same
// journal — so a definition with other type parameters is a different service.
const yields: Equals<Served, Journal<Operation, Snapshot, Principal>> = true
const requires: Equals<Requires, Journal<Operation, Snapshot, Principal>> = true
void yields
void requires

// The layer is fixed by the same parameters, so mismatched options are rejected.
TodoJournal.layer(options)
// @ts-expect-error an operation of another shape does not build this journal
TodoJournal.layer(otherOptions)

// The definition's layer satisfies its own tag.
const provided: Effect.Effect<Journal<Operation, Snapshot, Principal>, unknown> = served.pipe(
  Effect.provide(TodoJournal.layer(options)),
)
void provided

// Why `Journal.define` exists: `JournalService` takes its parameters at the use
// site, so reading the same key back as another journal still compiles.
const unsound = Effect.gen(function* () {
  return yield* JournalService<OtherOperation, Snapshot, Principal>('app/TodoJournal')
})
void unsound
