/**
 * WindowList, broken in turn: `pnpm mutate packages/mixins-ui/test/windowList.mutations.ts`.
 * The Model's cases die in the unit tests, the drawing's in the browser's.
 * Placing the list inside the patch that adopts it (`Effect.void` for
 * `Effect.yieldNow` in `Track`) is killed by hand: a hydrating runtime reports
 * the mismatch in `examples/foldkit/domains-plus/e2e/from.e2e.ts`, which
 * `pnpm mutate` does not run.
 */
const file = '../src/windowList.ts'
const unit = ['packages/mixins-ui/test/windowList.test.ts']
const browser = ['packages/mixins-ui/test/windowList.browser.test.ts']
const ssr = ['packages/mixins-ui/test/windowList.ssr.test.ts']

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
    name: "the estimate follows the rows measured without 'mean'",
    edits: [
      {
        file,
        find: "model.unmeasured === 'mean' && measured.length > 0",
        replace: 'measured.length > 0',
      },
    ],
    tests: unit,
  },
  {
    name: "a list is 'mean' unless told otherwise",
    edits: [
      {
        file,
        find: "unmeasured: config.unmeasured ?? 'estimate',",
        replace: "unmeasured: config.unmeasured ?? 'mean',",
      },
    ],
    tests: unit,
  },
  {
    name: 'a row hidden at 0 counts toward the mean',
    edits: [{ file, find: '.filter(height => height > 0)', replace: '' }],
    tests: unit,
  },
  {
    name: 'the mean of no rows replaces the last',
    edits: [
      {
        file,
        find: "model.unmeasured === 'mean' && measured.length > 0",
        replace: "model.unmeasured === 'mean'",
      },
    ],
    tests: unit,
  },
  {
    name: 'keep leaves the mean of the rows it dropped',
    edits: [
      {
        file,
        find: ': withHeights(model, Object.fromEntries(held))',
        replace: ': modifyFields(model, { heights: () => Object.fromEntries(held) })',
      },
    ],
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
        find: "      spacer('end', `${endHeight}px`),",
        replace: "      spacer('end', '0px'),",
      },
    ],
    tests: browser,
  },
  {
    name: 'the start spacer takes no room',
    edits: [
      {
        file,
        find: 'model.from === 0 ? `${startHeight}px` :',
        replace: "model.from === 0 ? '0px' :",
      },
    ],
    tests: browser,
  },
  {
    name: 'the viewport is never read',
    edits: [
      {
        file,
        find: '.pipe(Stream.map(({ top, height }) => Message.Placed({ top, height }))),',
        replace:
          '.pipe(Stream.map(({ top, height }) => Message.Placed({ top: top * 0, height }))),',
      },
    ],
    tests: browser,
  },
  {
    name: 'the rows are never measured',
    edits: [
      {
        file,
        find: '.pipe(Stream.map(({ rows }) => Message.Measured({ rows }))),',
        replace: '.pipe(Stream.drain),',
      },
    ],
    tests: browser,
  },
  {
    name: 'the rows drawn as MeasureRows starts are not read',
    edits: [
      {
        file: '../../primitives/src/state/virtual.ts',
        find: 'return height > 0 ? [{ key, height }] : []',
        replace: 'return []',
      },
    ],
    tests: [...browser, 'packages/primitives/test/virtual-mounts.test.ts'],
  },
  {
    name: 'the start read takes the box an ancestor scales',
    edits: [
      {
        file: '../../primitives/src/state/virtual.ts',
        find: 'const height = borderBlockSize(row)',
        replace: 'const height = row.getBoundingClientRect().height',
      },
    ],
    tests: browser,
  },
  {
    name: "the start read keeps the style's four decimals",
    edits: [
      {
        file: '../../primitives/src/state/virtual.ts',
        find: 'return Math.round(box * 64) / 64',
        replace: 'return box',
      },
    ],
    tests: browser,
  },
  {
    name: 'the start read leaves out the padding',
    edits: [
      {
        file: '../../primitives/src/state/virtual.ts',
        find: "style.boxSizing === 'border-box'",
        replace: 'true',
      },
    ],
    tests: [...browser, 'packages/primitives/test/virtual-mounts.test.ts'],
  },
  {
    name: 'a row of no height is read as it starts',
    edits: [
      {
        file: '../../primitives/src/state/virtual.ts',
        find: 'return height > 0 ? [{ key, height }] : []',
        replace: 'return [{ key, height }]',
      },
    ],
    tests: ['packages/primitives/test/virtual-mounts.test.ts'],
  },
  {
    name: "a Scene's reading skips the page's onMessage",
    edits: [{ file, find: '=> [Track, onMessage(reading)]', replace: '=> [Track, reading]' }],
    tests: unit,
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
  {
    name: 'placing leaves the list opened at its row',
    edits: [{ file, find: 'from: () => 0 }) },', replace: 'from: () => model.from }) },' }],
    tests: unit,
  },
  {
    name: 'a first reading equal to the one assumed leaves the list opened',
    edits: [
      {
        file,
        find: 'height === model.viewport.height && model.from === 0',
        replace: 'height === model.viewport.height',
      },
    ],
    tests: unit,
  },
  {
    name: 'an opened list draws the window of its viewport',
    edits: [
      {
        file,
        find: '  model.from === 0\n    ? visibleRange(',
        replace: '  true\n    ? visibleRange(',
      },
    ],
    tests: unit,
  },
  {
    name: 'a row past the last viewport opens past it',
    edits: [{ file, find: 'const start = Math.min(row, last)', replace: 'const start = row' }],
    tests: unit,
  },
  {
    name: 'from is not checked',
    edits: [{ file, find: "    ['from', from],\n", replace: '' }],
    tests: unit,
  },
  {
    name: 'the previous page is one window back by count',
    edits: [
      {
        file,
        find: 'previous: start > 0 ? Option.some(low) : Option.none(),',
        replace:
          'previous: start > 0 ? Option.some(Math.max(0, start - (end - start))) : Option.none(),',
      },
    ],
    tests: unit,
  },
  {
    name: 'the previous page is the first whose window passes this one',
    edits: [
      {
        file,
        find: 'openedAt(model, keys, middle).end >= start',
        replace: 'openedAt(model, keys, middle).end > start',
      },
    ],
    tests: unit,
  },
  {
    name: 'the first page has a previous',
    edits: [{ file, find: 'previous: start > 0 ?', replace: 'previous: true ?' }],
    tests: unit,
  },
  {
    name: 'the last page has a next',
    edits: [{ file, find: 'next: end < keys.length ?', replace: 'next: true ?' }],
    tests: unit,
  },
  {
    name: 'an opened list draws the rows above its row in their room before it is placed',
    edits: [
      {
        file,
        find: ': `calc(var(${PLACED}, 0) * ${startHeight}px)`,',
        replace: ': `${startHeight}px`,',
      },
    ],
    tests: [...ssr, ...browser],
  },
  {
    name: 'Track never gives the rows above an opened row their room',
    edits: [{ file, find: "  root.style.setProperty(PLACED, '1')\n", replace: '' }],
    tests: browser,
  },
  {
    name: 'placing an opened list scrolls nothing',
    edits: [
      {
        file,
        find: "  if (moved !== 0) window.scrollBy({ top: moved, behavior: 'instant' })\n",
        replace: '',
      },
    ],
    tests: browser,
  },
  {
    name: 'placing scrolls from the window rather than from where the row was',
    edits: [
      {
        file,
        find: 'const before = first?.getBoundingClientRect().top ?? 0',
        replace: 'const before = 0',
      },
    ],
    tests: browser,
  },
  {
    name: 'the recipe leaves the spacers in a page without scripts',
    edits: [
      {
        file: '../src/recipes/windowList.ts',
        find: 'spacer: component(Utilities.scriptedOnly),',
        replace: 'spacer: component(),',
      },
    ],
    tests: ssr,
  },
]
