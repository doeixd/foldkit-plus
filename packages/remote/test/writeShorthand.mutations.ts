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
        find: "Write.update(inputOver(entity, set, input), { ...options, id: 'id' } as never)",
        replace: "Write.update(inputOver(entity, set, input), { id: 'id' } as never)",
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
        find: "Write.delete(inputOver(entity, {}), { ...options, id: 'id' } as never)",
        replace: "Write.delete(inputOver(entity, {}), { id: 'id' } as never)",
      },
    ],
    tests,
  },
  {
    name: 'the id is text, not the Entity’s id field',
    edits: [
      {
        file,
        find: "Schema.Struct({ ...Entity.fields(entity, 'id'), ...set, ...input })",
        replace: 'Schema.Struct({ id: Schema.String, ...set, ...input })',
      },
    ],
    tests,
  },
  {
    name: 'an update drops its input',
    edits: [
      {
        file,
        find: 'Write.update(inputOver(entity, set, input),',
        replace: 'Write.update(inputOver(entity, set),',
      },
    ],
    tests,
  },
  {
    name: 'an input key is mapped to its field',
    edits: [
      {
        file,
        find: 'for (const key of Object.keys(input)) unmapped[key] = Entity.unmapped',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a key in set and input is taken',
    edits: [
      {
        file,
        find: "Object.keys(input).find(key => key === 'id' || Object.hasOwn(set, key))",
        replace: "Object.keys(input).find(key => key === 'id')",
      },
    ],
    tests,
  },
  {
    name: 'the id in input is taken',
    edits: [
      {
        file,
        find: "Object.keys(input).find(key => key === 'id' || Object.hasOwn(set, key))",
        replace: 'Object.keys(input).find(key => Object.hasOwn(set, key))',
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
