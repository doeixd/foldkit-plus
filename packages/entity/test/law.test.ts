/**
 * Laws, their evidence, and the conformance helper that tests them:
 * expr-operations-DESIGN §10.
 */
import { Match, Option, Schema } from 'effect'
import { describe, expect, it } from 'vitest'
import { Conformance, Outcome } from '../src/conformance/index.js'
import { Collation, Evidence, Expr, Law, Operators, Text, valueOfOperand } from '../src/index.js'

/** Text after text: associative, with the empty string its identity, and not commutative. */
const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
  laws: [Law.associative, Law.identity(''), Law.preservesCollation],
})
const concatLive = Operators.implement(concat, (left, right) => `${left}${right}`)

const add = Expr.operator('acme.add', {
  input: [Schema.Int, Schema.Int],
  output: Schema.Int,
  laws: [Law.associative, Law.commutative, Law.identity(0), Law.monotonic('increasing', 0)],
})
const neg = Expr.operator('acme.neg', {
  input: [Schema.Int],
  output: Schema.Int,
  laws: [Law.monotonic('decreasing', 0)],
})
const mul = Expr.operator('acme.mul', {
  input: [Schema.Int, Schema.Int],
  output: Schema.Int,
  laws: [Law.absorbing(0), Law.distributes(add)],
})
const max = Expr.operator('acme.max', {
  input: [Schema.Int, Schema.Int],
  output: Schema.Int,
  laws: [Law.idempotent, Law.commutative],
})
const sub = Expr.operator('acme.sub', {
  input: [Schema.Int, Schema.Int],
  output: Schema.Int,
  laws: [Law.inverse(neg, 0)],
})
const arithmetic = Operators.memory(
  Operators.implement(add, (a, b) => a + b),
  Operators.implement(neg, a => -a),
  Operators.implement(mul, (a, b) => a * b),
  Operators.implement(max, (a, b) => Math.max(a, b)),
  // Subtracting the negation adds: `a - neg(a)` is not zero, so this inverse is false.
  Operators.implement(sub, (a, b) => a - b),
)

describe('Declaring a law', () => {
  const declare = (
    laws: ReadonlyArray<Law>,
    input: ReadonlyArray<Schema.Top> = [Schema.Int, Schema.Int],
  ) => Expr.operator('acme.declared', { input, output: Schema.Int, laws })

  it('refuses a witness that does not decode as the argument it stands in', () => {
    expect(() => declare([Law.identity('zero')])).toThrow(
      `identity's left witness "zero" does not decode as its schema`,
    )
    expect(() => declare([Law.absorbing(0.5, 'right')])).toThrow(
      "absorbing's right witness 0.5 does not decode as its schema",
    )
    expect(() => declare([Law.inverse(neg, 'none')])).toThrow(
      `inverse's identity "none" does not decode as its schema`,
    )
  })

  it('refuses a law the operator has the wrong shape for', () => {
    expect(() => declare([Law.commutative], [Schema.Int])).toThrow(
      'commutative is a law of an operator of two arguments, and this one takes 1',
    )
    expect(() => declare([Law.inverse(add, 0)])).toThrow(
      "inverse's other operator takes one argument",
    )
    expect(() => declare([Law.distributes(neg)])).toThrow(
      'distributes is over an operator of two arguments',
    )
    expect(() => declare([Law.monotonic('increasing', 2)])).toThrow(
      "monotonic's position 2 is not an argument's",
    )
    expect(() => declare([Law.preservesCollation])).toThrow(
      "preservesCollation is a law of an operator declared `collation: 'operands'`",
    )
  })

  it('describes each law as JSON, operators by name and a domain by its JSON Schema', () => {
    expect(mul.descriptor.laws.map(Law.describe)).toEqual([
      { kind: 'absorbing', witnesses: { value: 0, side: 'both' }, domain: null },
      { kind: 'distributes', witnesses: { over: 'acme.add' }, domain: null },
    ])
    const narrowed = Law.within(Law.commutative, Schema.Int.check(Schema.isGreaterThanOrEqualTo(0)))
    expect(Law.describe(narrowed).domain).toMatchObject({ type: 'integer', minimum: 0 })
    // A named domain is a reference, so its definition travels with it.
    const named = Law.within(Law.commutative, Schema.Int.annotate({ identifier: 'Count' }))
    expect(Law.describe(named).domain).toMatchObject({
      $ref: '#/$defs/Count',
      $defs: { Count: { type: 'integer' } },
    })
  })
})

