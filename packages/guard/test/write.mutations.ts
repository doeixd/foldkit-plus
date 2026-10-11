/**
 * A guard set's write rules on declared writes, broken in turn:
 * `pnpm mutate packages/guard/test/write.mutations.ts`.
 */
const file = '../src/server.ts'
const tests = ['packages/guard/test/write.test.ts']

export default [
  {
    name: 'an update is not checked over the row as it is',
    edits: [
      {
        file,
        find: 'yield* require([row, ...members, ...relations], before, principal)',
        replace: 'yield* require([...members, ...relations], before, principal)',
      },
    ],
    tests,
  },
  {
    name: 'an update is not checked over the row as it would be',
    edits: [{ file, find: 'yield* require([row], after, principal)', replace: '' }],
    tests,
  },
  {
    name: 'an update of a row its writer cannot see goes ahead',
    edits: [
      {
        file,
        find: 'if (Option.isNone(current)) return yield* Effect.fail(refused(row.deny))',
        replace: 'if (Option.isNone(current)) return yield* writer.update(context)',
      },
    ],
    tests,
  },
  {
    name: 'a relation rule’s fields are not read',
    edits: [{ file, find: '[row, ...members, ...ruleOf(relating)]', replace: '[row, ...members]' }],
    tests,
  },
  {
    name: 'unlinking is decided as linking',
    edits: [
      {
        file,
        find: "policy.linkable(entity, principal, relation, 'Unlink'),",
        replace: "policy.linkable(entity, principal, relation, 'Link'),",
      },
    ],
    tests,
  },
  {
    name: 'a relation pointed nowhere new is still ruled',
    edits: [{ file, find: 'if (was === now) return []', replace: '' }],
    tests,
  },
  {
    name: 'a create is not checked',
    edits: [
      { file, find: 'yield* require(rules, { ...unset, ...proposed }, principal)', replace: '' },
    ],
    tests,
  },
  {
    name: 'an unset field reads as empty',
    edits: [
      {
        file,
        find: '.map(field => [field, matchesNothing]),',
        replace: '.map(field => [field, null]),',
      },
    ],
    tests,
  },
  {
    name: 'a refusal drops its explanation',
    edits: [
      {
        file,
        find: 'Explain: ({ reason }) => RemoteServer.forbid(reason),',
        replace: 'Explain: () => RemoteServer.forbid(),',
      },
    ],
    tests,
  },
  {
    name: 'a delete is not checked',
    edits: [{ file, find: 'yield* require([row], current.value, context.principal)', replace: '' }],
    tests,
  },
  {
    name: 'a delete of a row its writer cannot see goes ahead',
    edits: [
      {
        file,
        find: "if (Option.isNone(current)) return 'absent' as const",
        replace: 'if (Option.isNone(current)) return yield* writer.delete(context)',
      },
    ],
    tests,
  },
  {
    name: 'a write is answered as written, not as its writer sees it',
    edits: [
      {
        file: '../../remote-server/src/index.ts',
        find: 'const read = writer.read\n',
        replace: 'const read = undefined as typeof writer.read\n',
      },
    ],
    tests,
  },
  {
    name: 'a Drizzle writer reads nothing back',
    edits: [
      {
        file: '../../remote-drizzle/src/index.ts',
        find: 'Option.fromUndefinedOr(records.find(record => record.id === id)?.values),',
        replace: 'Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'a preset is not set',
    edits: [
      {
        file,
        find: '...Object.fromEntries(presets.map(({ field, value }) => [field, value(user)])),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a visitor creates with nothing preset',
    edits: [
      {
        file,
        find: 'if (presets.length > 0 && Option.isNone(given.principal)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'an input may set a preset field',
    edits: [
      {
        file,
        find: 'const preset = presets.find(({ field }) => Object.hasOwn(given.values, field))',
        replace: 'const preset = undefined as { readonly field: string } | undefined',
      },
    ],
    tests,
  },
  {
    name: 'validate does not look at writes',
    edits: [
      { file, find: '!writeRules.has(source.writes.writer, policy, name)', replace: 'false' },
    ],
    tests,
  },
  {
    name: 'validate takes any writer of any Entity as guarded',
    edits: [{ file, find: 'source.writes.entity === name &&', replace: '' }],
    tests,
  },
  {
    name: 'RemoteServer.write does not say which writer it lands through',
    edits: [
      {
        file: '../../remote-server/src/index.ts',
        find: 'writes: { entity: writer.entity, writer },',
        replace: '',
      },
    ],
    tests,
  },
]
