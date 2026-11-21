/**
 * The language trace's claim, each interpreter broken in turn:
 * `pnpm mutate examples/entity/test/language.mutations.ts`.
 */
const tests = ['examples/entity/test/language.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
/** The same, against the guide's own snippets (`docs/expressions.md`). */
const guide = (name: string, file: string, find: string, replace: string) => ({
  ...edit(name, file, find, replace),
  tests: ['examples/entity/test/expressionsGuide.test.ts'],
})

export default [
  edit(
    'in memory, not of an unknown holds, so a post with no editor is kept',
    '../../../packages/entity/src/lower.ts',
    'Not: ({ operand }) => callOf(Bool.notOp, [lower(operand)]),',
    'Not: ({ operand }) => callOf(Bool.notOp, [callOf(Null.coalesceOp, [lower(operand), Node.Lit({ value: false })])]),',
  ),
  edit(
    'in memory, contains is exact about case',
    '../../../packages/entity/src/lower.ts',
    'callOf(Str.lowerAsciiOp, [lower(search)]),',
    'lower(search),',
  ),
  edit(
    'SQL searches a title from its start only',
    '../../../packages/metakit/src/sqlLowering.ts',
    '(${s}, ${sub}) > 0)',
    '(${s}, ${sub}) = 1)',
  ),
  edit(
    'a page says it holds every comment when it holds some',
    '../src/questions.ts',
    ': { entity: Comment, rows: partial.comments, complete: false },',
    ': { entity: Comment, rows: partial.comments },',
  ),
  edit(
    'a page says it holds every author when it holds some',
    '../src/questions.ts',
    ': { entity: Author, rows: partial.authors, complete: false },',
    ': { entity: Author, rows: partial.authors },',
  ),
  edit(
    'the trace asks SQLite as a visitor, whoever asks',
    '../src/questions.ts',
    'viewer: question.viewer,\n      })',
    'viewer: Option.none(),\n      })',
  ),
  guide(
    'the guide: not of an unknown comparison keeps the draft',
    '../../../packages/entity/src/lower.ts',
    'Not: ({ operand }) => callOf(Bool.notOp, [lower(operand)]),',
    'Not: ({ operand }) => callOf(Bool.notOp, [callOf(Null.coalesceOp, [lower(operand), Node.Lit({ value: false })])]),',
  ),
  guide(
    'the guide: a viewer of any Entity reads as an author',
    '../../../packages/entity/src/context.ts',
    'Option.filter(context.viewer, ref => ref.entity === entity.name),',
    'Option.filter(context.viewer, () => true),',
  ),
  guide(
    'the guide: a visitor reads as the first author',
    '../../../packages/entity/src/context.ts',
    'Option.some(Option.getOrNull(viewerIdOf(entity, context))),',
    "Option.some(Option.getOrElse(viewerIdOf(entity, context), () => 'a1')),",
  ),
]