describe('Testing laws', () => {
  it('holds of a lawful implementation, one Tested record a law', () => {
    const verdict = Conformance.laws(concat, Operators.memory(concatLive))
    expect(verdict).toMatchObject({ _tag: 'Holds' })
    expect(verdict._tag === 'Holds' && verdict.evidence.map(record => record.law.kind)).toEqual([
      'associative',
      'identity',
      'preservesCollation',
    ])
    for (const operator of [add, neg, mul, max]) {
      expect(Conformance.laws(operator, arithmetic)._tag).toBe('Holds')
    }
  })

  it('finds a counterexample to concat declared commutative', () => {
    const commuting = Expr.operator('acme.concatCommuting', {
      input: [Schema.String, Schema.String],
      output: Schema.String,
      laws: [Law.commutative],
    })
    const verdict = Conformance.laws(
      commuting,
      Operators.memory(Operators.implement(commuting, (left, right) => `${left}${right}`)),
    )
    expect(verdict).toMatchObject({ _tag: 'Counterexample', law: { kind: 'commutative' } })
    const { left, right } = verdict as Extract<typeof verdict, { _tag: 'Counterexample' }>
    expect(left).not.toEqual(right)
  })

  it('finds a counterexample to every kind of law an implementation breaks', () => {
    // a - neg(a) is 2a, not 0.
    expect(Conformance.laws(sub, arithmetic)).toMatchObject({
      _tag: 'Counterexample',
      law: { kind: 'inverse' },
    })
    const broken = Operators.override(
      arithmetic,
      Operators.implement(add, (a, b) => a + b + (a === 1 ? 1 : 0)),
      Operators.implement(neg, a => (a === 0 ? 5 : -a)),
      // Off by one only past zero, so 0 still absorbs and only distributing breaks.
      Operators.implement(mul, (a, b) => (a !== 0 && b === 1 ? a * b + 1 : a * b)),
      Operators.implement(max, (a, b) => (a === b ? a + 1 : Math.max(a, b))),
    )
    const kinds = [add, neg, mul, max].map(operator => {
      const verdict = Conformance.laws(operator, broken)
      return verdict._tag === 'Counterexample' ? verdict.law.kind : 'holds'
    })
    expect(kinds).toEqual(['associative', 'monotonic', 'distributes', 'idempotent'])
  })

  it('finds text that does not keep its collation', () => {
    // The lesser by code point: 'B' before 'a', but folded 'a' before 'b'.
    const least = Expr.operator('acme.least', {
      input: [Schema.String, Schema.String],
      output: Schema.String,
      collation: 'operands',
      laws: [Law.preservesCollation],
    })
    const verdict = Conformance.laws(
      least,
      Operators.memory(Operators.implement(least, (a, b) => (a < b ? a : b))),
    )
    expect(verdict).toMatchObject({ _tag: 'Counterexample', law: { kind: 'preservesCollation' } })
  })

  it('shows nothing of a law whose every call is refused, and counts only answered cases', () => {
    const refusing = Operators.override(
      arithmetic,
      Operators.implement(add, () => {
        throw new Error('no')
      }),
    )
    expect(Conformance.laws(add, refusing)).toMatchObject({
      _tag: 'Unanswered',
      law: { kind: 'associative' },
    })
    // Refused for 2 and 7 in either order, both sides alike: agreeing, and no case.
    const half = Operators.override(
      arithmetic,
      Operators.implement(max, (a, b) => {
        if (a + b === 9) throw new Error('no')
        return Math.max(a, b)
      }),
    )
    const verdict = Conformance.laws(max, half)
    expect(verdict._tag === 'Holds' && verdict.evidence.map(record => record.cases)).toEqual([
      7, 47,
    ])
  })

  it('tests a law only over its domain', () => {
    const square = (domain: Option.Option<Schema.Top>) => {
      const law = Law.monotonic('increasing', 0)
      const op = Expr.operator('acme.square', {
        input: [Schema.Int],
        output: Schema.Int,
        laws: [
          Option.match(domain, { onNone: () => law, onSome: within => Law.within(law, within) }),
        ],
      })
      return Conformance.laws(op, Operators.memory(Operators.implement(op, a => a * a)))._tag
    }
    expect(square(Option.none())).toBe('Counterexample')
    expect(square(Option.some(Schema.Int.check(Schema.isGreaterThanOrEqualTo(0))))).toBe('Holds')
  })

  it('tests at most as many cases as asked, chosen by the seed', () => {
    const run = (seed: number) => Conformance.laws(add, arithmetic, { cases: 5, seed })
    const evidence = (seed: number) => {
      const verdict = run(seed)
      return verdict._tag === 'Holds' ? verdict.evidence : []
    }
    // Five tuples a law; an identity of both sides checks each tuple twice.
    expect(evidence(3).map(record => [record.law.kind, record.cases, record.seed])).toEqual([
      ['associative', 5, 3],
      ['commutative', 5, 3],
      ['identity', 10, 3],
      ['monotonic', 5, 3],
    ])
    expect(evidence(3)).toEqual(evidence(3))
  })

  it('chooses which cases by the seed, the same for one seed every time', () => {
    // Associativity breaks only where the first argument is 1, which three cases may miss.
    const lopsided = Operators.override(
      arithmetic,
      Operators.implement(add, (a, b) => (a === 1 ? a + b + 1 : a + b)),
    )
    const verdicts = Array.from({ length: 12 }, (_, seed) =>
      Conformance.laws(add, lopsided, { cases: 3, seed }),
    )
    expect(new Set(verdicts.map(verdict => verdict._tag))).toEqual(
      new Set(['Holds', 'Counterexample']),
    )
    expect(verdicts.map((_, seed) => Conformance.laws(add, lopsided, { cases: 3, seed }))).toEqual(
      verdicts,
    )
  })
})

