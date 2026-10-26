/**
 * `Write`, broken in turn: `pnpm mutate packages/entity/test/write.mutations.ts`.
 */
const tests = ['packages/entity/test/write.test.ts']
const file = '../src/write.ts'

export default [
  {
    name: 'any field can be the id',
    edits: [{ file, find: "if (id.key !== 'id')", replace: 'if (false)' }],
    tests,
  },
  {
    name: 'the id can be the revision',
    edits: [{ file, find: 'if (options.expect === options.id)', replace: 'if (false)' }],
    tests,
  },
  {
    name: 'the revision need not be a field',
    edits: [
      {
        file,
        find: "field: fieldAt(input, options.expect, 'expect')",
        replace: 'field: undefined as never',
      },
    ],
    tests,
  },
  {
    name: 'an unmapped key is set',
    edits: [
      {
        file,
        find: "      case 'Unmapped':\n        break\n",
        replace:
          "      case 'Unmapped':\n        sets.push(Object.freeze({ key, field: member as never }))\n        break\n",
      },
    ],
    tests,
  },
  {
    name: 'a write may set nothing',
    edits: [{ file, find: "? fail(write.input, 'it sets no field')", replace: '? write' }],
    tests,
  },
  {
    name: 'the keys asked for are ignored',
    edits: [{ file, find: 'wanted === undefined || wanted.has(key)', replace: 'true' }],
    tests,
  },
  {
    name: 'a value is written decoded',
    edits: [
      {
        file,
        find: 'values[field.key] = encoded(field, held)',
        replace: 'values[field.key] = held',
      },
    ],
    tests,
  },
  {
    name: 'the sets can be changed after',
    edits: [{ file, find: 'sets: Object.freeze(sets),', replace: 'sets,' }],
    tests,
  },
  {
    name: 'a many relation is pointed like a one',
    edits: [
      { file, find: "if (member.relation.cardinality !== 'one') {", replace: 'if (false) {' },
    ],
    tests,
  },
  {
    name: 'a relation set to nothing points at a row with no id',
    edits: [
      {
        file,
        find: 'Option.flatMap(given(input[key]), Option.fromNullishOr)',
        replace: 'given(input[key])',
      },
    ],
    tests,
  },
  {
    name: 'a delete may name a member it would not write',
    edits: [{ file, find: 'if (named !== undefined)', replace: 'if (false)' }],
    tests,
  },
  {
    name: 'an Option is bound as itself',
    edits: [
      {
        file: '../src/write.ts',
        find: 'return Option.isOption(value) ? value : Option.some(value)',
        replace: 'return Option.some(value)',
      },
    ],
    tests: ['packages/entity/test/write.test.ts'],
  },
  {
    name: 'an id that may be absent is declared',
    edits: [
      {
        file: '../src/write.ts',
        find: 'if (SchemaAST.isOptional(idSchema.ast) || takes(undefined) || takes(Option.none()))',
        replace: 'if (false)',
      },
    ],
    tests: ['packages/entity/test/write.test.ts'],
  },
  {
    name: 'an integer field takes a fractional amount',
    edits: [
      {
        file,
        find: 'if (storedAsInteger(field.schema as unknown as Schema.Top) && !integer)',
        replace: 'if (false)',
      },
    ],
    tests,
  },
  {
    name: 'an integer check inside a group is not seen',
    edits: [
      {
        file,
        find: 'FilterGroup: group => checksInteger(group.checks)',
        replace: 'FilterGroup: () => false',
      },
    ],
    tests,
  },
  {
    name: 'any check reads as the integer one',
    edits: [
      {
        file,
        find: "Filter: filter => filter.annotations?.representation?.id === 'effect/schema/isInt'",
        replace: 'Filter: () => true',
      },
    ],
    tests,
  },
]
