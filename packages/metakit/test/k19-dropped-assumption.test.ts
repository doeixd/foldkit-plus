import { Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Abstract, Arr, Bool, Eq, Expr, Ord, Path, Str, Transition, Verdict } from '@doeixd/metakit'

describe('K19 (#672): dropped assumptions must not produce False refutations', () => {
  it('answers Unknown, not False, for the issue #672 unsatisfiable list-fold Schema', () => {
    const Fold = Schema.Struct({ xs: Schema.Array(Schema.Int) }).pipe(
      Expr.refine($ => Ord.gte(Arr.count($.xs), 1)),
      Expr.refine($ => Arr.every($.xs, x => Ord.lt(x, 0))),
      Expr.refine($ => Arr.every($.xs, x => Ord.gt(x, 0))),
    )
    const verdict = Abstract.checkInvariant(Fold, Expr.lit(false))
    expect(Verdict.isFalse(verdict)).toBe(false)
    expect(verdict).toEqual(
      Verdict.Unknown(
        'refuted only without the rule it could not read: rows.every',
        Option.some({ kind: 'unsupported', detail: 'rows.every' }),
      ),
    )
  })

  it('still refutes False when no assumption was dropped', () => {
    const Status = Schema.Struct({ s: Schema.Literals(['a', 'b']) })
    const s = Path.forSchema(Status)
    expect(Abstract.checkInvariant(Status, Ord.gt(Expr.match(s.s, { a: 1, b: 5 }), 9))).toEqual(
      Verdict.False(Option.none()),
    )

    const NonNeg = Schema.Struct({
      n: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    })
    const n = Path.forSchema(NonNeg)
    expect(Abstract.checkInvariant(NonNeg, Ord.lt(n.n, 0))).toEqual(Verdict.False(Option.none()))
  })

  it('still proves True when the goal follows without the dropped fold refinement', () => {
    const FoldAndBound = Schema.Struct({
      xs: Schema.Array(Schema.Int),
      n: Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)),
    }).pipe(Expr.refine($ => Arr.every($.xs, x => Ord.gt(x, 0))))
    const $ = Path.forSchema(FoldAndBound)
    expect(Verdict.isTrue(Abstract.checkInvariant(FoldAndBound, Ord.gte($.n, 0)))).toBe(true)
  })

  it('demotes False to Unknown for other dropped assumptions (Opaque, If, Match, str.lt, disjunction)', () => {
    const WithOpaque = Schema.Struct({ x: Schema.Int }).pipe(
      Expr.refine(() => Expr.opaque({ name: 'alwaysFalse' }, () => false)),
    )
    expect(Abstract.checkInvariant(WithOpaque, Expr.lit(false))).toEqual(
      Verdict.Unknown(
        'refuted only without the rule it could not read: alwaysFalse',
        Option.some({ kind: 'opaque', detail: 'alwaysFalse' }),
      ),
    )

    const WithIf = Schema.Struct({ flag: Schema.Boolean, x: Schema.Int }).pipe(
      Expr.refine($ => Expr.when($.flag, { then: Ord.gt($.x, 0), else: Ord.lt($.x, 0) })),
    )
    expect(Abstract.checkInvariant(WithIf, Expr.lit(false))).toEqual(
      Verdict.Unknown(
        'refuted only without the rule it could not read: if',
        Option.some({ kind: 'unsupported', detail: 'if' }),
      ),
    )

    const WithMatch = Schema.Struct({ tag: Schema.Literals(['a', 'b']), x: Schema.Int }).pipe(
      Expr.refine($ => Expr.match($.tag, { a: Ord.gt($.x, 0), b: Ord.lt($.x, 0) })),
    )
    expect(Abstract.checkInvariant(WithMatch, Expr.lit(false))).toEqual(
      Verdict.Unknown(
        'refuted only without the rule it could not read: match',
        Option.some({ kind: 'unsupported', detail: 'match' }),
      ),
    )

    const WithStrOrder = Schema.Struct({ a: Schema.String, b: Schema.String }).pipe(
      Expr.refine($ => Str.lt($.a, $.b)),
      Expr.refine($ => Str.lt($.b, $.a)),
    )
    expect(Abstract.checkInvariant(WithStrOrder, Expr.lit(false))).toEqual(
      Verdict.Unknown(
        'refuted only without the rule it could not read: str.lt',
        Option.some({ kind: 'unsupported', detail: 'str.lt' }),
      ),
    )

    const WithOrDrop = Schema.Struct({ xs: Schema.Array(Schema.Int), x: Schema.Int }).pipe(
      Expr.refine($ => Ord.lt($.x, 0)),
      Expr.refine($ =>
        Bool.or(
          Arr.every($.xs, v => Ord.gt(v, 0)),
          Ord.gt($.x, 0),
        ),
      ),
    )
    expect(Abstract.checkInvariant(WithOrDrop, Expr.lit(false))).toEqual(
      Verdict.Unknown(
        'refuted only without the rule it could not read: rows.every',
        Option.some({ kind: 'unsupported', detail: 'rows.every' }),
      ),
    )
  })

  it('demotes False to Unknown in Abstract.checkGoal and Abstract.checkTransition when an assumption is dropped', () => {
    const NonNeg = Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))
    const State = Schema.Struct({
      xs: Schema.Array(Schema.Int),
      n: NonNeg,
    }).pipe(
      Expr.refine($ => Ord.gte(Arr.count($.xs), 1)),
      Expr.refine($ => Arr.every($.xs, x => Ord.lt(x, 0))),
      Expr.refine($ => Arr.every($.xs, x => Ord.gt(x, 0))),
    )

    const badWrite = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.n, -1)],
    })
    expect(Abstract.checkTransition(State, badWrite)).toEqual(
      Verdict.Unknown(
        'refuted only without the rule it could not read: rows.every',
        Option.some({ kind: 'unsupported', detail: 'rows.every' }),
      ),
    )

    const noop = Transition.make({
      state: State,
      input: Schema.Struct({}),
      apply: ({ state }) => [Transition.set(state.n, state.n)],
    })
    expect(
      Abstract.checkGoal(State, noop, {
        goal: Eq.is(Path.forEnv({ state: State, next: State }).next.n, -1),
      }),
    ).toEqual(
      Verdict.Unknown(
        'refuted only without the rule it could not read: rows.every',
        Option.some({ kind: 'unsupported', detail: 'rows.every' }),
      ),
    )
  })
})
