/**
 * What a live insert does with a row the client can judge for itself.
 *
 * local-execution-DESIGN phase 4. `LiveInsertion` —
 * `'visible' | 'boundary' | 'invalidate' | 'ignore'`, declared per connection
 * end — exists because nothing could tell whether an inserted row belonged to
 * a query. A body can tell, for rows the client holds, so the policy stops
 * being the whole answer and becomes the answer for the rows it cannot.
 *
 * It also fixes something that turned up on the way: **the declared policy
 * never reached the decision.** `Query.connection(E, { live })` was typed,
 * documented, carried on the descriptor and present in the Message schema, and
 * nothing in the production path ever set it — so every live insert took the
 * default, whatever an application asked for.
 */
import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { Query, Remote, entityKey, type QueryProjection } from '../src/index.js'

const Project = DomainEntity.define(
  'Project',
  Schema.Struct({ id: Schema.String, name: Schema.String, status: Schema.String }),
)
const Summary = DomainEntity.select(Project, { id: true, name: true })

const activeOnly = () =>
  Query.from(Project).pipe(
    Query.where(Expr.eq(Project.fields.status, 'active')),
    Query.orderBy(Order.asc(Project.fields.id)),
  )

/** Active projects, showing whatever a live insert brings: the default. */
const ActiveProjects = Query.define('ActiveProjects', {}, activeOnly)

/**
 * The same population, declaring that a prepend must not be shown.
 *
 * `'ignore'` rather than `'invalidate'`: an invalidating event records a stale
 * mark in the live state that **nothing reads** — `isStale` has no caller
 * outside its own module, and a connection's own `stale` flag is what a read
 * consults. That is a separate dead path from the one this phase fixes, and
 * pinning behaviour on it would be pinning nothing.
 */
const QuietProjects = Query.define('QuietProjects', {}, activeOnly, {
  live: { prepend: 'ignore' },
})

const Model = Schema.Struct({ remote: Remote.Model })
type Model = typeof Model.Type
const App = Surface.application({ Model, Message: defineMessageUnion({ ...Remote.messages }) })
const Data = Remote.make({
  model: App.model.remote,
  entities: [Project],
  queries: [ActiveProjects, QuietProjects],
})

/** Either connection, so the helpers are not pinned to one query's name. */
type Projection = QueryProjection<Model, { readonly id: string; readonly name: string }, string, {}>

const projects: Projection = Data.query(ActiveProjects, {}, { select: Summary, first: 25 })
const quiet: Projection = Data.query(QuietProjects, {}, { select: Summary, first: 25 })
const key = (id: string) => entityKey('Project', id)

/** A loaded connection holding `p1`, plus whatever else is written. */
const loaded = (
  extra: ReadonlyArray<{ id: string; status: string }> = [],
  into: Projection = projects,
): Model => {
  const merged = Data.reduce(
    { remote: Remote.initial },
    {
      _tag: 'ConnectionMerged',
      connection: into.ref.identity,
      page: {
        edges: [{ key: key('p1'), ref: { entity: 'Project', id: 'p1' } }],
        start: { _tag: 'Terminal' },
        end: { _tag: 'Terminal' },
      },
    },
  )
  return [{ id: 'p1', status: 'active' }, ...extra].reduce(
    (model, row) =>
      Data.reduce(model, {
        _tag: 'ReadReceived',
        requests: [{ entity: 'Project', id: row.id, fields: ['id', 'name', 'status'] }],
        result: {
          entities: [
            {
              entity: 'Project',
              id: row.id,
              values: { id: row.id, name: `Project ${row.id}`, status: row.status },
            },
          ],
        },
        now: 0,
      }),
    merged,
  )
}

const insert = (model: Model, id: string, into: Projection = projects, cursor = 1) =>
  Data.reduce(model, {
    _tag: 'LiveReceived',
    stream: 's',
    event: {
      _tag: 'ConnectionInsert',
      cursor,
      connection: into.ref.identity,
      edge: { key: key(id), ref: { entity: 'Project', id } },
      position: 'prepend',
    },
    now: 0,
  })

/**
 * The edges the connection holds, overlays included.
 *
 * Not the same question as `shown`: an edge for a row whose selected fields
 * were never fetched is in the connection and makes the *page* unrenderable,
 * so a read of it is `Initial`. Which of the two a test asks decides whether it
 * is about membership or about rendering.
 */
const edges = (model: Model, of: Projection = projects): ReadonlyArray<string> =>
  Remote.visibleItems(model.remote, of.ref.identity).map(edge => edge.ref.id)

const shown = (model: Model, of: Projection = projects): ReadonlyArray<string> => {
  const page = of.read(model)
  return page._tag === 'Ready' || page._tag === 'Refreshing'
    ? page.value.items.map(item => item.id)
    : []
}

describe('A row the body can judge', () => {
  it('does not appear when the body says it does not belong', () => {
    // `p2` is archived. Nothing had to declare that: the query says which rows
    // it is about, and this is not one of them.
    const model = insert(loaded([{ id: 'p2', status: 'archived' }]), 'p2')

    expect(edges(model)).toEqual(['p1'])
    expect(shown(model)).toEqual(['p1'])
  })

  it('is not hidden by being judged — a belonging row still appears', () => {
    const model = insert(loaded([{ id: 'p2', status: 'active' }]), 'p2')

    expect(shown(model)).toEqual(['p2', 'p1'])
  })
})

describe('A row the body cannot judge', () => {
  it('follows the declared policy when the row was never fetched', () => {
    // Nothing is known about `p9`, so "does it belong" has no answer and the
    // application's declaration is the whole answer. This connection says a
    // prepend must not be shown.
    const model = insert(loaded([], quiet), 'p9', quiet)

    expect(edges(model, quiet)).toEqual(['p1'])
  })

  it('admits it where the application declared nothing, which is the default', () => {
    const model = insert(loaded(), 'p9')

    expect(edges(model)).toEqual(['p9', 'p1'])
    // And the page is not renderable until `p9`'s own fields arrive, which is
    // the ordinary rule rather than anything this phase changed.
    expect(shown(model)).toEqual([])
  })
})

describe('The declared policy reaches the decision at all', () => {
  it('is used rather than the default, even for a row that belongs', () => {
    // The bug this pins: nothing in the production path ever put a policy on
    // the Message, so a connection asking for `ignore` took `visible` and
    // showed the row anyway. `p2` belongs to the query, and is still not shown,
    // because the application said so.
    const model = insert(loaded([{ id: 'p2', status: 'active' }], quiet), 'p2', quiet)

    expect(edges(model, quiet)).toEqual(['p1'])
  })

  it('leaves a policy the caller supplied alone', () => {
    // `updateRemote` on its own is unchanged, and a caller that says what it
    // wants keeps it — which is what the reducer's own tests rely on.
    //
    // The connection is the one declaring `ignore`, and the caller says
    // `visible`, so the two disagree: if resolution overwrote what it was
    // given, the edge would not be here.
    const model = Data.reduce(loaded([], quiet), {
      _tag: 'LiveReceived',
      stream: 's',
      policy: { prepend: 'visible' },
      event: {
        _tag: 'ConnectionInsert',
        cursor: 1,
        connection: quiet.ref.identity,
        edge: { key: key('p9'), ref: { entity: 'Project', id: 'p9' } },
        position: 'prepend',
      },
      now: 0,
    })

    expect(edges(model, quiet)).toEqual(['p9', 'p1'])
  })
})