describe('Testing laws under each collation', () => {
  /** The lesser of two texts, the left one when they tie: commutative under binary only. */
  const least = Expr.operator('acme.least', {
    input: [Schema.String, Schema.String],
    output: Schema.String,
    collation: 'operands',
    laws: [Law.commutative],
  })
  const leastLive = Operators.memory(
    Operators.implement(least, (left, right, { collation }) => {
      const key = (text: string) =>
        Option.exists(collation, each => each._tag === 'AsciiFold')
          ? Collation.foldAscii(text)
          : text
      return key(right) < key(left) ? right : left
    }),
  )

  it('finds a law that holds under binary and breaks under asciiFold', () => {
    // Folded, 'a' and 'A' tie, so each order keeps its own left.
    expect(Conformance.laws(least, leastLive)).toMatchObject({
      _tag: 'Counterexample',
      collation: Option.some(Collation.asciiFold),
    })
  })

  it('calls a witness that compares text under the collation', () => {
    const swap = Expr.operator('acme.swapCase', {
      input: [Schema.String],
      output: Schema.String,
      collation: 'required',
    })
    const glue = Expr.operator('acme.glue', {
      input: [Schema.String, Schema.String],
      output: Schema.String,
      collation: 'operands',
      laws: [Law.inverse(swap, 'x')],
    })
    const table = Operators.memory(
      Operators.implement(glue, (left, right) => `${left}${right}`),
      Operators.implement(swap, text => text),
    )
    // A verdict, not a refusal of the witness's call for want of a collation.
    expect(Conformance.laws(glue, table)._tag).toBe('Counterexample')
  })

  it('calls a witness that compares text under a collation, though the operator compares none', () => {
    const fold = Expr.operator('acme.fold', {
      input: [Schema.String],
      output: Schema.String,
      collation: 'required',
    })
    const pad = Expr.operator('acme.pad', {
      input: [Schema.String, Schema.String],
      output: Schema.String,
      laws: [Law.inverse(fold, '')],
    })
    const table = Operators.memory(
      Operators.implement(pad, (left, right) => `${left}${right}`),
      Operators.implement(fold, text => text),
    )
    expect(Conformance.laws(pad, table)._tag).toBe('Counterexample')
  })
})

