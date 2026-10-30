/**
 * Fields named like `Object.prototype`'s members, read and written by name:
 * `pnpm mutate packages/remote/test/protoKey.mutations.ts`.
 */
const tests = ['packages/remote/test/protoKey.test.ts']
const derived = ['packages/remote/test/protoKeyDerived.test.ts']

export default [
  {
    name: 'a written field reads its window through the prototype',
    edits: [
      {
        file: '../src/store.ts',
        find: `    const requested = own(windows, field)
    if (requested`,
        replace: `    const requested = windows?.[field]
    if (requested`,
      },
    ],
    tests,
  },
  {
    name: 'a written field’s window is assigned',
    edits: [
      {
        file: '../src/store.ts',
        find: 'put(nextWindows, field, requested)',
        replace: '(nextWindows[field] = requested)',
      },
    ],
    tests,
  },
  {
    name: 'a field asked for reads its window through the prototype',
    edits: [
      {
        file: '../src/store.ts',
        find: `    const requested = own(windows, field)
    const stored`,
        replace: `    const requested = windows?.[field]
    const stored`,
      },
    ],
    tests,
  },
  {
    name: 'a held field reads its window through the prototype',
    edits: [
      {
        file: '../src/store.ts',
        find: 'const stored = own(value.windows, field)',
        replace: 'const stored = value.windows[field]',
      },
    ],
    tests,
  },
  {
    name: 'a read’s window is assigned',
    edits: [
      {
        file: '../src/model.ts',
        find: 'put(entry.windows, field, windowKey(window))',
        replace: '(entry.windows[field] = windowKey(window))',
      },
    ],
    tests,
  },
  {
    name: 'a selected scalar is assigned to the schema’s fields',
    edits: [
      {
        file: '../src/selection.ts',
        find: 'put(picked, key, entity.fields[key] as AnySchema)',
        replace: '(picked[key] = entity.fields[key] as AnySchema)',
      },
    ],
    tests,
  },
  {
    name: 'a connection’s window is assigned',
    edits: [
      {
        file: '../src/selection.ts',
        find: 'put(connections, name, nested.window)',
        replace: '(connections[name] = nested.window)',
      },
    ],
    tests,
  },
  {
    name: 'a connection’s schema is assigned',
    edits: [
      {
        file: '../src/selection.ts',
        find: 'put(picked, key, nullable(nested.schema as AnySchema))',
        replace: '(picked[key] = nullable(nested.schema as AnySchema))',
      },
    ],
    tests,
  },
  {
    name: 'a connection’s relation is assigned',
    edits: [
      {
        file: '../src/selection.ts',
        find: 'put(relations, name, relationOf(nested))',
        replace: '(relations[name] = relationOf(nested))',
      },
    ],
    tests,
  },
  {
    name: 'a relation’s schema is assigned',
    edits: [
      {
        file: '../src/selection.ts',
        find: 'put(picked, key, nullable(read))',
        replace: '(picked[key] = nullable(read))',
      },
    ],
    tests,
  },
  {
    name: 'a relation’s requirement is assigned',
    edits: [
      {
        file: '../src/selection.ts',
        find: 'put(relations, key, relationOf(nested))',
        replace: '(relations[key] = relationOf(nested))',
      },
    ],
    tests,
  },
  {
    name: 'a field is assembled with the relation the prototype holds',
    edits: [
      {
        file: '../src/selection.ts',
        find: 'const relation = own(requirement.relations, field)',
        replace: 'const relation = requirement.relations?.[field]',
      },
    ],
    tests,
  },
  {
    name: 'an assembled scalar is assigned',
    edits: [
      {
        file: '../src/selection.ts',
        find: 'put(values, aliasedField(field), value.value)',
        replace: '(values[aliasedField(field)] = value.value)',
      },
    ],
    tests,
  },
  {
    name: 'an assembled relation is assigned',
    edits: [
      {
        file: '../src/selection.ts',
        find: 'put(values, aliasedField(field), nested.values)',
        replace: '(values[aliasedField(field)] = nested.values)',
      },
    ],
    tests,
  },
  {
    name: 'a captured value is assigned',
    edits: [
      {
        file: '../src/resume.ts',
        find: 'put(entry.values, field, stored.values[field])',
        replace: '(entry.values[field] = stored.values[field])',
      },
    ],
    tests: tests,
  },
  {
    name: 'a captured field reads its window through the prototype',
    edits: [
      {
        file: '../src/resume.ts',
        find: 'const window = own(stored.windows, field)',
        replace: 'const window = stored.windows[field]',
      },
    ],
    tests: tests,
  },
  {
    name: 'a merged relation is read through the prototype',
    edits: [
      {
        file: '../src/requirement.ts',
        find: 'const existing = own(merged, field)',
        replace: 'const existing = merged[field]',
      },
    ],
    tests: tests,
  },
  {
    name: 'a merged relation is assigned',
    edits: [
      {
        file: '../src/requirement.ts',
        find: 'put(merged, field, existing === undefined ? relation : mergeRelation(existing, relation))',
        replace:
          '(merged[field] = existing === undefined ? relation : mergeRelation(existing, relation))',
      },
    ],
    tests: tests,
  },
  {
    name: 'a Selection.from member is assigned',
    edits: [
      {
        file: '../src/selection.ts',
        find: 'put(\n        spec,',
        replace: 'Reflect.set(\n        spec,',
      },
    ],
    tests: tests,
  },
  {
    name: 'a moved count reads through the prototype',
    edits: [
      {
        file: '../src/mutation.ts',
        find: '(own(move.adds, field) ?? 0)',
        replace: '(move.adds[field] ?? 0)',
      },
    ],
    tests: derived,
  },
  {
    name: 'a moved count is assigned',
    edits: [
      {
        file: '../src/mutation.ts',
        find: 'put(move.adds, field, (own(move.adds, field) ?? 0) + by)',
        replace: '(move.adds[field] = (own(move.adds, field) ?? 0) + by)',
      },
    ],
    tests: derived,
  },
  {
    name: 'a lost find is assigned',
    edits: [
      {
        file: '../src/mutation.ts',
        find: 'put(at(ref, owner).values, field, null)',
        replace: '(at(ref, owner).values[field] = null)',
      },
    ],
    tests: derived,
  },
  {
    name: 'a new find is assigned',
    edits: [
      {
        file: '../src/mutation.ts',
        find: 'put(at(to, owner).values, field, bound.id)',
        replace: '(at(to, owner).values[field] = bound.id)',
      },
    ],
    tests: derived,
  },
  {
    name: 'a new row’s derived member is assigned',
    edits: [
      {
        file: '../src/mutation.ts',
        find: 'put(values, member.field, DerivedBy',
        replace: '(values as Record<string, unknown>)[member.field] = (DerivedBy',
      },
    ],
    tests: derived,
  },
  {
    name: 'a foreseen supplied member is assigned',
    edits: [
      {
        file: '../src/mutation.ts',
        find: '      put(values, key, value)',
        replace: '      values[key] = value',
      },
    ],
    tests: derived,
  },
  {
    name: 'a field an invariant reads is assigned',
    edits: [
      {
        file: '../src/mutation.ts',
        find: '        put(plain, key, value)',
        replace: '        plain[key] = value',
      },
    ],
    tests: derived,
  },
  {
    name: 'a predicted increment is assigned',
    edits: [
      {
        file: '../src/optimistic.ts',
        find: 'put(values, field, predicted.row[field])',
        replace: '(values[field] = predicted.row[field])',
      },
    ],
    tests: derived,
  },
]
