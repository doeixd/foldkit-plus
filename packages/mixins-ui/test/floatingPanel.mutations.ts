/**
 * The floating panel, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/floatingPanel.mutations.ts` checks
 * that a test fails for every one.
 */
const file = '../src/floatingPanel.ts'
const unit = 'packages/mixins-ui/test/floatingPanel.test.ts'
const browser = 'packages/mixins-ui/test/floatingPanel.browser.test.ts'

export default [
  {
    name: 'a move leaves the viewport',
    edits: [
      {
        file,
        find: 'x: bounded ? within(x, 0, boundary.width - from.width) : x,',
        replace: 'x,',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'a move is kept in an unmeasured viewport',
    edits: [
      {
        file,
        find: 'limits.overflow !== true && boundary.width > 0 && boundary.height > 0',
        replace: 'limits.overflow !== true',
      },
    ],
    tests: [unit],
  },
  {
    name: 'overflow is refused',
    edits: [
      {
        file,
        find: 'limits.overflow !== true && boundary.width > 0',
        replace: 'boundary.width > 0',
      },
    ],
    tests: [unit],
  },
  {
    name: 'the grid snaps nothing',
    edits: [{ file, find: 'grid > 0 ? Math.round(value / grid) * grid : value', replace: 'value' }],
    tests: [unit],
  },
  {
    name: 'an end edge grows past the viewport',
    edits: [
      {
        file,
        find: 'const reach = bounded ? room - start : Infinity',
        replace: 'const reach = Infinity',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a start edge moves the far edge too',
    edits: [{ file, find: 'return [end - next, next]', replace: 'return [start + delta, next]' }],
    tests: [unit, browser],
  },
  {
    name: 'a resize goes below the least size',
    edits: [
      {
        file,
        find: 'return [start, within(size + delta, least, Math.min(most, reach))]',
        replace: 'return [start, within(size + delta, 0, Math.min(most, reach))]',
      },
    ],
    tests: [unit],
  },
  {
    name: 'minimized, it resizes',
    edits: [
      {
        file,
        find: "(model.stage === 'minimized' && handle === 'move')",
        replace: "model.stage === 'minimized'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'maximized, it moves',
    edits: [
      {
        file,
        find: "model.stage === 'default' || (model.stage === 'minimized' && handle === 'move')",
        replace: "model.stage !== 'minimized' || handle === 'move'",
      },
    ],
    tests: [unit],
  },
  {
    name: 'a smaller viewport leaves the panel outside',
    edits: [
      {
        file,
        find: "const rect = moveRect(model.rect, 'move', 0, 0, boundary, limits)",
        replace: 'const rect = model.rect',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a drag moves from the last move',
    edits: [
      {
        file,
        find: 'placed(model, moveRect(from, handle, deltaX, deltaY, model.boundary, limits)),',
        replace:
          'placed(model, moveRect(model.rect, handle, deltaX, deltaY, model.boundary, limits)),',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a press inside raises nothing',
    edits: [
      {
        file,
        find: 'Activated: () => ({ model, outMessage: Raised.make({ id: model.id }) }),',
        replace: 'Activated: () => ({ model }),',
      },
    ],
    tests: [unit, browser],
  },
  {
    name: 'raising the topmost makes a new order',
    edits: [{ file, find: 'order[order.length - 1] === id ? order :', replace: '' }],
    tests: [unit],
  },
  {
    name: 'close gives focus to nothing',
    edits: [
      { file, find: 'onSome: elementId => [Focus({ elementId })],', replace: 'onSome: () => [],' },
    ],
    tests: [unit, browser],
  },
  {
    name: 'focus lands nowhere',
    edits: [{ file, find: 'document.getElementById(elementId)?.focus()', replace: '' }],
    tests: [browser],
  },
  {
    name: 'Shift takes the same step',
    edits: [{ file, find: 'modifiers.shiftKey ? step * 5 : step', replace: 'step' }],
    tests: [unit, browser],
  },
  {
    name: 'right to left, the keys resize from the bottom right',
    edits: [{ file, find: "options.direction === 'rtl' ? 'sw' : 'se'", replace: "'se'" }],
    tests: [unit, browser],
  },
  {
    name: 'a press inside sends nothing',
    edits: [
      { file, find: 'h.OnPointerDown(() => Option.some(send(Message.Activated()))),', replace: '' },
    ],
    tests: [unit],
  },
  {
    name: 'minimized, the body shows',
    edits: [{ file, find: "stage === 'minimized' ? [h.Hidden(true)] : []", replace: '[]' }],
    tests: [unit, browser],
  },
  {
    name: 'the rect is the content box',
    edits: [{ file, find: "boxSizing: 'border-box', ", replace: '' }],
    tests: [browser],
  },
  {
    name: 'every panel is topmost',
    edits: [
      { file, find: 'const topmost = place === order.length - 1', replace: 'const topmost = true' },
    ],
    tests: [unit, browser],
  },
  {
    name: 'every panel stacks at one level',
    edits: [
      { file, find: 'zIndex: String(BASE_LAYER + place)', replace: 'zIndex: String(BASE_LAYER)' },
    ],
    tests: [browser],
  },
  {
    name: 'maximized keeps its rect',
    edits: [
      {
        file,
        find: "const placement =\n    stage === 'maximized'",
        replace: 'const placement =\n    false',
      },
    ],
    tests: [browser],
  },
  {
    name: 'maximized, the drag trigger still drags',
    edits: [
      {
        file,
        find: "const draggable = options.draggable !== false && stage !== 'maximized'",
        replace: 'const draggable = options.draggable !== false',
      },
    ],
    tests: [unit],
  },
  {
    name: 'a panel draws without a title',
    edits: [{ file, find: "if (options.title.trim() === '')", replace: 'if (false)' }],
    tests: [unit],
  },
]
