/**
 * A query declared by what it means, run here. The claim this file exists to
 * check is that a compiled body is the same query the hand-written binding was
 * — same SQL, same parameters — and that compiling one cannot get past what the
 * binding says a principal may see.
 */
import { eq, isNotNull, type SQL } from 'drizzle-orm'
import { pgTable, PgDialect, text, uuid } from 'drizzle-orm/pg-core'
import { Effect, Schema } from 'effect'
import { Entity as DomainEntity, Expr, Order } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { describe, expect, it } from 'vitest'
import {
  DrizzleDatabase,
  QueryCompileError,
  entity,
  query,
  type DrizzleDatabaseService,
  type DrizzleStatement,
} from '../src/index.js'

const posts = pgTable('posts', {
  id: uuid('id').primaryKey(),
  slug: text('slug').notNull(),
  archivedAt: text('archived_at'),
})

const Post = DomainEntity.define(
  'Post',
  Schema.Struct({ id: Schema.String, slug: Schema.String, archivedAt: Schema.String }),
)

const PostBinding = entity('Post', posts)

/** The CMS's `bySlug`, as it is written today: the meaning in the binding. */
const MadeBySlug = Query.make('PostsBySlug', {
  Input: Schema.Struct({ slug: Schema.String }),
  Result: Query.connection({ name: 'Post' }),
})

/** The same query, as a body the server compiles. */
const DefinedBySlug = Query.define('PostsBySlug', { slug: Schema.String }, ({ input }) =>
  Query.from(Post).pipe(
    Query.where(Expr.eq(Post.fields.slug, input.slug)),
    Query.orderBy(Order.asc(Post.fields.id)),
  ),
)

const fakeDatabase = () => {
  const calls: Array<{ where: unknown; orderBy: ReadonlyArray<unknown> | undefined }> = []
  const database: DrizzleDatabaseService = {
    select: () => {
      const call = {
        where: undefined as unknown,
        orderBy: undefined as ReadonlyArray<unknown> | undefined,
      }
      calls.push(call)
      const promise = Promise.resolve([] as ReadonlyArray<Record<string, unknown>>)
      const statement = {
        where: (condition: unknown) => {
          call.where = condition
          return statement
        },
        orderBy: (...order: ReadonlyArray<unknown>) => {
          call.orderBy = order
          return statement
        },
        limit: () => statement,
        then: promise.then.bind(promise),
      } as unknown as DrizzleStatement
      return { from: () => statement }
    },
  }
  return { database, calls }
}

const dialect = new PgDialect()
const rendered = (value: unknown) => {
  const { sql, params } = dialect.sqlToQuery(value as SQL)
  return { sql, params }
}

type AnySource = ReturnType<typeof query>

const run = (source: AnySource, database: DrizzleDatabaseService, slug = 'hello') =>
  Effect.runPromise(
    Effect.result(
      source
        .run({ input: { slug }, window: { first: 5 }, principal: null })
        .pipe(Effect.provideService(DrizzleDatabase, database)),
    ),
  )

