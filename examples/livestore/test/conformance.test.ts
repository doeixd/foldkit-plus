/**
 * The conformance suite through a fourth interpreter — and the first genuinely
 * narrow one.
 *
 * TanStack declined a single operator on an escaping technicality. This engine
 * has no null predicate at all, so it runs a quarter of the kernel. What is
 * being tested here is less "does LiveStore agree" than "does refusing work
 * when there is a great deal to refuse".
 */
import { State } from '@livestore/livestore'
import { DatabaseSync } from 'node:sqlite'
import { Query } from 'foldkit-entity'
import { cases, rows } from 'foldkit-entity/conformance'
import { describe, expect, it } from 'vitest'
import { LiveStoreCompileError, compile, supported } from '../src/interpreter.js'

const table = State.SQLite.table({
  name: 'subjects',
  columns: {
    id: State.SQLite.text({ primaryKey: true }),
    label: State.SQLite.text(),
    rank: State.SQLite.integer(),
    tag: State.SQLite.text({ nullable: true }),
    at: State.SQLite.text(),
  },
})

/** The rows in a real SQLite, so the compiled SQL is actually run. */
const database = () => {
  const db = new DatabaseSync(':memory:')
  db.exec(
    "create table 'subjects' (id text primary key, label text, rank integer, tag text, at text)",
  )
  const insert = db.prepare("insert into 'subjects' values (?, ?, ?, ?, ?)")
  for (const row of rows) insert.run(row.id, row.label, row.rank, row.tag, row.at)
  return db
}

/** What the operator declaration says it can run. */
const declared = cases.filter(one => Query.unsupported(one.body, supported).length === 0)
const undeclared = cases.filter(one => Query.unsupported(one.body, supported).length > 0)

/** What it can actually run, which is not the same set — see the last describe. */
const compiles = (one: (typeof cases)[number]) => {
  try {
    compile(one.body, one.input, table)
    return true
  } catch {
    return false
  }
}
const runnable = declared.filter(compiles)

describe('A narrow interpreter, on the quarter of the kernel it runs', () => {
  it('has something to run and a great deal to refuse', () => {
    expect(runnable.length).toBeGreaterThan(0)
    expect(undeclared.length).toBeGreaterThan(runnable.length)
  })

  it.each(runnable.map(one => ({ ...one, name: one.what })))(
    '$name',
    ({ body, input, expected }) => {
      const { query, bindValues } = compile(body, input, table)
      const got = database()
        .prepare(query)
        .all(...(bindValues as never[]))
        .map(row => (row as { id: string }).id)

      expect(got).toEqual(expected)
    },
  )
})

describe('What it refuses, which is the point of it', () => {
  it('declares one operator, because the engine offers no way to say the others', () => {
    expect(supported).toEqual(['eq'])
  })

  it('refuses every case needing an operator it does not run, rather than approximating', () => {
    for (const { body, input } of undeclared) {
      expect(() => compile(body, input, table)).toThrow(LiveStoreCompileError)
    }
  })

  it('names what was missing, so the refusal can be acted on', () => {
    const nulls = undeclared.find(one => Query.unsupported(one.body, supported).includes('isNull'))!

    expect(() => compile(nulls.body, nulls.input, table)).toThrow(/isNull/)
  })

  it('declares by operator, which is coarser than what it can run', () => {
    // The finding this engine is the first to produce: two cases use no
    // operator beyond `eq` and still cannot be run — an `eq` whose operand is
    // another predicate, and an `eq` against null. §16's declaration is about
    // operations, and neither of those is an operation. A capability list is
    // necessary and not sufficient; only running the suite finds the rest.
    const declaredButNot = declared.filter(one => !compiles(one))

    expect(declaredButNot.length).toBeGreaterThan(0)
    for (const one of declaredButNot) {
      expect(Query.unsupported(one.body, supported)).toEqual([])
      expect(() => compile(one.body, one.input, table)).toThrow(LiveStoreCompileError)
    }
  })

  it('does not reach for `= null`, which matches nothing and would look like an answer', () => {
    // The tempting approximation: SQL's `x = NULL` is unknown for every row,
    // including the null ones, so it would answer "none" to "which rows have no
    // tag" — an empty result that reads exactly like a correct one.
    const isNull = cases.find(one => one.what.startsWith('isNull finds'))!

    expect(isNull.expected).not.toEqual([])
    expect(() => compile(isNull.body, isNull.input, table)).toThrow(LiveStoreCompileError)
  })
})
