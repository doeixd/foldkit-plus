/**
 * `may` foreseen by the client, and the supplied-member prediction it rides
 * on, broken in turn: `pnpm mutate packages/guard/test/mayPrediction.mutations.ts`.
 */
const tests = [
  'packages/guard/test/mayPrediction.test.ts',
  'packages/remote/test/suppliedPrediction.test.ts',
  'examples/chirp/test/drawn.test.ts',
]
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const may = '../src/may.ts'
const condition = '../src/condition.ts'
const held = '../../remote/src/held.ts'
const mutation = '../../remote/src/mutation.ts'

export default [
  edit(
    '`may` says nothing of how a client foresees it',
    may,
    'Derived.make(MaySchema, { predict, forbids })',
    'Derived.make(MaySchema, { forbids })',
  ),
  edit(
    'a half-known answer is foreseen',
    may,
    'Option.filter(answerAssuming(false), other => sameMay(held, other))',
    'Option.some(held)',
  ),
  edit(
    'a client without a viewer is taken for a visitor',
    may,
    'deciding(() => Effect.succeed(assumed), false, interaction, context)',
    'deciding(() => Effect.succeed(assumed), Option.isNone(context.viewer), interaction, context)',
  ),
  edit(
    "a rule over the principal's fields is judged without them",
    condition,
    '          readsPrincipal(each.guard)\n            ? open\n',
    '          false\n            ? open\n',
  ),
  edit(
    'a rule over what the store lacks is taken to fail',
    condition,
    "Open: () => Node.Path({ segments: ['open', String(opened++)], ast: Option.none() }),",
    'Open: () => Node.Lit({ value: false }),',
  ),
  edit(
    'a rule over what the client cannot know is taken to hold',
    condition,
    "Open: () => Node.Path({ segments: ['open', String(opened++)], ast: Option.none() }),",
    'Open: () => Node.Lit({ value: true }),',
  ),
  edit(
    'a partly decided answer is foreseen',
    may,
    'return [...decided.values()].every(Option.isSome)',
    'return true',
  ),
  edit(
    'a link is read as its ref key',
    held,
    '        ? Held.of(idOfRef(value, `${entity.name}.${key}`))',
    '        ? Held.of(value)',
  ),
  edit(
    'a moved field is read as the store held it',
    held,
    '      for (const key of moves) present.delete(key)\n',
    '',
  ),
  edit(
    'a write foresees no supplied member',
    mutation,
    "'_tag' in patch ? [] : suppliedOfWrite(write, patch, by, context.store),",
    '[],',
  ),
]
