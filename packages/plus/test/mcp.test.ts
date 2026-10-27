/** The MCP server's answers, line by line, against a stub of the docs behind it. */
import { Option } from 'effect'
import { describe, expect, it } from 'vitest'

import { reply, type Serve } from '../src/mcp.js'

const asked: Array<unknown> = []
const serve: Serve = {
  version: '9.9.9',
  search: query => {
    asked.push(query)
    return { text: `about ${query}`, isError: query === 'zebra' }
  },
  outline: topic => {
    asked.push(topic)
    return { text: 'outline', isError: false }
  },
}

const send = (message: unknown) =>
  Option.map(reply(typeof message === 'string' ? message : JSON.stringify(message), serve), line =>
    JSON.parse(line),
  )
const call = (id: number, method: string, params?: unknown) =>
  Option.getOrThrow(
    send({ jsonrpc: '2.0', id, method, ...(params === undefined ? {} : { params }) }),
  )

describe('reply', () => {
  it('agrees on the revision the client asks for, or offers its newest', () => {
    const client = { capabilities: {}, clientInfo: { name: 'c', version: '1' } }
    expect(call(1, 'initialize', { protocolVersion: '2025-03-26', ...client })).toEqual({
      jsonrpc: '2.0',
      id: 1,
      result: {
        protocolVersion: '2025-03-26',
        capabilities: { tools: {} },
        serverInfo: { name: 'foldkit-plus', version: '9.9.9' },
      },
    })
    expect(
      call(2, 'initialize', { protocolVersion: '1999-01-01', ...client }).result.protocolVersion,
    ).toBe('2025-11-25')
  })

  it('answers no notification', () => {
    expect(send({ jsonrpc: '2.0', method: 'notifications/initialized' })).toEqual(Option.none())
  })

  it('advertises each tool with the schema its arguments are decoded with', () => {
    const { tools } = call(3, 'tools/list').result
    expect(tools.map((tool: { name: string }) => tool.name)).toEqual([
      'search_docs',
      'outline_docs',
    ])
    expect(tools[0].inputSchema).toMatchObject({
      type: 'object',
      required: ['query'],
      additionalProperties: false,
      properties: { query: { type: 'string', minLength: 1 } },
    })
    expect(tools[1].inputSchema).toMatchObject({ type: 'object', additionalProperties: false })
    expect(tools[1].inputSchema.required).toBeUndefined()
  })

  it('runs a tool with its arguments, and passes on whether it failed', () => {
    asked.length = 0
    const found = call(4, 'tools/call', {
      name: 'search_docs',
      arguments: { query: 'Remote.make' },
    })
    expect(found.result).toEqual({
      content: [{ type: 'text', text: 'about Remote.make' }],
      isError: false,
    })
    expect(
      call(5, 'tools/call', { name: 'search_docs', arguments: { query: 'zebra' }, _meta: {} })
        .result.isError,
    ).toBe(true)
    call(6, 'tools/call', { name: 'outline_docs' })
    call(7, 'tools/call', { name: 'outline_docs', arguments: { topic: 'remote' } })
    expect(asked).toEqual(['Remote.make', 'zebra', Option.none(), Option.some('remote')])
  })

  it.each([
    ['an argument it does not take', { name: 'search_docs', arguments: { query: 'x', limit: 2 } }],
    ['an empty query', { name: 'search_docs', arguments: { query: '' } }],
    ['no query', { name: 'search_docs' }],
    ['a tool it does not have', { name: 'constructor', arguments: {} }],
  ])('refuses %s as invalid params, running nothing', (_, params) => {
    asked.length = 0
    expect(call(8, 'tools/call', params).error.code).toBe(-32602)
    expect(asked).toEqual([])
  })

  it('answers an unknown method, a malformed line and a request that is not one', () => {
    expect(call(9, 'resources/list').error.code).toBe(-32601)
    expect(call(10, 'ping').result).toEqual({})
    expect(Option.getOrThrow(send('{not json')).error.code).toBe(-32700)
    expect(Option.getOrThrow(send({ jsonrpc: '1.0', id: 11, method: 'ping' }))).toMatchObject({
      id: null,
      error: { code: -32600 },
    })
  })
})
