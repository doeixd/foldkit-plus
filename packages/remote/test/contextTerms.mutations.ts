/**
 * The client judging a body over the context, each step broken in turn:
 * `pnpm mutate packages/remote/test/contextTerms.mutations.ts`.
 */
const tests = ['packages/remote/test/contextTerms.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    "a live insert is judged without Remote.make's viewer",
    '../src/remote.ts',
    '              live.event,\n              contextOf(model),',
    '              live.event,\n              { viewer: Option.none(), now: Option.none() },',
  ),
  edit(
    'matching drops the context',
    '../src/matching.ts',
    '    context: options.context,\n  })',
    '  })',
  ),
  edit(
    'belongsEncoded drops the context',
    '../src/matching.ts',
    '{ ...options, among: [key] }',
    '{ ...options, context: undefined, among: [key] }',
  ),
  edit(
    'the client reads the time as the epoch',
    '../src/remote.ts',
    '    now: Option.none(),\n  })',
    '    now: Option.some(0),\n  })',
  ),
]
