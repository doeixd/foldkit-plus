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

/** What a store or adapter declares it guarantees. */
export interface StoreCapabilities {
  /** What a refusal calls the store (`Postgres`, `memory`). */
  readonly name: string
  readonly isolation: Isolation
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

const given: Readonly<Record<Capability, (store: StoreCapabilities) => boolean>> = {
  'row-atomic': store => store.isolation !== 'eventual',
  'parent-serialized': store =>
    store.isolation === 'serializable' ||
    (store.isolation === 'read-committed' && store.parentRowLock),
}

const meaning: Readonly<Record<Capability, string>> = {
  'row-atomic': 'a guard and its writes apply to one row as one step',
  'parent-serialized': 'writers of the rows under one parent run one at a time',
}

/** Whether `store` gives `capability`. */
export const gives = (store: StoreCapabilities, capability: Capability): boolean =>
  given[capability](store)

/** One declared rule, the capability it needs and why. */
export interface Requirement<Rule extends string = string> {
  readonly rule: Rule
  readonly needs: Capability
  readonly because: string
}

/** A store asked to hold rules it cannot. */
export class StoreRefused extends Data.TaggedError('StoreRefused')<{
  readonly store: StoreCapabilities
  /** The rules the store cannot hold; never empty. */
  readonly refused: ReadonlyArray<Requirement>
}> {
  override get message(): string {
    const { name, isolation, parentRowLock } = this.store
    const lines = this.refused.map(
      ({ rule, needs, because }) => `  - "${rule}" needs ${needs} (${meaning[needs]}): ${because}`,
    )
    return `[metakit] store "${name}" (${isolation}, ${parentRowLock ? 'locks' : 'does not lock'} the parent row) cannot hold:\n${lines.join('\n')}`
  }
}

/** The requirements `store` cannot give. */
export const refused = <Rule extends string>(
  store: StoreCapabilities,
  needed: ReadonlyArray<Requirement<Rule>>,
): ReadonlyArray<Requirement<Rule>> => needed.filter(({ needs }) => !gives(store, needs))

/**
 * Call where a store is set up: throws `StoreRefused`, naming each rule, the
 * capability it needs and the store, when `store` cannot hold one of `needed`.
 */
export const mount = (store: StoreCapabilities, needed: ReadonlyArray<Requirement>): void => {
  const cannot = refused(store, needed)
  if (cannot.length > 0) throw new StoreRefused({ store, refused: cannot })
}
