/**
 * `why`'s reasons for every state but a wiring mistake: which list or
 * which field of which row is missing, stale, in flight or failed, which
 * pending write shows a value, and which term of a list's body put a row in
 * it or took it out (#248).
 */
import { Option } from 'effect'
import { Entity, Expr } from 'foldkit-entity'
import { Surface } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import { ConnectionChange, Remote } from '../src/index.js'
import { ShownBy, why, Why } from '../src/why.js'
import {
  App,
  ByStatus,
  Data,
  Project,
  User,
  active,
  card,
  list,
  listed,
  merged,
  open,
  p1,
  project,
  received,
  reduced,
  stored,
  summary,
} from './whyDomain.js'
import { overlay } from '../src/overlay.js'

describe("why names a list's own page", () => {
  it('in flight while it has nothing to show', () => {
    const said = why(
      Data,
      reduced(open, { _tag: 'QueryStarted', connections: [list.ref.identity] }),
      list,
    )

    expect(said.state).toBe('Loading')
    expect(said.because).toEqual([
      Why.List({
        list: { query: 'All', identity: list.ref.identity },
        held: 'Missing',
        inFlight: true,
      }),
    ])
    expect(said.message).toBe('Its list "All" is being fetched.')
  })

  it('stale while its rows still show', () => {
    const said = why(
      Data,
      reduced(listed, { _tag: 'ConnectionInvalidated', connection: active.ref.identity }),
      active,
    )

    expect(said.state).toBe('Refreshing')
    expect(said.because[0]).toEqual(
      Why.List({
        list: { query: 'ByStatus', identity: active.ref.identity },
        held: 'Stale',
        inFlight: false,
      }),
    )
  })

  it('missing while stale with no pages, as one invalidated before it loaded', () => {
    const said = why(
      Data,
      reduced(open, { _tag: 'ConnectionInvalidated', connection: list.ref.identity }),
      list,
    )

    expect(said.because).toEqual([
      Why.NoActiveRecord(),
      Why.List({
        list: { query: 'All', identity: list.ref.identity },
        held: 'Missing',
        inFlight: false,
      }),
    ])
  })

  it('after the reason that decides its state', () => {
    // A stale list whose row then failed: the failure decides `Failed`.
    const error = { _tag: 'RemoteReadError', message: 'offline' }
    const said = why(
      Data,
      reduced(
        listed,
        { _tag: 'ConnectionInvalidated', connection: active.ref.identity },
        {
          _tag: 'ReadFailed',
          requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
          error,
        },
      ),
      active,
    )

    expect(said.state).toBe('Failed')
    expect(said.because.map(reason => reason._tag)).toEqual(['FieldsFailed', 'List'])
    expect(said.message).toContain('Reading name of Project p1 failed.')
  })

  it('failed, and that nothing retries it on its own', () => {
    const error = { _tag: 'RemoteQueryError', message: 'offline' }
    const said = why(
      Data,
      reduced(open, { _tag: 'QueryFailed', connection: list.ref.identity, error }),
      list,
    )

    expect(said.state).toBe('Failed')
    expect(said.because[0]).toEqual(
      Why.ListFailed({ list: { query: 'All', identity: list.ref.identity }, error }),
    )
    expect(said.message).toContain('Nothing retries a failed read on its own')
  })
})

