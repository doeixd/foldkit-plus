/**
 * Ids read as the page's own nodes (#298), each lookup put back on the plain
 * object in turn: `pnpm mutate packages/builder/test/ownNodes.mutations.ts`.
 */
const builder = '../src/index.ts'
const tests = ['packages/builder/test/builder.test.ts']

export default [
  {
    name: 'a selection reads an inherited key as a node',
    edits: [
      {
        file: builder,
        find: '          return Composition.nodeAt(documentOf(model), message.id) === undefined',
        replace: '          return documentOf(model).nodes[message.id] === undefined',
      },
    ],
    tests,
  },
  {
    name: 'the layers’ focus reads an inherited key as a node',
    edits: [
      {
        file: builder,
        find: '        return Composition.nodeAt(documentOf(next.model), id) === undefined',
        replace: '        return documentOf(next.model).nodes[id] === undefined',
      },
    ],
    tests,
  },
  {
    name: 'an undo keeps a selection on an inherited key',
    edits: [
      {
        file: builder,
        find: '  Option.filter(selected, id => Composition.nodeAt(document, id) !== undefined)',
        replace: '  Option.filter(selected, id => document.nodes[id] !== undefined)',
      },
    ],
    tests,
  },
  {
    name: 'nodeAt reads inherited keys',
    edits: [
      {
        file: '../../composition/src/document.ts',
        find: '(Object.hasOwn(holder.nodes, id) ? holder.nodes[id] : undefined)',
        replace: 'holder.nodes[id]',
      },
    ],
    tests,
  },
]
