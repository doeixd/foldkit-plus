/**
 * A form over a variant Entity (#357), each part broken in turn:
 * `pnpm mutate packages/form/test/variants.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/form/test/variants.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'every key is asked whatever the case',
    'Option.isNone(cases) ? keys : keys.filter(key => shows(model, key))',
    'keys',
  ),
  edit(
    'a case’s key is asked as the input declares it, optional',
    '(caseOnly(key) === undefined\n',
    '(true\n',
  ),
  edit(
    'a case’s key may be required of every case',
    '      if (!SchemaAST.isOptional(fields[key]!.ast))\n',
    '      if (false)\n',
  ),
  edit(
    'a case’s key is shown in every case',
    'Option.exists(chosen(model), tag => holders.has(tag))',
    'true',
  ),
]
