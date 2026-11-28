import { Option, Schema } from 'effect'
import { Node } from '@doeixd/metakit'
import { describe, expect, it } from 'vitest'
import { Conformance, Outcome } from '../src/conformance/index.js'
import { exprOf } from '../src/expr/operand.js'
import { Collation, Expr, Operators, Text, valueOfOperand } from '../src/index.js'

const concat = Expr.operator('acme.concat', {
  input: [Schema.String, Schema.String],
  output: Schema.String,
  collation: 'operands',
})
const concatLive = Operators.implement(concat, (left, right) => `${left}${right}`)

describe('Running an operator through several implementations', () => {
  it('finds no disagreement between two that agree, over generated cases with null and NUL', async () => {
    const implementations = {
      kernel: Conformance.memory(Operators.kernel),
      again: Conformance.memory(Operators.kernel),
    }
    const report = await Conformance.operator(Text.startsWith, { implementations })
    // Each argument null, thirteen samples or text holding NUL, under binary and asciiFold: 15 × 15 × 2.
    expect(report.cases).toBe(450)
    expect(report.disagreements).toEqual([])
    // Text that admits no null is given none: 14 × 14 × 2.
    const concatenating = { memory: Conformance.memory(Operators.memory(concatLive)) }
    expect((await Conformance.operator(concat, { implementations: concatenating })).cases).toBe(392)
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
    const begins = Expr.operator('acme.begins', {
      input: [Schema.String, Schema.String],
      output: Schema.Boolean,
      collation: 'required',
    })
    const exact = Operators.memory(
      Operators.implement(begins, (text, prefix) => text.startsWith(prefix)),
    )
    // Folds whatever the call's collation, which is given folded text only under asciiFold.
    const folding = Operators.memory(
      Operators.implement(begins, (text, prefix) =>
        Collation.foldAscii(text).startsWith(Collation.foldAscii(prefix)),
      ),
    )
    const report = await Conformance.operator(begins, {
      implementations: {
        kernel: Conformance.memory(exact),
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

  it('compares an implementation of any name, __proto__ too (#319)', async () => {
    const one = Expr.operator('acme.one', { input: [Schema.Number], output: Schema.Number })
    const report = await Conformance.operator(one, {
      implementations: { good: () => 1, ['__proto__']: () => 2 },
      cases: [[1]],
    })
    expect(report.disagreements).toHaveLength(1)
    const { outcomes } = report.disagreements[0]!
    expect(Object.keys(outcomes)).toEqual(['good', '__proto__'])
    expect(Object.getOwnPropertyDescriptor(outcomes, '__proto__')?.value).toEqual(
      Outcome.Value({ value: 2 }),
    )
  })

  it('refuses an implementation named expansion beside a defined operator’s own', async () => {
    const blank = Expr.operator('acme.blankNamed', {
      input: [Schema.String],
      output: Schema.Boolean,
      definedAs: text => Expr.eq(text, ''),
    })
    await expect(
      Conformance.operator(blank, { implementations: { expansion: () => true }, cases: [['']] }),
    ).rejects.toThrow('"expansion" names the expansion')
  })

  it('runs a defined operator’s expansion beside its implementations', async () => {
    const blank = Expr.operator('acme.blankText', {
      input: [Schema.String],
      output: Schema.Boolean,
      definedAs: text => Expr.eq(text, ''),
    })
    // A database that compiled it as "blank once trimmed" disagrees with what it means.
    // A defined call is its body: `eq.equals(text, '')`, whose first argument is the text.
    const spaced = (call: Parameters<typeof valueOfOperand>[0]) =>
      Node.$is('Call')(call.node)
        ? String(valueOfOperand(exprOf(call.node.args[0]!))).trim() === ''
        : null
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

  it('samples a bounded and reproducible set of generated calls', async () => {
    const sample = (seed: number) =>
      Conformance.operator(Text.startsWith, {
        implementations: { memory: () => true, other: () => false },
        limit: 5,
        seed,
      })
    const first = await sample(3)
    expect(first.cases).toBe(10)
    expect(await sample(3)).toEqual(first)
    expect((await sample(4)).disagreements.map(each => each.args)).not.toEqual(
      first.disagreements.map(each => each.args),
    )
  })
})
