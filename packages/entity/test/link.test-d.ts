/** A link's value is its target's id, null where it is optional. operations-phase3-DESIGN. */
import { Schema } from 'effect'
import { expectTypeOf } from 'vitest'
import { Entity, Expr, Relation, type ValueOf } from '../src/index.js'

const UserId = Schema.String.pipe(Schema.brand('UserId'))
const Fields = {
  User: Entity.define('User', Schema.Struct({ id: UserId })),
  Post: Entity.define('Post', Schema.Struct({ id: Schema.String })),
}
const { User, Post } = Entity.relate(Fields, {
  Post: {
    author: Relation.one(Fields.User),
    editor: Relation.one(Fields.User, { optional: true }),
  },
})

expectTypeOf<ValueOf<typeof Post.relations.author>>().toEqualTypeOf<typeof UserId.Type>()
expectTypeOf<ValueOf<typeof Post.relations.editor>>().toEqualTypeOf<typeof UserId.Type | null>()

Expr.eq(Post.relations.author, Expr.viewer(User))
Expr.eq(Post.relations.editor, null)
Expr.in(Post.relations.author, Expr.input('authors', Schema.Array(UserId)))

// @ts-expect-error a link holds an id, not a number
Expr.eq(Post.relations.author, 3)

// @ts-expect-error a required link is never null
Expr.eq(Post.relations.author, null)

// @ts-expect-error a link to a User is not a Post's id
Expr.eq(Post.relations.author, Expr.viewer(Post))
