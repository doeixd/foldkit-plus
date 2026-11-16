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

export default [
  edit(
    'in memory, not of an unknown holds, so a post with no editor is kept',
    '../../../packages/entity/src/evaluate.ts',
    "return truth === 'unknown' || isUnheld(truth) ? truth : !truth",
    'return isUnheld(truth) ? truth : truth !== true',
  ),
  edit(
    'in memory, contains is exact about case',
    '../../../packages/entity/src/evaluate.ts',
    'return foldAscii(value).includes(foldAscii(search))',
    'return value.includes(search)',
  ),
  edit(
    'SQL searches a title from its start only',
    '../../../packages/remote-drizzle/src/compile.ts',
    'const pattern = `%${escapeLike(search)}%`',
    'const pattern = `${escapeLike(search)}%`',
  ),
  edit(
    'SQL reads like wildcards in what was typed',
    '../../../packages/remote-drizzle/src/compile.ts',
    'const pattern = `%${escapeLike(search)}%`',
    'const pattern = `%${search}%`',
  ),
  edit(
    'a page says it holds every comment when it holds some',
    '../src/language.ts',
    ': { entity: Comment, rows: partial.comments, complete: false },',
    ': { entity: Comment, rows: partial.comments },',
  ),
  edit(
    'a page says it holds every author when it holds some',
    '../src/language.ts',
    ': { entity: Author, rows: partial.authors, complete: false },',
    ': { entity: Author, rows: partial.authors },',
  ),
  edit(
    'the trace asks SQLite as a visitor, whoever asks',
    '../src/language.ts',
    'viewer: question.viewer,\n          })',
    'viewer: Option.none(),\n          })',
  ),
]