describe("why names a row's fields", () => {
  it('in flight, for an entity read that is Loading', () => {
    const loading = reduced(open, {
      _tag: 'ReadStarted',
      requests: [{ entity: 'Project', id: 'p1', fields: ['name', 'status'] }],
    })

    expect(why(Data, loading, project)).toEqual({
      state: 'Loading',
      because: [
        Why.Fields({
          row: p1,
          via: [],
          fields: ['name', 'status'],
          held: 'Missing',
          inFlight: true,
        }),
      ],
      message: 'name, status of Project p1 is being fetched.',
      surfaces: Option.none(),
    })
  })

  it('in flight, for one row of a list that holds its page (the #243 blip)', () => {
    const page = reduced(open, merged(active.ref.identity, ['p1']))
    const said = why(
      Data,
      reduced(page, {
        _tag: 'ReadStarted',
        requests: [{ entity: 'Project', id: 'p1', fields: ['name'] }],
      }),
      active,
    )

    expect(said.state).toBe('Loading')
    expect(said.because[0]).toEqual(
      Why.Fields({ row: p1, via: [], fields: ['name'], held: 'Missing', inFlight: true }),
    )
  })

  it('stale, and only the stale ones', () => {
    const refreshing = reduced(stored, {
      _tag: 'RefreshStarted',
      requests: [{ entity: 'Project', id: 'p1', fields: ['status'] }],
    })
    const said = why(Data, refreshing, project)

    expect(said.state).toBe('Refreshing')
    expect(said.because).toEqual([
      Why.Fields({ row: p1, via: [], fields: ['status'], held: 'Stale', inFlight: false }),
    ])
  })

  it('through a relation, with the path to it', () => {
    const owned = Data.get(
      Entity.select(Project, { owner: Entity.select(User, { name: true }) }),
      'p1',
    )
    const held = reduced(open, received([{ id: 'p1', owner: 'User:ada' }]), {
      _tag: 'ReadStarted',
      requests: [{ entity: 'User', id: 'ada', fields: ['name'] }],
    })

    expect(why(Data, held, owned).because).toEqual([
      Why.Fields({
        row: { entity: 'User', id: 'ada' },
        via: ['owner'],
        fields: ['name'],
        held: 'Missing',
        inFlight: true,
      }),
    ])
  })

  it('failed', () => {
    const error = { _tag: 'RemoteReadError', message: 'offline' }
    const said = why(
      Data,
      reduced(open, {
        _tag: 'ReadFailed',
        requests: [{ entity: 'Project', id: 'p1', fields: ['name', 'status'] }],
        error,
      }),
      project,
    )

    expect(said.because[0]).toEqual(
      Why.FieldsFailed({ row: p1, via: [], fields: ['name', 'status'], error }),
    )
    expect(said.message).toBe(
      'Reading name, status of Project p1 failed. Its request failed: offline. Nothing retries a failed read on its own; Data.refresh asks again.',
    )
  })

  it('settled without a value for this principal', () => {
    const withheld = reduced(open, {
      _tag: 'ReadReceived',
      requests: [{ entity: 'Project', id: 'p1', fields: ['name', 'status'] }],
      result: {
        settled: [{ entity: 'Project', id: 'p1', fields: ['status'] }],
        entities: [{ entity: 'Project', id: 'p1', values: { name: 'Apollo' } }],
      },
      now: 0,
    })
    const said = why(Data, withheld, project)

    expect(said.state).toBe('Failed')
    expect(said.because[0]).toEqual(Why.Unavailable({ row: p1, via: [], fields: ['status'] }))
  })
})

describe('why names what deleted a row', () => {
  it('the server', () => {
    const gone = reduced(stored, {
      _tag: 'MutationSucceeded',
      requestId: 'r1',
      entities: [],
      deleted: [p1],
      now: 0,
    })

    expect(why(Data, gone, project).because).toEqual([Why.Deleted({ row: p1, by: Option.none() })])
  })

  it('the newest pending write that touches it', () => {
    const renamed = overlay(Data, stored, 'rename', [
      { entity: 'Project', id: 'p1', values: { name: 'Apollo II' } },
    ])
    const gone = overlay(Data, renamed, 'trash', [Remote.tombstone(Project, 'p1')])

    expect(why(Data, gone, project).because).toEqual([
      Why.Deleted({ row: p1, by: Option.some(ShownBy.Overlay({ id: 'trash' })) }),
    ])
  })

  it('a pending write', () => {
    const gone = overlay(Data, stored, 'trash', [Remote.tombstone(Project, 'p1')])
    const said = why(Data, gone, project)

    expect(said.state).toBe('NotFound')
    expect(said.because).toEqual([
      Why.Deleted({ row: p1, by: Option.some(ShownBy.Overlay({ id: 'trash' })) }),
    ])
    expect(said.message).toContain('overlay "trash" deletes Project p1')
  })
})

