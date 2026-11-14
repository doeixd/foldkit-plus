/**
 * Parts, broken in turn: `pnpm mutate packages/agent/test/parts.mutations.ts`.
 */
const parts = '../src/parts.ts'
const runtime = '../src/runtime.ts'
const tests = ['packages/agent/test/parts.test.ts']

export default [
  {
    name: 'a part of an unavailable capability is listed',
    edits: [
      {
        file: parts,
        find: 'if (Option.exists(declared.tag, tag => !snapshot.available.has(tag))) return []',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'value is read from the Model, not the projected context',
    edits: [
      {
        file: runtime,
        find: 'encoded: Option.map(projected, each => each.encoded),',
        replace: 'encoded: Option.some(model),',
      },
    ],
    tests,
  },
  {
    name: 'each and label are given the context as read, not as its Schema keeps it',
    edits: [
      {
        file: runtime,
        find: 'decoded: Option.map(projected, each => each.decoded),',
        replace: 'decoded: Option.map(projected, () => declared!.read(model)),',
      },
    ],
    tests,
  },
  {
    name: 'an optional field left out reads as present',
    edits: [
      {
        file: parts,
        find: 'Object.hasOwn(context as object, field)',
        replace: 'true',
      },
    ],
    tests,
  },
  {
    name: 'find answers the first of two labels',
    edits: [
      {
        file: runtime,
        find: 'if (matches.length > 1) return Found.Ambiguous({ parts: matches })',
        replace: 'if (matches.length > 1) return Found.One({ part: matches[0]! })',
      },
    ],
    tests,
  },
  {
    name: 'an unexposed capability is let in',
    edits: [
      {
        file: parts,
        find: 'if (named !== undefined && tag === undefined) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'a field outside the context is let in',
    edits: [
      {
        file: parts,
        find: 'if (config.field !== undefined && !Option.exists(fields, keys => keys.has(config.field!))) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'two occurrences with one key are let through',
    edits: [{ file: parts, find: 'if (seen.has(occurrence)) {', replace: 'if (false) {' }],
    tests,
  },
  {
    name: 'availability is read from a second snapshot',
    edits: [
      {
        file: runtime,
        find: 'const available = new Set(availableAt(model).map(variant => variant.tag))',
        replace: 'const available = new Set(availableAt(host.model()).map(variant => variant.tag))',
      },
    ],
    tests,
  },
  {
    name: 'the context is projected for parts that read none of it',
    edits: [
      {
        file: runtime,
        find: 'declared === undefined || !partsReadContext',
        replace: 'declared === undefined',
      },
    ],
    tests,
  },
  {
    name: 'bind takes the parts of another definition',
    edits: [
      {
        file: runtime,
        find: 'if (options.parts !== undefined && options.parts.definition !== definition) {',
        replace: 'if (false) {',
      },
    ],
    tests,
  },
  {
    name: 'the manifest leaves out what a part invokes',
    edits: [
      {
        file: '../src/docs.ts',
        find: 'onSome: tag => ({ capability: nameOf.get(tag)! }),',
        replace: 'onSome: () => ({}),',
      },
    ],
    tests,
  },
]
