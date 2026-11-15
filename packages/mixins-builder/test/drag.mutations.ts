/**
 * What a drag in the drawn Builder shows and where it lands:
 * `pnpm mutate packages/mixins-builder/test/drag.mutations.ts`.
 */
const view = '../src/index.ts'
const preview = '../../primitives/src/dom/drag-preview.ts'
const mouse = ['packages/mixins-builder/test/drag.browser.test.ts']
const touch = ['packages/mixins-builder/test/drag.touch.browser.test.ts']

export default [
  {
    name: 'a drop lands where the last move was, not where the pointer let go',
    edits: [
      {
        file: view,
        find: 'return Message.DragDropped({ aim: aimOf(fact) })',
        replace: 'return Message.DragDropped({})',
      },
    ],
    tests: mouse,
  },
  {
    name: 'what is carried is drawn but never put in the top layer',
    edits: [
      {
        file: preview,
        find: 'popover.showPopover()',
        replace: 'popover.focus()',
      },
    ],
    tests: mouse,
  },
  {
    name: 'what is carried can be read by assistive technology',
    edits: [
      {
        file: view,
        find: "                h.AriaHidden(true),\n                h.Attribute('popover', 'manual'),",
        replace: "                h.Attribute('popover', 'manual'),",
      },
    ],
    tests: mouse,
  },
  {
    name: 'what is carried takes the pointer',
    edits: [
      {
        file: view,
        find: "        pointerEvents: 'none',\n        willChange: 'transform',",
        replace: "        willChange: 'transform',",
      },
    ],
    tests: mouse,
  },
  {
    name: 'a finger’s preview sits under the finger',
    edits: [
      {
        file: view,
        find: 'calc(var(--fk-drag-y, 0px) - 72px)',
        replace: 'calc(var(--fk-drag-y, 0px) + 12px)',
      },
    ],
    tests: touch,
  },
  {
    name: 'the handle lets the browser scroll under a finger holding it',
    edits: [{ file: view, find: "        touchAction: 'none',\n", replace: '' }],
    tests: touch,
  },
  {
    name: 'the handle is as small as a pointer’s on a touch screen',
    edits: [
      {
        file: view,
        find: "Style.media('(pointer: coarse)', { minInlineSize: '2.75rem', minBlockSize: '2.75rem' }),",
        replace:
          "Style.media('(pointer: coarse)', { minInlineSize: '1.5rem', minBlockSize: '1.5rem' }),",
      },
    ],
    tests: touch,
  },
  {
    name: 'the handle is drawn only while the pointer hovers',
    edits: [
      {
        file: view,
        find: 'onSome: ({ id, block }) => [nodeHandle(h, slots, input, id, block)],',
        replace: 'onSome: () => [],',
      },
    ],
    tests: touch,
  },
  {
    name: 'a command in the menu is not tied to it, so it stays open',
    edits: [
      {
        file: view,
        find: "                h.Attribute('popovertarget', menuId),\n                h.Attribute('popovertargetaction', 'hide'),\n",
        replace: '',
      },
    ],
    tests: touch,
  },
  {
    name: 'the layers do not scroll under a held finger',
    edits: [
      {
        file: view,
        find: '            attribute: `data-${ROW_ATTRIBUTE}`,\n            edgeScroll: {},',
        replace: '            attribute: `data-${ROW_ATTRIBUTE}`,',
      },
    ],
    tests: touch,
  },
  {
    name: 'the canvas does not scroll under a held finger',
    edits: [
      {
        file: view,
        find: "            part: `data-${REGION_ATTRIBUTE}`,\n            edgeScroll: {},\n            toMessage: nodeDrag,\n          }),\n          // The selected node's handle",
        replace:
          "            part: `data-${REGION_ATTRIBUTE}`,\n            toMessage: nodeDrag,\n          }),\n          // The selected node's handle",
      },
    ],
    tests: touch,
  },
]
