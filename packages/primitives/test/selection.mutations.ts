const tests = ['packages/primitives/test/selection.test.ts']
const file = '../src/interaction/selection.ts'

export default [
  {
    name: 'a single selection accepts multiple distinct ids',
    edits: [
      {
        file,
        find: "if (args.mode === 'single' && selected.length > 1) return { model }",
        replace: "if (args.mode === 'single' && selected.length > 2) return { model }",
      },
    ],
    tests,
  },
  {
    name: 'a range keeps what the previous range added',
    edits: [
      {
        file,
        find: 'const kept = model.selected.filter(other => !before.has(other))',
        replace: 'const kept = model.selected.filter(other => !before.has(other) || true)',
      },
    ],
    tests,
  },
  {
    name: 'a range forgets ids picked before it that lie inside it',
    edits: [
      {
        file,
        find: 'const added = between(order, model.anchor, id).filter(other => !keptSet.has(other))',
        replace: 'const added = between(order, model.anchor, id)',
      },
    ],
    tests,
  },
  {
    name: 'activating does not forget the range',
    edits: [
      {
        file,
        find: `          anchor: id,
          ranged: [],`,
        replace: `          anchor: id,
          ranged: model.ranged,`,
      },
    ],
    tests,
  },
  {
    name: 'Replaced does not forget the range',
    edits: [
      {
        file,
        find: 'return sameIds(selected, model.selected) && model.ranged.length === 0',
        replace: 'return sameIds(selected, model.selected)',
      },
    ],
    tests,
  },
  {
    name: 'a repeated range is not a no-op',
    edits: [
      {
        file,
        find: `      return sameIds(selected, model.selected) &&
        sameIds(added, model.ranged) &&
        anchor === model.anchor
        ? { model }`,
        replace: `      return false
        ? { model }`,
      },
    ],
    tests,
  },
]