describe('Evidence of a law calling another operator', () => {
  it('goes when that operator is replaced, as its own implementation is part of it', () => {
    const neg = Expr.operator('acme.neg2', { input: [Schema.Int], output: Schema.Int })
    const sum = Expr.operator('acme.sum2', {
      input: [Schema.Int, Schema.Int],
      output: Schema.Int,
      laws: [Law.inverse(neg, 0)],
    })
    const table = Operators.memory(
      Operators.implement(sum, (left, right) => left + right),
      Operators.implement(neg, value => -value),
    )
    const verdict = Conformance.laws(sum, table)
    const recorded = Operators.withEvidence(table, verdict._tag === 'Holds' ? verdict.evidence : [])
    expect(recorded.evidence).toHaveLength(1)
    // `neg` replaced by one that breaks the law: its record of `sum` goes too.
    const replaced = Operators.override(
      recorded,
      Operators.implement(neg, value => value),
    )
    expect(replaced.evidence).toEqual([])
  })
})

describe('Evidence in a table', () => {
  const tested = () => {
    const verdict = Conformance.laws(concat, Operators.memory(concatLive), { implementation: 'js' })
    return verdict._tag === 'Holds' ? verdict.evidence : []
  }
  const proof = Evidence.Proven({
    operator: 'acme.concat',
    law: Law.describe(Law.associative),
    reference: 'https://example.org/concat-proof',
    assumptions: ['strings of code points'],
  })

  it('round-trips through describeTable, as JSON, each operator with its own', () => {
    const added = Conformance.laws(add, arithmetic)
    const addEvidence = added._tag === 'Holds' ? added.evidence : []
    const table = Operators.withEvidence(
      Operators.merge(Operators.memory(concatLive), arithmetic),
      [...tested(), proof, ...addEvidence],
    )
    const described = JSON.parse(JSON.stringify(Operators.describeTable(table)))
    expect(described.map((entry: { name: string }) => entry.name)).toEqual([
      'acme.concat',
      'acme.add',
      'acme.neg',
      'acme.mul',
      'acme.max',
      'acme.sub',
    ])
    expect(described[0]).toEqual({
      ...JSON.parse(JSON.stringify(Operators.describe(concat))),
      evidence: JSON.parse(JSON.stringify([...tested(), proof])),
    })
    expect(described[0].laws).toEqual(concat.descriptor.laws.map(Law.describe))
    expect(described[1].evidence).toEqual(JSON.parse(JSON.stringify(addEvidence)))
    expect(described[2].evidence).toEqual([])
  })

  it('refuses evidence of an operator the table lacks, or of a law it does not declare', () => {
    expect(() => Operators.withEvidence(Operators.kernel, tested())).toThrow(
      'evidence names acme.concat, which this table does not implement',
    )
    expect(() =>
      Operators.withEvidence(Operators.memory(concatLive), [
        Evidence.Proven({ ...proof, law: Law.describe(Law.commutative) }),
      ]),
    ).toThrow('evidence names a law of acme.concat it does not declare (commutative)')
  })

  it('refuses evidence tested on another implementation of the operator', () => {
    const another = Operators.memory(Operators.implement(concat, (left, right) => right + left))
    expect(() => Operators.withEvidence(another, tested())).toThrow(
      "evidence of acme.concat's associative law was not tested on this table's implementation",
    )
  })

  it('keeps evidence through a merge, and drops a replaced implementation’s', () => {
    const table = Operators.withEvidence(Operators.memory(concatLive), tested())
    expect(Operators.merge(table, Operators.kernel).evidence).toEqual(tested())
    const replaced = Operators.override(
      table,
      Operators.implement(concat, (left, right) => left + right),
    )
    expect(replaced.evidence).toEqual([])
  })
})

