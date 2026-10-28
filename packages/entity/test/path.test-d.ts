import { Schema } from 'effect'
import { describe, expectTypeOf, it } from 'vitest'
import { Expr, Query, type ExistsPredicate, type PathExpr, type Reads } from '../src/index.js'
import { Relational } from '../src/conformance/index.js'

const { Team, Member, Badge, Pin } = Relational

describe('Expr.path types', () => {
  it("reads the end field's type, or null when no row is reached", () => {
    const name = Expr.path(Member.relations.team, Team.fields.name)
    expectTypeOf(name).toExtend<PathExpr<string | null> & Reads<'Member'>>()
    const twice = Expr.path(
      Badge.relations.member,
      Expr.path(Member.relations.team, Team.fields.region),
    )
    expectTypeOf(twice).toExtend<PathExpr<string | null>>()
    expectTypeOf(Expr.path(Badge.relations.member, Member.fields.rank)).toExtend<
      PathExpr<number | null>
    >()
  })

  it('compares against a value of its type, and an input of it', () => {
    const name = Expr.path(Member.relations.team, Team.fields.name)
    Expr.eq(name, 'Red')
    Expr.eq(name, Expr.input('name', Schema.String))
    // @ts-expect-error a team's name is text
    Expr.eq(name, 3)
  })

  it('is an exists when it ends at one, read from the row it starts on', () => {
    const asked = Expr.path(Member.relations.team, Expr.exists(Pin.relations.team))
    expectTypeOf(asked).toExtend<ExistsPredicate & Reads<'Member'>>()
    Query.from(Member).pipe(Query.where(asked))
  })

  it('refuses an end that is not on the row reached', () => {
    // @ts-expect-error a path from a Badge is read on a Badge, not the Team reached
    Expr.path(Member.relations.team, Expr.path(Badge.relations.member, Member.fields.handle))
    // @ts-expect-error an exists asked of a Member is not asked of the Team reached
    Expr.path(Member.relations.team, Expr.exists(Badge.relations.member))
  })
})

describe('Expr.exists types', () => {
  it('is asked of the Entity its relation points at', () => {
    expectTypeOf(Expr.exists(Badge.relations.member)).toExtend<ExistsPredicate & Reads<'Member'>>()
    Query.from(Member).pipe(Query.where(Expr.exists(Badge.relations.member)))
  })

  it('takes a filter over the pointing row and the input', () => {
    Expr.exists(
      Badge.relations.member,
      Expr.eq(Badge.fields.kind, Expr.input('kind', Schema.String)),
    )
  })
})
