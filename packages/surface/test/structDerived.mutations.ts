/**
 * A `Derived` in `Projection.struct`: `pnpm mutate packages/surface/test/structDerived.mutations.ts`.
 */
const tests = ['packages/surface/test/structDerived.test.ts']

const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file: '../src/index.ts', find, replace }],
  tests,
})

export default [
  edit(
    "a Derived's Model is not the struct's",
    '        picked[key] = entry.Model\n        dependencies.push(...entry.dependencies)\n        // A Derived',
    '        picked[key] = Schema.Unknown as never\n        dependencies.push(...entry.dependencies)\n        // A Derived',
  ),
  edit(
    "a Derived's paths are not the struct's",
    '        picked[key] = entry.Model\n        dependencies.push(...entry.dependencies)\n        // A Derived',
    '        picked[key] = entry.Model\n        // A Derived',
  ),
  edit('a Derived with no Model is accepted', 'if (entry.Model === undefined) {', 'if (false) {'),
  edit(
    'a struct is not marked by a Derived reading what no path names',
    '        nesteds.push(entry)\n',
    '',
  ),
  edit(
    'a struct reads the Derived without its memo',
    '        readers.push([key, entry.read])\n      }\n    }\n\n    const read = (root: unknown): unknown => {\n      const out: Record<string, unknown> = Object.create(null)\n      for (const [key, reader] of readers) out[key] = reader(root)\n      return out\n    }\n    return markedBy(\n      makeProjection(\n        objectSchema(picked),\n        mergeDependencies(dependencies),\n        read,\n        Metadata.combine(metadata),\n      ),\n      nesteds,',
    '        readers.push([key, root => ModelRef.is(entry) ? undefined : (entry.read as (r: unknown) => unknown)(structuredClone(root))])\n      }\n    }\n\n    const read = (root: unknown): unknown => {\n      const out: Record<string, unknown> = Object.create(null)\n      for (const [key, reader] of readers) out[key] = reader(root)\n      return out\n    }\n    return markedBy(\n      makeProjection(\n        objectSchema(picked),\n        mergeDependencies(dependencies),\n        read,\n        Metadata.combine(metadata),\n      ),\n      nesteds,',
  ),
  edit(
    'derive keeps the Model it was given',
    '...(options.Model === undefined ? {} : { Model: options.Model }),',
    '',
  ),
]
