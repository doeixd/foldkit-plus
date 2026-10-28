/**
 * A live hub's re-reads of a per-viewer member, broken in turn:
 * `pnpm mutate packages/remote-server/test/liveViewer.mutations.ts`.
 */
const file = '../src/index.ts'
const tests = ['packages/remote-server/test/liveViewer.test.ts']

export default [
  {
    name: 'readers sharing a key share a read of a per-viewer member',
    edits: [
      {
        file,
        find: "const viewerKey = perViewer ? viewerKeyOf(subscriber.viewer) : ''",
        replace: "const viewerKey = ''",
      },
    ],
    tests,
  },
  {
    name: 'every source is read once per viewer',
    edits: [
      {
        file,
        find: 'const perViewer = (source.perViewer ?? []).length > 0',
        replace: 'const perViewer = true',
      },
    ],
    tests,
  },
]
