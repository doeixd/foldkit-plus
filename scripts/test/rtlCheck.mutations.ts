/**
 * The check for physical directions in styles:
 * `pnpm mutate scripts/test/rtlCheck.mutations.ts`.
 */
const file = '../rtl-check.mjs'
const tests = ['scripts/test/rtlCheck.test.ts']

export default [
  {
    name: 'a physical margin or border side is missed',
    edits: [{ file, find: '(?:margin|padding|scrollMargin', replace: '(?:scrollMargin' }],
    tests,
  },
  {
    name: 'a physical text-align or float is missed',
    edits: [
      { file, find: String.raw`\b(?:textAlign|float)\b`, replace: String.raw`\b(?:textAlign)\b` },
    ],
    tests,
  },
  {
    name: 'a left or right offset is missed',
    edits: [{ file, find: '(?:ref|t|d|v|at)\\b[.(]', replace: '(?:ref)\\b[.(]' }],
    tests,
  },
  {
    name: 'a translateX is missed',
    edits: [{ file, find: String.raw`\btranslateX\(`, replace: String.raw`\btranslateXX\(` }],
    tests,
  },
  {
    name: 'a marker that does not say physical covers a line',
    edits: [{ file, find: String.raw`/^\/\/\s*physical\b/i.test(trimmed)`, replace: 'true' }],
    tests,
  },
  {
    name: 'a marker with no reason covers a line',
    edits: [
      {
        file,
        find: String.raw`[\s:,;\u2014\u2013-]*[^\s:,;\u2014\u2013-]/i`,
        replace: String.raw`[\s:,;\u2014\u2013-]*/i`,
      },
    ],
    tests,
  },
  {
    name: 'a marker covers the object after its own',
    edits: [
      {
        file,
        find: String.raw`if (/^[}\])]/.test(trimmed) || /[{[(]$/.test(trimmed)) return false`,
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a marker covers past a blank line',
    edits: [{ file, find: "if (trimmed === '') return false", replace: '' }],
    tests,
  },
  {
    name: 'a trailing marker is not read',
    edits: [
      {
        file,
        find: 'if (withReason.test(lines[index])) return true',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a comment is read as a declaration',
    edits: [
      {
        file,
        find: String.raw`const stripped = line => line.replace(/^\s*(?:\/\/|\*|\/\*\*?).*$/, '')`,
        replace: 'const stripped = line => line',
      },
    ],
    tests,
  },
  {
    name: 'a file that is no style file is read',
    edits: [{ file, find: 'if (!styleFile.test(text)) return []', replace: '' }],
    tests,
  },
]
