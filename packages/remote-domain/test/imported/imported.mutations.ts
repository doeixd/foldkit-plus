/**
 * `Imported`, broken in turn:
 * `pnpm mutate packages/remote-domain/test/imported/imported.mutations.ts`.
 */
const describe = '../../src/imported/describe.ts'
const mutation = '../../src/imported/mutation.ts'
const tests = 'packages/remote-domain/test/imported/imported.test.ts'
const example = 'examples/writes-domain/test/imported.test.ts'

export default [
  {
    name: 'a command with no Write is described as deriving empty lists',
    edits: [
      {
        file: describe,
        find: 'onNone: () => Footprint.unknown,',
        replace: 'onNone: () => Footprint.Derived({ reads: [], writes: [] }),',
      },
    ],
    tests: [tests, example],
  },
  {
    name: 'an unnamed footprint is the mutation’s own default no longer',
    edits: [
      {
        file: mutation,
        find: 'const footprint = config.footprint ?? Footprint.unknown',
        replace:
          'const footprint = config.footprint ?? Footprint.Derived({ reads: [], writes: [] })',
      },
    ],
    tests: [tests],
  },
  {
    name: 'a Declared footprint of another Entity is accepted',
    edits: [
      {
        file: mutation,
        find: 'if (footprint.entity !== config.entity.name)',
        replace: 'if (false)',
      },
    ],
    tests: [tests],
  },
  {
    name: 'a Declared field the Entity lacks is accepted',
    edits: [
      {
        file: mutation,
        find: 'key => !Object.hasOwn(config.entity.fields, key),',
        replace: 'key => false,',
      },
    ],
    tests: [tests],
  },
  {
    name: 'a Rejection carries no field',
    edits: [
      {
        file: describe,
        find: 'field: Option.fromUndefinedOr(fields[served.tag]?.[tag]),',
        replace: 'field: Option.none(),',
      },
    ],
    tests: [tests],
  },
  {
    name: 'operations are listed as given, not sorted',
    edits: [
      {
        file: describe,
        find: 'operations: byId(operations), reads: byId(reads)',
        replace: 'operations, reads',
      },
    ],
    tests: [tests],
  },
  {
    name: 'a binding of another Api is described',
    edits: [{ file: describe, find: 'if (binding.api !== api)', replace: 'if (false)' }],
    tests: [tests],
  },
  {
    name: 'Remote reads an Unknown footprint as touching nothing',
    edits: [
      {
        file: '../../../remote/src/reaches.ts',
        find: '    Unknown: () => undefined,',
        replace: '    Unknown: () => () => false,',
      },
    ],
    tests: [tests, example],
  },
  {
    name: 'a declared footprint does not reach a list in why',
    edits: [
      {
        file: '../../../remote/src/reaches.ts',
        find: '  const touched = isMutation(write) ? write.footprint : undefined',
        replace: '  const touched = undefined as typeof write.footprint',
      },
    ],
    tests: [tests],
  },
]
