/**
 * Phase 2: the prices, read by name through Remote. `Trace.run` runs the
 * application's `update` and Remote's real Subscriptions, holds each request
 * until a step answers it, and records every Model; the client answers from
 * the server's own `readDomains`.
 */
import { Effect, Option, Stream } from 'effect'
import { fromString } from 'foldkit/url'
import { type RemoteClient, RemoteReadError } from 'foldkit-remote'
import { Respond, Trace } from 'foldkit-remote/testing'
import { describe, expect, test } from 'vitest'
import { Data, Message, actives, freshness, init, update, type Model } from '../src/client/app.js'
import { SearchInput } from '../src/client/message.js'
import { READ_FAILED, searchViewState } from '../src/client/searchViewState.js'
import { readDomains } from '../src/server/remote.js'
import { Domain } from '../src/shared/entity'

const empty = init(Option.getOrThrow(fromString('https://domains.test/'))).model

/** The server's rows for a batch, as `/remote` answers it. */
const client: RemoteClient['Service'] = {
  read: batch =>
    Effect.succeed({
      settled: [],
      entities: readDomains(batch.requests.map(({ id }) => id)).map(({ id, values }) => ({
        entity: 'Domain',
        id,
        values,
      })),
    }),
  query: () => Effect.die('the page lists nothing'),
  mutate: () => Effect.die('the page writes nothing'),
  live: () => Stream.die('the page reads nothing live'),
}

/** A text typed and rested: the debounce's timer is not run in a trace. */
const searched = (value: string, generation: number): ReadonlyArray<Message> => [
  Message.UpdatedSearch({ value }),
  Message.GotSearchMessage({
    message: SearchInput.Message.Settled({ value, generation }),
  }),
]

const last = (trace: Trace<Model, Message>): Model => trace.entries.at(-1)?.model ?? trace.start

const run = (steps: ReadonlyArray<Message | Respond>) =>
  Trace.run(Data, {
    start: empty,
    update,
    active: actives,
    options: { policy: freshness },
    client,
    steps,
  })

describe('the Top Results', () => {
  test('land their prices from one read of the four names', async () => {
    const trace = await run([...searched('vercel', 1), Respond.all])
    const search = searchViewState(last(trace))
    expect(search._tag).toBe('Ready')
    expect(
      search._tag === 'Ready' ? search.domains.map(domain => [domain.name, domain._tag]) : [],
    ).toEqual([
      ['vercel.com', 'Unconfirmed'],
      ['vercel.dev', 'Unconfirmed'],
      ['vercel.app', 'Available'],
      ['vercel.io', 'Available'],
    ])
    expect(trace.pending).toEqual([])
  })

  test('a failed read with nothing to show is the search failing, and Try again reads it again', async () => {
    const failed = await run([
      ...searched('acme', 1),
      Respond.read(Domain, 'acme.com', { fail: new RemoteReadError({ message: 'down' }) }),
    ])
    expect(searchViewState(last(failed))).toEqual({ _tag: 'Failed', error: READ_FAILED })

    const retried = await run([
      ...searched('acme', 1),
      Respond.read(Domain, 'acme.com', { fail: new RemoteReadError({ message: 'down' }) }),
      Message.ClickedRetrySearch(),
      Respond.all,
    ])
    expect(searchViewState(last(retried))._tag).toBe('Ready')
  })

  test('going back to a search read within the minute asks nothing', async () => {
    const trace = await run([
      ...searched('acme', 1),
      Respond.all,
      ...searched('globex', 2),
      Respond.all,
      ...searched('acme', 3),
    ])
    expect(trace.pending).toEqual([])
    expect(searchViewState(last(trace))._tag).toBe('Ready')
  })
})
