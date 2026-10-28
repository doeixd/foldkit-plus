/**
 * `pnpm dev`'s lifecycle, broken one piece at a time:
 * `pnpm mutate examples/cloudflare/test/develop.mutations.ts`
 */
const file = '../src/develop.ts'
const tests = ['examples/cloudflare/test/develop.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit('a second stop stops again', '      stopping = Option.some(once)\n', ''),
  edit(
    'a failure while starting leaves the stack running',
    '    await stop(1)\n    throw error',
    '    throw error',
  ),
  edit(
    'a failure to stop exits as asked',
    'parts.exit(failures.length > 0 ? 1 : code)',
    'parts.exit(code)',
  ),
  edit(
    'a failure to stop is not reported',
    '        for (const failure of failures) parts.error(',
    '        for (const failure of []) parts.error(',
  ),
]
