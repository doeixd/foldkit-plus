/**
 * The connection and device bundles' `lastError` and `coords` as `Option`s,
 * broken in turn: `pnpm mutate packages/primitives/test/lastError.mutations.ts`.
 */
const noOp = 'packages/primitives/test/no-op.test.ts'
const websocket = 'packages/primitives/test/websocket.test.ts'
const sse = 'packages/primitives/test/sse.test.ts'
const geolocation = 'packages/primitives/test/geolocation.test.ts'
const stored = 'packages/primitives/test/stored.test.ts'

export default [
  {
    name: 'a repeated error held in an Option is a new Model',
    edits: [
      {
        file: '../src/internal.ts',
        find: '(Option.isOption(left) && Option.isOption(right) && Equal.equals(left, right))',
        replace: 'false',
      },
    ],
    tests: [noOp],
  },
  {
    name: 'a socket with an error outstanding reads as open',
    edits: [
      {
        file: '../src/net/websocket.ts',
        find: "model.status === 'open' && Option.isNone(model.lastError)",
        replace: "model.status === 'open'",
      },
    ],
    tests: [websocket],
  },
  {
    name: 'a socket error is never shown',
    edits: [
      {
        file: '../src/net/websocket.ts',
        find: 'Option.match(model.lastError, {',
        replace: 'Option.match(Option.none<string>(), {',
      },
    ],
    tests: [websocket],
  },
  {
    name: 'a stream error is never shown',
    edits: [
      {
        file: '../src/net/sse.ts',
        find: 'Option.match(model.lastError, {',
        replace: 'Option.match(Option.none<string>(), {',
      },
    ],
    tests: [sse],
  },
  {
    name: 'a socket error is stored as an Option, which JSON cannot carry',
    edits: [
      {
        file: '../src/net/websocket.ts',
        find: 'lastError: Schema.OptionFromNullOr(Schema.String),',
        replace: 'lastError: Schema.Option(Schema.String),',
      },
    ],
    tests: [stored],
  },
  {
    name: 'a fix is stored as an Option, which JSON cannot carry',
    edits: [
      {
        file: '../src/device/geolocation.ts',
        find: 'coords: Schema.OptionFromNullOr(Coordinates),',
        replace: 'coords: Schema.Option(Coordinates),',
      },
    ],
    tests: [stored],
  },
  {
    name: 'a fix that has not moved is a new Model',
    edits: [
      {
        file: '../src/device/geolocation.ts',
        find: "model.status === 'ready' &&\n        Option.exists(",
        replace: 'false &&\n        Option.exists(',
      },
    ],
    tests: [noOp, geolocation],
  },
]
