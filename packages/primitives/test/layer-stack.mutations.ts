/**
 * The layer stack's topmost layer owns containment:
 * `pnpm mutate packages/primitives/test/layer-stack.mutations.ts`.
 */
const stack = '../src/dom/layer-stack.ts'
const scope = '../src/dom/focus-scope.ts'
const layers = '../src/dom/layers.ts'
const tests = [
  'packages/primitives/test/layer-stack.browser.test.ts',
  'packages/mixins-ui/test/conformance/dialog.browser.test.ts',
]

export default [
  {
    name: 'an outer scope pulls focus back out of a layer opened beside it',
    edits: [
      { file: scope, find: '            if (LayerStack.isCovered(element)) return\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'an outer HideOutside hides the layers opened over it',
    edits: [
      { file: layers, find: '              ...LayerStack.selectorsAbove(element),\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'opening a layer tells no lower one',
    edits: [{ file: stack, find: '  if (opened) changed()\n', replace: '' }],
    tests,
  },
  {
    name: 'closing a layer tells no lower one',
    edits: [{ file: stack, find: '    changed()\n  }\n}', replace: '  }\n}' }],
    tests,
  },
  {
    name: 'a closed layer stays in the stack',
    edits: [{ file: stack, find: '    layers.splice(layers.indexOf(held), 1)\n', replace: '' }],
    tests,
  },
  {
    name: 'a layer drawn where a lower one hid it is never focused',
    edits: [
      {
        file: layers,
        find: 'Effect.andThen(isolate(), Effect.sync(LayerStack.showed))',
        replace: 'isolate()',
      },
    ],
    tests,
  },
]
