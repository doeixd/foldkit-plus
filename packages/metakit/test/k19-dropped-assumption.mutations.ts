const tests = [
  'packages/metakit/test/k19-dropped-assumption.test.ts',
  'packages/metakit/test/nested-fold-readers.test.ts',
]

export default [
  {
    name: 'a refutation past a dropped assumption stays False',
    edits: [
      {
        file: '../src/abstract/check.ts',
        find: 'return first === undefined || !Verdict.isFalse(verdict)',
        replace: 'return true',
      },
    ],
    tests,
  },
  {
    name: 'a list fold assumed is dropped without a record',
    edits: [
      {
        file: '../src/abstract/state.ts',
        find: "      Rows: ({ fold }) => this.drop('unsupported', `rows.${fold}`),\n    })\n  }\n\n  /** Leave out",
        replace: '      Rows: () => {},\n    })\n  }\n\n  /** Leave out',
      },
    ],
    tests,
  },
  {
    name: 'a clone keeps a drop log of its own',
    edits: [
      {
        file: '../src/abstract/state.ts',
        find: 'this.dropped = from.dropped',
        replace: 'this.dropped = []',
      },
    ],
    tests,
  },
  {
    name: 'text order assumed is dropped without a record',
    edits: [
      {
        file: '../src/abstract/ops.ts',
        find: "  assume: (_, state) => state.drop('unsupported', op.id),\n  refute: (_, state) => state.drop('unsupported', op.id),\n})",
        replace: '  assume: () => {},\n  refute: () => {},\n})',
      },
    ],
    tests,
  },
]
