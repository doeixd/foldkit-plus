/**
 * `Walk.run` and `Walk.states` (#538, #543), broken in turn:
 * `pnpm mutate packages/remote/test/walk.mutations.ts`.
 */
const walk = '../src/walk.ts'
const tests = ['packages/remote/test/walkStates.test.ts', 'packages/remote/test/heldValue.test.ts']

export default [
  {
    name: 'a walk stops after its first step',
    edits: [
      {
        file: walk,
        find: 'for (let step = 0; step < options.steps; step++) {',
        replace: 'for (let step = 0; step < 1; step++) {',
      },
    ],
    tests,
  },
  {
    name: 'from reads only its first start',
    edits: [
      {
        file: walk,
        find: 'for (const { name, start } of options.from) {',
        replace: 'for (const { name, start } of options.from.slice(0, 1)) {',
      },
    ],
    tests,
  },
  {
    name: 'a failing start does not stop its own seeds',
    edits: [
      {
        file: walk,
        find: '        failures.push({ start: name, seed: Option.some(seed), ...result })\n        break\n',
        replace: '        failures.push({ start: name, seed: Option.some(seed), ...result })\n',
      },
    ],
    tests,
  },
  {
    name: 'a step is not awaited',
    edits: [
      {
        file: walk,
        find: 'const after = await options.step(current, message)',
        replace: 'const after = options.step(current, message) as Model',
      },
    ],
    tests,
  },
  {
    name: 'regressions are not run',
    edits: [
      {
        file: walk,
        find: 'for (const regression of options.regressions ?? []) {',
        replace: 'for (const regression of []) {',
      },
    ],
    tests,
  },
  {
    name: 'the walk is seeded from zero',
    edits: [
      {
        file: walk,
        find: 'for (let seed = 1; seed <= options.seeds; seed++) {',
        replace: 'for (let seed = 0; seed < options.seeds; seed++) {',
      },
    ],
    tests,
  },
  {
    name: 'the generator is changed',
    edits: [
      {
        file: walk,
        find: 'state = (state * 1103515245 + 12345) & 0x7fffffff',
        replace: 'state = (state * 1103515245 + 12346) & 0x7fffffff',
      },
    ],
    tests,
  },
  {
    name: 'states skips the decode',
    edits: [
      {
        file: walk,
        find: 'const exit = decode(build(encoded, [], random))',
        replace: 'const exit = Exit.succeed(build(encoded, [], random) as A)',
      },
    ],
    tests,
  },
  {
    name: 'states ignores its seed',
    edits: [
      {
        file: walk,
        find: 'const random = generator(options.seed)',
        replace: 'const random = generator(1)',
      },
    ],
    tests,
  },
  {
    name: 'an unsupported kind is built as null',
    edits: [
      {
        file: walk,
        find: '  throw new Error(`Walk.states: no generator for a ${ast._tag} at ${describePath(path)}`)',
        replace: '  return null as never',
      },
    ],
    tests,
  },
  {
    name: 'an optional key is never omitted',
    edits: [
      {
        file: walk,
        find: 'if (type.context?.isOptional === true && random(2) === 0) continue',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'an array always has one rest item',
    edits: [
      {
        file: walk,
        find: 'Array.from({ length: random(3) }, (_, index) =>',
        replace: 'Array.from({ length: 1 + random(1) }, (_, index) =>',
      },
    ],
    tests,
  },
]
