/**
 * Identity, Primary/Composite Keys, Typed Relations, Self-Referential SQL/Drizzle,
 * Relation Cardinality Z3 Proofs, Domain.Ordinal, and OrderedEnum Extensions.
 */
import { DatabaseSync } from 'node:sqlite'
import { PGlite } from '@electric-sql/pglite'
import { Effect, Option, Result, Schema } from 'effect'
import { Bool, Eq, Expr, Null, Num, Path, Transition, Verdict } from 'metakit'
import { Domain, Id, OrderedEnum, Ordinal } from 'metakit/domain'
import * as Prove from 'metakit/prove'
import * as Relation from 'metakit/relation'
import * as Sql from 'metakit/sql'
import { describe, expect, it } from 'vitest'

describe('Domain.Id: branded, NUL-free entity identifiers', () => {
  const UserId = Id.make('User', { prefix: 'usr_', maxLength: 32 })
  const OrgId = Id.make('Org', { prefix: 'org_' })

  it('validates prefix, length, NUL-freedom, metadata, and Z3 reflexivity', async () => {
    expect(Domain.domainOf(UserId)).toEqual(
      Option.some({ kind: 'id', entity: 'User', prefix: 'usr_' }),
    )
    expect(Schema.decodeUnknownSync(UserId)('usr_alice')).toBe('usr_alice')
    expect(() => Schema.decodeUnknownSync(UserId)('org_alice')).toThrow()
    expect(() => Schema.decodeUnknownSync(UserId)('usr_')).toThrow()
    expect(() => Schema.decodeUnknownSync(UserId)('usr_a\u0000b')).toThrow()
    expect(() => Id.value('User', '')).toThrow()

    const Doc = Schema.Struct({ authorId: UserId, orgId: OrgId })
    const $ = Path.from(Doc)

    // Type safety: UserId and OrgId are distinct branded types
    const sameUser = Eq.is($.authorId, Id.value('User', 'usr_alice'))
    expect(
      Expr.evaluate(sameUser, {
        authorId: Id.value('User', 'usr_alice'),
        orgId: Id.value('Org', 'org_1'),
      }),
    ).toBe(true)

    // @ts-expect-error cannot compare UserId with OrgId
    void Eq.is($.authorId, $.orgId)

    // Z3 recognizes Domain.Id as NUL-free, so reflexivity proves True!
    expect(
      Verdict.isTrue(await Effect.runPromise(Prove.invariant(Doc, Eq.is($.authorId, $.authorId)))),
    ).toBe(true)
  })
})

describe('Domain.Ordinal & OrderedEnum extensions', () => {
  it('generates strictly ordered base-62 fractional-index ordinals across 100 bisections', () => {
    expect(Domain.domainOf(Ordinal.schema)).toEqual(Option.some({ kind: 'ordinal' }))
    let lo = Ordinal.before(Ordinal.initial)
    let hi = Ordinal.after(Ordinal.initial)
    expect(lo < Ordinal.initial).toBe(true)
    expect(Ordinal.initial < hi).toBe(true)

    // 100 consecutive insertions right at the lower boundary (stress-tests adjacent digits)
    let curHi = hi
    for (let i = 0; i < 100; i++) {
      const mid = Ordinal.between(lo, curHi)
      expect(Schema.is(Ordinal.schema)(mid)).toBe(true)
      expect(lo < mid).toBe(true)
      expect(mid < curHi).toBe(true)
      curHi = mid
    }

    // Edge cases: adjacent single-char digits & 'z' extension
    const mid01 = Ordinal.between(Ordinal.from('0'), Ordinal.from('1'))
    expect('0' < mid01 && mid01 < '1').toBe(true)
    const afterZ = Ordinal.after(Ordinal.from('z'))
    expect('z' < afterZ).toBe(true)
    const before1 = Ordinal.before(Ordinal.from('1'))
    expect(before1 < '1').toBe(true)
  })

  it('evaluates and proves OrderedEnum min, max, next, prev, and distance in Z3', async () => {
    const Stage = OrderedEnum.make(['draft', 'review', 'approved', 'published'])
    expect(Stage.min).toBe('draft')
    expect(Stage.max).toBe('published')

    const Pair = Schema.Struct({ a: Stage.schema, b: Stage.schema })
    const $ = Path.from(Pair)

    expect(Expr.evaluate(Stage.next($.a), { a: 'draft', b: 'review' })).toBe('review')
    expect(Expr.evaluate(Stage.next($.a), { a: 'published', b: 'review' })).toBeNull()
    expect(Expr.evaluate(Stage.prev($.a), { a: 'draft', b: 'review' })).toBeNull()
    expect(Expr.evaluate(Stage.distance($.b, $.a), { a: 'draft', b: 'approved' })).toBe(2)

    // Z3 formal proofs over OrderedEnum extensions:
    // 1. distance(a, b) === -distance(b, a)
    expect(
      Verdict.isTrue(
        await Effect.runPromise(
          Prove.invariant(Pair, Eq.is(Stage.distance($.a, $.b), Num.neg(Stage.distance($.b, $.a)))),
        ),
      ),
    ).toBe(true)
    // 2. a !== max => next(a) is non-null and strictly greater than a
    expect(
      Verdict.isTrue(
        await Effect.runPromise(
          Prove.invariant(
            Pair,
            Expr.implies(Eq.isNot($.a, Stage.max), Null.isNotNull(Stage.next($.a))),
          ),
        ),
      ),
    ).toBe(true)
    // 3. Advancing via Stage.next in a Transition preserves strict forward progress (and invariant)
    const Doc = Schema.Struct({ stage: Stage.schema })
    const Advance = Transition.make({
      state: Doc,
      input: Schema.Struct({}),
      when: ({ state }) => Eq.isNot(state.stage, Stage.max),
      apply: ({ state }) => [
        Transition.set(state.stage, Null.coalesce(Stage.next(state.stage), Stage.max)),
      ],
    })
    expect(Verdict.isTrue(await Effect.runPromise(Prove.transition(Doc, Advance)))).toBe(true)
    expect(
      Verdict.isTrue(
        await Effect.runPromise(
          Prove.invariant(
            Pair,
            Expr.implies(
              Eq.isNot($.a, Stage.max),
              Stage.gt(Null.coalesce(Stage.next($.a), Stage.max), $.a),
            ),
          ),
        ),
      ),
    ).toBe(true)
  })
})

