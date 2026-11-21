/**
 * The judge on metakit's evaluation (step 5 of the kernel convergence note),
 * broken in turn: `pnpm mutate packages/entity/test/judge-step5.mutations.ts`.
 */
const judgeRun = '../src/judgeRun.ts'
const step5 = ['packages/entity/test/judgeStep5.test.ts']

export default [
  {
    name: 'a refusal is not thrown',
    edits: [
      {
        file: judgeRun,
        find: 'if (Node.isRefusal(residual.value)) throw refusedBy(residual.value)',
        replace: 'if (Node.isRefusal(residual.value)) return Held.of(null)',
      },
    ],
    tests: step5,
  },
  {
    name: 'a refused row is not set aside',
    edits: [{ file: '../src/evaluate.ts', find: 'refused.push(row)', replace: 'throw error' }],
    tests: step5,
  },
  {
    name: 'sorting ignores a term’s collation',
    edits: [
      {
        file: '../src/rowOrder.ts',
        find: 'const sign = compare(left[index], right[index], term.collation)',
        replace: 'const sign = compare(left[index], right[index], Option.none())',
      },
    ],
    tests: ['packages/entity/test/collation.test.ts'],
  },
  {
    name: 'a write accepts text holding a NUL',
    edits: [
      { file: '../src/entity.ts', find: 'schema: schema.check(withoutNul),', replace: 'schema,' },
    ],
    tests: ['packages/entity/test/input.test.ts'],
  },
  {
    name: 'stored text is read as text that may hold a NUL',
    edits: [
      {
        file: '../src/lower.ts',
        find: 'const ast = stored(Schema.toEncoded(schema).ast)',
        replace: 'const ast = Schema.toEncoded(schema).ast',
      },
    ],
    tests: step5,
  },
  {
    name: "the holder's reason for what it lacks is lost",
    edits: [
      {
        file: judgeRun,
        find: 'unheld: (segments, reason) => left.push([segments, reason]),',
        replace: 'unheld: () => undefined,',
      },
    ],
    tests: step5,
  },
]
