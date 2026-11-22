/**
 * Step 9's security requirements, each broken in turn:
 * `pnpm mutate packages/guard/test/step9.mutations.ts`.
 */
const condition = '../src/condition.ts'
const may = '../src/may.ts'
const tests = ['packages/guard/test/step9.test.ts', 'packages/guard/test/step9Differential.test.ts']

const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests: [...tests, 'packages/guard/test/mayPrediction.test.ts'],
})

export default [
  edit(
    'a refused or null rule holds',
    condition,
    '      { Known: ({ value }) => value === true, Open: () => false },',
    '      { Known: ({ value }) => value !== false, Open: () => false },',
  ),
  edit(
    'a rule one row cannot judge holds',
    condition,
    '      { Known: ({ value }) => value === true, Open: () => false },',
    '      { Known: ({ value }) => value === true, Open: () => true },',
  ),
  edit(
    'a refused guard is absorbed beside one that allows',
    condition,
    'Known: ({ value }) => Node.Lit({ value: value === undefined ? null : value }),',
    'Known: ({ value }) => Node.Lit({ value: value === true }),',
  ),
  edit(
    'a refused guard left for the statement is dropped',
    condition,
    '              if (Node.isRefusal(value)) refused = true\n',
    '',
  ),
  edit(
    'the statement is handed the rest of a refused rule',
    condition,
    'return refused ? never : left',
    'return left',
  ),
  edit(
    'the page takes an open part to fail, and so a yes beside it',
    condition,
    "Open: () => Node.Path({ segments: ['open', String(opened++)], ast: Option.none() }),",
    'Open: () => Node.Lit({ value: false }),',
  ),
  edit(
    'the page judges a rule over who asks without them',
    condition,
    '          readsPrincipal(each.guard)\n            ? open\n',
    '          false\n            ? open\n',
  ),
  edit(
    'the page foresees what it decided of a partly decided answer',
    may,
    'return [...decided.values()].every(Option.isSome)',
    'return true',
  ),
  edit(
    'a malformed link throws',
    condition,
    "    return Settled.Known({ value: Node.illTyped(each.guard.name, 'a ref key', values) })",
    '    throw new Error(`${each.guard.name} holds no ref key`)',
  ),
  edit(
    'Policy.decide lets a visitor pass a rule over the principal',
    '../src/index.ts',
    '!(Option.isNone(principal) && readsPrincipal(rowGuard)) &&',
    '',
  ),
]
