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
        find: 'yield* require([rules.row, ...rules.members, ...relations], before, principal)',
        replace: 'yield* require([...rules.members, ...relations], before, principal)',
      },
    ],
    tests,
  },
  {
    name: 'an update is not checked over the row as it would be',
    edits: [{ file, find: 'yield* require([rules.row], after, principal)', replace: '' }],
    tests,
  },
  {
    name: 'an update of a row its writer cannot see goes ahead',
    edits: [
      {
        file,
        find: 'if (Option.isNone(current)) return yield* Effect.fail(refused(rules.row.deny))',
        replace: 'if (Option.isNone(current)) return yield* writer.update(context)',
      },
    ],
    tests,
  },
  {
    name: 'a relation rule’s fields are not read',
    edits: [
      {
        file,
        find: '[rules.row, ...rules.members, ...ruleOf(rules.relating)]',
        replace: '[rules.row, ...rules.members]',
      },
    ],
    tests,
  },
  {
    name: 'unlinking is decided as linking',
    edits: [
      {
        file,
        find: "'Unlink'),\n            policy.linkable(entity, principal, relation, 'Link'),",
        replace: "'Link'),\n            policy.linkable(entity, principal, relation, 'Link'),",
      },
    ],
    tests,
  },
  {
    name: 'a relation pointed nowhere new is still ruled',
    edits: [{ file, find: 'if (was === now && (exact || was !== null)) return []', replace: '' }],
    tests,
  },
  {
    name: 'a create is not checked',
    edits: [
      {
        file,
        find: 'yield* require(rules.map(rule => ({',
        replace: 'void (rules.map(rule => ({',
      },
    ],
    tests,
  },
  {
    name: 'an unset field reads as empty',
    edits: [
      {
        file,
        find: 'condition: Condition.unsetting(rule.condition, unset),',
        replace: 'condition: rule.condition,',
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
      { file, find: '!writeRules.has(source.writes.writer, policy, entity)', replace: 'false' },
    ],
    tests,
  },
  {
    name: 'validate takes any writer of any Entity as guarded',
    edits: [
      {
        file,
        find: 'if (source.writes === undefined || source.writes.entity !== name) return []',
        replace: 'if (source.writes === undefined) return []',
      },
    ],
    tests,
  },
  {
    name: 'RemoteServer.write does not say which writer it lands through',
    edits: [
      {
        file: '../../remote-server/src/index.ts',
        find: 'writes: { entity: writer.entity, writer, write },',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a handler takes any Source',
    edits: [
      {
        file,
        find: 'if (!rowRules.has(source.visible, policy, entity)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a handler is checked under another interaction',
    edits: [
      {
        file,
        find: "id !== undefined && Option.isNone(target) ? 'Create' : interaction,",
        replace: "id !== undefined && Option.isNone(target) ? 'Create' : 'Update',",
      },
    ],
    tests,
  },
  {
    name: 'a create by a handler is not checked',
    edits: [
      {
        file,
        find: 'if (!Condition.holds(unset, {}, input, () => false)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a handler runs over a row its rule refuses',
    edits: [
      {
        file,
        find: '!Condition.holds(rule.condition, row.value, input, () => false)',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a handler is not given the fields it asked for',
    edits: [{ file, find: '...(guard.fields ?? [])', replace: '' }],
    tests,
  },
  {
    name: 'a handler is answered as it claims',
    edits: [
      {
        file,
        find: 'return yield* shown(yield* run({ ...context, row }), principal)',
        replace: 'return yield* run({ ...context, row })',
      },
    ],
    tests,
  },
  {
    name: 'a row a handler hid stays in its answer',
    edits: [
      {
        file,
        find: 'entities: read.flatMap(Option.toArray),',
        replace: 'entities: outcome.entities ?? [],',
      },
    ],
    tests,
  },
  {
    name: 'a row a handler hid is not answered deleted',
    edits: [
      {
        file,
        find: '.filter((_, index) => Option.isNone(read[index]!))',
        replace: '.filter(() => false)',
      },
    ],
    tests,
  },
  {
    name: 'an absent id is checked as the edit is',
    edits: [
      {
        file: '../src/server.ts',
        find: "id !== undefined && Option.isNone(target) ? 'Create' : interaction,",
        replace: 'interaction,',
      },
    ],
    tests,
  },
  {
    name: 'an edit is checked as a create',
    edits: [
      {
        file: '../src/server.ts',
        find: "id !== undefined && Option.isNone(target) ? 'Create' : interaction,",
        replace: "id !== undefined ? 'Create' : interaction,",
      },
    ],
    tests,
  },
  {
    name: 'a create by a handler reads unset fields',
    edits: [
      {
        file,
        find: 'const unset = Condition.unsetting(rule.condition, new Set(ruled))',
        replace: 'const unset = rule.condition',
      },
    ],
    tests,
  },
  {
    name: 'what is stored is never asked',
    edits: [{ file, find: 'writer.linked === undefined || linked.length === 0', replace: 'true' }],
    tests,
  },
  {
    name: 'a link seen as none is taken as none',
    edits: [
      {
        file,
        find: 'if (was === now && (exact || was !== null)) return []',
        replace: 'if (was === now) return []',
      },
    ],
    tests,
  },
  {
    name: 'a link seen as none unlinks nothing',
    edits: [
      {
        file,
        find: '...(was === null && exact ? [] : Option.toArray(unlink)),',
        replace: '...(was === null ? [] : Option.toArray(unlink)),',
      },
    ],
    tests,
  },
  {
    name: 'a declared write answers what its writer may not read',
    edits: [{ file, find: '{ filter: memberRead },', replace: '{},' }],
    tests,
  },
  {
    name: 'an answer is shown more than was asked',
    edits: [
      {
        file,
        find: 'allowed.filter(field => Object.hasOwn(shown, field)).map(field => [field, shown[field]]),',
        replace: 'Object.entries(shown),',
      },
    ],
    tests,
  },
  {
    name: "a handler's answer is read back unfiltered",
    edits: [{ file, find: 'see.filter === undefined', replace: 'true' }],
    tests,
  },
  {
    name: 'an answer is read back without its id',
    edits: [
      {
        file,
        find: "const row = yield* read([...new Set(['id', ...plan.fields])])",
        replace: 'const row = yield* read(plan.fields)',
      },
    ],
    tests,
  },
  {
    name: "a writer for another Entity takes this one's rules",
    edits: [{ file, find: 'if (writer.entity !== entity.name) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'validate takes a precondition over a hidden member',
    edits: [
      {
        file,
        find: 'onSome: body => hiddenOf(attachment, Query.dependencies(body).predicate),',
        replace: 'onSome: () => [],',
      },
    ],
    tests,
  },
  {
    name: 'validate takes an expected revision on a hidden member',
    edits: [
      {
        file,
        find: '...(expected !== undefined && readRuled(attachment, expected)',
        replace: '...(false',
      },
    ],
    tests,
  },
  {
    name: 'the writer lets a precondition read a hidden member',
    edits: [
      {
        file,
        find: 'const hidden = hiddenOf(ruled, Query.dependencies(body).predicate)',
        replace: 'const hidden: ReadonlyArray<string> = []',
      },
    ],
    tests,
  },
  {
    name: 'the writer lets an expected revision name a hidden member',
    edits: [
      {
        file,
        find: 'onSome: ({ field }) => (readRuled(ruled, field) ? [field] : []),',
        replace: 'onSome: () => [],',
      },
    ],
    tests,
  },
  {
    name: 'the writer checks nothing it writes',
    edits: [
      {
        file,
        find: 'return hidden.length === 0\n',
        replace: 'return true\n',
      },
    ],
    tests,
  },
]
