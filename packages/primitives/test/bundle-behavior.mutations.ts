/**
 * The Bundle-to-Behavior bridge, broken in turn: `pnpm mutate
 * packages/primitives/test/bundle-behavior.mutations.ts` checks that Press and
 * Selection fail for each — the wrapper mapping, the `send` it hands
 * attributes, and the events mount it contributes.
 */
const tests = [
  'packages/primitives/test/press.test.ts',
  'packages/primitives/test/selection.test.ts',
]
export default [
  {
    name: 'the events mount keeps the bundle’s messages',
    edits: [
      {
        file: '../src/interaction/bundle-behavior.ts',
        find: '{ mount: () => Mount.mapMessage(events, send) }',
        replace:
          '{ mount: () => Mount.mapMessage(events, message => message as unknown as ParentMessage) }',
      },
    ],
    tests,
  },
  {
    name: 'send leaves the message unwrapped',
    edits: [
      {
        file: '../src/interaction/bundle-behavior.ts',
        find: 'declared.wrapper.make(message) as unknown as ParentMessage',
        replace: 'message as unknown as ParentMessage',
      },
    ],
    tests,
  },
  {
    name: 'a bundle’s events never mount',
    edits: [
      {
        file: '../src/interaction/bundle-behavior.ts',
        find: '...(events === undefined ? {} : { mount: () => Mount.mapMessage(events, send) })',
        replace: '...(events === undefined ? {} : {})',
      },
    ],
    tests,
  },
]
