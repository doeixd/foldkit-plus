import { Effect, Option, Result, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Arr, Eq, Expr, Ord, Path, Verdict } from '@doeixd/metakit'
import * as Prove from '@doeixd/metakit/prove'
import * as Sql from '@doeixd/metakit/sql'

const Research = Schema.Struct({ id: Schema.String, era: Schema.Int })
const Era = Schema.Struct({ id: Schema.String, ordinal: Schema.Int })

const BaseCatalog = Schema.Struct({
  research: Schema.Array(Research),
  eras: Schema.Array(Era),
})

const $ = Path.forSchema(BaseCatalog)

const crossListExpr = Arr.every($.research, research =>
  Arr.any($.eras, era => Eq.is(research.era, era.ordinal)),
)

const uniqueIdExpr = Arr.every($.research, row =>
  Eq.is(
    Arr.count($.research, other => Eq.is(other.id, row.id)),
    1,
  ),
)

const CatalogCrossList = BaseCatalog.pipe(
  Expr.refine(c =>
    Arr.every(c.research, research => Arr.any(c.eras, era => Eq.is(research.era, era.ordinal))),
  ),
)

const CatalogUnique = BaseCatalog.pipe(
  Expr.refine(c =>
    Arr.every(c.research, row =>
      Eq.is(
        Arr.count(c.research, other => Eq.is(other.id, row.id)),
        1,
      ),
    ),
  ),
)

const Catalog = BaseCatalog.pipe(
  Expr.refine(c =>
    Arr.every(c.research, research => Arr.any(c.eras, era => Eq.is(research.era, era.ordinal))),
  ),
  Expr.refine(c =>
    Arr.every(c.research, row =>
      Eq.is(
        Arr.count(c.research, other => Eq.is(other.id, row.id)),
        1,
      ),
    ),
  ),
)

const nonEmptyResearchRequiresEra = Expr.implies(
  Ord.gt(Arr.count($.research), 0),
  Ord.gt(Arr.count($.eras), 0),
)

describe('nested list folds: evaluation (Expr.eval and Expr.holds)', () => {
  it('evaluates both nested folds accurately on valid, unmatched-era, and duplicate-id catalogs', () => {
    const validCatalog = {
      research: [
        { id: 'r1', era: 1 },
        { id: 'r2', era: 2 },
      ],
      eras: [
        { id: 'e1', ordinal: 1 },
        { id: 'e2', ordinal: 2 },
      ],
    }
    const unmatchedEraCatalog = {
      research: [{ id: 'r1', era: 99 }],
      eras: [{ id: 'e1', ordinal: 1 }],
    }
    const duplicateIdCatalog = {
      research: [
        { id: 'r1', era: 1 },
        { id: 'r1', era: 2 },
      ],
      eras: [
        { id: 'e1', ordinal: 1 },
        { id: 'e2', ordinal: 2 },
      ],
    }

    expect(Expr.eval(crossListExpr, validCatalog)).toBe(true)
    expect(Expr.holds(crossListExpr, validCatalog)).toBe(true)
    expect(Expr.eval(uniqueIdExpr, validCatalog)).toBe(true)
    expect(Expr.holds(uniqueIdExpr, validCatalog)).toBe(true)
    expect(Schema.is(Catalog)(validCatalog)).toBe(true)

    expect(Expr.eval(crossListExpr, unmatchedEraCatalog)).toBe(false)
    expect(Expr.holds(crossListExpr, unmatchedEraCatalog)).toBe(false)
    expect(Expr.eval(uniqueIdExpr, unmatchedEraCatalog)).toBe(true)
    expect(Expr.holds(uniqueIdExpr, unmatchedEraCatalog)).toBe(true)
    expect(Schema.is(Catalog)(unmatchedEraCatalog)).toBe(false)

    expect(Expr.eval(crossListExpr, duplicateIdCatalog)).toBe(true)
    expect(Expr.holds(crossListExpr, duplicateIdCatalog)).toBe(true)
    expect(Expr.eval(uniqueIdExpr, duplicateIdCatalog)).toBe(false)
    expect(Expr.holds(uniqueIdExpr, duplicateIdCatalog)).toBe(false)
    expect(Schema.is(Catalog)(duplicateIdCatalog)).toBe(false)
  })
})

describe('nested list folds: SQL (metakit/sql)', () => {
  const expectedReason = 'rows.every over a list: a list held in a column is not lowered to SQL'

  it('Sql.toCheck and Sql.toWhere refuse the cross-list nested fold with SqlUnsupportedError, naming rows.every and the list', () => {
    for (const dialect of ['postgres', 'sqlite'] as const) {
      const check = Sql.toCheck(CatalogCrossList, { dialect })
      expect(Result.isFailure(check)).toBe(true)
      if (Result.isFailure(check)) {
        expect(check.failure).toBeInstanceOf(Sql.SqlUnsupportedError)
        expect(check.failure.reason).toBe(expectedReason)
      }

      const where = Sql.toWhere(crossListExpr, { dialect, rowPrefix: [] })
      expect(Result.isFailure(where)).toBe(true)
      if (Result.isFailure(where)) {
        expect(where.failure).toBeInstanceOf(Sql.SqlUnsupportedError)
        expect(where.failure.reason).toBe(expectedReason)
      }
    }
  })

  it('Sql.toCheck and Sql.toWhere refuse the uniqueness nested fold with SqlUnsupportedError, naming rows.every and the list', () => {
    for (const dialect of ['postgres', 'sqlite'] as const) {
      const check = Sql.toCheck(CatalogUnique, { dialect })
      expect(Result.isFailure(check)).toBe(true)
      if (Result.isFailure(check)) {
        expect(check.failure).toBeInstanceOf(Sql.SqlUnsupportedError)
        expect(check.failure.reason).toBe(expectedReason)
      }

      const where = Sql.toWhere(uniqueIdExpr, { dialect, rowPrefix: [] })
      expect(Result.isFailure(where)).toBe(true)
      if (Result.isFailure(where)) {
        expect(where.failure).toBeInstanceOf(Sql.SqlUnsupportedError)
        expect(where.failure.reason).toBe(expectedReason)
      }
    }
  })
})

