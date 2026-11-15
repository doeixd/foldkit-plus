import { Schema } from 'effect'
import { Entity, Expr, Write } from 'foldkit-entity'

const Item = Entity.define('Item', Schema.Struct({ id: Schema.String, count: Schema.Number })).pipe(
  Entity.invariant('neverZero', ({ after }) => Expr.not(Expr.eq(after.count, 0)), {
    message: 'A count is never zero',
    path: ['count'],
  }),
)

/** The `{ writes }` that `Laws.check` takes, from a module that checks nothing itself. */
export default {
  writes: [
    {
      name: 'Recount',
      write: Write.update(
        Entity.input(Item, Schema.Struct({ id: Schema.String, count: Schema.Number })),
        { id: 'id' },
      ),
    },
  ],
}
