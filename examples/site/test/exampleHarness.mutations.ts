/**
 * The example harness, broken in turn:
 * `pnpm mutate examples/site/test/exampleHarness.mutations.ts`.
 */
const tests = ['examples/site/test/exampleHarness.test.ts']
const one = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})
const define = '../src/gallery/define.ts'
const state = '../src/gallery/examplesState.ts'

export default [
  one(
    'an example is drawn without its pins',
    define,
    'styleOf(selection, example.recipe, example.pins),',
    'styleOf(selection, example.recipe),',
  ),
  one(
    'an example is drawn with the page’s recipe, not its own',
    define,
    'styleOf(selection, example.recipe, example.pins),',
    'styleOf(selection, recipe, example.pins),',
  ),
  one(
    'an example is handed no state',
    define,
    'Object.hasOwn(live.examples, key) ? live.examples[key] : undefined,',
    'undefined,',
  ),
  one(
    'an example of other slots is accepted',
    define,
    'if (entry.example.slots !== contract)',
    'if (false)',
  ),
  one(
    'a module example’s pins go unchecked',
    define,
    'checkPins(entry.name, entry.example.recipe, entry.example.pins)',
    '',
  ),
  one(
    'an example with state reads as stateless',
    define,
    'stateful: Option.isSome(state),',
    'stateful: false,',
  ),
  one(
    'a no-op builds a new Model',
    state,
    'step.model === model[key] ? model : modifyFields(model, { [key]: () => step.model }),',
    'modifyFields(model, { [key]: () => step.model }),',
  ),
  one(
    'an example’s Commands lose their key',
    state,
    'toParent({ key, message: inner }),',
    "toParent({ key: '', message: inner }),",
  ),
  one(
    'an example’s Subscriptions run on every page',
    state,
    'when: parent => config.onPage(parent, slug),',
    'when: () => true,',
  ),
  one(
    'two examples’ Subscription entries share a name',
    state,
    '.map(([name, entry]) => [`${key}:${name}`, entry]),',
    '.map(([name, entry]) => [name, entry]),',
  ),
  one('two examples may share a key', state, 'if (byKey.size !== running.length)', 'if (false)'),
  one(
    'a state may start with a Command',
    '../src/gallery/example.ts',
    'if ((start.commands ?? []).length > 0)',
    'if (false)',
  ),
]
