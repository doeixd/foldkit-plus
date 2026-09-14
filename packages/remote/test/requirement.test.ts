import { Schema } from 'effect'
import { Metadata, Projection } from 'foldkit-surface'
import { describe, expect, it } from 'vitest'
import {
  Requirement,
  RemoteConnections,
  RemoteRequirements,
  connectionsOf,
  requirementsOf,
  type ConnectionRequirement,
} from '../src/index.js'

const needs = (...requirements: Requirement[]) =>
  Projection.fromReader(Schema.Unknown as Schema.Schema<unknown>, (_root: unknown) => null, {
    metadata: RemoteRequirements.of(...requirements),
  })

const reads = (...connections: ConnectionRequirement[]) =>
  Projection.fromReader(Schema.Number, (_root: unknown) => 1, {
    metadata: RemoteConnections.of(...connections),
  })

describe('Requirement windows', () => {
  it('merges windows for the same entity and id', () => {
    const projection = Projection.struct({
      a: needs({ entity: 'E', id: 'e1', fields: ['x'], windows: { comments: { first: 5 } } }),
      b: needs({ entity: 'E', id: 'e1', fields: ['y'], windows: { tags: { first: 9 } } }),
    })

    expect(requirementsOf(projection)).toEqual([
      {
        entity: 'E',
        id: 'e1',
        fields: ['x', 'y'],
        windows: { comments: { first: 5 }, tags: { first: 9 } },
      },
    ])
  })

  it('omits windows when there are none', () => {
    const projection = Projection.struct({
      a: needs({ entity: 'E', id: 'e1', fields: ['x'] }),
    })

    expect(requirementsOf(projection)).toEqual([{ entity: 'E', id: 'e1', fields: ['x'] }])
  })
})

describe('Requirement relations', () => {
  const owner = { entity: 'User', fields: ['name'] }
  const ownerWithTeam = {
    entity: 'User',
    fields: ['id'],
    relations: { team: { entity: 'Team', fields: ['name'] } },
  }

  it('merges relations for the same entity and id, recursively', () => {
    const projection = Projection.struct({
      a: needs({ entity: 'Project', id: 'p1', fields: ['owner'], relations: { owner } }),
      b: needs({
        entity: 'Project',
        id: 'p1',
        fields: ['owner'],
        relations: { owner: ownerWithTeam },
      }),
      c: needs({
        entity: 'Project',
        id: 'p1',
        fields: ['owner'],
        relations: {
          owner: {
            entity: 'User',
            fields: [],
            relations: { team: { entity: 'Team', fields: ['id'] } },
          },
        },
      }),
    })

    expect(requirementsOf(projection)).toEqual([
      {
        entity: 'Project',
        id: 'p1',
        fields: ['owner'],
        relations: {
          owner: {
            entity: 'User',
            fields: ['name', 'id'],
            relations: { team: { entity: 'Team', fields: ['name', 'id'] } },
          },
        },
      },
    ])
  })

  it('keeps a relation only one side declares', () => {
    expect(
      Requirement.merge([
        { entity: 'Project', id: 'p1', fields: ['name'] },
        { entity: 'Project', id: 'p1', fields: ['owner'], relations: { owner } },
      ]),
    ).toEqual([{ entity: 'Project', id: 'p1', fields: ['name', 'owner'], relations: { owner } }])
  })

  it('mergeRelation unions fields, windows, and nested relations of one target', () => {
    const current = { entity: 'Project', fields: ['name'], relations: { owner } }
    expect(
      Requirement.mergeRelation(current, { entity: 'Project', fields: ['name', 'id'] }),
    ).toEqual({
      entity: 'Project',
      fields: ['name', 'id'],
      relations: { owner },
    })
    expect(
      Requirement.mergeRelation(
        { entity: 'Project', fields: [] },
        {
          entity: 'Project',
          fields: [],
          windows: { comments: { first: 1 } },
          relations: { owner },
        },
      ),
    ).toEqual({
      entity: 'Project',
      fields: [],
      windows: { comments: { first: 1 } },
      relations: { owner },
    })
  })

  it('later windows win inside a relation', () => {
    expect(
      Requirement.mergeRelation(
        {
          entity: 'Project',
          fields: [],
          relations: {
            comments: { entity: 'Comment', fields: [], windows: { replies: { first: 1 } } },
          },
        },
        {
          entity: 'Project',
          fields: [],
          relations: {
            comments: { entity: 'Comment', fields: [], windows: { replies: { first: 9 } } },
          },
        },
      ).relations,
    ).toEqual({ comments: { entity: 'Comment', fields: [], windows: { replies: { first: 9 } } } })
  })
})

describe('connections ride on Projections', () => {
  const select = { entity: 'Project', fields: ['name'] }
  const feed = { identity: 'Feed\u0000{}', window: { first: 10 }, select }

  it('struct, array, option, and fromReader carry them', () => {
    const other = { ...feed, window: { first: 20 } }
    expect(connectionsOf(Projection.struct({ a: reads(feed), b: reads(other) }))).toEqual([
      feed,
      other,
    ])
    expect(connectionsOf(Projection.struct({ a: reads(feed), b: reads(feed) }))).toEqual([feed])
    expect(connectionsOf(Projection.array(reads(feed)))).toEqual([feed])
    expect(connectionsOf(Projection.option(reads(feed)))).toEqual([feed])
    expect(connectionsOf(Projection.fromReader(Schema.String, () => 'x'))).toEqual([])
  })

  it('mergeConnections unions what one connection and window select, and keeps windows apart', () => {
    expect(
      Requirement.mergeConnections([
        feed,
        { ...feed, select: { entity: 'Project', fields: ['id'] } },
        { ...feed, window: { first: 20 } },
      ]),
    ).toEqual([
      { ...feed, select: { entity: 'Project', fields: ['name', 'id'] } },
      { ...feed, window: { first: 20 } },
    ])
    // Whatever else the first carries (a remote ref, say) survives the merge.
    expect(
      Requirement.mergeConnections([
        { ...feed, extra: 1 } as typeof feed,
        { ...feed, extra: 2 } as typeof feed,
      ]),
    ).toEqual([{ ...feed, extra: 1 }])
  })

  it('summarizes requirements and connections for tooling', () => {
    const page = Projection.struct({
      project: needs({ entity: 'Project', id: 'p1', fields: ['name'] }),
      feed: reads(feed),
    })

    expect(Metadata.summarize(page.metadata)).toEqual([
      { name: 'remote', entries: ['Project:p1'] },
      { name: 'remote.connection', entries: ['Feed {}'] },
    ])
  })
})

describe('Requirement.merge keeps the live mark', () => {
  it('a requirement is live when any merged part is', () => {
    const plain = { entity: 'User', id: 'u1', fields: ['name'] }
    expect(Requirement.merge([plain, { ...plain, fields: ['id'], live: true }])).toEqual([
      { entity: 'User', id: 'u1', fields: ['name', 'id'], live: true },
    ])
    expect(Requirement.merge([plain, { ...plain, live: false }])).toEqual([plain])
    // Whichever part carries it, first or later.
    expect(
      Requirement.merge([
        { ...plain, live: true },
        { ...plain, fields: ['id'] },
      ]),
    ).toEqual([{ entity: 'User', id: 'u1', fields: ['name', 'id'], live: true }])
  })
})