describe('Running an operator through several implementations', () => {
  it('finds no disagreement between two that agree, over generated cases with null and NUL', async () => {
    const implementations = {
      kernel: Conformance.memory(Operators.kernel),
      again: Conformance.memory(Operators.checked(Operators.kernel)),
    }
    const report = await Conformance.operator(Text.startsWith, { implementations })
    // Each argument null, ten samples or text holding NUL, under binary and asciiFold: 12 × 12 × 2.
    expect(report.cases).toBe(288)
    expect(report.disagreements).toEqual([])
    // Text that admits no null is given none: 11 × 11 × 2.
    const concatenating = { memory: Conformance.memory(Operators.memory(concatLive)) }
    expect((await Conformance.operator(concat, { implementations: concatenating })).cases).toBe(242)
  })

  it('refuses text holding NUL beside a null, as SQL does where it compiles', () => {
    expect(() =>
      valueOfOperand(
        Text.startsWith(null, `a${String.fromCharCode(0)}`, { collation: Collation.binary }),
      ),
    ).toThrow('was given text holding a NUL character')
  })

  it('compares a Date by its time, and a field holding undefined as one absent', async () => {
    const at = Expr.operator('acme.at', { input: [Schema.Number], output: Schema.Date })
    const dates = await Conformance.operator(at, {
      implementations: { memory: () => new Date(0), sql: () => new Date(1e12) },
      cases: [[1]],
    })
    expect(dates.disagreements).toHaveLength(1)
    const shaped = Expr.operator('acme.shaped', { input: [Schema.Number], output: Schema.Unknown })
    const records = await Conformance.operator(shaped, {
      implementations: { memory: () => ({ a: 1, b: undefined }), sql: () => ({ a: 1 }) },
      cases: [[1]],
    })
    expect(records.disagreements).toEqual([])
  })

  it('tells Infinity and NaN from null, which JSON writes them as', async () => {
    const ratio = Expr.operator('acme.ratio', {
      input: [Schema.Number, Schema.Number],
      output: Schema.NullOr(Schema.Number),
    })
    const report = await Conformance.operator(ratio, {
      implementations: { memory: () => Infinity, sql: () => null, again: () => NaN },
      cases: [[1, 0]],
    })
    expect(report.disagreements).toHaveLength(1)
  })

  it('names the calls where one folds case and the other does not', async () => {
    const folding = Operators.override(
      Operators.kernel,
      Operators.implement(Text.startsWith, (text, prefix) =>
        Collation.foldAscii(text).startsWith(Collation.foldAscii(prefix)),
      ),
    )
    const report = await Conformance.operator(Text.startsWith, {
      implementations: {
        kernel: Conformance.memory(Operators.kernel),
        folding: Conformance.memory(folding),
      },
      cases: [
        ['Ab', 'a'],
        ['ab', 'a'],
      ],
    })
    expect(report.cases).toBe(4)
    expect(report.disagreements).toEqual([
      {
        args: ['Ab', 'a'],
        collation: Option.some(Collation.binary),
        outcomes: {
          kernel: Outcome.Value({ value: false }),
          folding: Outcome.Value({ value: true }),
        },
      },
    ])
  })

  it('runs a defined operator’s expansion beside its implementations', async () => {
    const blank = Expr.operator('acme.blankText', {
      input: [Schema.String],
      output: Schema.Boolean,
      definedAs: text => Expr.eq(text, ''),
    })
    // A database that compiled it as "blank once trimmed" disagrees with what it means.
    const spaced = (call: Parameters<typeof valueOfOperand>[0]) =>
      Match.value(call).pipe(
        Match.tag('Call', 'Test', ({ args }) => String(valueOfOperand(args[0]!)).trim() === ''),
        Match.orElse(() => null),
      )
    const report = await Conformance.operator(blank, {
      implementations: { spaced },
      cases: [[''], [' '], ['a']],
    })
    expect(report.disagreements.map(each => each.args)).toEqual([[' ']])
    expect(report.disagreements[0]!.outcomes).toEqual({
      spaced: Outcome.Value({ value: true }),
      expansion: Outcome.Value({ value: false }),
    })
  })
})
