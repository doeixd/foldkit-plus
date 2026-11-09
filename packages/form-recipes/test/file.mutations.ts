/**
 * The file recipe, broken in turn: `pnpm mutate packages/form-recipes/test/file.mutations.ts`.
 */
const file = '../src/file.ts'
const shared = '../src/uploadControl.ts'
const unit = 'packages/form-recipes/test/file.test.ts'
const browser = 'packages/form-recipes/test/file.browser.test.ts'

const one = (
  name: string,
  find: string,
  replace: string,
  tests: ReadonlyArray<string>,
  at = file,
) => ({ name, edits: [{ file: at, find, replace }], tests })

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
    'FileUpload.Refused({ file, reason, status })',
    'FileUpload.Empty()',
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
    '{ Kept: () => upload }, () => FileUpload.Empty()',
    '{}, () => upload',
    [unit],
  ),
  one('every refusal reads the same', 'words.refused[reason]', 'words.refused.Unexpected', [
    unit,
    browser,
  ]),
  one('the default address is the image route', "'/_media/files'", "'/_media/upload'", [
    unit,
    browser,
  ]),
  one('the download ignores the address', '`${url}/${asset.key}`', '`/_media/files/${asset.key}`', [
    unit,
  ]),
  one('the download names no file', "h.Attribute('download', asset.name),", '', [browser]),
  one(
    'the picker is not filtered',
    'options.accept === undefined ? [] : [...options.accept]',
    '[]',
    [unit],
  ),
  one(
    'the picker offers images only',
    'options.accept === undefined ? [] : [...options.accept]',
    "['image/*']",
    [unit],
  ),
  one(
    'a file too large is sent',
    'const sendable = (file: File): boolean => file.size <= maxBytes',
    'const sendable = (file: File): boolean => true',
    [unit],
  ),
  one(
    'a file of maxBytes is refused',
    'boolean => file.size <= maxBytes',
    'boolean => file.size < maxBytes',
    [unit],
  ),
  one('maxBytes is ignored', 'options.maxBytes ?? defaultMaxBytes', 'defaultMaxBytes', [unit]),
  one('the default size is 20 MiB less a byte', '20 * 1024 * 1024', '20 * 1024 * 1024 - 1', [unit]),
  one(
    'a retry is offered for a file refused before it was sent',
    'file.size <= maxBytes\n            ? [button',
    'true\n            ? [button',
    [unit],
  ),
  one(
    'a retry sends a file refused before it was sent',
    '? { model: send(model, file)',
    '|| true ? { model: send(model, file)',
    [unit],
  ),
  one(
    'a send forgets the total it reports',
    'FileUpload.Sending({ ...upload, loaded, total })',
    'FileUpload.Sending({ ...upload, loaded })',
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
  one(
    'a submit does not wait for a send',
    '{ Sending: () => true }, () => false',
    '{}, () => false',
    [unit],
  ),
  one('the progress has no name', 'h.AriaLabelledBy(`${id}-status`),', '', [browser]),
  one('the file is sent as an image', 'uploadFile(file, options)', 'upload(file, options)', [
    browser,
  ]),
  one('a size is written in binary units', 'value /= 1000', 'value /= 1024', [unit]),
  one('a size past a kilobyte is not scaled', 'value >= 1000', 'value >= 1000000', [unit]),
  one(
    'a size shows no decimal',
    '`${value.toFixed(1)} ${units[unit]}`',
    '`${Math.round(value)} ${units[unit]}`',
    [unit],
  ),
  one(
    'a maxBytes of no whole number is taken',
    'Number.isSafeInteger(options.maxBytes) && options.maxBytes >= 0',
    'true',
    [unit],
  ),
  one(
    'any id is taken',
    'if (!/^[A-Za-z_][\\w-]*$/.test(options.id))',
    'if (false)',
    [unit],
    shared,
  ),
  one(
    'the recipe is not named in an error',
    '`${recipe}: "${options.url}"',
    '`image: "${options.url}"',
    [unit],
    shared,
  ),
]
