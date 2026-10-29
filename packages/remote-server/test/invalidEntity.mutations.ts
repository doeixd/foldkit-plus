/**
 * An Invalid refusal named by its Entity and its id (#325), broken in turn:
 * `pnpm mutate packages/remote-server/test/invalidEntity.mutations.ts`.
 */
const tests = ['packages/remote-server/test/invalid.test.ts']

export default [
  {
    name: 'a refusal is matched by its id alone',
    edits: [
      {
        file: '../../remote/src/mutation.ts',
        find: '    Option.contains(refusal.entity, invariant.entity) &&\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: "the server's refusal names no Entity",
    edits: [
      {
        file: '../src/index.ts',
        find: 'entity: Option.some(write.input.entity.name),',
        replace: 'entity: Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'a declaration never learns its Entity',
    edits: [
      { file: '../../entity/src/invariant.ts', find: '    attached = entity.name\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'a declaration may be attached to a second Entity',
    edits: [
      {
        file: '../../entity/src/invariant.ts',
        find: 'if (attached !== undefined && attached !== entity.name)',
        replace: 'if (false)',
      },
    ],
    tests,
  },
]
