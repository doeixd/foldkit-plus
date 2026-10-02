// @vitest-environment jsdom
/**
 * The detail's footnote reads the whole of `Data.meta`: when the post was
 * fetched, and whether the Model is refreshing it or holding a stale value.
 */
import { Inert } from 'foldkit-mixins/testing'
import { describe, expect, test } from 'vitest'

import { Data, Message, TabPanel, postDetail, update } from '../src/main.js'
import { cachedFirstPostModel } from './fixtures.js'

const footnoteOf = (model: Parameters<typeof TabPanel>[0]): string => {
  const tree = Inert.draw(TabPanel, model)
  const notes = Inert.all(tree)
    .filter(node => typeof node.text === 'string' && node.text.startsWith('Future visits'))
    .map(node => node.text ?? '')
  return notes.join('')
}

const selected = update(cachedFirstPostModel, Message.ClickedPost({ postId: 'first-post' })).model

describe('the detail footnote', () => {
  test('says when the post was fetched, and nothing of a state it is not in', () => {
    const note = footnoteOf(selected)
    expect(note).toContain('Fetched at')
    expect(note).not.toContain('Refreshing')
    expect(note).not.toContain('out of date')
  })

  test('says a stale value is out of date, read from Data.meta', () => {
    // Asking again marks the shown value stale until the re-read answers.
    const stale = Data.refresh(selected, postDetail('first-post'))
    expect(Data.meta(stale, postDetail('first-post')).stale).toBe(true)
    expect(footnoteOf(stale)).toContain('May be out of date')
  })
})
