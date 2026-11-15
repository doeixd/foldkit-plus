/**
 * The box section, broken in turn: `pnpm mutate
 * examples/authoring/test/box.mutations.ts`.
 */
const app = '../src/box/app.ts'
const view = '../src/box/view.ts'
const unit = 'examples/authoring/test/box.test.ts'
const page = 'examples/authoring/test/box.browser.test.ts'

export default [
  {
    name: 'moving ignores the grid',
    edits: [
      {
        file: app,
        find: 'const moveLimits: Box.MoveLimits = { bounds: AREA, snap: GRID }',
        replace: 'const moveLimits: Box.MoveLimits = { bounds: AREA }',
      },
    ],
    tests: [unit],
  },
  {
    name: 'moving ignores the grid, on the page',
    edits: [
      {
        file: app,
        find: 'const moveLimits: Box.MoveLimits = { bounds: AREA, snap: GRID }',
        replace: 'const moveLimits: Box.MoveLimits = { bounds: AREA }',
      },
    ],
    tests: [page],
  },
  {
    name: 'moving ignores the bounds',
    edits: [
      {
        file: app,
        find: 'const moveLimits: Box.MoveLimits = { bounds: AREA, snap: GRID }',
        replace: 'const moveLimits: Box.MoveLimits = { snap: GRID }',
      },
    ],
    tests: [unit],
  },
  {
    name: 'moving ignores the bounds, on the page',
    edits: [
      {
        file: app,
        find: 'const moveLimits: Box.MoveLimits = { bounds: AREA, snap: GRID }',
        replace: 'const moveLimits: Box.MoveLimits = { snap: GRID }',
      },
    ],
    tests: [page],
  },
  {
    name: 'resizing ignores the bounds',
    edits: [
      {
        file: app,
        find: 'const resizeLimits: Box.ResizeLimits = { bounds: AREA, snap: GRID, min: MIN }',
        replace: 'const resizeLimits: Box.ResizeLimits = { snap: GRID, min: MIN }',
      },
    ],
    tests: [unit],
  },
  {
    name: 'resizing ignores the bounds, on the page',
    edits: [
      {
        file: app,
        find: 'const resizeLimits: Box.ResizeLimits = { bounds: AREA, snap: GRID, min: MIN }',
        replace: 'const resizeLimits: Box.ResizeLimits = { snap: GRID, min: MIN }',
      },
    ],
    tests: [page],
  },
  {
    name: 'resizing ignores the smallest size',
    edits: [
      {
        file: app,
        find: 'const resizeLimits: Box.ResizeLimits = { bounds: AREA, snap: GRID, min: MIN }',
        replace: 'const resizeLimits: Box.ResizeLimits = { bounds: AREA, snap: GRID }',
      },
    ],
    tests: [unit],
  },
  {
    name: 'resizing ignores the smallest size, on the page',
    edits: [
      {
        file: app,
        find: 'const resizeLimits: Box.ResizeLimits = { bounds: AREA, snap: GRID, min: MIN }',
        replace: 'const resizeLimits: Box.ResizeLimits = { bounds: AREA, snap: GRID }',
      },
    ],
    tests: [page],
  },
  {
    name: 'a drag is measured from the box as it is, not as it began',
    edits: [
      {
        file: app,
        find: 'Box.moveBy(from, dx, dy, moveLimits)',
        replace: 'Box.moveBy(model.rect, dx, dy, moveLimits)',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a cancelled drag keeps where it went',
    edits: [
      {
        file: app,
        find: 'rect: rect => (completed ? rect : from),',
        replace: 'rect: rect => rect,',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a cancelled drag keeps where it went, on the page',
    edits: [
      {
        file: app,
        find: 'rect: rect => (completed ? rect : from),',
        replace: 'rect: rect => rect,',
      },
    ],
    tests: [page],
  },
  {
    name: 'a second drag start replaces the first',
    edits: [{ file: app, find: 'Option.isSome(model.drag)', replace: 'false' }],
    tests: [unit],
  },
  {
    name: 'the resize keys move another corner',
    edits: [
      {
        file: app,
        find: "Box.resize(model.rect, 'se', dx, dy, resizeLimits)",
        replace: "Box.resize(model.rect, 'nw', dx, dy, resizeLimits)",
      },
    ],
    tests: [unit],
  },
  {
    name: 'the box takes no nudge keys',
    edits: [{ file: view, find: '  Behavior.attach(BoxKeys),\n', replace: '' }],
    tests: [page],
  },
  {
    name: 'the handle takes no resize keys',
    edits: [{ file: view, find: '  Behavior.attach(HandleKeys),\n', replace: '' }],
    tests: [page],
  },
  {
    name: 'the box takes no pointer',
    edits: [{ file: view, find: '  Behavior.attach(MovesBox),\n', replace: '' }],
    tests: [page],
  },
  {
    name: 'the handle takes no pointer',
    edits: [{ file: view, find: '  Behavior.attach(ResizesBox),\n', replace: '' }],
    tests: [page],
  },
  {
    name: 'the area is drawn smaller than its bounds',
    edits: [{ file: view, find: "boxSizing: 'content-box',", replace: '' }],
    tests: [page],
  },
]
