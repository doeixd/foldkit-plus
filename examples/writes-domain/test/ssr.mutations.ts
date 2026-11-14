/**
 * First paint from a server render, broken in turn:
 * `pnpm mutate examples/writes-domain/test/ssr.mutations.ts`.
 */
const tests = ['examples/writes-domain/test/ssr.test.ts']

export default [
  {
    name: 'the browser opens its stream without the revisions it was handed',
    edits: [
      {
        file: '../../../packages/remote/src/liveReads.ts',
        find: '        ...(revisions.length === 0 ? {} : { revisions }),\n',
        replace: '',
      },
    ],
    tests,
  },
  {
    name: 'the adapter sends a frame at the revision the page holds',
    edits: [
      {
        file: '../../../packages/remote-domain/src/adapter/layer.ts',
        find: '(revisionOf(binding, frame.state).revision ?? Infinity) > holds',
        replace: '(revisionOf(binding, frame.state).revision ?? Infinity) >= holds',
      },
    ],
    tests,
  },
  {
    name: "a capture leaves out a row's revision",
    edits: [
      {
        file: '../../../packages/remote/src/resume.ts',
        find: '      revision: stored.revision,\n',
        replace: '      revision: undefined,\n',
      },
    ],
    tests,
  },
  {
    name: 'the browser restores nothing the server read',
    edits: [
      {
        file: '../../../packages/remote/src/resume.ts',
        find: '        Result.succeed(domain.store.set(model, restoreRemote(domain.store.get(model), capture))),',
        replace: '        Result.succeed(model),',
      },
    ],
    tests,
  },
  {
    name: 'the page render reads as nobody',
    edits: [
      {
        file: '../../../packages/remote-domain/src/adapter/resume.ts',
        find: '          Layer.provide(config.middleware(principal)),',
        replace: '          Layer.provide(config.middleware(Option.none())),',
      },
      {
        file: '../../../packages/remote-domain/src/adapter/resume.ts',
        find: 'import { Effect, Layer, type Duration, type Option',
        replace: 'import { Effect, Layer, type Duration, Option',
      },
    ],
    tests,
  },
]
