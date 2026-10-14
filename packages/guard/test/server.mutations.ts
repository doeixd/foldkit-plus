/**
 * A guard set's read rules as remote-server's seams, broken in turn:
 * `pnpm mutate packages/guard/test/server.mutations.ts`.
 */
const file = '../src/server.ts'
const tests = ['packages/guard/test/server.test.ts']

export default [
  {
    name: 'a rule from a provided Policy is not its origin’s',
    edits: [
      {
        file: '../src/placed.ts',
        find: 'originOf(placed.policy) === originOf(policy) &&',
        replace: 'placed.policy === policy &&',
      },
    ],
    tests,
  },
  {
    name: 'a provided Policy records no origin',
    edits: [{ file: '../src/origin.ts', find: 'origins.set(policy, originOf(from))', replace: '' }],
    tests,
  },
  {
    name: 'provide hands the bodies nothing',
    edits: [
      {
        file: '../src/index.ts',
        find: 'Effect.provide(effect, context)',
        replace: 'Effect.provide(effect, Context.empty() as Context.Context<Provided>)',
      },
    ],
    tests,
  },
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
        find: 'placed !== undefined &&',
        replace: 'true ||',
      },
    ],
    tests: ['packages/guard/test/server.test.ts', 'packages/guard/test/drizzle.test.ts'],
  },
  {
    name: 'validate takes a rule built from another Policy',
    edits: [
      {
        file: '../src/placed.ts',
        find: 'originOf(placed.policy) === originOf(policy) &&',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'validate takes a rule built for another Entity',
    edits: [{ file: '../src/placed.ts', find: 'placed.entities.has(entity.name) &&', replace: '' }],
    tests: ['packages/guard/test/drizzle.test.ts', 'packages/guard/test/write.test.ts'],
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
    edits: [{ file, find: '!rowRules.has(listed.visible, policy, entity)', replace: 'false' }],
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
  {
    name: 'a shared field of rows only some may read is allowed',
    edits: [{ file, find: 'shared.length > 0 && readRowsRuled(attachment)', replace: 'false' }],
    tests,
  },
  {
    name: 'a shared field with a Read rule of its own is allowed',
    edits: [
      { file, find: 'const own = readRuled(attachment, member)', replace: 'const own = false' },
    ],
    tests,
  },
  {
    name: 'a shared relation to rows only some may read is allowed',
    edits: [{ file, find: 'return rowsRuled(byName.get(target))', replace: 'return false' }],
    tests,
  },
  {
    name: '`always` does not rule who reads the rows',
    edits: [
      {
        file: '../src/attach.ts',
        find: '||\n  attachment.always.some(rule => !isAnyone(rule))',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: "a relation's Read rule is not its own",
    edits: [
      {
        file: '../src/attach.ts',
        find: "restricts(surfaceOf(attachment, { _tag: 'Relation', relation: member, interaction: 'Read' }))",
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'a seam built before the guards were attached counts',
    edits: [
      {
        file: '../src/placed.ts',
        find: 'placed.entities.get(entity.name) === guardsOf(entity)',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'a live Source of its own passes',
    edits: [
      {
        file,
        find: 'const liveProblems = config.server.live.has(name)',
        replace: 'const liveProblems = false',
      },
    ],
    tests,
  },
  {
    name: 'an undeclared query passes',
    edits: [
      {
        file,
        find: '.filter(query => !config.domain.registry.queries.has(query))',
        replace: '.filter(() => false)',
      },
    ],
    tests,
  },
  {
    name: 'a shared relation to an unvalidated target passes',
    edits: [{ file, find: 'if (!byName.has(target))', replace: 'if (false)' }],
    tests,
  },
  {
    name: 'a body may filter by a hidden member',
    edits: [{ file, find: '...hidden(predicate).map(', replace: '...hidden([]).map(' }],
    tests,
  },
  {
    name: 'a body may order by a hidden member',
    edits: [{ file, find: '...hidden(order).map(', replace: '...hidden([]).map(' }],
    tests,
  },
  {
    name: 'every member a body reads is refused',
    edits: [{ file, find: '.filter(key => readRuled(attachment, key))', replace: '' }],
    tests,
  },
  {
    name: 'a body over another Entity is judged by this one',
    edits: [
      {
        file,
        find: 'if (body === undefined || body.entity.name !== name) return []',
        replace: 'if (body === undefined) return []',
      },
    ],
    tests,
  },
  {
    name: 'a Policy provided twice records the first as its origin',
    edits: [
      {
        file: '../src/origin.ts',
        find: 'origins.set(policy, originOf(from))',
        replace: 'origins.set(policy, from)',
      },
    ],
    tests,
  },
  {
    name: 'a second provide drops what the first gave',
    edits: [
      {
        file: '../src/index.ts',
        find: 'provide: more => provided(next, more),',
        replace: 'provide: more => provided(policy as never, more),',
      },
    ],
    tests,
  },
  {
    name: 'a provided Policy decides without what it was given',
    edits: [
      {
        file: '../src/index.ts',
        find: 'decide: (guard, request) => run(policy.decide(guard, request)),',
        replace: 'decide: (guard, request) => policy.decide(guard, request) as never,',
      },
    ],
    tests,
  },
  {
    name: 'a provided Policy rules writes without what it was given',
    edits: [
      {
        file: '../src/index.ts',
        find: 'run(policy.writable(entity, principal, interaction)),',
        replace: 'policy.writable(entity, principal, interaction) as never,',
      },
    ],
    tests,
  },
  {
    name: 'a provided Policy rules written members without what it was given',
    edits: [
      {
        file: '../src/index.ts',
        find: 'run(policy.writeMembers(entity, principal, members, interaction)),',
        replace: 'policy.writeMembers(entity, principal, members, interaction) as never,',
      },
    ],
    tests,
  },
]
