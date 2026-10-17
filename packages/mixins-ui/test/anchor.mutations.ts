/**
 * The anchor adapter and the top layer, broken in turn:
 * `pnpm mutate packages/mixins-ui/test/anchor.mutations.ts` checks that a
 * test fails for every one.
 */
const unit = ['packages/mixins-ui/test/anchor.test.ts']

export default [
  {
    name: 'the top layer drops the wrapped Mount',
    edits: [
      {
        file: '../src/anchor.ts',
        find: '): Mount.MountAction<Message, E> => ({\n  ...action,',
        replace: '): Mount.MountAction<Message, E> => ({\n  name: action.name,',
      },
    ],
    tests: unit,
  },
  {
    name: 'the top layer never shows its panel',
    edits: [
      {
        file: '../src/anchor.ts',
        find: '        element.showPopover()\n        shown.add(element)',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'the top layer never hides its panel',
    edits: [
      {
        file: '../src/anchor.ts',
        find: '          shown.delete(element)\n          element.hidePopover()',
        replace: '',
      },
    ],
    tests: unit,
  },
  {
    name: 'the top layer shows an element without the popover attribute',
    edits: [
      {
        file: '../src/anchor.ts',
        find: "typeof element.showPopover === 'function' &&\n  element.hasAttribute('popover')",
        replace: "typeof element.showPopover === 'function'",
      },
    ],
    tests: unit,
  },
  {
    name: 'the top layer drops the wrapped Mount’s stream',
    edits: [
      {
        file: '../src/anchor.ts',
        find: 'heldInTopLayer(element).pipe(Effect.as(action.f(element, viewStateChanges)))',
        replace: 'heldInTopLayer(element).pipe(Effect.as(Stream.empty))',
      },
    ],
    tests: unit,
  },
]
