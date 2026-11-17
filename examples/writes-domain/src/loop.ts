/**
 * One reservation followed all the way round: the page predicts it, the
 * adapter sends it as a command, the aggregate records an Event, the View
 * catches up late, and the page reconciles. Then the ways it goes wrong: a
 * rule the declaration states, a stale revision, and a reply lost after the
 * command committed. Each line says what one owner held at that moment.
 */
import * as Model from '@alchemy.run/domain/Model'
import { Effect, Match, Option, Ref } from 'effect'
import { world as makeWorld } from './scenario/world.js'
import { page } from './scenario/page.js'

const bolt = {
  id: 'p1',
  ownerId: 'ada',
  name: 'Bolt',
  status: 'published',
  stock: 10,
  reserved: 2,
  revision: 1,
}

const text = (value: unknown) => JSON.stringify(value)

export const runLoop = (): Promise<ReadonlyArray<string>> => {
  const world = makeWorld()
  const out: Array<string> = []
  const say = (line: string) => Effect.sync(() => out.push(line))

  return Effect.runPromise(
    Effect.gen(function* () {
      yield* world.seed([bolt])
      yield* Ref.set(world.as, Option.some('ada'))
      const shown = yield* page('p1')
      const internals = yield* Model.Internals

      /** The Events the Product stream holds, read through Domain's diagnostics. */
      const events = Effect.gen(function* () {
        const read = internals.aggregates.get('Product')?.events
        if (read === undefined) return yield* Effect.die(new Error('this host keeps no history'))
        return (yield* read('p1')).map(({ event }) => text(event))
      })
      const showing = () => text(shown.seen.at(-1)?.shows)
      const write = Effect.map(shown.write, ({ status, refusal }) =>
        Match.valueTags(status, {
          Unknown: () => 'unknown',
          Pending: () => 'pending',
          Applied: () => 'applied',
          Failed: ({ error }) =>
            Option.match(refusal, {
              onNone: () => `failed, ${error._tag}`,
              onSome: refused =>
                `refused, ${Match.valueTags(refused, {
                  Conflict: () => 'Conflict',
                  Unmet: () => 'Unmet',
                  Invalid: ({ rule, message }) =>
                    `Invalid by ${Option.getOrElse(rule, () => 'a rule')}: ${message}`,
                })}`,
            }),
        }),
      )
      const stream = Effect.map(
        events,
        held =>
          `  domain   was sent ${world.commandIds.length} commands; the stream holds ${held.length} Events`,
      )

      yield* say('1. the page reads the product through its View')
      yield* shown.read
      yield* say(`  page     shows ${showing()}`)
      yield* say(`  domain   ${(yield* events).at(-1)}`)

      yield* say('2. ada reserves 3: the page predicts before anything is sent')
      const settle = yield* shown.start({ id: 'p1', revision: 1, quantity: 3 })
      yield* say(`  page     shows ${showing()}; the write is ${yield* write}`)

      yield* say('3. the adapter sends the command; the aggregate decides and records an Event')
      yield* shown.reply(settle)
      yield* say(`  domain   ${(yield* events).at(-1)}`)
      yield* say(`  page     shows ${showing()}; the write is ${yield* write}`)
      yield* say(`  remote   holds the row to the receipt ${text((yield* shown.floors)[0]?.token)}`)

      yield* say('4. a read while the View is behind keeps the row, and names it behind')
      const behind = yield* shown.read
      yield* say(`  adapter  answers behind ${text(behind)}`)
      yield* say(`  page     shows ${showing()}`)

      yield* say('5. the View catches up: a read at the receipt answers, and the hold ends')
      yield* world.control.drain
      yield* shown.read
      yield* say(`  page     shows ${showing()}`)
      yield* say(`  remote   holds ${(yield* shown.floors).length} rows to a receipt`)

      yield* say('6. reserving 9 more would pass the stock: the declared invariant refuses it')
      const tooMany = yield* shown.start({ id: 'p1', revision: 2, quantity: 9 })
      yield* shown.reply(tooMany)
      yield* say(`  page     shows ${showing()}; the write is ${yield* write}`)
      yield* say(yield* stream)

      yield* say('7. a write at the revision read before step 3 is a conflict')
      const stale = yield* shown.start({ id: 'p1', revision: 1, quantity: 1 })
      yield* shown.reply(stale)
      yield* say(`  page     shows ${showing()}; the write is ${yield* write}`)
      yield* say(yield* stream)

      yield* say('8. a reply is lost after the command committed, and the write is retried')
      world.loseReply()
      const lost = yield* shown.start({ id: 'p1', revision: 2, quantity: 1 })
      yield* shown.reply(lost)
      yield* say(`  page     shows ${showing()}; the write is ${yield* write}`)
      yield* say(yield* stream)
      const again = yield* shown.retry
      yield* shown.reply(again)
      const [first, second] = world.commandIds.slice(-2)
      yield* say(`  adapter  the retry carries the same commandId: ${first === second}`)
      yield* say(`  page     shows ${showing()}; the write is ${yield* write}`)
      yield* say(yield* stream)
      return out
    }).pipe(Effect.scoped, Effect.provide(world.layer)),
  )
}
