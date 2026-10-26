/**
 * Read and write rules decided for one principal, broken in turn:
 * `pnpm mutate packages/guard/test/condition.mutations.ts`.
 */
const file = '../src/condition.ts'
const tests = ['packages/guard/test/condition.test.ts']

export default [
  {
    name: 'a row its rule cannot judge ends the request',
    edits: [
      {
        file,
        find: 'import { Query, evaluateEach,',
        replace: 'import { Query, evaluate, evaluateEach,',
      },
      {
        file,
        find: 'evaluateEach(guard.query, input, [values], { operators }).matched.length === 1',
        replace: 'evaluate(guard.query, input, [values], { operators }).length === 1',
      },
    ],
    tests,
  },
  {
    name: 'a conjunction keeps a part that can never hold',
    edits: [{ file, find: "if (condition._tag === 'Never') return never", replace: '' }],
    tests,
  },
  {
    name: 'a disjunction keeps going past a part that always holds',
    edits: [{ file, find: "if (condition._tag === 'Always') return always", replace: '' }],
    tests,
  },
  {
    name: 'a visitor is asked a row guard',
    edits: [{ file, find: 'visitor && readsPrincipal(guard)', replace: 'false' }],
    tests,
    survives:
      'asked, a row guard reading the principal is refused for a visitor who has none, and a refused guard does not hold: denied either way',
  },
  {
    name: 'a principal guard named twice is asked twice',
    edits: [
      {
        file,
        find: 'found.set(guard.name, guard)',
        replace: 'found.set(`${guard.name}${found.size}`, guard)',
      },
    ],
    tests,
  },
  {
    name: 'a Read left without rules is open under a closed set',
    edits: [{ file, find: "attachment.unguarded === 'allow' ? always : never", replace: 'always' }],
    tests,
  },
  {
    name: 'always is left out of a read',
    edits: [{ file, find: 'condition(attachment.always, and),', replace: 'always,' }],
    tests,
  },
  {
    name: "a member's refusal is not found",
    edits: [
      {
        file,
        find: '{ member, rules, deny: Option.getOrElse(deny, () => defaultDeny(target)) },',
        replace:
          "{ member, rules, deny: Option.getOrElse(deny, () => defaultDeny({ ...target, _tag: 'Row' })) },",
      },
    ],
    tests,
  },
  {
    name: 'a row guard holds over any row',
    edits: [
      {
        file,
        find: 'evaluateEach(guard.query, input, [values], { operators }).matched.length === 1',
        replace: 'evaluateEach(guard.query, input, [values], { operators }).matched.length >= 0',
      },
    ],
    tests,
  },
  {
    name: 'an inherited Read reads no member',
    edits: [
      { file, find: 'Inherit: ({ relation }) => [relation],', replace: 'Inherit: () => [],' },
    ],
    tests,
  },
  {
    name: "another set's Entity is read anyway",
    edits: [
      {
        file: '../src/index.ts',
        find: '          if (set !== name) {\n            throw new Error(`[foldkit-guard] ${name}: ${entity.name} carries',
        replace:
          '          if (false) {\n            throw new Error(`[foldkit-guard] ${name}: ${entity.name} carries',
      },
    ],
    tests,
  },
  {
    name: 'a relation’s Read is never asked',
    edits: [
      {
        file,
        find: 'const target = Object.hasOwn(entity.relations, member)',
        replace: 'const target = false',
      },
    ],
    tests: ['packages/guard/test/server.test.ts'],
  },
  {
    name: 'a body is told every interaction is a Read',
    edits: [
      {
        file: '../src/index.ts',
        find: 'decide(guard, { principal, interaction })',
        replace: "decide(guard, { principal, interaction: 'Read' })",
      },
    ],
    tests,
  },
  {
    name: 'a row’s chosen refusal is ignored',
    edits: [{ file, find: 'Option.flatMap(row, ({ deny }) => deny)', replace: 'Option.none()' }],
    tests,
  },
  {
    name: 'a relation is asked about linking whatever the interaction',
    edits: [
      {
        file,
        find: "const target = { _tag: 'Relation', relation, interaction } as const",
        replace: "const target = { _tag: 'Relation', relation, interaction: 'Link' } as const",
      },
    ],
    tests,
  },
  {
    name: 'a write is decided by the Read rules',
    edits: [
      {
        file: '../src/index.ts',
        find: 'decidingFor(entity, principal, interaction).row(entity)',
        replace: "decidingFor(entity, principal, 'Read').row(entity)",
      },
    ],
    tests,
  },
  {
    name: 'a visitor passes no row guard, even one over the row alone',
    edits: [{ file, find: 'visitor && readsPrincipal(guard)', replace: 'visitor' }],
    tests,
  },
  {
    name: 'a visitor is decided no row guard, even one over the row alone',
    edits: [
      {
        file: '../src/index.ts',
        find: 'evaluate(rowGuard.query, {}, [row], { operators }).length === 1,',
        replace: 'false,',
      },
    ],
    tests,
  },
  {
    name: 'a row guard over an unset field still decides',
    edits: [
      {
        file,
        find: 'Query.dependencies(guard.query).predicate.some(field => unset.has(field.key))',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'an unset relation is still followed',
    edits: [
      {
        file,
        find: 'Inherit: ({ relation }) => (unset.has(relation) ? never : each),',
        replace: 'Inherit: () => each,',
      },
    ],
    tests,
  },
  {
    name: 'a refusal with a reason holds',
    edits: [
      {
        file: '../src/index.ts',
        find: 'decision => decision === true),',
        replace: 'decision => decision !== false),',
      },
    ],
    tests,
  },
]
