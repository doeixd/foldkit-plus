import { Schema } from 'effect'
import { Arr, Expr, Num, type SchemaOf } from 'metakit'

export function table<S extends SchemaOf>(row: S) {
  const Table = Schema.Struct({
    rows: Schema.Array(row),
  }).pipe(Expr.refine($ => Num.gt(Arr.count($.rows), 0)))

  return {
    schema: Table,
    decode: (input: unknown) => Schema.decodeUnknownSync(Table)(input),
  }
}

const Task = Schema.Struct({ id: Schema.String, done: Schema.Boolean })
const tasks = table(Task)
export const parsedTasks = tasks.decode({ rows: [{ id: '1', done: false }] })
