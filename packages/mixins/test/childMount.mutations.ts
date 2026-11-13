/** Child boundary Mounts must not be silently replaced. */
const file = '../src/resolver.ts'
const tests = ['packages/mixins/test/resolver.test.ts', 'packages/mixins/test/mountRuntime.test.ts']

export default [
  {
    name: 'the view child Mount is not counted',
    edits: [
      {
        file,
        find: 'if (!countChildMount(inner._tag)) reserve(inner._tag, inner)',
        replace: 'reserve(inner._tag, inner)',
      },
    ],
    tests,
  },
  {
    name: 'a Mixin child Mount is not counted',
    edits: [
      {
        file,
        find: 'if (!countChildMount(inner._tag)) claim(inner._tag, inner)',
        replace: 'claim(inner._tag, inner)',
      },
    ],
    tests,
  },
  {
    name: 'a child Mount and another Mount are allowed',
    edits: [{ file, find: 'childMounts > 0 && childMounts + mounts.length > 1', replace: 'false' }],
    tests,
  },
]
