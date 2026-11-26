/**
 * `SSR.hydrate`'s `prepare` (#347), broken in turn: `pnpm mutate
 * packages/ssr/test/hydratePrepare.mutations.ts` checks that a test fails for
 * each.
 */
const client = '../src/client.ts'
const tests = ['packages/ssr/test/hydratePrepare.test.ts']
const call = `  } else {
    // Keep the binder alive while async \`prepare\` runs, then take its final
    // snapshot right before adopting so clicks during \`prepare\` are never lost.
    void Effect.runPromise(prepare(restoredModel)).then(preparedModel => {
      const snap = takeBinder()
      adoptFrom(mergeBinderModel(preparedModel, snap), snap)
    })
  }
`

export default [
  {
    name: 'the runtime starts from the resumed Model, not the prepared one',
    edits: [
      {
        file: client,
        find: call,
        replace: `  } else {
    void Effect.runPromise(prepare(restoredModel)).then(() => {
      const snap = takeBinder()
      adoptFrom(mergeBinderModel(restoredModel, snap), snap)
    })
  }
`,
      },
    ],
    tests,
  },
  {
    name: 'the page is adopted before prepare answers',
    edits: [
      {
        file: client,
        find: call,
        replace: `  } else {
    void Effect.runPromise(prepare(restoredModel))
    const snap = takeBinder()
    adoptFrom(mergeBinderModel(restoredModel, snap), snap)
  }
`,
      },
    ],
    tests,
  },
]
