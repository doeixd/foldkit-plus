/**
 * Where the layer, write and live capabilities are installed (#378), each install taken out:
 * `pnpm mutate packages/remote/test/capability.mutations.ts`.
 */
const tests = ['packages/remote/test/capability.test.ts']
const index = '../src/index.ts'
const overlay = '../src/overlay.ts'
const live = '../src/live.ts'
const liveReads = '../src/liveReads.ts'

export default [
  {
    name: 'a registered mutation installs nothing',
    edits: [
      {
        file: index,
        find: '  for (const mutation of definition.mutations) mutation[Installs](capabilities)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a mutation installs no write capability',
    edits: [
      {
        file: '../src/writes.ts',
        find: '  capabilities.writes = Option.some(writes)\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'a mutation installs the write capability without the layers it shows',
    edits: [{ file: '../src/writes.ts', find: '  installLayers(capabilities)\n', replace: '' }],
    tests,
  },
  {
    name: 'live reads install no layers, which a live insert shows',
    edits: [
      {
        file: liveReads,
        find: '  installLayers(capabilities)\n  capabilities.live',
        replace: '  capabilities.live',
      },
    ],
    tests,
  },
  {
    name: 'live reads install no live capability',
    edits: [
      { file: liveReads, find: '  capabilities.live = Option.some(liveReads)\n', replace: '' },
    ],
    tests,
  },
  {
    name: 'a row read live installs nothing',
    edits: [
      {
        file: live,
        find: '): Projection<AppModel, RemoteData<Value>> => {\n  installLive(domain[Capability])\n',
        replace: '): Projection<AppModel, RemoteData<Value>> => {\n',
      },
    ],
    tests,
  },
  {
    name: 'a list read live installs nothing',
    edits: [
      {
        file: live,
        find: '): QueryProjection<unknown, unknown, string, unknown> {\n  installLive(domain[Capability])\n',
        replace: '): QueryProjection<unknown, unknown, string, unknown> {\n',
      },
    ],
    tests: [...tests, 'packages/remote/test/liveBelongs.test.ts'],
  },
  {
    name: 'observeLive installs nothing',
    edits: [{ file: live, find: '  installLive(bound[Capability])\n', replace: '' }],
    tests,
  },
  {
    name: 'an overlay installs nothing',
    edits: [
      {
        file: overlay,
        find: "  installLayers(domain[Capability])\n  return domain.reduce(model, { _tag: 'OverlayShown'",
        replace: "  return domain.reduce(model, { _tag: 'OverlayShown'",
      },
    ],
    tests,
  },
  {
    name: 'a lift installs nothing',
    edits: [
      {
        file: overlay,
        find: "  installLayers(domain[Capability])\n  return domain.reduce(model, { _tag: 'OverlayLifted'",
        replace: "  return domain.reduce(model, { _tag: 'OverlayLifted'",
      },
    ],
    tests,
  },
  {
    name: 'Remote.mutateInto installs nothing',
    edits: [{ file: index, find: '    mutation[Installs](capabilities)\n', replace: '' }],
    tests,
  },
  {
    name: 'a read with no layer asks the capability anyway',
    edits: [
      {
        file: '../src/capability.ts',
        find: '  optimistic.layers.length === 0\n    ? entities\n',
        replace: '  false\n    ? entities\n',
      },
    ],
    tests,
  },
]
