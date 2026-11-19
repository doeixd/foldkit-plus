/**
 * `Mutation.update`, `insert` and `delete` each drop what they pass to the long
 * form: `pnpm mutate packages/remote/test/writeShorthand.mutations.ts`.
 */
const tests = ['packages/remote/test/writeShorthand.test.ts']
const file = '../src/mutationDescriptor.ts'

export default [
  {
    name: 'an update drops its options',
    edits: [
      {
        file,
        find: "write(name, Write.update(inputOver(entity, set), { ...options, id: 'id' } as never))",
        replace: "write(name, Write.update(inputOver(entity, set), { id: 'id' } as never))",
      },
    ],
    tests,
  },
  {
    name: 'an insert drops its becomes',
    edits: [{ file, find: "{ id: 'id', becomes })", replace: "{ id: 'id' })" }],
    tests,
  },
  {
    name: 'a delete drops its options',
    edits: [
      {
        file,
        find: "write(name, Write.delete(inputOver(entity, {}), { ...options, id: 'id' } as never))",
        replace: "write(name, Write.delete(inputOver(entity, {}), { id: 'id' } as never))",
      },
    ],
    tests,
  },
  {
    name: 'the id is text, not the Entity’s id field',
    edits: [
      {
        file,
        find: "Schema.Struct({ ...Entity.fields(entity, 'id'), ...set })",
        replace: 'Schema.Struct({ id: Schema.String, ...set })',
      },
    ],
    tests,
  },
  // Leaving `set` out of the input is refused where every case is declared ("sets no field").
  {
    name: 'an insert is declared as an update',
    edits: [
      {
        file,
        find: 'Write.insert(inputOver(entity, set)',
        replace: 'Write.update(inputOver(entity, set)',
      },
    ],
    tests,
  },
]
