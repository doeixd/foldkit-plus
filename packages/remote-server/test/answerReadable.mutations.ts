/**
 * What a mutation answers of the rows its handler patched, broken in turn:
 * `pnpm mutate packages/remote-server/test/answerReadable.mutations.ts`.
 */
const tests = ['packages/remote-server/test/answerReadable.test.ts']
const index = '../src/index.ts'

export default [
  {
    name: 'the handler patches are answered as they are',
    edits: [
      {
        file: index,
        find: 'entities: sent.map(patch => ({',
        replace: 'entities: outcome.entities.map(patch => ({',
      },
    ],
    tests,
  },
  {
    name: 'a row the read does not return keeps its patch',
    edits: [
      {
        file: index,
        find: '      if (keys === undefined) return []\n',
        replace: '      if (keys === undefined) return [patch]\n',
      },
    ],
    tests,
  },
  {
    name: 'a patch left with no keys is still sent',
    edits: [
      {
        file: index,
        find: 'return Object.keys(values).length === 0 ? [] : [{ ...patch, values }]',
        replace: 'return [{ ...patch, values }]',
      },
    ],
    tests,
  },
  {
    name: 'a key the read did not return is kept',
    edits: [
      {
        file: index,
        find: '        if (keys.has(key)) values[key] = patch.values[key]\n',
        replace: '        values[key] = patch.values[key]\n',
      },
    ],
    tests,
  },
  {
    name: 'a key the read withheld is counted as readable',
    edits: [
      {
        file: index,
        find: 'rows.set(record.id, new Set(Object.keys(record.values)))',
        replace: 'rows.set(record.id, new Set(Object.keys(record.values).concat(fields)))',
      },
    ],
    tests,
  },
  {
    name: 'a failed read answers the patches unread',
    edits: [
      {
        file: index,
        find: 'Effect.andThen(Effect.sync(() => readable.set(entity, new Map()))),',
        replace: 'Effect.asVoid,',
      },
    ],
    tests,
  },
  {
    name: 'a failed read is not reported',
    edits: [
      {
        file: index,
        find: '          onFailure: error =>\n            Diagnostics.report(answerUnread(mutation, reasonOf(error))).pipe(\n              Effect.andThen(',
        replace:
          '          onFailure: error =>\n            Effect.void.pipe(\n              Effect.andThen(',
      },
    ],
    tests,
  },
  {
    name: 'an entity with no reader rule is read too',
    edits: [
      {
        file: index,
        find: '        (source.authorize === undefined &&\n          source.filter === undefined &&\n          source.visible === undefined)\n',
        replace: '        false\n',
      },
    ],
    tests,
  },
  {
    name: 'a source whose rows only `visible` hides is not read',
    edits: [
      {
        file: index,
        find: '          source.filter === undefined &&\n          source.visible === undefined)\n',
        replace: '          source.filter === undefined)\n',
      },
    ],
    tests,
  },
  {
    name: 'authorize is not applied to the patch keys',
    edits: [
      {
        file: index,
        find: 'readAs(source, { ids: chunk, fields, principal, viewer: viewerOf(server, principal) }),',
        replace: 'source.read({ ids: chunk, fields, principal }).pipe(Effect.map(Option.some)),',
      },
    ],
    tests,
  },
  {
    name: 'the answer read treats a cut key as answered',
    edits: [
      {
        file: index,
        find: 'for (const patch of sent) name(patch.entity, patch.id, Object.keys(patch.values))',
        replace:
          'for (const patch of outcome.entities) name(patch.entity, patch.id, Object.keys(patch.values))',
      },
    ],
    tests,
  },
]
