/**
 * `Behaviors.Keys`: `pnpm mutate packages/mixins/test/keys.mutations.ts`.
 */
const unit = ['packages/mixins/test/keys.test.ts']
const browser = ['packages/mixins/test/keys.browser.test.ts']
const file = '../src/behaviors/keys.ts'

export default [
  {
    name: "the declared route's answer does not end the press",
    edits: [{ file, find: '    if (Option.isSome(answered)) return answered\n', replace: '' }],
    tests: unit,
  },
  {
    name: 'every where route is asked, past the first answer',
    edits: [
      {
        file,
        find: '      if (Option.isSome(given)) return given',
        replace: '      if (Option.isSome(given) && candidate === routes.at(-1)) return given',
      },
    ],
    tests: unit,
  },
  {
    name: 'where routes are asked first, in list order with the declared ones',
    edits: [
      {
        file,
        find: 'routes.find(candidate => candidate.on.some(takes))',
        replace:
          'routes.find(candidate => candidate.on.some(gesture => gestureMatches(gesture, press.key, press.modifiers)))',
      },
    ],
    tests: unit,
  },
  {
    name: 'a chord ignores Alt',
    edits: [{ file, find: '      chord.alt === modifiers.altKey &&\n', replace: '' }],
    tests: [...unit, ...browser],
  },
  {
    name: 'a chord ignores Shift',
    edits: [
      {
        file,
        find: "      (chord.shift === 'any' || chord.shift === modifiers.shiftKey) &&\n",
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'the Behavior skips the overlap check',
    edits: [
      { file, find: '  refuseOverlaps(options.routes, Option.some(options.slot))\n', replace: '' },
    ],
    tests: unit,
  },
  {
    name: 'a character chord does not overlap printable',
    edits: [
      {
        file,
        find: '        Chord: chord => (plainCharacter(chord) ? Option.some(describe(chord)) : Option.none()),',
        replace: '        Chord: () => Option.none(),',
      },
    ],
    tests: unit,
  },
  {
    name: 'Keys.first asks a route for a press it does not take',
    edits: [
      {
        file,
        find: '        if (!routeMatches(inner, press.key, press.modifiers)) continue\n',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'a misspelt key is accepted',
    edits: [
      { file, find: 'if (!isCharacter(key) && !named.has(key)) {', replace: 'if (key === "") {' },
    ],
    tests: unit,
  },
  {
    name: 'a character is one UTF-16 unit',
    edits: [
      {
        file,
        find: 'return first !== undefined && key.length === (first > 0xffff ? 2 : 1)',
        replace: 'return first !== undefined && key.length === 1',
      },
    ],
    tests: unit,
  },
  {
    name: 'the Behavior asks nothing of the slot',
    edits: [{ file, find: '        requires: { events: [Event.KeyDown] },\n', replace: '' }],
    tests: unit,
  },
  {
    name: 'a focus answer moves no focus',
    edits: [
      {
        file,
        find: '{ focusSelector: idSelector(given.id), message: given.message }',
        replace: "{ focusSelector: ':not(*)', message: given.message }",
      },
    ],
    tests: browser,
  },
  {
    name: 'a focus answer looks its id up as `#id`',
    edits: [
      {
        file,
        find: '{ focusSelector: idSelector(given.id), message: given.message }',
        replace: '{ focusSelector: `#${given.id}`, message: given.message }',
      },
    ],
    tests: browser,
  },
  {
    name: 'a keydown conflict does not point at Keys',
    edits: [
      {
        file: '../src/resolver.ts',
        find: "'; fold their keys into one Behaviors.Keys.behavior'",
        replace: "''",
      },
    ],
    tests: unit,
  },
]
