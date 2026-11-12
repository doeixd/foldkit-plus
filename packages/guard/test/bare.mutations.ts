/**
 * A descriptor without the guards of a guarded Entity, refused by each seam
 * that enforces them (#539), broken in turn:
 * `pnpm mutate packages/guard/test/bare.mutations.ts`.
 */
const tests = ['packages/guard/test/bare.test.ts']

export default [
  {
    name: 'enforced answers as attached does',
    edits: [
      {
        file: '../src/attach.ts',
        find: 'if (Option.isNone(attachment) && guarded.has(entity.identity)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'attaching records no guarded Entity',
    edits: [{ file: '../src/attach.ts', find: 'guarded.add(entity.identity)', replace: '' }],
    tests,
  },
  {
    name: 'filter checks nothing',
    edits: [
      {
        file: '../src/server.ts',
        find: '    enforced(entity)\n    return memberRules',
        replace: '    return memberRules',
      },
    ],
    tests,
  },
  {
    name: 'mutation checks nothing',
    edits: [
      {
        file: '../src/server.ts',
        find: 'const { entity, policy, interaction, id, source } = guard\n    enforced(entity)',
        replace: 'const { entity, policy, interaction, id, source } = guard',
      },
    ],
    tests,
  },
  {
    name: 'the SQL Read rule reads attached',
    edits: [
      {
        file: '../src/drizzle.ts',
        find: '  Option.match(enforced(entity), {',
        replace: '  Option.match(Option.none<never>(), {',
      },
    ],
    tests,
  },
  {
    name: 'a Sync document reads attached',
    edits: [
      {
        file: '../src/sync.ts',
        find: '    Option.map(enforced(entity), attachment => {',
        replace: '    Option.map(Option.none<never>(), attachment => {',
      },
    ],
    tests,
  },
]
