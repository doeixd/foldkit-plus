/**
 * Phase 3: All Results. `WindowList` names the rows in view of the window,
 * and the `VisibleResults` Surface reads their names and no others, in one
 * request beside what is already read.
 */
import { Effect, Option, Stream } from 'effect'
import { fromString } from 'foldkit/url'
import { WindowList } from 'foldkit-mixins-ui'
import type { RemoteClient } from 'foldkit-remote'
import { Respond, Trace } from 'foldkit-remote/testing'
import { describe, expect, test } from 'vitest'
import {
  Data,
  Message,
  actives,
  freshness,
  init,
  readNames,
  update,
  type Model,
} from '../src/client/app.js'
import { SearchInput } from '../src/client/message.js'
import { arrangedOf, namesOf } from '../src/client/results.js'
import { RESULTS_GROUP_HEIGHT_PX } from '../src/client/resultsList.js'
import { readDomains } from '../src/server/remote.js'
import { Quote } from '../src/shared/entity'

const empty = init(Option.getOrThrow(fromString('https://domains.test/'))).model

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

const searched = (value: string): ReadonlyArray<Message> => [
  Message.UpdatedSearch({ value }),
  Message.GotSearchMessage({ message: SearchInput.Message.Settled({ value, generation: 1 }) }),
]

/** The viewport over the list, `top` pixels past the list's top. */
const placed = (top: number, height = 900): Message =>
  Message.GotResultsListMessage({ message: WindowList.Message.Placed({ top, height }) })

const run = (steps: ReadonlyArray<Message | Respond>) =>
  Trace.run(Data, {
    start: empty,
    update,
    active: actives,
    options: { policy: freshness },
    client,
    steps,
  })

/** The names a held read asks for. */
const asked = (pending: ReadonlyArray<string>): ReadonlyArray<string> =>
  pending.flatMap(request => [...request.matchAll(/Domain:([^,]+)/g)].map(([, name]) => name!))

const { groups } = arrangedOf(
  'acme',
  { tldFilter: 'All', availabilityFilter: 'All', sortOrder: 'Relevance' },
  [],
)
const namesOfGroups = (from: number, to: number) =>
  groups.slice(from, to).flatMap(group => group.listings.map(({ name }) => name))

describe('All Results', () => {
  test('reads the Top Results and the rows in view, and no row below them', () => {
    const settled = searched('acme').reduce((model, message) => update(model, message).model, empty)
    const names = readNames(settled)
    expect(names.slice(0, 4)).toEqual(['acme.com', 'acme.dev', 'acme.app', 'acme.io'])
    // 1000 px assumed before the list is placed: nine rows of six and two more past them.
    expect(names).toEqual(namesOfGroups(0, 11))
  })

  test('a scroll further down reads the names it brings into view, and nothing else', async () => {
    const top = 40 * RESULTS_GROUP_HEIGHT_PX
    const trace = await run([...searched('acme'), Respond.all, placed(top)])
    const window = namesOfGroups(40 - 2, 40 + Math.ceil(900 / RESULTS_GROUP_HEIGHT_PX) + 2)
    expect([...asked(trace.pending)].sort()).toEqual([...window].sort())
  })

  test('a scroll that keeps the same rows in view asks for nothing more', async () => {
    const top = 40 * RESULTS_GROUP_HEIGHT_PX
    const trace = await run([
      ...searched('acme'),
      Respond.all,
      placed(top),
      Respond.all,
      placed(top + 5),
    ])
    expect(trace.pending).toEqual([])
  })

  test('the count says how many names are checked, scrolled past or not', async () => {
    const trace = await run([
      ...searched('acme'),
      Respond.all,
      placed(40 * RESULTS_GROUP_HEIGHT_PX),
      Respond.all,
    ])
    const last: Model = trace.entries.at(-1)?.model ?? trace.start
    const checked = namesOf('acme').filter(
      name => Data.get(Quote, name).read(last)._tag === 'Ready',
    )
    // The first eleven rows, the top four among them, and the twelve around row 40.
    expect(checked).toHaveLength(11 * 6 + 12 * 6)
  })

  test("a new search drops the heights measured for the last one's rows", () => {
    const settle = (model: Model, value: string, generation: number) =>
      [
        Message.UpdatedSearch({ value }),
        Message.GotSearchMessage({ message: SearchInput.Message.Settled({ value, generation }) }),
      ].reduce((current, message) => update(current, message).model, model)
    const measured = update(
      settle(empty, 'acme', 1),
      Message.GotResultsListMessage({
        message: WindowList.Message.Measured({ rows: [{ key: 'acme.com', height: 120 }] }),
      }),
    ).model
    expect(measured.resultsList.heights).toEqual({ 'acme.com': 120 })
    expect(settle(measured, 'globex', 2).resultsList.heights).toEqual({})
  })
})