describe('A compiled body is the query the binding used to spell out', () => {
  it('produces the same SQL and parameters as the hand-written where', async () => {
    const made = query(MadeBySlug, {
      entity: PostBinding,
      where: input => eq(posts.slug, (input as { slug: string }).slug),
      orderBy: [{ column: posts.id, direction: 'asc' }],
    })
    const defined = query(DefinedBySlug, { entity: PostBinding })

    const madeDb = fakeDatabase()
    const definedDb = fakeDatabase()
    await run(made, madeDb.database)
    await run(defined, definedDb.database)

    expect(rendered(definedDb.calls[0]!.where)).toEqual(rendered(madeDb.calls[0]!.where))
    expect(rendered(definedDb.calls[0]!.where).params).toEqual(['hello'])
  })

  it('orders by what the body says, compiled to the columns of the binding', async () => {
    const defined = query(DefinedBySlug, { entity: PostBinding })
    const { database, calls } = fakeDatabase()

    await run(defined, database)

    expect(rendered(calls[0]!.orderBy![0]).sql).toContain('"posts"."id"')
    expect(rendered(calls[0]!.orderBy![0]).sql).toContain('asc')
  })

  it('still conjoins what the binding says a principal may see', async () => {
    const guarded = entity('Post', posts, {
      visible: principal => (principal === null ? isNotNull(posts.archivedAt) : undefined),
    })
    const defined = query(DefinedBySlug, { entity: guarded })
    const { database, calls } = fakeDatabase()

    await run(defined, database)

    const where = rendered(calls[0]!.where).sql
    expect(where).toContain('"posts"."slug"')
    expect(where).toContain('"archived_at" is not null')
  })

  it('conjoins an extra where of the server with the body, never replacing it', async () => {
    const defined = query(DefinedBySlug, {
      entity: PostBinding,
      where: () => isNotNull(posts.archivedAt),
    })
    const { database, calls } = fakeDatabase()

    await run(defined, database)

    const where = rendered(calls[0]!.where).sql
    expect(where).toContain('"posts"."slug"')
    expect(where).toContain('"archived_at" is not null')
  })

  it('tie-breaks a body order that does not end on the id, so paging is stable', async () => {
    // A body says what the rows mean, not how a cursor walks them. Ordering by
    // slug alone is ambiguous between two rows of the same slug, and keyset
    // paging over an ambiguous order can repeat or skip one.
    const BySlugOnly = Query.define('BySlugOnly', {}, () =>
      Query.from(Post).pipe(Query.orderBy(Order.desc(Post.fields.slug))),
    )
    const defined = query(BySlugOnly, { entity: PostBinding })
    const { database, calls } = fakeDatabase()

    await run(defined, database)

    expect(calls[0]!.orderBy!.map(term => rendered(term).sql)).toEqual([
      '"posts"."slug" desc',
      '"posts"."id" asc',
    ])
  })

  it('leaves a body order that already ends on the id alone', async () => {
    const defined = query(DefinedBySlug, { entity: PostBinding })
    const { database, calls } = fakeDatabase()

    await run(defined, database)

    expect(calls[0]!.orderBy!.map(term => rendered(term).sql)).toEqual(['"posts"."id" asc'])
  })

  it('refuses at registration a body ordering by a field the binding has no column for', () => {
    const Ghost = DomainEntity.define(
      'Post',
      Schema.Struct({ id: Schema.String, missing: Schema.String }),
    )
    const ByMissing = Query.define('ByMissing', {}, () =>
      Query.from(Ghost).pipe(Query.orderBy(Order.asc(Ghost.fields.missing))),
    )

    expect(() => query(ByMissing, { entity: PostBinding })).toThrow(QueryCompileError)
    expect(() => query(ByMissing, { entity: PostBinding })).toThrow(
      'query "ByMissing" reads the field "missing", which the binding has no column for',
    )
  })

  it('refuses a descriptor with neither a body nor an orderBy', () => {
    expect(() => query(MadeBySlug, { entity: PostBinding })).toThrow(
      'needs an orderBy, or a descriptor declared with Query.define whose body has one',
    )
  })

  it('refuses a body with no ordering at all: a connection pages on a stable order', () => {
    const Unordered = Query.define('Unordered', {}, () => Query.from(Post))

    expect(() => query(Unordered, { entity: PostBinding })).toThrow('has a body with no ordering')
  })

  it('lets the binding override the order of the body when it says so', async () => {
    const defined = query(DefinedBySlug, {
      entity: PostBinding,
      orderBy: [{ column: posts.slug, direction: 'desc' }],
    })
    const { database, calls } = fakeDatabase()

    await run(defined, database)

    expect(rendered(calls[0]!.orderBy![0]).sql).toContain('"posts"."slug"')
  })

  it('compares the same however the body wrote the comparison round', async () => {
    // The input on the left and the column on the right: Drizzle's `eq` wants
    // the column first, so the compiler has to turn this one around.
    const Reversed = Query.define('Reversed', { slug: Schema.String }, ({ input }) =>
      Query.from(Post).pipe(
        Query.where(Expr.eq(input.slug, Expr.field(Post.fields.slug))),
        Query.orderBy(Order.asc(Post.fields.id)),
      ),
    )
    const defined = query(Reversed, { entity: PostBinding })
    const { database, calls } = fakeDatabase()

    await run(defined, database)

    // Normalised to column-first, which is both what Drizzle's own `eq` reads
    // like and what the hand-written binding produced. `$1 = "posts"."slug"`
    // would be the same query and a different string, and the point of this
    // compiler is that the two are not merely equivalent but identical.
    expect(rendered(calls[0]!.where)).toEqual({
      sql: '"posts"."slug" = $1',
      params: ['hello'],
    })
  })

  it('reads the value the request was given, not the one the body was built with', async () => {
    const defined = query(DefinedBySlug, { entity: PostBinding })
    const { database, calls } = fakeDatabase()

    await run(defined, database, 'another')

    expect(rendered(calls[0]!.where).params).toEqual(['another'])
  })
})

describe('A body the binding cannot answer is refused when it is registered', () => {
  const Ghost = DomainEntity.define(
    'Post',
    Schema.Struct({ id: Schema.String, missing: Schema.String }),
  )

  it('refuses a predicate over a field the binding has no column for', () => {
    const ByMissing = Query.define('ByMissingWhere', { v: Schema.String }, ({ input }) =>
      Query.from(Ghost).pipe(
        Query.where(Expr.eq(Ghost.fields.missing, input.v)),
        Query.orderBy(Order.asc(Ghost.fields.id)),
      ),
    )

    // Not on the first request that happens to run it: a server that starts is
    // a server whose queries can be answered.
    expect(() => query(ByMissing, { entity: PostBinding })).toThrow(
      'query "ByMissingWhere" reads the field "missing", which the binding has no column for',
    )
  })
})
