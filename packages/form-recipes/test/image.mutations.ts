/**
 * The image recipe, broken in turn: `pnpm mutate packages/form-recipes/test/image.mutations.ts`.
 */
const file = '../src/image.ts'
const unit = 'packages/form-recipes/test/image.test.ts'
const browser = 'packages/form-recipes/test/image.browser.test.ts'

const one = (name: string, find: string, replace: string, tests: ReadonlyArray<string>) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  one(
    'an earlier send’s events count',
    'upload.attempt === attempt ? next(upload) : model',
    'next(upload)',
    [unit],
  ),
  one(
    'the last file dropped is sent',
    'send(next, files[0])',
    'send(next, files[files.length - 1]!)',
    [unit],
  ),
  one(
    'a refusal forgets why',
    'ImageUpload.Refused({ file, reason, status })',
    'ImageUpload.Empty()',
    [unit, browser],
  ),
  one('cancel is ignored', '{ Sending: () => emptied(model) }', '{}', [unit, browser]),
  one('retry is ignored', '{ Refused: ({ file }) => send(model, file) }', '{}', [unit, browser]),
  one(
    'a refusal is a value',
    '{ Kept: ({ asset }) => asset }',
    "{ Kept: ({ asset }) => asset, Refused: () => ({ key: 'x' }) as never }",
    [unit, browser],
  ),
  one(
    'a stored draft keeps its File',
    '{ Kept: () => upload }, () => ImageUpload.Empty()',
    '{}, () => upload',
    [unit],
  ),
  one('every refusal reads the same', 'words.refused[reason]', 'words.refused.Unexpected', [
    browser,
  ]),
]
