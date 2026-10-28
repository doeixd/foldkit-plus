import { Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import {
  Entity,
  Expr,
  Order,
  Query,
  Relation,
  dependenciesOf,
  maxPathLength,
} from '../src/index.js'
import { Relational } from '../src/conformance/index.js'
import { Blog } from './blogFixture.js'

const { Team, Member, Badge, Pin } = Relational

describe('Expr.path', () => {
  it('flattens a path of paths into one, its relations in order', () => {
    const path = Expr.path(
      Badge.relations.member,
      Expr.path(Member.relations.team, Team.fields.name),
    )
    expect(path.via.map(relation => relation.key)).toEqual(['member', 'team'])
    expect(path.field.key).toBe('name')
    expect(Expr.show(path)).toBe('Badge.member.team.name')
  })

  it('carries an exists asked of the row it reaches', () => {
    const asked = Expr.path(Member.relations.team, Expr.exists(Pin.relations.team))
    expect(asked._tag).toBe('Exists')
    expect(asked.via.map(relation => relation.key)).toEqual(['team'])
    expect(Expr.show(asked)).toBe('Member.team: exists Pin.team')
  })

  it.each([
    {
      what: 'a many relation, naming the one that points back',
      build: () =>
        // @ts-expect-error a many relation is no path
        Expr.path(Blog.Post.relations.comments, Blog.Comment.fields.body),
      refusal: /many relation.*Expr\.exists/,
    },
    {
      what: 'a field of an Entity the relation does not reach',
      build: () =>
        // @ts-expect-error a Badge field is not on the Team reached
        Expr.path(Member.relations.team, Badge.fields.kind),
      refusal: /reaches a Team, but Badge\.kind is read on a Badge/,
    },
    {
      what: 'a value at the end, which no row holds',
      build: () =>
        // @ts-expect-error a value is not read on a row
        Expr.path(Member.relations.team, 'Red'),
      refusal: /ends at a field, a path or an exists/,
    },
    {
      what: 'something that is not a relation first',
      build: () =>
        // @ts-expect-error a field is not a relation
        Expr.path(Member.fields.handle, Team.fields.name),
      refusal: /first argument is a relation/,
    },
  ])('refuses $what', ({ build, refusal }) => {
    expect(build).toThrow(refusal)
  })

  it(`refuses a path of more than ${maxPathLength} relations`, () => {
    const Node = Entity.define('Node', Schema.Struct({ id: Schema.String, label: Schema.String }))
    const { Node: N } = Entity.relate({ Node }, { Node: { parent: Relation.one(Node) } })
    let path = Expr.path(N.relations.parent, N.fields.label)
    for (let length = 1; length < maxPathLength; length++)
      path = Expr.path(N.relations.parent, path)
    expect(path.via).toHaveLength(maxPathLength)
    expect(() => Expr.path(N.relations.parent, path)).toThrow(/more than 4 relations/)
  })

  it('cannot order a list, which orders by its own row', () => {
    expect(() => Order.asc(Expr.path(Member.relations.team, Team.fields.name))).toThrow(/is a path/)
  })
})

describe('Expr.exists', () => {
  it.each([
    {
      what: "a filter over another Entity's field",
      build: () =>
        // @ts-expect-error the filter reads a Member, not the pointing Badge
        Expr.exists(Badge.relations.member, Expr.eq(Member.fields.handle, 'x')),
      refusal: /reads Member\.handle; it reads the pointing Badge's own fields/,
    },
    {
      what: 'a filter that reaches past its row',
      build: () =>
        Expr.exists(
          Badge.relations.member,
          Expr.isNull(Expr.path(Badge.relations.member, Member.fields.handle)),
        ),
      refusal: /reads past its row/,
    },
    {
      what: 'a many relation',
      build: () =>
        // @ts-expect-error a many relation points nowhere back
        Expr.exists(Blog.Post.relations.comments),
      refusal: /many relation; name the one relation that points back$/,
    },
  ])('refuses $what', ({ build, refusal }) => {
    expect(build).toThrow(refusal)
  })

  it('reads its filter as SQL reads it', () => {
    expect(Expr.show(Expr.exists(Badge.relations.member, Expr.eq(Badge.fields.kind, 'gold')))).toBe(
      'exists Badge.member where Badge.kind = "gold"',
    )
  })
})

describe('what a path and an exists read', () => {
  const kind = Expr.input('kind', Schema.String)
  const exists = Expr.exists(Badge.relations.member, Expr.eq(Badge.fields.kind, kind))
  const path = Expr.path(Member.relations.team, Team.fields.name)

  it("names each in `reaches`, its filter's inputs and operations in the lists, and no other row's field", () => {
    const read = dependenciesOf(Expr.and(Expr.eq(path, 'Red'), exists))
    expect(read.reaches).toEqual([path, exists])
    expect(read.fields).toEqual([])
    expect(read.inputs).toEqual(['kind'])
    expect(read.operations).toEqual(['and', 'eq', 'path', 'exists'])
  })

  it('belongs to a query over the row it starts from, and no other', () => {
    expect(() => Query.from(Member).pipe(Query.where(Expr.eq(path, 'Red')))).not.toThrow()
    expect(() => Query.from(Member).pipe(Query.where(exists))).not.toThrow()
    // @ts-expect-error the path starts from a Member
    expect(() => Query.from(Badge).pipe(Query.where(Expr.eq(path, 'Red')))).toThrow(
      /reads Member\.team, but the query is from Badge/,
    )
    // @ts-expect-error the exists is asked of a Member
    expect(() => Query.from(Badge).pipe(Query.where(exists))).toThrow(
      /reads Member\.id, but the query is from Badge/,
    )
  })
})
