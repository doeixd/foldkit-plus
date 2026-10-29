/**
 * Rules over who asks, broken in turn:
 * `pnpm mutate packages/guard/test/viewerRule.mutations.ts`.
 */
const tests = ['packages/guard/test/viewerRule.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a rule judged in memory is given no context',
    '../src/condition.ts',
    '            operators,\n            context,\n          }).matched.length === 1,',
    '            operators,\n          }).matched.length === 1,',
  ),
  edit(
    'the viewer is not the principal’s key',
    '../src/index.ts',
    'Option.map(user, each => ({ entity: entity.name, id: options.key(each) })),',
    "Option.map(user, () => ({ entity: entity.name, id: 'nobody' })),",
  ),
  edit(
    'a rule may read the time',
    '../src/index.ts',
    "        if (operations.includes('now')) {",
    '        if (false) {',
  ),
  edit(
    'a set with no viewer takes a rule over it',
    '../src/index.ts',
    "        if (operations.includes('viewer') && options.viewer === undefined) {",
    '        if (false) {',
  ),
  edit(
    'a rule over one row may reach another',
    '../src/attach.ts',
    'if (!reachingSurfaces.has(where) && Query.dependencies(guard.query).reaches.length > 0) {',
    'if (false) {',
  ),
  edit(
    'a Read rule is compiled with no context',
    '../src/drizzle.ts',
    '                  context,\n                  visibleOf: () => Option.none(),\n',
    '                  visibleOf: () => Option.none(),\n',
  ),
]
