/**
 * The context terms in the reference interpreter, broken in turn:
 * `pnpm mutate packages/entity/test/context.mutations.ts`.
 */
const tests = ['packages/entity/test/context.test.ts']
const environment = '../src/environment.ts'
const evaluate = '../src/evaluate.ts'
const write = '../src/write.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    // The judge reads the context through the environment it builds (`environment.ts`).
    'a viewer of another Entity is read',
    environment,
    'Option.filter(context.viewer, ref => ref.entity === name),',
    'context.viewer,',
  ),
  edit(
    'a visitor is read as no one in particular',
    environment,
    '// A visitor, or a viewer of another Entity.\n          onNone: () => null,',
    "// A visitor, or a viewer of another Entity.\n          onNone: () => ({ '#asker': 'ada' }),",
  ),
  {
    ...edit(
      'no reading of the time is a null',
      environment,
      "Option.map(context.now, now => put(env, 'now', now))",
      "put(env, 'now', Option.getOrNull(context.now))",
    ),
    survives:
      'a run that reads the time with none to read is refused before its environment is built (checkContext in judgeRun.ts, killed by "a run with no context reads a visitor"), so the environment only ever holds a reading',
  },
  edit(
    'a run with no context reads a visitor',
    '../src/judgeRun.ts',
    "throw new ContextMissingError(term, 'was given no context to read it from')",
    'return',
  ),
  edit(
    'evaluateEach refuses a missing context row by row',
    evaluate,
    'error instanceof ContextMissingError ||',
    'false ||',
  ),
  edit(
    'a predicate over the context is decided from the input alone',
    evaluate,
    'return reads.field || (reads.context && context === undefined)',
    'return reads.field',
  ),
  edit(
    'evaluate is not given the context',
    evaluate,
    'rows.filter(row => matches(body, row, input, { operators, context })),',
    'rows.filter(row => matches(body, row, input, { operators, context: undefined })),',
  ),
  edit(
    'an assignment computes from the context',
    write,
    'if (context.length > 0) {',
    'if (false) {',
  ),
]
