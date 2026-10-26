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
  one(
    'cancel is ignored',
    'model: emptied(model), commands: [focus(`#${model.drop.id}`)]',
    'model',
    [unit, browser],
  ),
  one('retry is ignored', 'model: send(model, file),', 'model,', [unit, browser]),
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
  one('a dropped file that is no image is sent', "files[0].type.startsWith('image/')", 'true', [
    unit,
  ]),
  one(
    'a send forgets the total it reports',
    'ImageUpload.Sending({ ...upload, loaded, total })',
    'ImageUpload.Sending({ ...upload, loaded })',
    [unit],
  ),
  one(
    'a remove keeps a refused file',
    '{ Empty: () => ({ model }) }, () => ({',
    '{ Empty: () => ({ model }), Refused: () => ({ model }) }, () => ({',
    [unit],
  ),
  one(
    'focus stays where a retry was',
    'focus(`#${model.drop.id}-cancel`)',
    'focus(`#${model.drop.id}`)',
    [unit],
  ),
  one(
    'a stored draft keeps its drag',
    'drop: drop => (drop.isDragOver ? { ...drop, isDragOver: false } : drop),',
    'drop: drop => drop,',
    [unit],
  ),
  one('the progress has no name', 'h.AriaLabelledBy(`${id}-status`),', '', [browser]),
  {
    name: 'the field’s label names no group',
    edits: [
      { file: '../../mixins-form/src/index.ts', find: "        h.Role('group'),\n", replace: '' },
    ],
    tests: [browser],
  },
]
