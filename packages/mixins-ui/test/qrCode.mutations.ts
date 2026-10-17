/**
 * The QR code, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/qrCode.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = 'packages/mixins-ui/test/qrCode.test.ts'
const browser = 'packages/mixins-ui/test/qrCode.browser.test.ts'
const source = '../src/qrCode.ts'
const recipe = '../src/recipes/qrCode.ts'

export default [
  {
    name: 'every level encodes at L',
    edits: [{ file: source, find: 'ecc: level', replace: "ecc: 'L'" }],
    tests: [unit],
  },
  {
    name: 'a kept code is found by its text alone',
    edits: [{ file: source, find: 'const key = `${level}:${text}`', replace: 'const key = text' }],
    tests: [unit],
  },
  {
    name: 'any failure of the encoder reads as too long',
    edits: [
      {
        file: source,
        find: "error.message === 'Data too long'",
        replace: "error.message !== 'Data too long'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a row that ends dark loses its last module',
    edits: [{ file: source, find: 'const end = dark ? x + 1 : x', replace: 'const end = x' }],
    tests: [unit],
  },
  {
    name: 'a quiet zone of one',
    edits: [{ file: source, find: 'options.quietZone ?? 4', replace: 'options.quietZone ?? 1' }],
    tests: [unit],
  },
  {
    name: 'an overlay covers a code corrected at M',
    edits: [
      {
        file: source,
        find: "overlay === undefined ? 'M' : 'H'",
        replace: "overlay === undefined ? 'M' : 'M'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the name does not say what the code holds',
    edits: [{ file: source, find: '`QR code: ${options.value}`', replace: "'QR code'" }],
    tests: [unit],
  },
  {
    name: 'a downloaded SVG keeps the tokens a file cannot read',
    edits: [
      {
        file: source,
        find: "to.setAttribute('fill', getComputedStyle(from).fill)",
        replace: 'void from',
      },
    ],
    tests: [browser],
  },
  {
    name: 'a PNG half the size asked for',
    edits: [{ file: source, find: 'canvas.width = pixels', replace: 'canvas.width = pixels / 2' }],
    tests: [browser],
  },
  {
    name: 'a file saved without its extension',
    edits: [
      {
        file: source,
        find: 'link.download = `${filename}.${format}`',
        replace: 'link.download = filename',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the code follows a dark page by default',
    edits: [
      {
        file: recipe,
        find: "light: { root: variant(Style.self({ colorScheme: 'light' })) }",
        replace: 'light: {}',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the overlay at the start edge',
    edits: [{ file: recipe, find: "insetInlineStart: '50%'", replace: "insetInlineStart: '0'" }],
    tests: [browser],
  },
  {
    name: 'the size axis sets nothing',
    edits: [
      {
        file: recipe,
        find: "lg: { root: variant(Style.self({ '--_fk-qr-size': '16rem' })) }",
        replace: 'lg: {}',
      },
    ],
    tests: [browser],
  },
  {
    name: 'the frame served as an HTML element',
    edits: [{ file: source, find: '          h.svg(', replace: '          h.div(' }],
    tests: ['packages/mixins-ui/test/qrCode.ssr.test.ts'],
  },
]
