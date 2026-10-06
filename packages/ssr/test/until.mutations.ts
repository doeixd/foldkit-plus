/**
 * A declined page kept in view until the fresh one is ready, broken in turn at
 * each layer: `pnpm mutate packages/ssr/test/until.mutations.ts` checks that a
 * test fails for every one.
 */
const client = '../src/client.ts'
const reads = '../../composition/src/remote/index.ts'
const site = '../../../examples/cms/src/apps/siteApp.ts'
const takeover = ['packages/ssr/test/takeover.test.ts']

export default [
  {
    name: '`until` is not waited for',
    edits: [
      {
        file: client,
        find: '    if (!shown && until(model)) queueMicrotask(show)\n',
        replace: '    if (!shown) queueMicrotask(show)\n',
      },
    ],
    tests: takeover,
  },
  {
    name: 'the fresh page draws in view',
    edits: [{ file: client, find: '  holder.hidden = true\n', replace: '' }],
    tests: takeover,
  },
  {
    name: 'the served page stays after the swap',
    edits: [{ file: client, find: '    served.remove()\n', replace: '' }],
    tests: takeover,
  },
  {
    name: 'the served page keeps its server stamp',
    edits: [
      { file: client, find: '  served.removeAttribute(FOLDKIT_APP_ATTRIBUTE)\n', replace: '' },
    ],
    tests: takeover,
  },
  {
    name: 'the limit never shows the fresh page',
    edits: [
      {
        file: client,
        find: '  const limit = setTimeout(show, UNTIL_LIMIT_MS)',
        replace: '  const limit = 0',
      },
    ],
    tests: takeover,
  },
  {
    name: 'one answered Block read answers the page',
    edits: [
      { file: reads, find: '.every(RemoteData.answered)', replace: '.some(RemoteData.answered)' },
    ],
    tests: ['packages/composition/test/remote.test.ts'],
  },
  {
    name: 'no page is a page still waiting',
    edits: [
      {
        file: reads,
        find: '          onNone: () => true,\n          onSome: reads => Object.values',
        replace: '          onNone: () => false,\n          onSome: reads => Object.values',
      },
    ],
    tests: ['packages/composition/test/remote.test.ts'],
  },
  {
    name: 'a loading read is an answer',
    edits: [
      {
        file: '../../remote/src/remoteData.ts',
        find: '      Loading: () => false,\n      Ready: () => true,',
        replace: '      Loading: () => true,\n      Ready: () => true,',
      },
    ],
    tests: ['packages/remote/test/remoteData.test.ts'],
  },
  {
    name: 'the site does not wait for its Blocks',
    edits: [
      {
        file: site,
        find: '    route(blogRead(model)) &&\n    actives.blocks.answered(model)',
        replace: '    route(blogRead(model))',
      },
    ],
    tests: ['examples/cms/test/siteAnswered.test.ts'],
  },
  {
    name: 'the site does not wait for its route',
    edits: [{ file: site, find: '    route(blogRead(model)) &&\n', replace: '' }],
    tests: ['examples/cms/test/siteAnswered.test.ts'],
  },
]
