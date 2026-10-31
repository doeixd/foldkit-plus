/**
 * The view conformance suite, each part broken in turn:
 * `pnpm mutate packages/plus/test/conformance.mutations.ts`.
 */
const cases = './conformance/cases.ts'
const drawers = './conformance/drawers.ts'
const harness = './conformance/harness.ts'
const markup = './conformance/markup.ts'
const tests = ['packages/plus/test/conformance.test.ts']

export default [
  {
    // The plan's R0 test: the runtime then ends the last row's Mount, as
    // Scene says, so the disagreement the suite records is gone; Scene's own
    // reading is the same with the key or without it.
    name: 'the keyed list loses its keys',
    edits: [
      {
        file: cases,
        find: "h.keyed('li')(id, [h.DataAttribute('id', id), h.OnMount(Watch({ id }))], [id]),",
        replace: "h.li([h.DataAttribute('id', id), h.OnMount(Watch({ id }))], [id]),",
      },
    ],
    tests,
  },
  {
    name: 'every drawer agrees with the reference whatever it drew',
    edits: [
      {
        file: harness,
        find: 'reference === drawn ? [] : [{ drawer, step, aspect, reference, drawn }]',
        replace: '[]',
      },
    ],
    tests,
  },
  {
    name: "Scene's ended Mounts go unreported",
    edits: [
      {
        file: drawers,
        find: "if (probed.has(name)) record.mounts.push({ event: 'ended', name, args: args ?? {} })",
        replace: '',
      },
    ],
    tests,
  },
  {
    // The grid's header row and body start before its root in the runtime;
    // resolved parent first, Scene's start Messages come in another order.
    name: 'Scene resolves its Mounts parent first',
    edits: [
      {
        file: drawers,
        find: 'const pending = startOrder(current.html)',
        replace: 'const pending = current.mounts.map(mount => mount.name)',
      },
    ],
    tests,
  },
  {
    // The grid case opens its editor from the keyboard: unpressed, the
    // runtime draws no editor where Scene, pressing the key, does.
    name: "the runtime's key reaches nothing",
    edits: [
      {
        file: drawers,
        find: "new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }),",
        replace: "new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }),",
      },
    ],
    tests,
  },
  {
    // The editor's Mount answers as it starts, and Scene is told it does.
    name: "the grid's editor says nothing when it holds focus",
    edits: [
      {
        file: '../../mixins-data-grid/src/holdFocus.ts',
        find: '          Queue.offerUnsafe(queue, HoldingFocus.make({}))\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: "a field is read by its markup's value, not what it holds",
    edits: [
      {
        file: markup,
        find: "[['value', element.value]]",
        replace: "[['value', element.getAttribute('value') ?? '']]",
      },
    ],
    tests,
  },
]
