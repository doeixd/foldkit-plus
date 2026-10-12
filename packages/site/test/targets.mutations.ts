/**
 * The tree's parser, builder and listing, broken in turn:
 * `pnpm mutate packages/site/test/targets.mutations.ts` checks that a test
 * fails for every one.
 */
const tests = ['packages/site/test/targets.test.ts']
const file = '../src/index.ts'

export default [
  {
    name: 'the parser tries nodes deepest first',
    edits: [
      {
        file,
        find: 'oneOf(...[...parent.keys()].map(node => node.router)),',
        replace: 'oneOf(...[...parent.keys()].reverse().map(node => node.router)),',
      },
    ],
    tests,
  },
  {
    name: 'an address no node takes reads as a route',
    edits: [
      {
        file,
        find: '{ make: () => Option.none() },',
        replace: "{ make: ({ path }) => Option.some({ _tag: 'NotFound', path }) },",
      },
    ],
    tests,
  },
  {
    name: 'an href drops its params',
    edits: [
      {
        file,
        find: '    return node.router.build(params)\n',
        replace: '    return node.router.build({})\n',
      },
    ],
    tests,
  },
  {
    name: 'a node with params needs no paths',
    edits: [
      {
        file,
        find: 'const unlisted = nodes.filter(node => takesParams(node) && !listed.has(node))',
        replace: 'const unlisted = nodes.filter(node => !takesParams(node) && false)',
      },
    ],
    tests,
  },
  {
    name: 'paths for a stranger are taken',
    edits: [
      {
        file,
        find: '      if (!nodes.includes(each.node))\n',
        replace: '      if (false)\n',
      },
    ],
    tests,
  },
  {
    name: 'paths twice for one node are taken',
    edits: [
      {
        file,
        find: '      if (listed.has(each.node)) throw',
        replace: '      if (false) throw',
      },
    ],
    tests,
  },
  {
    name: 'a listed address loses when it changed',
    edits: [
      {
        file,
        find: '              ...(modified === undefined ? {} : { modified }),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a node with no params is not listed',
    edits: [
      {
        file,
        find: 'if (source === undefined) return Effect.succeed([Site.target(node, {})])',
        replace: 'if (source === undefined) return Effect.succeed([])',
      },
    ],
    tests,
  },
]
