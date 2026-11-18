# Traps: external APIs and protocols

Read before writing or testing an adapter for a library or protocol we do not own (Agent Native, WebMCP, a wire client), or a schema boundary an agent calls.

- **Compile adapters against the real peer types, and make fakes reject what the real thing rejects.**
  The Agent Native registration did not type-check (its tool needs an object schema; ours promised `Record<string, unknown>`). The WebMCP adapter passed the signal on the descriptor instead of in `registerTool`'s second argument, so unregistering did nothing, and a one-argument fake asserting `descriptor.signal` confirmed the mistake. Read the spec before the client and again before its fake.
- **Make the wire carry every field the client sends, with the same types.**
  `RemoteClient.live` sends `{ requirements, after }` but `LiveRequirement` omitted `after`, and `LivePatch.cursor` was a `string` against a numeric client cursor, so a real server could never answer. The adapter is cast: diff the client's request/response types against the payload/success schemas.
- **Pass `portal: false` to upstream's anchor.**
  `anchorSetup` relocates the node into a portal root (`portal ?? true`), so the runtime that drew it patches a stranger and crashes, and under jsdom's zero geometry it burns about 35s (portal or locked) against milliseconds without. Drive the config in tests, not the clock; prefer a placing Behavior that never relocates for popups placed once.
- **Check what a schema boundary produces, not that the call returned; enforce what you advertise.**
  `defineAction` accepts four schema forms and three advertise a tool with no parameters. A JSON Schema saying `additionalProperties: false` is not validation: the decoder has to agree.
- **Keep intermediate validators strict, and type a boundary from the side the runtime consumes.**
  Agent Native's Standard Schema stripped excess fields before dispatch, bypassing the strict decoder: pass `parseOptions: { onExcessProperty: 'error' }` to `toStandardSchemaV1`. Dispatch decodes, so its input type is the schema's encoded side (typed decoded, it accepted `{value: 42}` and rejected the working `{value: '42'}`).
