/**
 * Attaching guards to an Entity, broken in turn:
 * `pnpm mutate packages/guard/test/attach.mutations.ts`.
 */
const file = '../src/attach.ts'
const tests = ['packages/guard/test/attach.test.ts']

export default [
  {
    name: 'Write is kept as an interaction of its own',
    edits: [
      {
        file,
        find: "interaction === 'Write' ? ['Create', 'Update', 'Delete'] : [interaction]",
        replace: '[interaction]',
      },
    ],
    tests,
  },
  {
    name: 'a second attachment keeps the first refusal',
    edits: [
      {
        file,
        find: 'deny: Option.orElse(added.deny, () => before.deny)',
        replace: 'deny: Option.orElse(before.deny, () => added.deny)',
      },
    ],
    tests,
  },
  {
    name: "a member's Update does not govern its creation",
    edits: [
      {
        file,
        find: "own === undefined && interaction === 'Create' ? surfaces['Update'] : own",
        replace: 'own',
      },
    ],
    tests,
  },
  {
    name: 'a row guard over a namesake Entity is attached',
    edits: [{ file, find: 'if (!Entity.same(guard.entity, entity)) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: "a conjunction's guards go unchecked",
    edits: [
      {
        file,
        find: 'All: ({ rules }) => checkRules(set, entity, where, rules),',
        replace: 'All: () => {},',
      },
    ],
    tests,
  },
  {
    name: 'a second set attaches beside the first',
    edits: [{ file, find: 'if (set !== G.name) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'guardFields leaves out what always reads',
    edits: [
      {
        file,
        find: '[...(attachment.row[interaction]?.rules ?? []), ...attachment.always]',
        replace: '[...(attachment.row[interaction]?.rules ?? [])]',
      },
    ],
    tests,
  },
  {
    name: "guardFields leaves out a conjunction's guards",
    edits: [
      { file, find: 'All: ({ rules }) => rules.flatMap(membersRead),', replace: 'All: () => [],' },
    ],
    tests,
  },
  {
    name: 'a hidden member reads as not found',
    edits: [{ file, find: 'Member: () => omit,', replace: 'Member: () => notFound,' }],
    tests,
  },
  {
    name: 'a surface without guards prints open under a closed set',
    edits: [
      {
        file,
        find: "attachment.unguarded === 'allow' ? 'open' : 'closed'",
        replace: "'open'",
      },
    ],
    tests,
  },
  {
    name: 'an empty list prints as no guard at all',
    edits: [{ file, find: "rules.length === 0 ? 'nobody' : ", replace: '' }],
    tests,
  },
  {
    name: 'an attachment declares no read filter',
    edits: [
      {
        file,
        find: 'Metadata.combine([key.of(attachment), ReadFilter.of(filtered)])',
        replace: 'key.of(attachment)',
      },
    ],
    tests,
  },
  {
    name: 'an interaction may take a built-in name',
    edits: [
      {
        file,
        find: 'if ((builtIn as ReadonlyArray<string>).includes(name)) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
]
