/**
 * A drag onto several regions: `pnpm mutate packages/primitives/test/dragTargets.mutations.ts`.
 */
const file = '../src/dom/pointer-drag.ts'
const tests = ['packages/primitives/test/pointer-drag.test.ts']

export default [
  {
    name: 'only the first target region is a place',
    edits: [
      {
        file,
        find: "const lands = targets ?? [{ attribute, within: '' }]",
        replace: "const lands = targets?.slice(0, 1) ?? [{ attribute, within: '' }]",
      },
    ],
    tests,
  },
  {
    name: 'every region’s marked descendants are read by the first one’s attribute',
    edits: [
      {
        file,
        find: 'landsOn: land.attribute,',
        replace: 'landsOn: lands[0]!.attribute,',
      },
    ],
    tests,
  },
  {
    name: 'a marked descendant outside its region is a place',
    edits: [
      {
        file,
        find: 'if (marked !== null && region.contains(marked))',
        replace: 'if (marked !== null)',
      },
    ],
    tests,
  },
]
