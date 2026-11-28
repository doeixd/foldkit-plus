/** A placed Bundle's confinement: `pnpm mutate packages/plus/test/writesConfinement.mutations.ts` */
const tests = ['packages/plus/test/writesConfinement.test.ts']

export default [
  {
    name: 'a placement’s contract owns no path',
    edits: [
      {
        file: '../../bundle-surface/src/index.ts',
        find: '  owns: [placement.link.path],',
        replace: '  owns: [],',
      },
    ],
    tests,
  },
  {
    name: 'a placement’s contract names no Message of its own',
    edits: [
      {
        file: '../../bundle-surface/src/index.ts',
        find: '  messages: placement.link.messages,',
        replace: '  messages: [],',
      },
    ],
    tests,
  },
  {
    name: 'a Message outside the owner’s messages may write the path it owns',
    edits: [
      {
        file: '../../surface/src/writesCheck.ts',
        find: '    const foreign = owners.filter(entry => !entry.messages.has(tag))',
        replace: '    const foreign: typeof owners = []',
      },
    ],
    tests,
  },
]
