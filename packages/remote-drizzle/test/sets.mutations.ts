/**
 * What the write's context sets, on the server, broken in turn:
 * `pnpm mutate packages/remote-drizzle/test/sets.mutations.ts`.
 */
const tests = ['packages/remote-drizzle/test/sets.test.ts']
const file = '../../remote-server/src/index.ts'
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
export default [
  edit(
    "an insert's fields the context sets are not written",
    '                    values: { ...bound.values, ...set.values },',
    '                    values: bound.values,',
  ),
  edit(
    "an insert's relations the context sets are not written",
    '                    links: { ...bound.links, ...set.links },',
    '                    links: bound.links,',
  ),
  edit(
    'the input may set a member the context sets',
    '                    values: { ...bound.values, ...set.values },',
    '                    values: { ...set.values, ...(given as Record<string, unknown>) },',
  ),
  edit(
    'an update sets nothing from the context',
    '                  values: { ...named.values, ...set.values },',
    '                  values: named.values,',
  ),
  edit(
    'the server passes no operation to an insert',
    '...set.links },\n                      operation,',
    '...set.links },\n                      operation: Option.none(),',
  ),
  edit(
    'a visitor is not refused',
    '                // A visitor, a viewer of another Entity, or a path reaching no row.\n                if (set.unfilled.length > 0) return yield* Effect.fail(RemoteServer.forbid())',
    '',
  ),
  edit(
    'the handler gives no viewer',
    'viewer: server.viewer === undefined ? Option.none() : server.viewer(caller),',
    'viewer: Option.none(),',
  ),
  edit('a server without a viewer is made', 'if (viewing !== undefined) {', 'if (false) {'),
  edit(
    'a field the context sets is not counted as set where an insert is registered',
    '...write.sets.map(set => set.field.key), ...contextual])',
    '...write.sets.map(set => set.field.key)])',
  ),
  edit(
    "the server ignores the client's time",
    'now: yield* writeTime(server, payload.mutation, Option.fromUndefinedOr(payload.now)),',
    'now: yield* Clock.currentTimeMillis,',
  ),
  edit(
    "the context reads another time than the write's",
    '{ viewer, now: Option.some(now) },',
    '{ viewer, now: Option.some(now + 1) },',
  ),
  edit('any client time is taken', 'return Math.abs(time - own) <= bound', 'return true'),
  edit(
    'a time at the bound is refused',
    'return Math.abs(time - own) <= bound',
    'return Math.abs(time - own) < bound',
  ),
  edit(
    "a bound of 0 takes the client's time",
    'if (bound === 0) return Effect.succeed(own)',
    'if (bound === 0) return Effect.succeed(time)',
  ),
  edit('a bound of 0 reports what it refuses', 'if (bound === 0) return Effect.succeed(own)', ''),
  edit(
    'a skewed time is not reported',
    ': Effect.as(Diagnostics.report(clockSkewed({ mutation, sent: time, own, bound })), own)',
    ': Effect.succeed(own)',
  ),
  edit(
    'the default bound is a second',
    'const DEFAULT_CLOCK_SKEW = Duration.seconds(60)',
    'const DEFAULT_CLOCK_SKEW = Duration.seconds(1)',
  ),
  edit(
    'make drops the bound it is given',
    ': { clockSkew: Duration.fromInputUnsafe(config.clockSkew) }),',
    ': {}),',
  ),
]
