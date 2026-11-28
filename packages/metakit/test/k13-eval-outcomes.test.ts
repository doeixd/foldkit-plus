import { Expr, Node, Null, Path } from '@doeixd/metakit'
import { call, settleNode, Settled } from '@doeixd/metakit/build'
import { Option, Schema } from 'effect'
import { expect, it } from 'vitest'

const { subject } = Path.forEnv({ subject: Schema.Unknown })
const match = Expr.fromNode<{ readonly subject: unknown }, boolean>(
  Node.Match({
    on: subject.node,
    cases: [['yes', Expr.lit(true).node]],
    otherwise: Option.none(),
  }),
)

const cyclic = { self: {} }
cyclic.self = cyclic
const cyclicList: Array<unknown> = []
cyclicList.push(cyclicList)
const unprintable = {
  toJSON: () => {
    throw new Error('cannot serialize')
  },
  toString: () => {
    throw new Error('cannot convert')
  },
}

it.each([
  { name: 'a string', value: 'no', detail: '"no"' },
  { name: 'a BigInt', value: 2n, detail: '2' },
  { name: 'a cyclic record', value: cyclic, detail: '[object Object]' },
  { name: 'a cyclic list', value: cyclicList, detail: '<unprintable value>' },
  {
    name: 'an object that throws when formatted',
    value: unprintable,
    detail: '<unprintable value>',
  },
])('returns an unmatched refusal for $name', ({ value, detail }) => {
  expect(Expr.evalResult(match, { subject: value })).toMatchObject({
    failure: { reason: 'unmatched', at: 'match', detail: `no case names ${detail}` },
  })
})

it('keeps the NUL screen for a cyclic list', () => {
  expect(Expr.evalResult(match, { subject: [cyclicList, 'a\u0000'] })).toMatchObject({
    failure: { reason: 'unportable', at: 'match' },
  })
})

it('returns an unmatched refusal when a BigInt is known to the partial readers', () => {
  const env = { subject: 2n }
  const refusal = new Node.Refusal({ reason: 'unmatched', at: 'match', detail: 'no case names 2' })

  expect(settleNode(match.node, env)).toEqual(Settled.Known({ value: refusal }))
  expect(Expr.evalResult(Expr.residualize(match, env), env)).toMatchObject({ failure: refusal })
})

it.each([{ args: [] }, { args: [null] }, { args: [null, 7, 8] }])(
  'rejects coalesce with $args.length arguments at construction',
  ({ args }) => {
    expect(() => call(Null.coalesceOp, args)).toThrow(
      `null.coalesce expects 2 arguments, got ${args.length}`,
    )
  },
)

it('evaluates coalesce built with two arguments', () => {
  expect(Expr.evaluate(call(Null.coalesceOp, [null, 7]), {})).toBe(7)
})