describe('nested list folds: Checker (Abstract.checkInvariant)', () => {
  const expectedUnknown = Verdict.Unknown(
    'rows.every undecided in Tier 3',
    Option.some({ kind: 'unsupported', detail: 'rows.every' }),
  )

  it('Abstract.checkInvariant leaves the cross-list nested fold Unknown as a goal, naming rows.every', () => {
    expect(Abstract.checkInvariant(BaseCatalog, crossListExpr)).toEqual(expectedUnknown)
    expect(Abstract.checkInvariant(CatalogCrossList, crossListExpr)).toEqual(expectedUnknown)
  })

  it('Abstract.checkInvariant leaves the uniqueness nested fold Unknown as a goal, naming rows.every', () => {
    expect(Abstract.checkInvariant(BaseCatalog, uniqueIdExpr)).toEqual(expectedUnknown)
    expect(Abstract.checkInvariant(CatalogUnique, uniqueIdExpr)).toEqual(expectedUnknown)
  })

  // Records #672: assume drops a fold rule, so the checker answers as if it were absent and refutes (False) on a Schema the rule makes unsatisfiable.
  it('Abstract.checkInvariant silently ignores the cross-list nested fold when assumed as a Schema refinement', () => {
    const withRule = Abstract.checkInvariant(CatalogCrossList, nonEmptyResearchRequiresEra)
    const withoutRule = Abstract.checkInvariant(BaseCatalog, nonEmptyResearchRequiresEra)
    expect(withRule).toEqual(Verdict.Unknown('intervals overlap', Option.none()))
    expect(withRule).toEqual(withoutRule)

    const ImpossibleCrossList = BaseCatalog.pipe(
      Expr.refine(c => Ord.gte(Arr.count(c.research), 1)),
      Expr.refine(c => Eq.is(Arr.count(c.eras), 0)),
      Expr.refine(c =>
        Arr.every(c.research, research => Arr.any(c.eras, era => Eq.is(research.era, era.ordinal))),
      ),
    )
    expect(Abstract.checkInvariant(ImpossibleCrossList, Expr.lit(false))).toEqual(
      Verdict.False(Option.none()),
    )
  })

  // Records #672, as above, for the uniqueness rule.
  it('Abstract.checkInvariant silently ignores the uniqueness nested fold when assumed as a Schema refinement', () => {
    const atMostOne = Ord.lte(Arr.count($.research), 1)
    const withRule = Abstract.checkInvariant(CatalogUnique, atMostOne)
    const withoutRule = Abstract.checkInvariant(BaseCatalog, atMostOne)
    expect(withRule).toEqual(Verdict.Unknown('intervals overlap', Option.none()))
    expect(withRule).toEqual(withoutRule)

    const SingleIdResearch = Schema.Struct({
      id: Schema.Literals(['only']),
      era: Schema.Int,
    })
    const ImpossibleUnique = Schema.Struct({
      research: Schema.Array(SingleIdResearch),
      eras: Schema.Array(Era),
    }).pipe(
      Expr.refine(c => Ord.gte(Arr.count(c.research), 2)),
      Expr.refine(c =>
        Arr.every(c.research, row =>
          Eq.is(
            Arr.count(c.research, other => Eq.is(other.id, row.id)),
            1,
          ),
        ),
      ),
    )
    expect(Abstract.checkInvariant(ImpossibleUnique, Expr.lit(false))).toEqual(
      Verdict.False(Option.none()),
    )
  })
})

describe('nested list folds: Prover (metakit/prove)', () => {
  const expectedUnknown = Verdict.Unknown(
    'z3 lowering unsupported: the fold rows.every',
    Option.some({ kind: 'unsupported', detail: 'the fold rows.every' }),
  )

  it('Prove.invariant refuses the cross-list nested fold as Unknown in Z3, naming rows.every both as goal and as Schema refinement', async () => {
    expect(await Effect.runPromise(Prove.invariant(BaseCatalog, crossListExpr))).toEqual(
      expectedUnknown,
    )
    expect(await Effect.runPromise(Prove.invariant(CatalogCrossList, crossListExpr))).toEqual(
      expectedUnknown,
    )
    expect(
      await Effect.runPromise(Prove.invariant(CatalogCrossList, nonEmptyResearchRequiresEra)),
    ).toEqual(expectedUnknown)
    expect(await Effect.runPromise(Prove.invariant(CatalogCrossList, Expr.lit(false)))).toEqual(
      expectedUnknown,
    )
  }, 30_000)

  it('Prove.invariant refuses the uniqueness nested fold as Unknown in Z3, naming rows.every both as goal and as Schema refinement', async () => {
    expect(await Effect.runPromise(Prove.invariant(BaseCatalog, uniqueIdExpr))).toEqual(
      expectedUnknown,
    )
    expect(await Effect.runPromise(Prove.invariant(CatalogUnique, uniqueIdExpr))).toEqual(
      expectedUnknown,
    )
    expect(
      await Effect.runPromise(Prove.invariant(CatalogUnique, Ord.lte(Arr.count($.research), 1))),
    ).toEqual(expectedUnknown)
    expect(await Effect.runPromise(Prove.invariant(CatalogUnique, Expr.lit(false)))).toEqual(
      expectedUnknown,
    )
  }, 30_000)
})
