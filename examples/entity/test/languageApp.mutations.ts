/**
 * The language page's Model, broken in turn:
 * `pnpm mutate examples/entity/test/languageApp.mutations.ts`.
 */
const tests = ['examples/entity/test/languageApp.test.ts']
const file = '../src/languageApp.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'SQLite’s answer to an earlier question is taken',
    'SqlAnswered: ({ key, ids, statements }) =>\n      key === keyOf(inputsOf(model))',
    'SqlAnswered: ({ key, ids, statements }) =>\n      key === key',
  ),
  edit(
    'SQLite’s failure for an earlier question is taken',
    'SqlFailed: ({ key, message }) =>\n      key === keyOf(inputsOf(model))',
    'SqlFailed: ({ key, message }) =>\n      key === key',
  ),
  edit(
    'choosing the body already chosen asks SQLite again',
    'chosen === model.body ? { model } :',
    'false ? { model } :',
  ),
  edit(
    'a value that is no declared body is taken',
    'const decodeBody = Schema.decodeUnknownOption(Body)',
    'const decodeBody = (body: string) => Option.some(body as typeof Body.Type)',
  ),
  edit(
    'a body is given inputs it does not read',
    'Query.dependencies(base.body).inputs.flatMap(key =>',
    "['search', 'name', 'editor'].flatMap(key =>",
  ),
  edit(
    'a visitor asks as an author',
    "inputs.viewer === 'visitor'\n      ? Option.none()",
    'false\n      ? Option.none()',
  ),
  edit(
    'two answers agree when they are as long as each other',
    'left.length === right.length && left.every((id, index) => id === right[index])',
    'left.length === right.length',
  ),
  edit('a page holding part is never counted wrong', 'truth !== sqlIds.includes(post.id)', 'false'),
  edit(
    'a verdict Judge is sure of reads as unknown',
    'known: Option.some(truth),',
    'known: Option.none(),',
  ),
  edit(
    'the live region leaves out what evaluate refuses',
    'onFailure: why => ` evaluate refuses: ${why}.`',
    "onFailure: () => ''",
  ),
]
