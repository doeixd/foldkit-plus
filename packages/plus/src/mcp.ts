/**
 * `npx foldkit-plus mcp`: the docs command as two tools of a Model Context
 * Protocol server over stdio. The transport is one JSON-RPC message per line
 * (https://modelcontextprotocol.io/specification/2025-06-18/basic/transports),
 * and a server that offers only tools needs `initialize`, `ping`, `tools/list`
 * and `tools/call`, so this answers those by hand rather than bundling the SDK.
 * Pure: `reply` takes a line and returns the line to write, if any.
 */
import { Option, Schema } from 'effect'

/** What a tool returns: text, and whether it is a failure the model should read. */
export interface ToolResult {
  readonly text: string
  readonly isError: boolean
}

/** The work behind the tools, which the CLI does against the project it runs in. */
export interface Serve {
  readonly version: string
  readonly search: (query: string) => ToolResult
  readonly outline: (topic: Option.Option<string>) => ToolResult
}

/** The revisions this server speaks, newest first. */
const VERSIONS = ['2025-11-25', '2025-06-18', '2025-03-26', '2024-11-05']

// A tool's arguments refuse what its advertised schema does not name; the
// protocol's own messages carry fields this server does not read (`_meta`,
// `capabilities`), which pass.
const strict = { onExcessProperty: 'error' } as const
const decode = <S extends Schema.ConstraintDecoder<unknown>>(
  schema: S,
  value: unknown,
  options = {},
) => Schema.decodeUnknownOption(schema)(value, options)

/** A tool whose advertised input schema is derived from the one its arguments are decoded with. */
const tool = <S extends Schema.ConstraintDecoder<unknown> & Schema.Constraint>(definition: {
  readonly name: string
  readonly description: string
  readonly input: S
  readonly run: (input: S['Type'], serve: Serve) => ToolResult
}) => ({
  name: definition.name,
  description: definition.description,
  inputSchema: Schema.toJsonSchemaDocument(definition.input, strict).schema,
  call: (input: unknown, serve: Serve) =>
    Option.map(decode(definition.input, input, strict), decoded => definition.run(decoded, serve)),
})

export const tools = [
  tool({
    name: 'search_docs',
    description:
      "Searches the docs of the Foldkit Plus packages installed in this project (each package's README, and the foldkit-plus skill if installed), at the installed versions. A symbol such as `Remote.make` or `RemoteData` also returns its declaration from the installed types. Returns the three best sections as Markdown, each with its file and line.",
    input: Schema.Struct({
      query: Schema.String.annotate({
        description: 'A symbol (`Data.preload`) or words (`optimistic delete`).',
      }).check(Schema.isNonEmpty()),
    }),
    run: ({ query }, serve) => serve.search(query),
  }),
  tool({
    name: 'outline_docs',
    description:
      'Without a topic, lists the installed Foldkit Plus documents and their topics. With one (`remote`, `sync`, `skill`), returns the headings of each document on it as an outline, with line numbers.',
    input: Schema.Struct({
      topic: Schema.optionalKey(
        Schema.String.annotate({
          description: "A package's name without `foldkit-` (`remote`), or a skill file's.",
        }),
      ),
    }),
    run: ({ topic }, serve) => serve.outline(Option.fromNullishOr(topic)),
  }),
]

const Message = Schema.Struct({
  jsonrpc: Schema.Literal('2.0'),
  id: Schema.optionalKey(Schema.Union([Schema.String, Schema.Number])),
  method: Schema.String,
  params: Schema.optionalKey(Schema.Unknown),
})
const Initialize = Schema.Struct({ protocolVersion: Schema.String })
const Call = Schema.Struct({ name: Schema.String, arguments: Schema.optionalKey(Schema.Unknown) })

type Outcome = { readonly result: unknown } | { readonly error: { code: number; message: string } }

const respond = (id: unknown, outcome: Outcome) =>
  Option.some(JSON.stringify({ jsonrpc: '2.0', id, ...outcome }))

/** The result of `tools/call`, or why its params are refused. */
const called = (params: unknown, serve: Serve): Outcome =>
  Option.match(decode(Call, params), {
    onNone: () => ({ error: { code: -32602, message: 'Invalid params: expected `name`' } }),
    onSome: ({ name, arguments: input = {} }) =>
      Option.match(Option.fromNullishOr(tools.find(each => each.name === name)), {
        onNone: () => ({ error: { code: -32602, message: `Unknown tool: ${name}` } }),
        onSome: found =>
          Option.match(found.call(input, serve), {
            onNone: () => ({
              error: {
                code: -32602,
                message: `Invalid arguments for ${name}: ${JSON.stringify(found.inputSchema)}`,
              },
            }),
            onSome: result => ({
              result: { content: [{ type: 'text', text: result.text }], isError: result.isError },
            }),
          }),
      }),
  })

/** The line to write back for one received line; a notification gets none. */
export const reply = (line: string, serve: Serve): Option.Option<string> => {
  let parsed: unknown
  try {
    parsed = JSON.parse(line)
  } catch {
    return respond(null, { error: { code: -32700, message: 'Parse error' } })
  }
  const message = decode(Message, parsed)
  if (Option.isNone(message))
    return respond(null, { error: { code: -32600, message: 'Invalid Request' } })
  const { id, method, params } = message.value
  if (id === undefined) return Option.none()
  // `method` is the client's string: anything not listed is answered as unknown.
  switch (method) {
    case 'initialize':
      return respond(
        id,
        Option.match(decode(Initialize, params), {
          onNone: () => ({
            error: { code: -32602, message: 'Invalid params: expected `protocolVersion`' },
          }),
          onSome: ({ protocolVersion }) => ({
            result: {
              protocolVersion: VERSIONS.includes(protocolVersion) ? protocolVersion : VERSIONS[0],
              capabilities: { tools: {} },
              serverInfo: { name: 'foldkit-plus', version: serve.version },
            },
          }),
        }),
      )
    case 'ping':
      return respond(id, { result: {} })
    case 'tools/list':
      return respond(id, {
        result: {
          tools: tools.map(({ name, description, inputSchema }) => ({
            name,
            description,
            inputSchema,
          })),
        },
      })
    case 'tools/call':
      return respond(id, called(params, serve))
    default:
      return respond(id, { error: { code: -32601, message: `Method not found: ${method}` } })
  }
}
