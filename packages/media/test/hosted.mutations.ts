/**
 * The variant space and the hosted provider, broken in turn:
 * `pnpm mutate packages/media/test/hosted.mutations.ts` checks that a
 * test fails for every one.
 */
export default [
  {
    name: 'a space takes any format',
    edits: [
      {
        file: '../src/variant.ts',
        find: 'format: Schema.Literals(formats),',
        replace: 'format: Format,',
      },
    ],
    tests: ['packages/media/test/hosted.test.ts'],
  },
  {
    name: 'a space takes any quality',
    edits: [
      {
        file: '../src/variant.ts',
        find: 'quality: Schema.Option(Schema.Literals(qualities)),',
        replace: 'quality: Schema.Option(Quality),',
      },
    ],
    tests: ['packages/media/test/hosted.test.ts'],
  },
  {
    name: 'a space takes a repeated format',
    edits: [
      {
        file: '../src/variant.ts',
        find: "distinct('format', formats)",
        replace: '',
      },
    ],
    tests: ['packages/media/test/hosted.test.ts'],
  },
  {
    name: 'a space takes a width its URL cannot spell',
    edits: [
      {
        file: '../src/variant.ts',
        find: 'if (unspellableWidth !== undefined) {',
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/media/test/hosted.test.ts'],
  },
  {
    name: 'the hosted provider offers a format its server does not make',
    edits: [
      {
        file: '../src/provider.ts',
        find: 'if (!space.formats.includes(format)) {',
        replace: 'if (false) {',
      },
    ],
    tests: ['packages/media/test/hosted.test.ts'],
  },
  {
    name: 'the hosted provider names a quality its server does not make',
    edits: [
      {
        file: '../src/provider.ts',
        find: '!space.qualities.includes(quality.value)',
        replace: 'false',
      },
    ],
    tests: ['packages/media/test/hosted.test.ts'],
  },
  {
    name: 'a variant may be spelled with a leading zero',
    edits: [
      {
        file: '../src/variant.ts',
        find: '/^w([1-9]\\d{0,4})',
        replace: '/^w(\\d{1,5})',
      },
    ],
    tests: ['packages/media/test/hosted.test.ts'],
  },
  {
    name: 'a quality may be spelled with a leading zero',
    edits: [
      {
        file: '../src/variant.ts',
        find: '(?:q([1-9]\\d?|100))?',
        replace: '(?:q(\\d{1,3}))?',
      },
    ],
    tests: ['packages/media/test/hosted.test.ts'],
  },
  {
    name: 'a hash may be uppercase',
    edits: [
      {
        file: '../src/variant.ts',
        find: '/^[0-9a-f]{64}$/',
        replace: '/^[0-9a-fA-F]{64}$/',
      },
    ],
    tests: ['packages/media/test/hosted.test.ts'],
  },
  {
    name: 'the hosted provider drops its quality',
    edits: [
      {
        file: '../src/provider.ts',
        find: 'encodeVariant({ width, format: encoding, quality })',
        replace: 'encodeVariant({ width, format: encoding, quality: Option.none() })',
      },
    ],
    tests: ['packages/media/test/hosted.test.ts'],
  },
  {
    name: 'the hosted provider leaves the hash out',
    edits: [
      {
        file: '../src/provider.ts',
        find: ".replace(':hash', asset.hash.value)",
        replace: '',
      },
    ],
    tests: ['packages/media/test/hosted.test.ts'],
  },
  {
    name: 'any base URL is accepted',
    edits: [
      {
        file: '../src/provider.ts',
        find: "url => (url.protocol === 'http:' || url.protocol === 'https:')",
        replace: "url => true || (url.protocol === 'http:' || url.protocol === 'https:')",
      },
    ],
    tests: ['packages/media/test/hosted.test.ts'],
  },
]
