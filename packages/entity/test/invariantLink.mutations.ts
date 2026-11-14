/**
 * Invariants over `one` relations (#345), each place a relation is read as the
 * id it points at broken in turn: `pnpm mutate
 * packages/entity/test/invariantLink.mutations.ts`.
 */
const entityTests = ['packages/entity/test/invariantLink.test.ts']
const drizzleTests = ['packages/remote-drizzle/test/linkInvariant.test.ts']
const clientTests = ['packages/remote/test/localLinkRefusal.test.ts']

export default [
  {
    name: 'an invariant is handed no relation',
    edits: [
      {
        file: '../src/invariant.ts',
        find: '    ...links.map(link => [link.key, Expr.next(link)] as const),',
        replace: '',
      },
    ],
    tests: entityTests,
  },
  {
    name: 'a form input judges no relation key',
    edits: [
      {
        file: '../src/invariant.ts',
        find: "if (id === null || typeof id === 'string') put(row, member.relation.key, id)",
        replace: '',
      },
    ],
    tests: entityTests,
  },
  {
    name: 'a relation input given nothing is judged as a null link',
    edits: [
      {
        file: '../src/invariant.ts',
        find: 'Option.isOption(given) ? Option.getOrUndefined(given) : given',
        replace: 'Option.isOption(given) ? Option.getOrNull(given) : given',
      },
    ],
    tests: entityTests,
  },
  {
    name: 'a path may name no relation',
    edits: [
      {
        file: '../src/invariant.ts',
        find: 'if (!Object.hasOwn(fields, key) && !links.some(link => link.key === key))',
        replace: 'if (!Object.hasOwn(fields, key))',
      },
    ],
    tests: entityTests,
  },
  {
    name: 'an insert judges its values without its links',
    edits: [
      {
        file: '../../remote-drizzle/src/index.ts',
        find: '{ after: { ...values, ...linkIds(links), id } },',
        replace: '{ after: { ...values, id } },',
      },
    ],
    tests: drizzleTests,
  },
  {
    name: "an update's statement reads the link as it was",
    edits: [
      {
        file: '../../remote-drizzle/src/index.ts',
        find: '            judged,\n            { ...values, ...linkIds(links) },',
        replace: '            judged,\n            values,',
      },
    ],
    tests: drizzleTests,
  },
  {
    name: "a missed update's row is judged with its links as refs",
    edits: [
      {
        file: '../../remote-drizzle/src/index.ts',
        find: 'const before = judgedRow(row)',
        replace: 'const before = row',
      },
    ],
    tests: drizzleTests,
  },
  {
    name: 'a CHECK is compiled without the columns relations are stored on',
    edits: [
      {
        file: '../../remote-drizzle/src/checks.ts',
        find: '      relations: binding.relations,',
        replace: '',
      },
    ],
    tests: drizzleTests,
  },
  {
    name: 'the client judges a row without its links',
    edits: [
      {
        file: '../../remote/src/mutation.ts',
        find: 'for (const key of [...Object.keys(entity.fields), ...links])',
        replace: 'for (const key of Object.keys(entity.fields))',
      },
    ],
    tests: clientTests,
  },
  {
    name: 'the server takes an insert as leaving its links unset',
    edits: [
      {
        file: '../../remote-server/src/index.ts',
        find: '        ...write.links.map(link => link.relation.key),',
        replace: '',
      },
    ],
    tests: drizzleTests,
  },
  {
    name: 'entityChecks reads no relation it is given',
    edits: [
      {
        file: '../../remote-drizzle/src/checks.ts',
        find: 'relations: linksOf(options.relations ?? {}),',
        replace: 'relations: {},',
      },
    ],
    tests: drizzleTests,
  },
  {
    name: "bind reads a table's CHECKs without its relations",
    edits: [
      {
        file: '../../remote-drizzle/src/bind.ts',
        find: 'holdsChecks(entity, config.table, columns, relations, operators)',
        replace: 'holdsChecks(entity, config.table, columns, {}, operators)',
      },
    ],
    tests: drizzleTests,
  },
]
