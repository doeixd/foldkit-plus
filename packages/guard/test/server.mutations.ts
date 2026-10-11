/**
 * A guard set's read rules as remote-server's seams, broken in turn:
 * `pnpm mutate packages/guard/test/server.mutations.ts`.
 */
const file = '../src/server.ts'
const tests = ['packages/guard/test/server.test.ts']

export default [
  {
    name: 'a redacted member is omitted instead',
    edits: [{ file, find: "member.deny._tag === 'Redact'", replace: 'false' }],
    tests,
  },
  {
    name: 'a member rule is decided without the fields it reads',
    edits: [
      {
        file,
        find: '...members.flatMap(({ condition }) => Condition.members(condition)),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a member rule always holds',
    edits: [
      {
        file,
        find: 'if (Condition.holds(condition, record.values, input, () => false)) continue',
        replace: 'continue',
      },
    ],
    tests,
  },
  {
    name: 'an inherited Read holds without looking at the related row',
    edits: [
      {
        file,
        find: 'onSome: target => holds(ref.entity, target, new Set([...seen, key])),',
        replace: 'onSome: () => true,',
      },
    ],
    tests,
  },
  {
    name: 'an Entity not given is read by no one',
    edits: [
      {
        file,
        find: 'if (condition === undefined) return true',
        replace: 'if (condition === undefined) return false',
      },
    ],
    tests,
  },
  {
    name: 'a loop of inherited Reads is followed for ever',
    edits: [{ file, find: 'if (seen.has(key)) return false', replace: '' }],
    tests,
  },
  {
    name: 'validate takes any function for a placed rule',
    edits: [
      {
        file: '../src/placed.ts',
        find: 'return placed !== undefined && placed.policy === policy && placed.entities.has(entity)',
        replace: 'return true',
      },
    ],
    tests: ['packages/guard/test/server.test.ts', 'packages/guard/test/drizzle.test.ts'],
  },
  {
    name: 'validate takes a rule built from another Policy',
    edits: [{ file: '../src/placed.ts', find: '&& placed.policy === policy', replace: '' }],
    tests,
  },
  {
    name: 'validate takes a rule built for another Entity',
    edits: [{ file: '../src/placed.ts', find: '&& placed.entities.has(entity)', replace: '' }],
    tests: ['packages/guard/test/drizzle.test.ts'],
  },
  {
    name: 'validate does not compare guard sets',
    edits: [{ file, find: 'if (attachment.set !== policy.set) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'memory Sources do not say they apply readable',
    edits: [
      {
        file: '../../remote-server/src/index.ts',
        find: 'const visible = config.readable === undefined ? {} : { visible: config.readable }',
        replace: 'const visible = {}',
      },
    ],
    tests,
  },
  {
    name: 'validate does not look at a Source',
    edits: [
      {
        file,
        find: 'const sourceProblems = Option.match(source, {',
        replace: 'const sourceProblems = Option.match(Option.none(), {',
      },
    ],
    tests: ['packages/guard/test/server.test.ts', 'packages/guard/test/drizzle.test.ts'],
  },
  {
    name: 'validate does not look at queries',
    edits: [{ file, find: '!rowRules.has(listed.visible, policy, name)', replace: 'false' }],
    tests: ['packages/guard/test/server.test.ts', 'packages/guard/test/drizzle.test.ts'],
  },
  {
    name: 'validate looks at every query, whatever it lists',
    edits: [{ file, find: 'lists(query.Result, name) &&', replace: '' }],
    tests: ['packages/guard/test/server.test.ts', 'packages/guard/test/drizzle.test.ts'],
  },
  {
    name: 'the live hub re-reads every subscriber as the first',
    edits: [
      {
        file: '../../remote-server/src/index.ts',
        find: 'const principalKey = keyOf(subscriber.principal)',
        replace: 'const principalKey = groups.keys().next().value ?? keyOf(subscriber.principal)',
      },
    ],
    tests,
  },
  {
    name: 'the live hub shares a re-read only between equal principals',
    edits: [
      {
        file: '../../remote-server/src/index.ts',
        find: 'const keyOf = options.key ?? ((principal: P): unknown => principal)',
        replace: 'const keyOf = (principal: P): unknown => principal',
      },
    ],
    tests,
  },
  {
    name: 'a live subscription is answered as no one',
    edits: [
      {
        file: '../../remote-server/src/index.ts',
        find: 'Effect.map(asking, caller => {',
        replace: 'Effect.map(Effect.succeed(Option.none()), caller => {',
      },
    ],
    tests,
  },
  {
    name: 'may is never answered',
    edits: [
      {
        file,
        find: "fields.includes('may') && Object.hasOwn(entity.derived, 'may')",
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'may names no interaction the application named',
    edits: [{ file, find: "['Update', 'Delete', ...named]", replace: "['Update', 'Delete']" }],
    tests,
  },
  {
    name: 'may answers no member',
    edits: [
      {
        file,
        find: 'policy.writeMembers(entity, principal, ruledMembers, ' + "'Update'),",
        replace: "policy.writeMembers(entity, principal, [], 'Update'),",
      },
    ],
    tests,
  },
  {
    name: 'a relation with no rule for one direction is refused it',
    edits: [{ file, find: 'onNone: () => true,', replace: 'onNone: () => false,' }],
    tests,
  },
  {
    name: 'may is answered without the fields its rules read',
    edits: [
      {
        file,
        find: '...Option.match(may, { onNone: () => [], onSome: ({ fields }) => fields }),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'may reads no id',
    edits: [
      {
        file,
        find: "fields: ['id', ...new Set(conditions.flatMap(Condition.members))],",
        replace: 'fields: [...new Set(conditions.flatMap(Condition.members))],',
      },
    ],
    tests: ['packages/guard/test/drizzle.test.ts'],
  },
  {
    name: 'may holds every row rule',
    edits: [
      {
        file,
        find: 'rows.map(([interaction, { condition }]) => [interaction, holds(condition, values)]),',
        replace: 'rows.map(([interaction]) => [interaction, true]),',
      },
    ],
    tests,
  },
  {
    name: 'may gives no reason',
    edits: [
      {
        file,
        find: 'Explain: ({ reason }) => [[interaction, reason] as const],',
        replace: 'Explain: () => [],',
      },
    ],
    tests,
  },
  {
    name: 'may gives a reason for what it allows',
    edits: [
      {
        file,
        find: 'holds(condition, values)\n                ? []',
        replace: 'false\n                ? []',
      },
    ],
    tests,
  },
]
