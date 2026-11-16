/**
 * Each rule of how `print` writes a link or image destination, broken in turn: `pnpm mutate
 * packages/richtext-markdown/test/destination.mutations.ts` checks that a test fails for every
 * one. There is no title rule to break: the model holds no title, so none is written.
 */
const file = '../src/print.ts'
const tests = ['packages/richtext-markdown/test/destination.test.ts']

export default [
  {
    name: 'a backslash is never escaped',
    edits: [
      {
        file,
        find: 'return next === undefined || ASCII_PUNCTUATION.test(next) ?',
        replace: 'return false ?',
      },
    ],
    tests,
  },
  {
    name: 'a backslash at the end is not escaped',
    edits: [
      {
        file,
        find: 'return next === undefined || ASCII_PUNCTUATION',
        replace: 'return ASCII_PUNCTUATION',
      },
    ],
    tests,
  },
  {
    name: 'a backslash before punctuation is not escaped',
    edits: [{ file, find: '|| ASCII_PUNCTUATION.test(next) ?', replace: '|| false ?' }],
    tests,
  },
  {
    name: 'a backslash before anything is escaped',
    edits: [{ file, find: '|| ASCII_PUNCTUATION.test(next) ?', replace: '|| true ?' }],
    tests,
  },
  {
    name: 'an ampersand is never escaped',
    edits: [
      {
        file,
        find: 'reference !== undefined && decodeString(reference) !== reference ?',
        replace: 'false ?',
      },
    ],
    tests,
  },
  {
    name: 'an ampersand that names nothing is escaped too',
    edits: [
      {
        file,
        find: 'reference !== undefined && decodeString(reference) !== reference ?',
        replace: 'reference !== undefined ?',
      },
    ],
    tests,
  },
  {
    name: 'the reference is looked for after its ampersand',
    edits: [
      {
        file,
        find: 'REFERENCE.exec(plain.slice(at))',
        replace: 'REFERENCE.exec(plain.slice(at + 1))',
      },
    ],
    tests,
  },
  {
    name: 'angle brackets are chosen for the URL a bare one holds',
    edits: [
      {
        file,
        find: 'return /[\\s()<>]/.test(plain) ?',
        replace: 'return !/[\\s()<>]/.test(plain) ?',
      },
    ],
    tests,
  },
  {
    name: 'the form is chosen before control characters are encoded',
    edits: [
      { file, find: 'return /[\\s()<>]/.test(plain) ?', replace: 'return /[\\s()<>]/.test(url) ?' },
    ],
    tests,
  },
  {
    name: 'an angle bracket inside angle brackets is not escaped',
    edits: [
      {
        file,
        find: String.raw`if (character !== '\\') return`,
        replace: String.raw`if (character !== '\\') return character; if (false) return`,
      },
    ],
    tests,
  },
  {
    name: 'a control character is written as it is',
    edits: [
      {
        file,
        find: 'const plain = url.replace(\n    CONTROL,',
        replace: 'const plain = url.replace(\n    /(?!)/g,',
      },
    ],
    tests,
  },
  {
    name: 'a control character is percent-encoded in lower case',
    edits: [{ file, find: '.toString(16).toUpperCase()', replace: '.toString(16)' }],
    tests,
  },
  {
    name: 'a control character is percent-encoded with one digit',
    edits: [{ file, find: ".padStart(2, '0')", replace: '' }],
    tests,
  },
]
