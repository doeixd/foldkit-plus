import { eq } from 'drizzle-orm'
import { sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { Schema } from 'effect'
import { Query } from 'foldkit-remote'
import type { QuerySource } from 'foldkit-remote-server'
import { expectTypeOf } from 'vitest'
import { entity, query, type DrizzleDatabase } from '../src/index.js'

const posts = sqliteTable('posts', {
  id: text('id').primaryKey(),
  slug: text('slug').notNull(),
  authorId: text('author_id').notNull(),
})
const Post = entity('Post', posts)
const BySlug = Query.make('PostsBySlug', {
  Input: Schema.Struct({ slug: Schema.String }),
  Result: Query.connection({ name: 'Post' }),
})
interface Principal {
  readonly id: string
}

// No type arguments: the input is the descriptor's, and the principal is what
// the `where` that reads it says it is.
const mine = query(BySlug, {
  entity: Post,
  orderBy: [{ column: posts.id, direction: 'asc' }],
  where: (input, principal: Principal) => {
    expectTypeOf(input).toEqualTypeOf<{ readonly slug: string }>()
    return eq(posts.authorId, principal.id)
  },
})
expectTypeOf(mine).toEqualTypeOf<QuerySource<Principal, DrizzleDatabase>>()

// A query that reads no principal fits any server's.
const anyone: QuerySource<Principal, DrizzleDatabase> = query(BySlug, {
  entity: Post,
  orderBy: [{ column: posts.id, direction: 'asc' }],
})
export { anyone }

// @ts-expect-error a server whose principal is not a Principal cannot run it
const _other: QuerySource<number, DrizzleDatabase> = mine
