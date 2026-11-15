/**
 * Repeat's steps, taps, stop and stale timers, broken in turn: `pnpm mutate
 * packages/primitives/test/repeat.mutations.ts`.
 */
const file = '../src/interaction/repeat.ts'
const tests = ['packages/primitives/test/repeat.test.ts']

export default [
  {
    name: 'a finger steps as it goes down',
    edits: [{ file, find: 'if (isFinger(input)) return', replace: 'if (false) return' }],
    tests,
  },
  {
    name: 'a lifted finger does not tap',
    edits: [{ file, find: 'model.count === 0 && isFinger(model.input)', replace: 'false' }],
    tests,
  },
  {
    name: 'a stopped finger still taps',
    edits: [
      { file, find: 'isFinger(model.input) && !model.stopped', replace: 'isFinger(model.input)' },
    ],
    tests,
  },
  {
    name: 'a stale timer steps',
    edits: [{ file, find: 'model.generation !== generation || ', replace: '' }],
    tests,
  },
  {
    name: 'a released press keeps stepping',
    edits: [
      { file, find: 'if (!model.holding || model.generation', replace: 'if (model.generation' },
    ],
    tests,
  },
  {
    name: 'a stop does not end the stepping',
    edits: [{ file, find: '|| model.stopped) return { model }', replace: ') return { model }' }],
    tests,
  },
  {
    name: 'the repeat never reschedules',
    edits: [{ file, find: 'commands: [after(args.intervalMs, generation)],', replace: '' }],
    tests,
  },
  {
    name: 'the click after a press steps again',
    edits: [{ file, find: 'detail === 0 && !model.holding', replace: 'detail === 0' }],
    tests,
  },
  {
    name: 'a mouse click steps',
    edits: [{ file, find: 'detail === 0 && !model.holding', replace: '!model.holding' }],
    tests,
  },
  {
    name: 'another pointer releases the press',
    edits: [
      {
        file,
        find: 'if (!Option.contains(model.pointerId, pointerId)) return { model }',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a release reports no end',
    edits: [{ file, find: 'outMessage: Ended.make({ count: model.count })', replace: '' }],
    tests,
  },
  {
    name: 'a secondary button holds',
    edits: [{ file, find: 'button !== 0 || model.holding', replace: 'model.holding' }],
    tests,
  },
  {
    name: 'the target is never marked aria-disabled',
    edits: [
      {
        file,
        find: '...(options.disabled?.(input) === true ? [h.AriaDisabled(true)] : []),',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a hold is not marked',
    edits: [
      {
        file,
        find: "...(input[declared.field].holding ? [h.DataAttribute('holding', 'true')] : []),",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the target supplies no activation',
    edits: [{ file, find: 'provides: [A11y.Activation],', replace: 'provides: [],' }],
    tests: ['packages/primitives/test/obligations.test.ts'],
  },
  {
    name: 'the Press events are not mounted',
    edits: [{ file, find: 'events: Press.events(),', replace: '' }],
    tests,
  },
]
