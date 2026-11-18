# Traps: external APIs and protocols

Read before writing or testing an adapter for a library or protocol we do not own (Agent Native, WebMCP, a wire client), or a schema boundary an agent calls.

- **Compile adapters against the real peer types.** The Agent Native README
  registration did not type-check: its tool requires an object schema, while
  our local descriptor only promised `Record<string, unknown>`.

- **Read the spec before writing the client, and again before writing its fake.**
  The WebMCP adapter passed the registration signal on the tool descriptor
  instead of in `registerTool`'s second argument, so unregistering did nothing.
  The test fake took one argument and asserted on `descriptor.signal`, so it
  confirmed the mistake instead of catching it. A fake authored from the same
  assumption as the code tests nothing. Make it reject what the real thing
  rejects.

- **Make the wire carry every field the client sends, with the same types.**
  `RemoteClient.live` sends `{ requirements, after }`, but the `LiveRequirement`
  payload omitted `after` and `LivePatch.cursor` was a `string` while the client
  cursor is numeric, so a real server could never answer the client's own call.
  The adapter is cast, so only diffing the client's request/response types against
  the payload/success schemas catches it.

- **Upstream's anchor portals by default and burns without layout.**
  `anchorSetup` relocates the node into a portal root (`portal ?? true`), so
  the runtime that drew it patches a stranger and crashes; and under jsdom's
  zero geometry it burns ~35s (portal or locked) where the same open takes
  milliseconds without it. Pass `portal: false` to keep the node, drive the
  config in tests instead of the clock, and prefer a placing Behavior that
  never relocates for popups placed once.


- **Check the output, not just that the call returned.** `defineAction` accepts
  four different schema forms without complaint; three of them advertise a tool
  with no parameters at all. An API that takes your input and quietly produces an
  empty result is worse than one that throws.
- **Enforce what you advertise.** Deriving a JSON Schema that says
  `additionalProperties: false` is not validation; the decoder has to agree.
- **Keep intermediate validators strict too.** Agent Native's Standard Schema
  stripped excess fields before dispatch, bypassing its strict decoder. Pass
  `parseOptions: { onExcessProperty: 'error' }` to `toStandardSchemaV1`.
- **Type a boundary from the side the runtime consumes.** Dispatch decodes, so
  its input type is the schema's *encoded* side. Typing it from the decoded side
  accepted `{value: 42}` and rejected the `{value: '42'}` that works.
