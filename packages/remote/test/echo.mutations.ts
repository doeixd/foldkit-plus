/**
 * A live patch does not overwrite an answer its stream has not sent back
 * (#485), each step broken in turn: `pnpm mutate packages/remote/test/echo.mutations.ts`.
 */
const tests = ['packages/remote/test/echo.test.ts']
const events = '../src/liveEvents.ts'
const model = '../src/model.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'an answer awaits no echo',
    events,
    '): Readonly<Record<EntityKey, AwaitedEcho>> => {\n  const kept',
    '): Readonly<Record<EntityKey, AwaitedEcho>> => {\n  return echoes\n  const kept',
  ),
  edit(
    'a later answer forgets what an earlier one awaits',
    events,
    'values: { ...next[key]?.values, ...values }',
    'values: { ...values }',
  ),
  edit(
    'a contradicting patch is written',
    events,
    'const contradicted = named.filter(field => !Equal.equals(values[field], echo.values[field]))',
    'const contradicted: Array<string> = []',
  ),
  edit(
    'an echo leaves the stream waiting',
    events,
    'echo: named.length === 0 ? echo : { ...echo, heard: [...echo.heard, stream] },',
    'echo,',
  ),
  edit(
    'one stream vouches for another',
    events,
    'if (echo.heard.includes(stream)) return',
    'if (echo.heard.length > 0) return',
  ),
  edit(
    'a live delete leaves the wait',
    events,
    'echoes: awaited === undefined ? echoes : rest,',
    'echoes,',
  ),
  edit(
    'a read asked before the answer ends the wait',
    model,
    'if (echo === undefined || echo.since > now) continue',
    'if (echo === undefined) continue',
  ),
  edit(
    'a read asked after the answer leaves the wait',
    model,
    'next ??= { ...echoes }\n    delete next[key]',
    'next ??= { ...echoes }',
  ),
  edit(
    'a contradicted field is not read again',
    model,
    'if (requests.every(request => request.fields.length === 0)) return model',
    'return model',
  ),
  edit(
    'an answer awaits an echo with no live read installed',
    model,
    'onNone: () => model.echoes,\n            onSome: live =>',
    'onNone: () => ({ x: { values: {}, since: 0, heard: [] } }),\n            onSome: live =>',
  ),
]
