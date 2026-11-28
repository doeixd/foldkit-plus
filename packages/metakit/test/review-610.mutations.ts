/**
 * Review of #610: emitted-record tags, and totals kept by deltas.
 * `pnpm mutate packages/metakit/test/review-610.mutations.ts`.
 */
const tests = [
  'packages/metakit/test/emit.test.ts',
  'packages/metakit/test/aggregates-review.test.ts',
]

export default [
  {
    name: 'emit accepts a payload field named _tag',
    edits: [
      {
        file: '../src/transition.ts',
        find: '  for (const name of Object.keys(fields)) rejectReservedField(name)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a hand-built emission may overwrite its tag',
    edits: [
      {
        file: '../src/transition.ts',
        find: '      for (const [name] of fields) rejectReservedField(name)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'updateDelta carries a difference past the safe range',
    edits: [
      {
        file: '../src/aggregates.ts',
        find: `    updateDelta: (before, after) => {
      const delta = BigInt(valueOf(after)) - BigInt(valueOf(before))
      if (delta > SAFE_TOTAL || delta < -SAFE_TOTAL) {
        throw new Node.Refusal({
          reason: 'unsafe-integer',
          at: \`Rows.\${fold}\`,
          detail: 'the update delta is past ±(2^53−1); replaceTotal keeps the exact total',
        })
      }
      return Number(delta) as A
    },`,
        replace: '    updateDelta: (before, after) => (valueOf(after) - valueOf(before)) as A,',
      },
    ],
    tests,
  },
  {
    name: 'replaceTotal does not check its final total',
    edits: [
      {
        file: '../src/aggregates.ts',
        find: `    replaceTotal: (total, before, after) =>
      withinSafe(fold, BigInt(total) - BigInt(valueOf(before)) + BigInt(valueOf(after))) as A,`,
        replace: `    replaceTotal: (total, before, after) =>
      Number(BigInt(total) - BigInt(valueOf(before)) + BigInt(valueOf(after))) as A,`,
      },
    ],
    tests,
  },
  {
    name: 'symbolic deltas subtract a missing contribution as null',
    edits: [
      {
        file: '../src/aggregates.ts',
        find: `    symbolicInsertDelta: Null.coalesce(liftNumber('row'), missing),
    symbolicUpdateDelta: Num.sub(
      Null.coalesce(liftNumber('after'), missing),
      Null.coalesce(liftNumber('before'), missing),
    ),`,
        replace: `    symbolicInsertDelta: liftNumber('row') as never,
    symbolicUpdateDelta: Num.sub(liftNumber('after') as never, liftNumber('before') as never),`,
      },
    ],
    tests,
  },
]