describe('why names what a pending write shows', () => {
  it('the fields it writes, and the mutation that wrote them', () => {
    const pending = reduced(stored, {
      _tag: 'MutationStarted',
      requestId: 'r7',
      optimistic: [{ entity: 'Project', id: 'p1', values: { name: 'Apollo II', price: 11 } }],
      write: { mutation: 'Rename', input: {} },
    })
    const said = why(Data, pending, project)

    expect(said.state).toBe('Ready')
    expect(said.because).toEqual([
      Why.Pending({
        row: p1,
        fields: ['name'],
        by: ShownBy.Write({ requestId: 'r7', mutation: Option.some('Rename') }),
      }),
    ])
    expect(said.message).toBe(
      'name of Project p1 show what Rename (request r7) wrote, until it is answered.',
    )
  })

  it('a row that joined a list, and the term that put it there', () => {
    const created = overlay(Data, listed, 'new', [
      {
        entity: 'Project',
        id: 'p9',
        values: { id: 'p9', name: 'Nova', status: 'active', price: 15 },
      },
    ])
    const list = { query: 'ByStatus', identity: active.ref.identity }

    expect(why(Data, created, active).because).toContainEqual(
      Why.Joined({
        list,
        row: { entity: 'Project', id: 'p9' },
        by: Option.some(ShownBy.Overlay({ id: 'new' })),
        terms: [
          { term: Expr.show(ByStatus.body!.where[0]!), truth: 'True', reason: Option.none() },
        ],
      }),
    )
  })

  it('a row that left a list, and the term that took it out', () => {
    const archived = overlay(Data, listed, 'archive', [
      { entity: 'Project', id: 'p1', values: { status: 'archived' } },
    ])

    expect(why(Data, archived, active).because).toContainEqual(
      Why.Left({
        list: { query: 'ByStatus', identity: active.ref.identity },
        row: p1,
        by: Option.some(ShownBy.Overlay({ id: 'archive' })),
        terms: [
          { term: Expr.show(ByStatus.body!.where[0]!), truth: 'False', reason: Option.none() },
        ],
      }),
    )
  })

  it('a term it could not judge, and what it lacks', () => {
    // p5 is held without the status the body filters on, and an insert shows it.
    const inserted = overlay(
      Data,
      reduced(listed, received([{ id: 'p5', name: 'Echo', price: 1 }])),
      'pin',
      [ConnectionChange.prepend(active.ref, { entity: 'Project', id: 'p5' })],
    )
    const joined = why(Data, inserted, active).because.find(Why.guards.Joined)

    expect(joined?.by).toEqual(Option.some(ShownBy.Overlay({ id: 'pin' })))
    expect(joined?.terms).toEqual([
      {
        term: Expr.show(ByStatus.body!.where[0]!),
        truth: 'Unknown',
        reason: Option.some('Project.status is not held'),
      },
    ])
  })
})

describe('why names a list by what it shows', () => {
  it('not a row past the window as one that left', () => {
    const first = Data.query(ByStatus, { status: 'active' }, { select: summary, first: 1 })

    expect(why(Data, listed, first).because).toEqual([])
  })

  it('nor the fields of a row past it', () => {
    const first = Data.query(ByStatus, { status: 'active' }, { select: summary, first: 1 })
    const stale = reduced(listed, {
      _tag: 'RefreshStarted',
      requests: [{ entity: 'Project', id: 'p2', fields: ['name'] }],
    })

    expect(why(Data, stale, first)).toMatchObject({ state: 'Ready', because: [] })
  })
})

describe('why names a value the store holds and cannot show', () => {
  it('one that does not decode against the Selection', () => {
    const said = why(
      Data,
      reduced(open, received([{ id: 'p1', name: 42, status: 'active' }])),
      project,
    )

    expect(said.state).toBe('Failed')
    expect(said.because[0]?._tag).toBe('Undecodable')
  })

  it('one only an overlay shows, which lacks what the Selection reads', () => {
    const said = why(
      Data,
      overlay(Data, open, 'draft', [{ entity: 'Project', id: 'p1', values: { name: 'Draft' } }]),
      project,
    )

    expect(said.state).toBe('Failed')
    expect(said.because[0]?._tag).toBe('OverlayOnly')
  })
})

describe('why names a live stream that is not arriving', () => {
  const Watched = App.surface('Watched', { model: () => ({ project: Data.live(card, 'p1') }) })
  const watching = { watched: Surface.at(Watched, undefined) }
  const stream = 'Project:p1:name,status'

  it('reconnecting, which the live entry does on its own', () => {
    const error = { _tag: 'RemoteLiveError', message: 'dropped' }
    const broke = reduced(stored, { _tag: 'ReadFailed', requests: [], error, stream })

    expect(why(Data, broke, Data.live(card, 'p1'), { surfaces: watching }).because).toEqual([
      Why.LiveReconnecting({ surface: 'Watched', attempt: 1, error: Option.some(error) }),
    ])
  })

  it('refused, which nothing asks again', () => {
    const error = { _tag: 'RemoteLiveRefused', message: 'too many' }
    const refused = reduced(stored, { _tag: 'ReadFailed', requests: [], error, stream })

    expect(why(Data, refused, Data.live(card, 'p1'), { surfaces: watching }).because).toEqual([
      Why.LiveRefused({ surface: 'Watched', error }),
    ])
  })

  it('not for a read that is not live', () => {
    const error = { _tag: 'RemoteLiveError', message: 'dropped' }
    const broke = reduced(stored, { _tag: 'ReadFailed', requests: [], error, stream })

    expect(why(Data, broke, project, { surfaces: watching }).because).toEqual([])
  })
})
