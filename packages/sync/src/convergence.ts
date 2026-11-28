/**
 * What a rebase can change and what a copy needs, read from the declaration
 * (`foldkit-sync/metakit`).
 *
 * Replicas converge by replaying the server's order, so a replica's
 * optimistic result can be rebased: its own Message, shown at once, is
 * replayed after one it did not know of. From `Transition.commutes`, a rebase
 * of two durable Messages that commute changes nothing a replica showed;
 * where they may not, it possibly does, and a two-replica walk in both orders
 * is owed. From `Transition.idempotent`, an immediate back-to-back copy of a
 * durable Message changes nothing when its writes are idempotent (`harmless`);
 * otherwise (`removed by id`) even an immediate copy would count twice. In both
 * cases, a copy delivered later after another write relies on id deduplication
 * (the replica drops an operation it holds committed, and the journal commits
 * an id once) unless the Message also commutes with every durable Message.
 *
 * `settleConvergence` declares what is owed in the registry of `@doeixd/metakit/temporal` and
 * runs the walks the caller supplies: the walks need the application's
 * replica and journal, which this module does not know. Development and test
 * only; no page imports it.
 */
import { Transition, Verdict } from '@doeixd/metakit'
import type { Machine } from '@doeixd/metakit/machine'
import * as Pairs from '@doeixd/metakit/pairs'
import * as Temporal from '@doeixd/metakit/temporal'

type AnyTransition = Transition.Transition<unknown, unknown, unknown, unknown>

/** A pair of durable Messages whose footprints overlap, and whether a rebase can change what a replica showed. */
export interface RebasePair<Tag extends string = string> {
  readonly name: `${Tag}/${Tag}`
  readonly over: readonly [Tag, Tag]
  /** `never` where `Transition.commutes` is true; `possible` where it does not decide. */
  readonly rebase: 'never' | 'possible'
  /** For `never` the rule that decided it; for `possible` why `commutes` does not. */
  readonly why: string
}

/** What a durable Message delivered twice in a row to one replica does. */
export interface Redelivery<Tag extends string = string> {
  readonly tag: Tag
  /** `harmless`: an immediate back-to-back copy changes nothing (interleaved copies still rely on id deduplication); `removed by id`: even an immediate copy would count twice. */
  readonly copy: 'harmless' | 'removed by id'
  readonly why: string
}

export interface Convergence<Tag extends string = string> {
  /** Every overlapping pair of the durable Messages, each with itself. A pair left out writes disjoint state: it never rebases. */
  readonly pairs: ReadonlyArray<RebasePair<Tag>>
  readonly redelivery: ReadonlyArray<Redelivery<Tag>>
}

/**
 * Read `machine`'s durable `tags`: for each overlapping pair whether a rebase
 * can change what a replica showed, and for each Message what its copy needs.
 */
export const convergence = <
  State,
  Transitions extends Readonly<Record<string, unknown>>,
  const Tag extends keyof Transitions & string,
>(
  machine: Machine<State, Transitions>,
  tags: ReadonlyArray<Tag>,
): Convergence<Tag> => {
  const unique = [...new Set(tags)]
  for (const tag of unique) {
    if (!Object.hasOwn(machine.transitions, tag)) {
      throw new Error(`[foldkit-sync] convergence: the machine declares no transition "${tag}"`)
    }
  }
  const durable = new Set<string>(unique)
  return {
    pairs: Pairs.pairs(machine)
      .filter(({ over }) => over.every(tag => durable.has(tag)))
      .map(({ name, over, verdict, why }) => ({
        name: name as `${Tag}/${Tag}`,
        over: over as readonly [Tag, Tag],
        rebase: Verdict.isTrue(verdict) ? 'never' : 'possible',
        why,
      })),
    redelivery: unique.map((tag): Redelivery<Tag> => {
      const transition = machine.transitions[tag] as AnyTransition
      const verdict = Transition.idempotent(transition)
      return Verdict.match<never, Redelivery<Tag>>(verdict, {
        True: () => ({
          tag,
          copy: 'harmless' as const,
          why: `every way of writing it is idempotent: ${[...new Set(transition.writes.map(({ way }) => way._tag))].join(', ') || 'it writes nothing'}`,
        }),
        False: () => ({ tag, copy: 'removed by id' as const, why: 'a witness shows it is not' }),
        Unknown: ({ reason }) => ({ tag, copy: 'removed by id' as const, why: reason }),
      })
    }),
  }
}

