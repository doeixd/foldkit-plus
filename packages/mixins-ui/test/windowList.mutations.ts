/**
 * WindowList, broken in turn: `pnpm mutate packages/mixins-ui/test/windowList.mutations.ts`.
 * The Model's cases die in the unit tests, the drawing's in the browser's.
 */
const file = '../src/windowList.ts'
const unit = ['packages/mixins-ui/test/windowList.test.ts']
const browser = ['packages/mixins-ui/test/windowList.browser.test.ts']

export default [
  {
    name: 'an unchanged viewport makes a new Model',
    edits: [
      {
        file,
        find: 'top === model.viewport.top && height === model.viewport.height',
        replace: 'false',
      },
    ],
    tests: unit,
  },
  {
    name: 'a height already held makes a new Model',
    edits: [
      {
        file,
        find: '!(Object.hasOwn(model.heights, key) && model.heights[key] === height),',
        replace: 'true,',
      },
    ],
    tests: unit,
  },
  {
    name: 'a non-finite height is filed',
    edits: [{ file, find: '          Number.isFinite(height) &&\n', replace: '' }],
    tests: unit,
  },
  {
    name: 'a negative height is filed',
    edits: [{ file, find: '          height >= 0 &&\n', replace: '' }],
    tests: unit,
  },
  {
    name: 'keep always returns the Model',
    edits: [{ file, find: 'return held.length === entries.length', replace: 'return true' }],
    tests: unit,
  },
  {
    name: 'keep always makes a new Model',
    edits: [{ file, find: 'return held.length === entries.length', replace: 'return false' }],
    tests: unit,
  },
  {
    name: 'the viewport above the list counts as over it',
    edits: [
      {
        file,
        find: 'Math.max(1, model.viewport.height + Math.min(0, model.viewport.top)),',
        replace: 'model.viewport.height,',
      },
    ],
    tests: unit,
  },
  {
    name: 'a list wholly below the viewport draws nothing',
    edits: [
      {
        file,
        find: 'Math.max(1, model.viewport.height + Math.min(0, model.viewport.top)),',
        replace: 'Math.max(0, model.viewport.height + Math.min(0, model.viewport.top)),',
      },
    ],
    tests: unit,
  },
  {
    name: 'the end spacer takes no room',
    edits: [
      {
        file,
        find: "      spacer('end', endHeight),",
        replace: "      spacer('end', 0),",
      },
    ],
    tests: browser,
  },
  {
    name: 'the start spacer takes no room',
    edits: [
      {
        file,
        find: "      spacer('start', startHeight),",
        replace: "      spacer('start', 0),",
      },
    ],
    tests: browser,
  },
  {
    name: 'the viewport is never read',
    edits: [
      {
        file,
        find: 'onMessage(Message.Placed({ top, height })),',
        replace: 'onMessage(Message.Placed({ top: top * 0, height })),',
      },
    ],
    tests: browser,
  },
  {
    name: 'rows carry no key to be measured by',
    edits: [{ file, find: '            h.Attribute(ROW_KEY, key),\n', replace: '' }],
    tests: browser,
  },
  {
    name: "a row's content margins escape its measure",
    edits: [{ file, find: "            h.Style({ display: 'flow-root' }),\n", replace: '' }],
    tests: browser,
  },
]
