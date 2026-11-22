/**
 * What a store guarantees of concurrent writes, and what a rule needs of it
 * (`metakit/store`).
 *
 * A proof of one step assumes the store runs concurrent writers a certain
 * way. A store or adapter declares what it gives (`StoreCapabilities`), each
 * rule needs a `Capability` (`metakit/temporal`'s `requirements` reads them
 * off a machine and its aggregates), and `mount` throws where a store is set
 * up to hold a rule it cannot. This module imports no expression code, so a
 * server that only checks its stores carries nothing else of metakit.
 */
import { Data } from 'effect'

/**
 * How a store runs concurrent writes. `serializable`: as if one at a time.
 * `read-committed`: each statement reads what has committed, so two writers
 * can each read a value the other is about to change. `eventual`: replicas
 * accept writes apart and merge them later.
 */
export type Isolation = 'eventual' | 'read-committed' | 'serializable'

/**
 * How far a store's isolation reaches. `transaction`: a transaction that
 * reads, then writes in a later round trip, is isolated as a whole (SQLite
 * through one connection, Postgres, a step in memory). `statement`: one
 * statement, or one batch, which cannot branch on what it read (D1), and no
 * more: a read in one round trip and a write in the next can interleave with
 * another writer.
 */
export type Isolates = 'transaction' | 'statement'

/** What a store or adapter declares it guarantees. */
export interface StoreCapabilities {
  /** What a refusal calls the store (`Postgres`, `memory`). */
  readonly name: string
  readonly isolation: Isolation
  /** How far `isolation` reaches. A store that does not say isolates one `statement`. */
  readonly isolates?: Isolates
  /**
   * Whether a write locks the row its rule's rows hang on (an account, for a
   * rule over its entries) until it commits, so writers of one parent wait
   * for each other.
   */
  readonly parentRowLock: boolean
}

/**
 * What a rule needs of its store. `row-atomic`: a guard and the writes it
 * admits apply to one row as one step. `parent-serialized`: writers of the
 * rows under one parent run one at a time.
 */
export type Capability = 'row-atomic' | 'parent-serialized'

/**
 * Where a writer judges a rule. `in-statement`: inside the statement, or the
 * one batch, that writes, over the rows as that statement finds them.
 * `read-first`: from a read made before the statement that writes.
 * `constraint`: by a constraint the database itself enforces (a foreign key),
 * which takes its own locks, whatever the isolation.
 */
export type Judged = 'in-statement' | 'read-first' | 'constraint'

const given: Readonly<Record<Capability, (store: StoreCapabilities, judged: Judged) => boolean>> = {
  // A statement re-reads the row it writes (Postgres at read committed too); a row read
  // before it is still the row written only in a serializable transaction.
  'row-atomic': (store, judged) =>
    store.isolation !== 'eventual' &&
    (judged !== 'read-first' ||
      (store.isolates === 'transaction' && store.isolation === 'serializable')),
  // A read in one round trip and the write in the next are one isolated step only
  // where the isolation reaches across them, or where the read is in the write. A
  // foreign key locks the row pointed at against its deleters at any isolation, but
  // replicas that merge later each check it against their own rows.
  'parent-serialized': (store, judged) =>
    judged === 'constraint'
      ? store.isolation !== 'eventual'
      : (judged === 'in-statement' || store.isolates === 'transaction') &&
        (store.isolation === 'serializable' ||
          (store.isolation === 'read-committed' && store.parentRowLock)),
}

const meaning: Readonly<Record<Capability, string>> = {
  'row-atomic': 'a guard and its writes apply to one row as one step',
  'parent-serialized': 'writers of the rows under one parent run one at a time',
}

const where: Readonly<Record<Judged, string>> = {
  'in-statement': 'judged in the statement that writes',
  'read-first': 'judged from a read before the write',
  constraint: 'held by a constraint the database enforces',
}

/** Whether `store` gives `capability` to a rule judged as `judged` says. */
export const gives = (
  store: StoreCapabilities,
  capability: Capability,
  judged: Judged = 'read-first',
): boolean => given[capability](store, judged)

/** One declared rule, the capability it needs and why. */
export interface Requirement<Rule extends string = string> {
  readonly rule: Rule
  readonly needs: Capability
  readonly because: string
  /** Where the writer judges it: `read-first` unless said. */
  readonly judged?: Judged
}

/** A store asked to hold rules it cannot. */
export class StoreRefused extends Data.TaggedError('StoreRefused')<{
  readonly store: StoreCapabilities
  /** The rules the store cannot hold; never empty. */
  readonly refused: ReadonlyArray<Requirement>
}> {
  override get message(): string {
    const { name, isolation, isolates = 'statement', parentRowLock } = this.store
    const lines = this.refused.map(
      ({ rule, needs, because, judged = 'read-first' }) =>
        `  - "${rule}" needs ${needs} (${meaning[needs]}), ${where[judged]}: ${because}`,
    )
    return `[metakit] store "${name}" (${isolation} per ${isolates}, ${parentRowLock ? 'locks' : 'does not lock'} the parent row) cannot hold:\n${lines.join('\n')}`
  }
}

/** The requirements `store` cannot give. */
export const refused = <Rule extends string>(
  store: StoreCapabilities,
  needed: ReadonlyArray<Requirement<Rule>>,
): ReadonlyArray<Requirement<Rule>> =>
  needed.filter(({ needs, judged }) => !gives(store, needs, judged))

/**
 * Call where a store is set up: throws `StoreRefused`, naming each rule, the
 * capability it needs and the store, when `store` cannot hold one of `needed`.
 */
export const mount = (store: StoreCapabilities, needed: ReadonlyArray<Requirement>): void => {
  const cannot = refused(store, needed)
  if (cannot.length > 0) throw new StoreRefused({ store, refused: cannot })
}
