/**
 * What a Surface left keeps, broken in turn:
 * `pnpm mutate packages/remote/test/departed.mutations.ts`
 */
const tests = ['packages/remote/test/departed.test.ts', 'packages/remote/test/noOp.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const model = '../src/model.ts'
const retain = '../src/retain.ts'

export default [
  edit(
    'only the active roots are kept',
    model,
    'const retained = gc(model, recent)',
    'const retained = gc(model, message.roots)',
  ),
  edit('the roots are not remembered', model, '        recent,\n        grown:', '        grown:'),
  edit(
    'a list left is not refetched',
    model,
    'ages === true\n            ? held\n            : setConnectionStale(held, identity, true),',
    'ages === true\n            ? held\n            : held,',
  ),
  edit(
    'a list still shown is marked stale too',
    model,
    'active.has(identity) || held[identity] === undefined',
    'held[identity] === undefined',
  ),
  edit(
    'nothing left is kept',
    retain,
    'return [...departed.slice(Math.max(0, departed.length - limit)), ...active]',
    'return active',
  ),
  edit(
    'the oldest left are kept instead of the newest',
    retain,
    'departed.slice(Math.max(0, departed.length - limit))',
    'departed.slice(0, limit)',
  ),
  edit(
    'lists left are kept without limit',
    retain,
    '      departedLimit.connections,',
    '      Infinity,',
  ),
  edit(
    'reads left are kept without limit',
    retain,
    '      departedLimit.requirements,',
    '      Infinity,',
  ),
  edit(
    'unchanged roots are new roots',
    retain,
    '    ? previous\n    : next',
    '    ? next\n    : next',
  ),
]
