/**
 * Media, each part broken in turn: `pnpm mutate packages/richtext/test/media.mutations.ts`
 * checks that a test fails for every one.
 */
const file = '../src/media.ts'
const tests = ['packages/richtext/test/media.test.ts']

export default [
  {
    name: 'any data: URL plays',
    edits: [
      {
        file,
        find: "return accepts(data[1] ?? '') ? value.trim() : undefined",
        replace: 'return value.trim()',
      },
    ],
    tests,
  },
  {
    name: 'no data: URL plays',
    edits: [
      {
        file,
        find: "return accepts(data[1] ?? '') ? value.trim() : undefined",
        replace: 'return undefined',
      },
    ],
    tests,
  },
  {
    name: 'an attachment may be a page',
    edits: [
      {
        file,
        find: 'const href = mediaUrl(block.props.src, type => !ACTIVE.test(type))',
        replace: 'const href = mediaUrl(block.props.src, () => true)',
      },
    ],
    tests,
  },
  {
    name: 'other URLs skip the policy',
    edits: [
      {
        file,
        find: 'if (data === null) return safeUrl(value)',
        replace: 'if (data === null) return value',
      },
    ],
    tests,
  },
  {
    name: 'a sound plays from a video',
    edits: [
      {
        file,
        find: "type.toLowerCase().startsWith('audio/')",
        replace: '/^(audio|video)\\//.test(type)',
      },
    ],
    tests,
  },
  {
    name: 'a video is an attachment',
    edits: [
      {
        file,
        find: "if (family === 'video') return node('Video', { src: file.src, title })\n",
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'sizes over a megabyte read in kilobytes',
    edits: [
      {
        file,
        find: 'if (bytes < 1024 * 1024) return',
        replace: 'if (bytes < 1024 * 1024 * 1024) return',
      },
    ],
    tests,
  },
]
