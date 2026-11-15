/**
 * First paint from a server render, broken in turn:
 * `pnpm mutate packages/remote-domain/test/adapter/resume.mutations.ts`.
 */
const layer = '../../src/adapter/layer.ts'
const resume = '../../src/adapter/resume.ts'
const tests = ['packages/remote-domain/test/adapter/resume.test.ts']

export default [
  {
    name: 'live sends a frame at the revision the client holds',
    edits: [
      {
        file: layer,
        find: '(revisionOf(binding, frame.state).revision ?? Infinity) > holds',
        replace: '(revisionOf(binding, frame.state).revision ?? Infinity) >= holds',
      },
    ],
    tests,
  },
  {
    name: 'live leaves out a frame newer than the revision the client holds',
    edits: [
      {
        file: layer,
        find: '(revisionOf(binding, frame.state).revision ?? Infinity) > holds',
        replace: 'false',
      },
    ],
    tests,
  },
  {
    name: 'live leaves out the frames of a row held to a receipt at the revision named',
    edits: [
      {
        file: layer,
        find: '                          onSome: () =>\n                            snapshotAt(binding, requirement.id, receipt).pipe(',
        replace:
          '                          onSome: () =>\n                            (holds !== undefined ? Effect.succeedNone : snapshotAt(binding, requirement.id, receipt)).pipe(',
      },
    ],
    tests,
  },
  {
    name: 'the reader reads as someone the request did not resolve to',
    edits: [
      {
        file: resume,
        find: '          principal: Effect.succeed(principal),',
        replace: "          principal: Effect.succeed(Option.some('ada')),",
      },
      {
        file: resume,
        find: 'import { Effect, Layer, type Duration, type Option',
        replace: 'import { Effect, Layer, type Duration, Option',
      },
    ],
    tests,
  },
  {
    name: 'the middleware trusts someone the request did not resolve to',
    edits: [
      {
        file: resume,
        find: '          Layer.provide(config.middleware(principal)),',
        replace: "          Layer.provide(config.middleware(Option.some('ada'))),",
      },
      {
        file: resume,
        find: 'import { Effect, Layer, type Duration, type Option',
        replace: 'import { Effect, Layer, type Duration, Option',
      },
    ],
    tests,
  },
  {
    name: 'a read is not noted',
    edits: [
      {
        file: resume,
        find: 'read: batch => Effect.ensuring(inner.read(batch), noted(named(batch.requests))),',
        replace: 'read: batch => inner.read(batch),',
      },
    ],
    tests,
  },
  {
    name: 'the reader keeps a live stream',
    edits: [
      {
        file: resume,
        find: 'live: () =>\n',
        replace: 'live: request => inner.live(request),\n              lived: () =>\n',
      },
    ],
    tests,
  },
]
