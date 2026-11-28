import { Effect, Schema } from 'effect'
import { expect, it } from 'vitest'
import * as Language from '../src/language.js'
import * as Operation from '../src/operation.js'
import * as Sql from '../src/operationSql.js'

const define = (id: string) =>
  Operation.define({ id, version: 1, args: [Schema.Int], returns: Schema.Int, nulls: 'strict' })

const Double = define('double')
const Triple = define('triple')
const sqlite = Sql.lowering(Double, { sqlite: x => Sql.piece`(${x} * 2)` })
const postgres = Sql.lowering(Double, { postgres: x => Sql.piece`(${x} + ${x})` })
const triple = Sql.lowering(Triple, { sqlite: x => Sql.piece`(${x} * 3)` })
const families = { math: { double: Double } }
const language = Language.make(families, { lowerings: Sql.lowerings(sqlite) })

it('restricts default lowerings to the retained operations', () => {
  const full = Language.make(
    { math: { double: Double, triple: Triple } },
    { lowerings: Sql.lowerings(sqlite, triple) },
  )

  const restricted = Language.restrict(full, { math: ['double'] })

  expect([...restricted.sql('sqlite').entries]).toEqual([[sqlite.key, sqlite]])
})

it('retains a default lowering when the other language has none for the operation', async () => {
  const composed = await Effect.runPromise(Language.compose(language, Language.make(families)))

  expect(composed.sql('sqlite').entries.get(sqlite.key)?.sqlite).toBe(sqlite.sqlite)
})

it('merges independent dialect lowerings and repeated references', async () => {
  const other = Language.make(families, { lowerings: Sql.lowerings(postgres) })
  const composed = await Effect.runPromise(
    Language.compose(await Effect.runPromise(Language.compose(language, other)), language),
  )

  expect(composed.sql('sqlite').entries.get(sqlite.key)?.sqlite).toBe(sqlite.sqlite)
  expect(composed.sql('postgres').entries.get(postgres.key)?.postgres).toBe(postgres.postgres)
})

const differentSqlite = Sql.lowering(Double, { sqlite: x => Sql.piece`(${x} * 2)` })
const sum = Sql.lowering(Double, { aggregate: { sqlite: x => Sql.piece`sum(${x})` } })
const max = Sql.lowering(Double, { aggregate: { sqlite: x => Sql.piece`max(${x})` } })

it.each([
  { kind: 'scalar', left: sqlite, right: differentSqlite },
  { kind: 'aggregate', left: sum, right: max },
])(
  'refuses conflicting $kind lowerings for the same operation and dialect',
  async ({ left, right }) => {
    const result = Language.compose(
      Language.make(families, { lowerings: Sql.lowerings(left) }),
      Language.make(families, { lowerings: Sql.lowerings(right) }),
    )

    const error = await Effect.runPromise(Effect.flip(result))
    expect(error).toBeInstanceOf(Language.LanguageConflictError)
    expect(error).toMatchObject({ location: sqlite.key, detail: expect.stringContaining('sqlite') })
  },
)
