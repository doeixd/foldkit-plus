/**
 * The slider and segmented previews, broken in turn: `pnpm mutate
 * examples/site/test/fields.mutations.ts`.
 */
const tests = ['examples/site/test/fields.test.ts']
const fields = '../src/gallery/fields.ts'

const mutation = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: fields, find, replace }],
  tests,
})

export default [
  mutation(
    'a moved slider saves as it goes',
    'brightness => ({ ...brightness, value })',
    'brightness => ({ saved: value, value })',
  ),
  mutation(
    'a commit does not save',
    'brightness => ({ ...brightness, saved: value })',
    'brightness => brightness',
  ),
  mutation('a weekday is only turned on', '{ multiple: true }),', '{ multiple: false }),'),
]
