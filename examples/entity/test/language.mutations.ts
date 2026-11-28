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
    '../../../packages/entity/src/expr/logic.ts',
    'return exprOf(call(Bool.notOp, [node]))',
    'return exprOf(call(Bool.notOp, [call(Null.coalesceOp, [node, Node.Lit({ value: false })])]))',
  ),
  edit(
    'in memory, contains is exact about case',
    '../../../packages/entity/src/expr/text.ts',
    'args: [lowered(text), lowered(sought)]',
    'args: [lowered(text), sought]',
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
    '../../../packages/entity/src/expr/logic.ts',
    'return exprOf(call(Bool.notOp, [node]))',
    'return exprOf(call(Bool.notOp, [call(Null.coalesceOp, [node, Node.Lit({ value: false })])]))',
  ),
  guide(
    // The judge reads the viewer through the environment it builds.
    'the guide: a viewer of any Entity reads as an author',
    '../../../packages/entity/src/environment.ts',
    'Option.filter(context.viewer, ref => ref.entity === name),',
    'Option.filter(context.viewer, () => true),',
  ),
  guide(
    'the guide: a visitor reads as the first author',
    '../../../packages/entity/src/environment.ts',
    '// A visitor, or a viewer of another Entity.\n          onNone: () => null,',
    "// A visitor, or a viewer of another Entity.\n          onNone: () => ({ '#asker': 'a1' }),",
  ),
]
