/**
 * SwipeActions' release and keys, broken in turn: `pnpm mutate
 * packages/primitives/test/swipe-actions.mutations.ts`.
 */
const file = '../src/interaction/swipe-actions.ts'
const tests = ['packages/primitives/test/swipe-actions.test.ts']

export default [
  {
    name: 'the half-way share is ignored',
    edits: [{ file, find: 'Math.abs(x) >= room / 2', replace: 'true' }],
    tests,
  },
  {
    name: 'a flick is ignored',
    edits: [{ file, find: 'Math.abs(release.velocityX) > args.flick', replace: 'false' }],
    tests,
  },
  {
    name: 'a flick back opens',
    edits: [{ file, find: 'sideOf(release.velocityX, release.rtl) === side', replace: 'true' }],
    tests,
  },
  {
    name: 'a long swipe never runs the action',
    edits: [{ file, find: 'if (args.full && ', replace: 'if (false && ' }],
    tests,
  },
  {
    name: 'a swipe past a side with no actions opens',
    edits: [{ file, find: 'if (x === 0 || room <= 0)', replace: 'if (x === 0)' }],
    tests,
  },
  {
    name: 'an open row is measured from closed',
    edits: [
      { file, find: 'onSome: side => sign(side) * widthOf(side),', replace: 'onSome: () => 0,' },
    ],
    tests,
  },
  {
    name: 'right to left reads left to right',
    edits: [
      { file, find: "(x > 0 !== rtl ? 'start' : 'end')", replace: "(x > 0 ? 'start' : 'end')" },
    ],
    tests,
  },
  {
    name: 'opening an open side hands back a copy',
    edits: [
      {
        file,
        find: 'Option.contains(model.open, side) ? model :',
        replace: 'false ? model :',
      },
    ],
    tests,
  },
  {
    name: 'Escape on a closed row is taken',
    edits: [
      {
        file,
        find: 'return Option.isSome(open)\n          ?',
        replace: 'return true\n          ?',
      },
    ],
    tests,
  },
  {
    name: 'the arrow that reveals the open side closes it',
    edits: [{ file, find: 'side === reveals ? Option.none()', replace: 'false ? Option.none()' }],
    tests,
  },
]
