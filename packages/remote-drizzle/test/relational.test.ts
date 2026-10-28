/**
 * What `query` refuses of a body that reads other rows, at registration, and
 * the one thing compiling refuses at request time: reaching a table without
 * what its reader may see of it. The answers themselves are in
 * `conformance.test.ts`.
 */
import { Schema } from 'effect'
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { describe, expect, it } from 'vitest'
import { Entity, Expr, Order, Query as Body, Relation, type AnyQuery } from 'foldkit-entity'
import { Relational } from 'foldkit-entity/conformance'
import { Query } from 'foldkit-remote'
import { bind, compileWhere, entity, query } from '../src/index.js'

const teams = sqliteTable('rel_teams', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  region: text('region'),
})
const members = sqliteTable('rel_members', {
  id: text('id').primaryKey(),
  handle: text('handle').notNull(),
  rank: integer('rank').notNull(),
  teamId: text('team_id'),
})
const badges = sqliteTable('rel_badges', {
  id: text('id').primaryKey(),
  kind: text('kind').notNull(),
  memberId: text('member_id').notNull(),
})
const pins = sqliteTable('rel_pins', {
  id: text('id').primaryKey(),
  label: text('label').notNull(),
  teamId: text('team_id').notNull(),
})
const bound = bind(Relational, {
  Team: { table: teams },
  Member: { table: members, relations: { team: { field: members.teamId } } },
  Badge: { table: badges, relations: { member: { field: badges.memberId } } },
  Pin: { table: pins, relations: { team: { field: pins.teamId } } },
})

const { Member: M, Team: T, Badge: B } = Relational
const descriptor = (name: string, body: AnyQuery) => ({
  ...Query.make(name, { Input: {}, Result: Query.connection(body.entity) }),
  body,
})
const members_ = Body.from(M).pipe(Body.orderBy(Order.asc(M.fields.id)))

describe('a body that reads other rows, at registration', () => {
  it('registers a path and an exists over Entities bound together', () => {
    const body = members_.pipe(
      Body.where(Expr.eq(Expr.path(M.relations.team, T.fields.name), 'Red')),
      Body.where(Expr.exists(B.relations.member)),
    )
    expect(() => query(descriptor('Fine', body), { entity: bound.Member })).not.toThrow()
  })

  it('refuses one that meets a table twice, which would need an alias', () => {
    // Members, then their team, then the team's members: `rel_members` twice.
    const body = members_.pipe(
      Body.where(Expr.path(M.relations.team, Expr.exists(M.relations.team))),
    )
    expect(() => query(descriptor('Twice', body), { entity: bound.Member })).toThrow(
      /reaches Member's table twice/,
    )
  })

  it('refuses one over a binding made alone, which reaches nothing', () => {
    const alone = entity('Member', members)
    const body = members_.pipe(
      Body.where(Expr.eq(Expr.path(M.relations.team, T.fields.name), 'Red')),
    )
    expect(() => query(descriptor('Alone', body), { entity: alone })).toThrow(
      /reaches Team, which is not bound beside it/,
    )
  })

  it('refuses a relation stored on the other table, which a path cannot leave this one by', () => {
    const User = Entity.define('User', Schema.Struct({ id: Schema.String, name: Schema.String }))
    const Profile = Entity.define(
      'Profile',
      Schema.Struct({ id: Schema.String, bio: Schema.String }),
    )
    const Domain = Entity.relate(
      { User, Profile },
      { User: { profile: Relation.one(Profile, { optional: true }) } },
    )
    const users = sqliteTable('users', {
      id: text('id').primaryKey(),
      name: text('name').notNull(),
    })
    const profiles = sqliteTable('profiles', {
      id: text('id').primaryKey(),
      bio: text('bio').notNull(),
      userId: text('user_id').notNull().unique(),
    })
    const domain = bind(Domain, {
      User: { table: users, relations: { profile: { foreignKey: profiles.userId } } },
      Profile: { table: profiles },
    })
    const body = Body.from(Domain.User).pipe(
      Body.where(Expr.eq(Expr.path(Domain.User.relations.profile, Domain.Profile.fields.bio), 'x')),
      Body.orderBy(Order.asc(Domain.User.fields.id)),
    )
    expect(() => query(descriptor('Inverse', body), { entity: domain.User })).toThrow(
      /goes through User\.profile, which is not stored on User's own table/,
    )
  })
})

describe('compiling a body that reads other rows', () => {
  it('refuses without what the reader may see of the table reached, rather than read every row', () => {
    const body = members_.pipe(
      Body.where(Expr.eq(Expr.path(M.relations.team, T.fields.name), 'Red')),
    )
    expect(() => compileWhere(body, bound.Member, {}, 'Unseen')).toThrow(
      /compiled without what its reader may see of it/,
    )
  })
})
