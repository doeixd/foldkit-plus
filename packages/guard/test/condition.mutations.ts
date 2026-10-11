/**
 * Read rules decided for one principal, broken in turn:
 * `pnpm mutate packages/guard/test/condition.mutations.ts`.
 */
const file = '../src/condition.ts'
const tests = ['packages/guard/test/condition.test.ts']

export default [
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
    edits: [{ file, find: 'visitor ? never : ', replace: '' }],
    tests,
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
        find: 'deny: Option.getOrElse(deny, () => defaultDeny(target))',
        replace: "deny: Option.getOrElse(deny, () => defaultDeny({ ...target, _tag: 'Row' }))",
      },
    ],
    tests,
  },
  {
    name: 'a row guard holds over any row',
    edits: [
      {
        file,
        find: 'evaluate(guard.query, input, [values]).length === 1',
        replace: 'evaluate(guard.query, input, [values]).length >= 0',
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
]
