/**
 * Part binding, broken in turn: `pnpm mutate packages/agent/test/parts.mutations.ts`.
 */
const file = '../src/parts.ts'
const tests = ['packages/agent/test/parts.test.ts']

const swap = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  swap(
    'unavailable capabilities stay listed',
    'new Set((yield* runtime.messages.available)',
    'new Set((yield* runtime.messages.list)',
  ),
  swap(
    'a part by id ignores availability',
    'return part !== undefined && offered.has(part.capability) ? [part] : []',
    'return part !== undefined ? [part] : []',
  ),
  swap(
    'a label ignores availability',
    '.filter(part => part.label === label && offered.has(part.capability))',
    '.filter(part => part.label === label)',
  ),
  swap(
    'a shared label selects the first rendering',
    'if (rest.length > 0) {',
    'if (rest.length > 100) {',
  ),
  swap(
    'a part shows every encoded field',
    'part.fields.flatMap(field =>',
    'Object.keys(encoded).flatMap(field =>',
  ),
  swap(
    'an unknown part id dispatches that name',
    'if (part === undefined) return Effect.fail(UnknownPartError.of(id))',
    'if (part === undefined) return runtime.messages.dispatchUnknown(id, input, invocation)',
  ),
  swap(
    'a stale occurrence selects another row',
    '.filter(item => item.part === id && item.id === occurrence)',
    '.filter(item => item.part === id)',
  ),
  swap(
    "an occurrence answers for another part's rendering",
    '.filter(item => item.part === id && item.id === occurrence)',
    '.filter(item => item.id === occurrence)',
  ),
  swap(
    'an unmounted part is not discoverable',
    'return hits.length === 0 ? [{ part, occurrence: Option.none() }] : hits',
    'return hits',
  ),
  swap(
    'a runtime of another definition is accepted',
    'runtime.definition === definitionOf(catalog)',
    'true || runtime.definition === definitionOf(catalog)',
  ),
  swap(
    'an id may be bound twice',
    'if (index.has(part.id)) throw',
    'if (index.has(part.id) && false) throw',
  ),
  swap(
    'a label may be empty',
    "if (part.label === '') throw",
    "if (part.label === '' && false) throw",
  ),
  swap(
    'an unexposed capability is accepted',
    'if (capability === undefined) {',
    'if (capability === undefined && false) {',
  ),
  swap(
    'a field the context lacks is accepted',
    'const missing = shown.find(field => !fields.has(field))',
    'const missing = shown.find(field => !fields.has(field) && false)',
  ),
  swap(
    'fields are checked against the decoded context',
    'SchemaAST.toEncoded(definition.context.Model.ast)',
    'definition.context.Model.ast',
  ),
  swap(
    'the caller keeps the fields array',
    'const shown = [...(part.fields ?? [])]',
    'const shown = part.fields ?? []',
  ),
]
