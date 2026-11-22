/**
 * `Temporal.walk` for steps that must be awaited (an exchange, an IndexedDB
 * transaction): the same seeded orders, each step after the ones it waits on,
 * the property asked after every step, the same `WalkResult` with the seed and
 * the shortest order that still breaks it. Each order runs on a world of its
 * own, built by `initial` and closed by `finish`; a step that throws breaks
 * the property with its message.
 */
import { Option } from 'effect'
import * as Temporal from 'metakit/temporal'

export interface AsyncStep<World, Name extends string> {
  readonly name: Name
  readonly after?: ReadonlyArray<NoInfer<Name>>
  readonly run: (world: World) => Promise<void>
}

export interface AsyncScenario<World, Name extends string> {
  readonly initial: () => Promise<World>
  readonly steps: ReadonlyArray<AsyncStep<World, Name>>
  /** Asked after every step, with the steps run so far: a reason when the property is broken. */
  readonly holds: (world: World, ran: ReadonlyArray<Name>) => Promise<Option.Option<string>>
  readonly finish?: (world: World) => Promise<void>
}

export const walkAsync = async <World, Name extends string>(
  scenario: AsyncScenario<World, Name>,
  options?: Temporal.WalkOptions,
): Promise<Temporal.WalkResult<Name>> => {
  type S = AsyncStep<World, Name>
  const { steps } = scenario

  const orderOf = (seed: number): ReadonlyArray<S> => {
    const next = Temporal.generator(seed)
    const ran = new Set<Name>()
    const waiting = [...steps]
    const order: Array<S> = []
    while (waiting.length > 0) {
      const ready = waiting.filter(step => (step.after ?? []).every(name => ran.has(name)))
      const step = ready[Math.floor(next() * ready.length)]
      if (step === undefined)
        throw new Error('[walkAsync] steps wait on each other, or on one that is no step')
      waiting.splice(waiting.indexOf(step), 1)
      ran.add(step.name)
      order.push(step)
    }
    return order
  }

  /** The steps of `order` up to the first after which the property is broken, and why. */
  const broken = async (
    order: ReadonlyArray<S>,
  ): Promise<Option.Option<{ readonly ran: ReadonlyArray<S>; readonly reason: string }>> => {
    const world = await scenario.initial()
    try {
      const ran: Array<Name> = []
      for (const [at, step] of order.entries()) {
        const reason = await step.run(world).then(
          () => scenario.holds(world, [...ran, step.name]),
          (cause: unknown) =>
            Option.some(
              `${step.name} threw: ${cause instanceof Error ? cause.message : String(cause)}`,
            ),
        )
        ran.push(step.name)
        if (Option.isSome(reason))
          return Option.some({ ran: order.slice(0, at + 1), reason: reason.value })
      }
      return Option.none()
    } finally {
      await scenario.finish?.(world)
    }
  }

  const shrunk = async (failing: {
    readonly ran: ReadonlyArray<S>
    readonly reason: string
  }): Promise<{ readonly ran: ReadonlyArray<S>; readonly reason: string }> => {
    for (const step of failing.ran) {
      const rest = failing.ran.filter(other => other !== step)
      if (rest.some(other => (other.after ?? []).includes(step.name))) continue
      const still = await broken(rest)
      if (Option.isSome(still)) return shrunk(still.value)
    }
    return failing
  }

  const first = options?.seed ?? 1
  const runs = options?.runs ?? 30
  for (let run = 0; run < runs; run++) {
    const seed = first + run
    const failing = await broken(orderOf(seed))
    if (Option.isSome(failing)) {
      const least = await shrunk(failing.value)
      return Temporal.WalkResult.Broken({
        seed,
        interleaving: failing.value.ran.map(step => step.name),
        minimal: least.ran.map(step => step.name),
        reason: least.reason,
      })
    }
  }
  return Temporal.WalkResult.Held({ seed: first, runs })
}
