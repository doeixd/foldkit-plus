/**
 * The context terms in the reference interpreter, broken in turn:
 * `pnpm mutate packages/entity/test/context.mutations.ts`.
 */
const tests = ['packages/entity/test/context.test.ts']
const context = '../src/context.ts'
const evaluate = '../src/evaluate.ts'
const write = '../src/write.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a viewer of another Entity is read',
    context,
    'Option.filter(context.viewer, ref => ref.entity === entity.name),',
    'context.viewer,',
  ),
  edit(
    'a visitor is read as no one in particular',
    context,
    'Option.some(Option.getOrNull(viewerIdOf(entity, context))),',
    "Option.some(Option.getOrElse(viewerIdOf(entity, context), () => 'ada')),",
  ),
  edit(
    'no reading of the time is a null',
    context,
    'Now: () => context.now,',
    'Now: () => Option.some(Option.getOrNull(context.now)),',
  ),
  edit(
    'a run with no context reads a visitor',
    evaluate,
    "throw new ContextMissingError(node, 'was given no context to read it from')",
    'return null',
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
    'rows.filter(row => matches(body, row, input, operators, context)),',
    'rows.filter(row => matches(body, row, input, operators, undefined)),',
  ),
  edit(
    'an assignment computes from the context',
    write,
    'if (context.length > 0) {',
    'if (false) {',
  ),
]
