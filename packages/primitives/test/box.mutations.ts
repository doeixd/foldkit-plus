/**
 * Box's limits and keys, broken in turn: `pnpm mutate
 * packages/primitives/test/box.mutations.ts`.
 */
const file = '../src/state/box.ts'
const tests = ['packages/primitives/test/box.test.ts']

export default [
  {
    name: 'each box in a group stops alone at the edge',
    edits: [
      {
        file,
        find: 'const highX = Math.min(...moving.map(({ box }) => area.right - box.width - box.x))',
        replace: 'const highX = area.right - first.box.width - first.box.x',
      },
    ],
    tests,
  },
  {
    name: 'a group wider than the area is pushed out of it',
    edits: [{ file, find: 'Math.max(lowX, highX)', replace: 'highX' }],
    tests,
  },
  {
    name: 'a move on one axis snaps the other',
    edits: [
      {
        file,
        find: 'let moveY = dy === 0 ? 0 :',
        replace: 'let moveY =',
      },
    ],
    tests,
  },
  {
    name: 'the grid lands the last box, not the first',
    edits: [
      {
        file,
        find: 'snapTo(first.box.x + dx, limits.snap) - first.box.x',
        replace: 'snapTo(moving[moving.length - 1]!.box.x + dx, limits.snap) - first.box.x',
      },
    ],
    tests,
  },
  {
    name: 'an inherited name is a box to move',
    edits: [
      {
        file,
        find: 'const box = Object.hasOwn(boxes, id) ? boxes[id] : undefined',
        replace: 'const box = boxes[id]',
      },
    ],
    tests,
  },
  {
    name: 'a no-op hands back a copy',
    edits: [{ file, find: 'if (moveX === 0 && moveY === 0) return boxes', replace: '' }],
    tests,
  },
  {
    name: 'an infinite delta moves a box',
    edits: [{ file, find: '!Number.isFinite(dx + dy)', replace: 'false' }],
    tests,
  },
  {
    name: 'a resize that stays infinite is returned',
    edits: [
      {
        file,
        find: 'return finite(box) && !sameBox(box, from) ? box : from',
        replace: 'return sameBox(box, from) ? from : box',
      },
    ],
    tests,
  },
  {
    name: 'an unchanged resize returns a copy',
    edits: [
      {
        file,
        find: 'return finite(box) && !sameBox(box, from) ? box : from',
        replace: 'return finite(box) ? box : from',
      },
    ],
    tests,
  },
  {
    name: 'the west edge grows with the delta',
    edits: [{ file, find: 'west ? from.width - stepX', replace: 'west ? from.width + stepX' }],
    tests,
  },
  {
    name: 'the opposite edge moves when the minimum is hit',
    edits: [{ file, find: 'x: west ? anchorX - width :', replace: 'x: west ? from.x + stepX :' }],
    tests,
  },
  {
    name: 'the area does not limit growth',
    edits: [
      {
        file,
        find: 'const roomX = Math.min(max.width, west ? anchorX - left : right - anchorX)',
        replace: 'const roomX = max.width',
      },
    ],
    tests,
  },
  {
    name: 'the grid is applied after the limits, not before',
    edits: [
      {
        file,
        find: 'snapTo(from.x + from.width + dx, limits.snap) - (from.x + from.width)',
        replace: 'dx',
      },
    ],
    tests,
  },
  {
    name: 'a corner always follows the width',
    edits: [
      {
        file,
        find: 'if (Math.abs(width / from.width - 1) >= Math.abs(height / from.height - 1)) {',
        replace: 'if (true) {',
      },
    ],
    tests,
  },
  {
    name: 'an edge handle reads the other axis',
    edits: [
      {
        file,
        find: 'if ((x !== 0 && !alongX) || (y !== 0 && !alongY)) return Option.none()',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'Shift does not take the larger step',
    edits: [{ file, find: 'press.shift ? (largeStep ?? step * 10) : step', replace: 'step' }],
    tests,
  },
  {
    name: 'a plain arrow nudges',
    edits: [{ file, find: '|| !press.alt ||', replace: '||' }],
    tests,
  },
  {
    name: 'a browser chord nudges',
    edits: [
      {
        file,
        find: '!press.alt || press.ctrl || press.meta) return Option.none()',
        replace: '!press.alt) return Option.none()',
      },
    ],
    tests,
  },
  {
    name: 'a west handle End grows the wrong way',
    edits: [
      { file, find: "const growX = handle.includes('w') ? -1 : 1", replace: 'const growX = 1' },
    ],
    tests,
  },
]
