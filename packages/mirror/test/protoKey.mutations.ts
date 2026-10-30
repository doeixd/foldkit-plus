/**
 * Fields and store keys named like `Object.prototype` members:
 * `pnpm mutate packages/mirror/test/protoKey.mutations.ts`.
 */
const tests = ['packages/mirror/test/mirror.test.ts']
const plain = (name: string, type: string) => ({
  name: `${name} is a plain object`,
  edits: [
    {
      file: '../src/index.ts',
      find: `const ${name} = table<${type}>()`,
      replace: `const ${name}: Record<string, ${type}> = {}`,
    },
  ],
  tests,
})

export default [
  plain('keyOf', 'string'),
  plain('fieldOf', 'string'),
  plain('history', "'push' | 'replace'"),
  plain('initialText', 'string'),
  {
    name: 'a URL key is assigned',
    edits: [
      {
        file: '../src/index.ts',
        find: 'if (value !== null) put(out, key, value)',
        replace: 'if (value !== null) out[key] = value',
      },
    ],
    tests,
  },
  {
    name: 'the memory store assigns what it is given',
    edits: [
      {
        file: '../src/index.ts',
        find: 'for (const [key, value] of Object.entries(write.set)) put(next, key, value)',
        replace: 'Object.assign(next, write.set)',
      },
    ],
    tests,
  },
  {
    name: 'an encoded key is assigned',
    edits: [
      {
        file: '../src/index.ts',
        find: 'put(out, keyOf[field]!, text)',
        replace: 'out[keyOf[field]!] = text',
      },
    ],
    tests,
  },
  {
    name: 'decode reads a key through the prototype',
    edits: [
      {
        file: '../src/index.ts',
        find: 'const text = own(keys, key)',
        replace: 'const text = keys[key]',
      },
    ],
    tests,
  },
  {
    name: 'a decoded field is assigned',
    edits: [
      {
        file: '../src/index.ts',
        find: 'else put(value, field, decoded.success)',
        replace: 'else value[field] = decoded.success',
      },
    ],
    tests,
  },
  {
    name: 'a restored field is assigned',
    edits: [
      {
        file: '../src/index.ts',
        find: 'put(out, field, decoded[field])',
        replace: '(out[field] = decoded[field])',
      },
    ],
    tests,
  },
  {
    name: 'href keeps a key the encoded slice inherits',
    edits: [
      {
        file: '../src/index.ts',
        find: 'owned.filter(key => !Object.hasOwn(set, key))',
        replace: 'owned.filter(key => !(key in set))',
      },
    ],
    tests,
  },
  {
    name: 'a settled write reads a key through the prototype',
    edits: [
      {
        file: '../src/index.ts',
        find: 'own(encoded, keyOf[field]!) ?? initialText[field]!',
        replace: 'encoded[keyOf[field]!] ?? initialText[field]!',
      },
    ],
    tests,
  },
  {
    name: 'a sync removes what the store does not hold',
    edits: [
      {
        file: '../src/index.ts',
        find: '!Object.hasOwn(encoded, key) && Object.hasOwn(current, key)',
        replace: '!(key in encoded) && Object.hasOwn(current, key)',
      },
    ],
    tests,
  },
  {
    name: 'a sync writes a key the slice inherits',
    edits: [
      {
        file: '../src/index.ts',
        find: 'key => Object.hasOwn(encoded, key) && current[key] !== encoded[key]',
        replace: 'key => key in encoded && current[key] !== encoded[key]',
      },
    ],
    tests,
  },
  {
    name: 'a sync removes a key the store inherits',
    edits: [
      {
        file: '../src/index.ts',
        find: '!Object.hasOwn(encoded, key) && Object.hasOwn(current, key)',
        replace: '!Object.hasOwn(encoded, key) && key in current',
      },
    ],
    tests,
  },
]
