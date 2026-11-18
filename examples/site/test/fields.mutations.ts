/**
 * The file input previews, broken in turn: `pnpm mutate
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
    'a single file picker keeps every pick',
    "multiple: example === 'multiple',",
    'multiple: true,',
  ),
  mutation(
    'a remove drops every file of the same name',
    'held => held !== file',
    'held => held.name !== file.name',
  ),
  mutation(
    'a remove does not put focus back on the input',
    '...Command.mapMessages([FileInput.Focus({ id: FILES_ID[example] })], () =>',
    '...Command.mapMessages([], () =>',
  ),
  mutation('a changed price is not kept', 'price: () => value', 'price: () => model.price'),
  mutation('the same price makes a new Model', 'Equal.equals(value, model.price)', 'false'),
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
  mutation('a choice outside the orders is kept', 'Schema.is(Sort),', '() => true,'),
  mutation(
    'a choice made in the sheet is not kept',
    'sort: sort => Option.orElse(chosen, () => sort),',
    'sort: sort => sort,',
  ),
]
