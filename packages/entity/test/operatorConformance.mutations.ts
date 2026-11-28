const tests = ['packages/entity/test/operatorConformance.test.ts']
const helper = '../src/conformance/operator.ts'
const tuples = '../src/conformance/tuples.ts'
const edit = (name: string, file: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'outcomes are compared as JSON',
    helper,
    'sameValue(value, right.value)',
    'JSON.stringify(value) === JSON.stringify(right.value)',
  ),
  edit('every case runs, however many', tuples, 'if (size <= limit) return', 'if (true) return'),
  edit('the seed chooses nothing', tuples, 'const next = random(seed)', 'const next = random(0)'),
  edit(
    'outcomes are recorded in a plain object',
    helper,
    'const outcomes: Record<string, Outcome> = Object.create(null)',
    'const outcomes: Record<string, Outcome> = {}',
  ),
  edit(
    'an implementation named expansion is replaced',
    helper,
    "if (Object.hasOwn(runners, 'expansion')) {",
    'if (false) {',
  ),
  edit(
    'a defined operator runs without its expansion',
    helper,
    'if (Option.isSome(descriptor.definedAs)) {',
    'if (false) {',
  ),
  edit(
    'text is run under binary alone',
    helper,
    ': [Option.some(Collation.binary), Option.some(Collation.asciiFold)]',
    ': [Option.some(Collation.binary)]',
  ),
  edit(
    'null is never generated',
    helper,
    'const nulls = decodes(schema)(null) ? [null] : []',
    'const nulls: Array<null> = []',
  ),
  edit(
    'null is generated for any schema',
    helper,
    'const nulls = decodes(schema)(null) ? [null] : []',
    'const nulls = [null]',
  ),
  edit('text holding NUL is never generated', helper, '...(text ? [`a${NUL}`] : [])', '...[]'),
  edit(
    'a disagreement is never reported',
    helper,
    'others.some(each => !same(first, each))',
    'false',
  ),
  edit(
    'an object that is not plain is compared by its own keys',
    helper,
    'return prototype === Object.prototype || prototype === null',
    'return prototype !== undefined',
  ),
  edit(
    'a field holding undefined counts as present',
    helper,
    'Object.keys(record).filter(key => record[key] !== undefined)',
    'Object.keys(record)',
  ),
]
