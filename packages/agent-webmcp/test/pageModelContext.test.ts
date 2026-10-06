/**
 * `pageModelContext()`: the spec's `document.modelContext`, or the older
 * `navigator.modelContext` that Chromium before 150 and agent extensions still
 * expose. A browser with only the older name registered nothing before.
 */
import { afterEach, expect, test, vi } from 'vitest'
import { AgentWebMcp } from '../src/index.js'
import type { ModelContext } from '../src/webmcp.js'

const context = (): ModelContext => ({ registerTool: () => undefined })

afterEach(() => {
  vi.unstubAllGlobals()
})

test('reads document.modelContext, where the spec puts it', () => {
  const current = context()
  vi.stubGlobal('document', { modelContext: current })
  vi.stubGlobal('navigator', { modelContext: context() })
  expect(AgentWebMcp.pageModelContext()).toBe(current)
})

test('falls back to navigator.modelContext, the older name', () => {
  const older = context()
  vi.stubGlobal('document', {})
  vi.stubGlobal('navigator', { modelContext: older })
  expect(AgentWebMcp.pageModelContext()).toBe(older)
})

test('is undefined with neither, and on a server', () => {
  vi.stubGlobal('document', {})
  vi.stubGlobal('navigator', {})
  expect(AgentWebMcp.pageModelContext()).toBeUndefined()
  vi.stubGlobal('document', undefined)
  expect(AgentWebMcp.pageModelContext()).toBeUndefined()
})