/** What a walk of a pair found: how it ran, and whether the two commit orders left different documents. */
export interface PairWalk {
  readonly result: Temporal.WalkResult
  readonly orderMatters: boolean
}

export interface SettleOptions<Tag extends string> extends Temporal.Scope {
  /** The registry the obligations go into: the shared one unless given. */
  readonly registry?: Temporal.Registry
  /**
   * The two-replica walk of one pair, both orders. `rebase` says what the
   * declaration claims: for `never` the walk must find one document whichever
   * Message the server commits first.
   */
  readonly walkPair: (over: readonly [Tag, Tag], rebase: 'never' | 'possible') => Promise<PairWalk>
  /** The walk that delivers one Message twice, `copy` saying which path it checks. */
  readonly walkRedelivery: (tag: Tag, copy: Redelivery['copy']) => Promise<Temporal.WalkResult>
}

/**
 * Declare what `convergence` owes and discharge it with the walks given. A
 * pair that `never` rebases is a decision checked by its walk, refuted if the
 * order changed the document. A pair that `possible` rebases is an obligation
 * a walk that converged discharges, answering `order-matters` where the two
 * orders left different documents on replicas that still agreed. A walk that
 * broke (the replicas diverged) leaves it open. Each Message's copy is an obligation of
 * its own.
 */
export const settleConvergence = async <
  State,
  Transitions extends Readonly<Record<string, unknown>>,
  const Tag extends keyof Transitions & string,
>(
  machine: Machine<State, Transitions>,
  tags: ReadonlyArray<Tag>,
  options: SettleOptions<Tag>,
): Promise<Convergence<Tag>> => {
  const registry = options.registry ?? Temporal.registry
  const read = convergence(machine, tags)
  const rebasing = (pair: RebasePair<Tag>) => `rebase ${pair.name}`
  registry.declare(options, [
    ...read.pairs
      .filter(({ rebase }) => rebase === 'possible')
      .map(pair =>
        Temporal.obligation({
          name: rebasing(pair),
          shows: `a rebase of ${pair.over[0]} and ${pair.over[1]} may change what a replica showed (${pair.why}): two replicas, both orders, converge`,
          over: pair.over,
        }),
      ),
    ...read.redelivery.map(({ tag, copy }) =>
      Temporal.obligation({
        name: `redelivery ${tag}`,
        shows: `${tag} delivered twice leaves the document once (${copy})`,
        over: [tag],
      }),
    ),
  ])
  for (const pair of read.pairs) {
    const { result, orderMatters } = await options.walkPair(pair.over, pair.rebase)
    if (pair.rebase === 'possible') {
      registry.record(options, {
        obligation: rebasing(pair),
        result,
        // Only a walk whose replicas converged answers; `Broken` is a divergence and stays open.
        ...(orderMatters && Temporal.WalkResult.$is('Held')(result)
          ? { answer: 'order-matters' as const }
          : {}),
      })
    } else {
      registry.decide(options, {
        name: rebasing(pair),
        reason: pair.why,
        // A decided pair whose two orders differ is a wrong decision, whatever the walk's own verdict.
        checked:
          orderMatters && Temporal.WalkResult.$is('Held')(result)
            ? Temporal.WalkResult.Broken({
                seed: result.seed,
                interleaving: [],
                minimal: [],
                reason: 'the two commit orders left different documents',
              })
            : result,
      })
    }
  }
  for (const { tag, copy } of read.redelivery) {
    registry.record(options, {
      obligation: `redelivery ${tag}`,
      result: await options.walkRedelivery(tag, copy),
    })
  }
  return read
}
