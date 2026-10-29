/**
 * A write refused where it is made, each step broken in turn:
 * `pnpm mutate packages/remote/test/localRefusal.mutations.ts`.
 */
const tests = ['packages/remote/test/localRefusal.test.ts']
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const index = '../src/index.ts'

export default [
  edit(
    'nothing is refused where it is made',
    index,
    'mutation.write === undefined || options.optimistic !== undefined',
    'true',
  ),
  edit(
    'a field the client lacks is read as null, so an undecided invariant refuses',
    '../src/mutation.ts',
    'onUnheld: () => undefined,',
    'onUnheld: () => void (plain[key] = null),',
  ),
  edit(
    'a refused write is shown',
    index,
    'const optimistic = Option.isSome(refused)\n        ? undefined',
    'const optimistic = Option.isSome(refused)\n        ? predicted',
  ),
  edit(
    'a refused write is sent',
    index,
    '              Option.isSome(refused)\n                ? Effect.succeed({',
    '              false\n                ? Effect.succeed({',
  ),
  edit('the refusal names no rule', index, 'rule: Option.some(held.id),', 'rule: Option.none(),'),
]
