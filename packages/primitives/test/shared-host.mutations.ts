/**
 * The shared host, broken in turn: `pnpm mutate
 * packages/primitives/test/shared-host.mutations.ts` checks that a test fails for every one.
 */
const tests = ['packages/primitives/test/shared-host.browser.test.ts']
const file = '../src/net/sharedHost.ts'
export default [
  {
    name: 'the host takes any message as an opening',
    edits: [
      {
        file,
        find: 'Option.zipWith(decode(data),',
        replace: 'Option.zipWith(Option.some(data as never),',
      },
    ],
    tests,
  },
  {
    name: 'an opening without a port reaches the host',
    edits: [{ file, find: 'Option.fromUndefinedOr(port)', replace: 'Option.some(port!)' }],
    tests,
  },
  {
    name: 'the top document takes openings from any origin',
    edits: [{ file, find: 'if (event.origin === location.origin) receive', replace: 'receive' }],
    tests,
  },
  {
    name: 'a page that goes ends nothing',
    edits: [
      {
        file,
        find: '              void held.request(lockOf(envelope.conversation), () => ended.abort())\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the opening goes before the page holds its lock',
    edits: [
      {
        file,
        find: 'void hold(lockOf(conversation)).then(() => send(envelope, port2))',
        replace: 'send(envelope, port2)',
      },
    ],
    tests,
  },
  {
    name: 'the host starts for every conversation',
    edits: [
      {
        file,
        find: '(started ??= Promise.resolve().then(start))',
        replace: '(started = Promise.resolve().then(start))',
      },
    ],
    tests,
  },
  {
    name: 'a browser without SharedWorker asks for one',
    edits: [{ file, find: "if (typeof SharedWorker !== 'undefined') {", replace: 'if (true) {' }],
    tests,
  },
]
