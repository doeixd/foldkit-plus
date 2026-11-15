// @vitest-environment node
/**
 * `Lower.check`: what keeps a declared write out of one aggregate, as data,
 * and `Lower.write` refusing to lower it, naming each.
 */
import { Schema } from 'effect'
import { Entity, Expr, Relation, Write } from 'foldkit-entity'
import { Guards } from 'foldkit-guard'
import { Mutation } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import { Lower, LoweringFinding } from '../../src/lower/index.js'

/** A note in a team; each test's Entity is its own, since an invariant is its Entity's. */
const domainOf = (name: string) => {
  const Team = Entity.define(
    `${name}Team`,
    Schema.Struct({ id: Schema.String, orgId: Schema.String }),
  )
  const Note = Entity.define(
    name,
    Schema.Struct({ id: Schema.String, title: Schema.String, revision: Schema.Number }),
  )
  const Related = Entity.relate({ Team, Note }, { Note: { team: Relation.one(Team) } })
  const inOrg = Expr.eq(Expr.path(Related.Note.relations.team, Related.Team.fields.orgId), 'o1')
  const G = Guards.declare(
    name,
    Schema.Struct({ id: Schema.String }),
    guard => ({
      inOrg: guard.row(Related.Note, () => inOrg),
      titled: guard.row(Related.Note, () => Expr.eq(Related.Note.fields.title, 'kept')),
    }),
    { key: user => user.id, unguarded: 'allow' },
  )
  return { Note: Related.Note, inOrg, G }
}

const Retitled = Schema.Struct({ id: Schema.String, revision: Schema.Number, title: Schema.String })

describe('Lower.check', () => {
  it('finds nothing in a write over its own row', () => {
    const { Note, G } = domainOf('Own')
    const Guarded = Note.pipe(Guards.attach(G, { row: { Update: [G.titled] } }))
    const write = Write.update(Entity.input(Guarded, Retitled), { id: 'id', expect: 'revision' })
    expect(Lower.check(write)).toEqual([])
  })

  it('names a precondition that reads through a relation', () => {
    const { Note, inOrg } = domainOf('When')
    const write = Write.update(Entity.input(Note, Retitled), {
      id: 'id',
      expect: 'revision',
      when: () => inOrg,
    })
    expect(Lower.check(write)).toEqual([
      LoweringFinding.OutsideBoundary({ source: 'when', name: 'when', reaches: ['team.orgId'] }),
    ])
  })

  it('names an Update rule that reads through a relation', () => {
    const { Note, G } = domainOf('Rule')
    const Guarded = Note.pipe(Guards.attach(G, { row: { Update: [G.inOrg] } }))
    const write = Write.update(Entity.input(Guarded, Retitled), { id: 'id', expect: 'revision' })
    expect(Lower.check(write)).toEqual([
      LoweringFinding.OutsideBoundary({ source: 'rule', name: 'inOrg', reaches: ['team.orgId'] }),
    ])
  })

  it('names an invariant that reads through a relation', () => {
    const { Note, inOrg } = domainOf('Held')
    const Held = Note.pipe(
      Entity.invariant('inOrg', ({ after }) => Expr.and(Expr.eq(after.title, 'kept'), inOrg), {
        message: 'Only o1',
        path: ['title'],
      }),
    )
    const write = Write.update(Entity.input(Held, Retitled), { id: 'id', expect: 'revision' })
    expect(Lower.check(write)).toEqual([
      LoweringFinding.OutsideBoundary({
        source: 'invariant',
        name: 'inOrg',
        reaches: ['team.orgId'],
      }),
    ])
  })

  it('names a link the row does not hold as a field', () => {
    const { Note } = domainOf('Link')
    const write = Write.update(
      Entity.input(Note, Schema.Struct({ id: Schema.String, teamId: Schema.String }), {
        teamId: 'team',
      }),
      { id: 'id' },
    )
    expect(Lower.check(write)).toEqual([LoweringFinding.NotPersisted({ member: 'team' })])
  })
})

describe('Lower.write', () => {
  it('refuses a write Lower.check finds outside one aggregate, naming what it reads', () => {
    const { Note, inOrg, G } = domainOf('Refused')
    const Retitle = Mutation.write(
      'Retitle',
      Write.update(Entity.input(Note, Retitled), {
        id: 'id',
        expect: 'revision',
        when: () => inOrg,
      }),
    )
    expect(() =>
      Lower.write(Retitle, {
        policy: G.implement({}),
        revision: 'revision',
        // Refused before any of these is read.
        principal: undefined as never,
        middleware: [],
        listed: undefined as never,
        event: undefined as never,
        record: () => undefined as never,
        apply: row => row,
      }),
    ).toThrow(/Retitle cannot be lowered into one aggregate: its when when reads team\.orgId/)
  })
})
