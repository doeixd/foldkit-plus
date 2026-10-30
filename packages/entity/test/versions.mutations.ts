/**
 * One Entity per identity (#332), each part broken in turn:
 * `pnpm mutate packages/entity/test/versions.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/entity/test/versions.test.ts']
const edit = (name: string, find: string, replace: string) => ({
  name,
  edits: [{ file, find, replace }],
  tests,
})

export default [
  edit(
    'a descriptor keeps the members it was made with',
    '    if (seen !== shape.revision) {\n',
    '    if (seen === -1) {\n',
  ),
  edit('an addition does not move the revision', '  shape.revision += 1\n', ''),
  {
    name: 'relate adds each owner’s relations before checking the next',
    edits: [
      {
        file,
        find: '      additions.push([entity, added])\n',
        replace: '      extend(entity, { relations: added })\n',
      },
      {
        file,
        find: '    for (const [entity, added] of additions) extend(entity, { relations: added })\n',
        replace: '',
      },
    ],
    tests,
  },
  edit(
    'the spec added again is refused',
    "            taken?._tag === 'Derived' &&\n",
    '            false &&\n',
  ),
  edit(
    'another schema over the same derivation is the member',
    '            taken.schema === spec.schema &&\n',
    '',
  ),
  edit(
    'member metadata is dropped from shared members',
    '        if (extra === undefined) return member\n',
    '        return member\n',
  ),
  {
    name: 'a body read through fromRefs reads no link',
    edits: [
      {
        file: '../src/held.ts',
        find: '&& Object.hasOwn(relations, field.key),',
        replace: '&& false,',
      },
    ],
    tests,
  },
  edit(
    'an annotated copy is made again on each change',
    '        if (copied !== undefined) return copied\n',
    '',
  ),
]