describe('Typed Relation.define, Self-Referential SQL, Composite Keys & Z3 Cardinality Proofs', () => {
  it('runs self-referential tree Relation subqueries in both PGlite Postgres and SQLite', async () => {
    const Category = Schema.Struct({
      id: Id.make('Category'),
      parentId: Schema.NullOr(Id.make('Category')),
      active: Schema.Boolean,
    })

    const Children = Relation.define({
      name: 'Category.parentId',
      parent: Category,
      child: Category,
      foreignKey: 'parentId',
      parentKey: 'id',
      cardinality: 'many',
      onDelete: 'cascade',
    })

    const hasActiveChild = Expr.in({ row: Category }, ({ row }) =>
      Relation.any(row, Children, child => child.active),
    )

    // 1. PGlite Postgres
    const pg = new PGlite()
    await pg.exec(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        "parentId" TEXT REFERENCES categories(id),
        active BOOLEAN NOT NULL
      );
      INSERT INTO categories (id, "parentId", active) VALUES
        ('root', NULL, true),
        ('a', 'root', true),
        ('b', 'root', false),
        ('a1', 'a', false);
    `)
    const pgWhere = Result.getOrThrow(
      Sql.toWhere(hasActiveChild, {
        dialect: 'postgres',
        table: 'categories',
        relations: { 'Category.parentId': { table: 'categories', foreignKey: 'parentId' } },
      }),
    )
    const pgRows = await pg.query<{ id: string }>(
      `SELECT id FROM categories WHERE ${pgWhere.text} ORDER BY id`,
      [...pgWhere.params],
    )
    // Only 'root' has an active child ('a'); 'a' only has inactive child 'a1'
    expect(pgRows.rows).toEqual([{ id: 'root' }])
    await pg.close()

    // 2. node:sqlite
    const sqlite = new DatabaseSync(':memory:')
    sqlite.exec(`
      CREATE TABLE categories (
        id TEXT PRIMARY KEY,
        "parentId" TEXT,
        active INTEGER NOT NULL
      );
      INSERT INTO categories (id, "parentId", active) VALUES
        ('root', NULL, 1),
        ('a', 'root', 1),
        ('b', 'root', 0),
        ('a1', 'a', 0);
    `)
    const sqWhere = Result.getOrThrow(
      Sql.toWhere(hasActiveChild, {
        dialect: 'sqlite',
        table: 'categories',
        relations: { 'Category.parentId': { table: 'categories', foreignKey: 'parentId' } },
      }),
    )
    const sqRows = sqlite
      .prepare(`SELECT id FROM categories WHERE ${sqWhere.text} ORDER BY id`)
      .all(...(sqWhere.params as Array<string | number | null>)) as Array<{ id: string }>
    expect(sqRows).toEqual([{ id: 'root' }])
    sqlite.close()
  })

  it('supports composite foreign/parent keys in Relation.define and PGlite SQL', async () => {
    const TenantRoom = Schema.Struct({
      tenantId: Id.make('Tenant'),
      code: Schema.String,
    })
    const Booking = Schema.Struct({
      id: Id.make('Booking'),
      tenantId: Id.make('Tenant'),
      roomCode: Schema.String,
      confirmed: Schema.Boolean,
    })

    const RoomBookings = Relation.define({
      name: 'Booking.tenantRoom',
      parent: TenantRoom,
      child: Booking,
      foreignKey: ['tenantId', 'roomCode'],
      parentKey: ['tenantId', 'code'],
      cardinality: 'many',
    })

    const hasConfirmed = Expr.in({ row: TenantRoom }, ({ row }) =>
      Relation.any(row, RoomBookings, b => b.confirmed),
    )

    const pg = new PGlite()
    await pg.exec(`
      CREATE TABLE tenant_rooms ("tenantId" TEXT NOT NULL, code TEXT NOT NULL, PRIMARY KEY ("tenantId", code));
      CREATE TABLE bookings (id TEXT PRIMARY KEY, "tenantId" TEXT NOT NULL, "roomCode" TEXT NOT NULL, confirmed BOOLEAN NOT NULL);
      INSERT INTO tenant_rooms VALUES ('t1', '101'), ('t2', '101');
      INSERT INTO bookings VALUES ('b1', 't1', '101', true), ('b2', 't2', '101', false);
    `)
    const where = Result.getOrThrow(
      Sql.toWhere(hasConfirmed, {
        dialect: 'postgres',
        table: 'tenant_rooms',
        relations: {
          'Booking.tenantRoom': {
            table: 'bookings',
            foreignKey: ['tenantId', 'roomCode'],
            key: ['tenantId', 'code'],
          },
        },
      }),
    )
    const rows = await pg.query<{ tenantId: string; code: string }>(
      `SELECT "tenantId", code FROM tenant_rooms WHERE ${where.text}`,
      [...where.params],
    )
    // Only (t1, 101) has a confirmed booking — t2's 101 is isolated by composite key!
    expect(rows.rows).toEqual([{ tenantId: 't1', code: '101' }])
    await pg.close()
  })

  it('proves Relation cardinality and quantifier theorems in Z3', async () => {
    const Parent = Schema.Struct({ id: Id.make('Parent') })
    const Child = Schema.Struct({
      id: Id.make('Child'),
      parentId: Id.make('Parent'),
      active: Schema.Boolean,
    })

    const ManyKids = Relation.define({
      name: 'Child.many',
      parent: Parent,
      child: Child,
      foreignKey: 'parentId',
      cardinality: 'many',
    })
    const OneProfile = Relation.define({
      name: 'Child.one',
      parent: Parent,
      child: Child,
      foreignKey: 'parentId',
      cardinality: 'one',
    })
    const OptProfile = Relation.define({
      name: 'Child.optional',
      parent: Parent,
      child: Child,
      foreignKey: 'parentId',
      cardinality: 'optional',
    })

    const $ = Path.from(Parent)

    // 1. Filtered count <= total count
    expect(
      Verdict.isTrue(
        await Effect.runPromise(
          Prove.invariant(
            Parent,
            Num.lte(
              Relation.count($, ManyKids, c => c.active),
              Relation.count($, ManyKids),
            ),
          ),
        ),
      ),
    ).toBe(true)

    // 2. every(rel, p) && count(rel) >= 1 => any(rel, p)
    expect(
      Verdict.isTrue(
        await Effect.runPromise(
          Prove.invariant(
            Parent,
            Expr.implies(
              Expr.all(
                Relation.every($, ManyKids, c => c.active),
                Num.gte(Relation.count($, ManyKids), 1),
              ),
              Relation.any($, ManyKids, c => c.active),
            ),
          ),
        ),
      ),
    ).toBe(true)

    // 3. cardinality 'one': count === 1 AND any(p) <=> every(p)!
    expect(
      Verdict.isTrue(
        await Effect.runPromise(Prove.invariant(Parent, Eq.is(Relation.count($, OneProfile), 1))),
      ),
    ).toBe(true)
    expect(
      Verdict.isTrue(
        await Effect.runPromise(
          Prove.invariant(
            Parent,
            Eq.is(
              Relation.any($, OneProfile, c => c.active),
              Relation.every($, OneProfile, c => c.active),
            ),
          ),
        ),
      ),
    ).toBe(true)

    // 4. cardinality 'optional': count <= 1
    expect(
      Verdict.isTrue(
        await Effect.runPromise(Prove.invariant(Parent, Num.lte(Relation.count($, OptProfile), 1))),
      ),
    ).toBe(true)
  })
})
