// @vitest-environment node
/**
 * Script loading without a document (SSR): yields LoadFailed instead of
 * throwing.
 */
import { Effect } from 'effect'
import { describe, expect, it } from 'vitest'
import { ScriptMessage, loadScript } from '../src/dom/index.js'

describe('loadScript without a document', () => {
  it('yields LoadFailed', async () => {
    expect(await Effect.runPromise(loadScript('https://example.com/a.js').effect)).toEqual(
      ScriptMessage.LoadFailed({ message: 'script loading is unavailable' }),
    )
  })
})
