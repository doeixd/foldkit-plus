/**
 * `Site.routing`'s `preload`, broken in turn:
 * `pnpm mutate packages/site/test/intent.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = [
  'packages/site/test/intent.test.ts',
  'packages/site/test/routing.test.ts',
  'packages/site/test/together.test.ts',
]
const file = '../src/index.ts'

export default [
  {
    name: 'the intent is not claimed',
    edits: [
      { file, find: '      ...(intendedTag === undefined ? [] : [intendedTag]),\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'the intent is routed nowhere',
    edits: [
      {
        file,
        find: 'if (preload !== undefined && message._tag === intendedTag) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'an address no node holds is read through the fallback',
    edits: [
      {
        file,
        find: 'Option.match(Site.routeAt(config.site, url), {\n              // Another document',
        replace:
          'Option.match(Option.some(config.parse(url)), {\n              // Another document',
      },
    ],
    tests,
  },
  {
    name: 'the route shown is read ahead again',
    edits: [
      {
        file,
        find: 'sameRoute(config.route.get(model), next)\n                  ? { model }',
        replace: 'false\n                  ? { model }',
      },
    ],
    tests,
  },
  {
    name: 'the read is given the Model as it is, not as it would be there',
    edits: [
      {
        file,
        find: 'preload.read(config.route.set(model, next))',
        replace: 'preload.read(model)',
      },
    ],
    tests,
  },
  {
    name: 'the links are never listened to',
    edits: [
      {
        file,
        find: 'Stream.map(preload.links, url => preload.intended({ url }))',
        replace: 'Stream.empty',
      },
    ],
    tests,
  },
  {
    name: 'the contract does not name the intent',
    edits: [
      {
        file,
        find: 'messages: [completedTag, ...(intendedTag === undefined ? [] : [intendedTag])],',
        replace: 'messages: [completedTag],',
      },
    ],
    tests,
  },
]
