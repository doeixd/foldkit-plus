/**
 * Dropping into the empty Region a drag is over, broken in turn at each layer:
 * `pnpm mutate packages/builder/test/regions.mutations.ts` checks that a test
 * fails for every one.
 */
const primitive = '../../primitives/src/dom/pointer-drag.ts'
const renderer = '../../composition/src/foldkit/index.ts'
const builder = '../src/index.ts'
const view = '../../mixins-builder/src/index.ts'
const dragTests = ['packages/primitives/test/pointer-drag.test.ts']
const rendererTests = ['packages/composition/test/renderer.test.ts']
const builderTests = ['packages/builder/test/builder.test.ts']
const runtimeTests = ['packages/mixins-builder/test/runtime.test.ts']

export default [
  {
    name: 'the part an element names is not read',
    edits: [
      {
        file: primitive,
        find: 'const named = part === undefined ? null : (marked?.getAttribute(part) ?? null)',
        replace: 'const named = null',
      },
    ],
    tests: dragTests,
  },
  {
    name: 'a move between parts of one id is not a new place',
    edits: [
      { file: primitive, find: '                  place?.part === over?.part &&\n', replace: '' },
    ],
    tests: dragTests,
  },
  {
    name: 'an empty Region is drawn as nothing in edit mode',
    edits: [
      {
        file: renderer,
        find: "if (mode === 'view' || count > 0) return [name, drawn]",
        replace: 'return [name, drawn]',
      },
    ],
    tests: rendererTests,
  },
  {
    name: 'a drop aimed at a Region marks no Region',
    edits: [
      {
        file: renderer,
        find: "...(dropRegion === name ? [h.DataAttribute(DROP_ATTRIBUTE, 'inside')] : []),",
        replace: '',
      },
    ],
    tests: rendererTests,
  },
  {
    name: 'the Region a drag is over is not where it goes',
    edits: [
      {
        file: builder,
        find: 'const named = Option.orElse(region, () => regionTaking(catalog, holder.block, dragged.block))',
        replace: 'const named = regionTaking(catalog, holder.block, dragged.block)',
      },
    ],
    tests: builderTests,
  },
  {
    name: 'a Region is marked where the drop went beside its node',
    edits: [
      {
        file: builder,
        find: "region: landed.value.zone === 'inside' ? into : Option.none(),",
        replace: 'region: into,',
      },
    ],
    tests: builderTests,
  },
  {
    name: 'the page’s drag reads no Region',
    edits: [
      {
        file: view,
        find: "            container: 'canvas',\n            attribute: `data-${NODE_ATTRIBUTE}`,\n            part: `data-${REGION_ATTRIBUTE}`,\n",
        replace:
          "            container: 'canvas',\n            attribute: `data-${NODE_ATTRIBUTE}`,\n",
      },
    ],
    tests: runtimeTests,
  },
  {
    name: 'a palette tile’s drag reads no Region',
    edits: [
      {
        file: view,
        find: "            targets: { attribute: `data-${NODE_ATTRIBUTE}`, within: '[data-builder-canvas]' },\n            part: `data-${REGION_ATTRIBUTE}`,\n",
        replace:
          "            targets: { attribute: `data-${NODE_ATTRIBUTE}`, within: '[data-builder-canvas]' },\n",
      },
    ],
    tests: runtimeTests,
  },
]
