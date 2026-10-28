/**
 * An insert's stamps on the server, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/stamp.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/stamp.test.ts']
const file = '../../remote-server/src/index.ts'

export default [
  {
    name: 'the stamped fields are not written',
    edits: [
      {
        file,
        find: 'values: { ...bound.values, ...stamps.values },',
        replace: 'values: bound.values,',
      },
    ],
    tests,
  },
  {
    name: 'the stamped relations are not written',
    edits: [
      { file, find: 'links: { ...bound.links, ...stamps.links },', replace: 'links: bound.links,' },
    ],
    tests,
  },
  {
    name: 'the input may set a stamped member',
    edits: [
      {
        file,
        find: 'values: { ...bound.values, ...stamps.values },',
        replace: 'values: { ...stamps.values, ...(given as Record<string, unknown>) },',
      },
    ],
    tests,
  },
  {
    name: 'the server passes no operation to an insert',
    edits: [
      {
        file,
        find: '...stamps.links },\n                    operation,',
        replace: '...stamps.links },\n                    operation: Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'a visitor is not refused',
    edits: [
      {
        file,
        find: 'if (stamps.unknown.length > 0) return yield* Effect.fail(RemoteServer.forbid())',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the handler gives no viewer',
    edits: [
      {
        file,
        find: 'viewer: server.viewer === undefined ? Option.none() : server.viewer(caller),',
        replace: 'viewer: Option.none(),',
      },
    ],
    tests,
  },
  {
    name: 'a server without a viewer is made',
    edits: [{ file, find: 'if (viewing !== undefined) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'a stamped field is not counted as set where an insert is registered',
    edits: [
      {
        file,
        find: '...write.sets.map(set => set.field.key), ...stamped])',
        replace: '...write.sets.map(set => set.field.key)])',
      },
    ],
    tests,
  },
  {
    name: "the server ignores the client's time",
    edits: [
      {
        file,
        find: 'now: yield* writeTime(server, payload.mutation, Option.fromUndefinedOr(payload.now)),',
        replace: 'now: yield* Clock.currentTimeMillis,',
      },
    ],
    tests,
  },
  {
    name: "an insert stamps the server's clock, not the write's time",
    edits: [
      {
        file,
        find: 'Write.stamp(write, { viewer, now: Option.some(now) })',
        replace: 'Write.stamp(write, { viewer, now: Option.some(yield* Clock.currentTimeMillis) })',
      },
    ],
    tests,
  },
  {
    name: 'any client time is taken',
    edits: [{ file, find: 'return Math.abs(time - own) <= bound', replace: 'return true' }],
    tests,
  },
  {
    name: 'a time at the bound is refused',
    edits: [
      {
        file,
        find: 'return Math.abs(time - own) <= bound',
        replace: 'return Math.abs(time - own) < bound',
      },
    ],
    tests,
  },
  {
    name: "a bound of 0 takes the client's time",
    edits: [
      {
        file,
        find: 'if (bound === 0) return Effect.succeed(own)',
        replace: 'if (bound === 0) return Effect.succeed(time)',
      },
    ],
    tests,
  },
  {
    name: 'a bound of 0 reports what it refuses',
    edits: [{ file, find: 'if (bound === 0) return Effect.succeed(own)', replace: '' }],
    tests,
  },
  {
    name: 'a skewed time is not reported',
    edits: [
      {
        file,
        find: ': Effect.as(Diagnostics.report(clockSkewed({ mutation, sent: time, own, bound })), own)',
        replace: ': Effect.succeed(own)',
      },
    ],
    tests,
  },
  {
    name: 'the default bound is a second',
    edits: [
      {
        file,
        find: 'const DEFAULT_CLOCK_SKEW = Duration.seconds(60)',
        replace: 'const DEFAULT_CLOCK_SKEW = Duration.seconds(1)',
      },
    ],
    tests,
  },
  {
    name: 'make drops the bound it is given',
    edits: [
      {
        file,
        find: ': { clockSkew: Duration.fromInputUnsafe(config.clockSkew) }),',
        replace: ': {}),',
      },
    ],
    tests,
  },
]
