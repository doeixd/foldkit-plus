import { describe, expect, it } from 'vitest'
import { runPageDemo } from '../src/pageDemo.js'

describe('a page in foldkit-cms, built with foldkit-builder', () => {
  it('builds, saves, resumes, previews, publishes, revises, restores, schedules and conflicts', async () => {
    const page =
      'Section {"tone":"plain"} > body: > Heading {"text":"Welcome"} > Button {"href":"/blog","label":"Read the blog"}'
    expect(await runPageDemo()).toEqual([
      '— a writer builds a page —',
      `the page: ${page}`,
      'every change is saved as a draft: Saved; sent SaveDraft, SaveDraft, SaveDraft, SaveDraft, SaveDraft',
      'undo steps on hand: 4',
      'a visitor at /home: 404',
      '— a reload resumes the draft —',
      `resumed from the Model: ${page}`,
      'undo starts over after a reload: 0 steps',
      '— a preview, drawn by the site’s own views, sending nothing —',
      "the writer's page: Welcome | Read the blog",
      'preview off: NotFound; sent nothing',
      '— an editor publishes it —',
      'editor: Published; sent Publish; state Published',
      'a visitor at /home: Welcome | Read the blog',
      '— a second revision, and going back to the first —',
      'published again: Welcome | News | Read the blog',
      'revisions: 1, 2',
      `the first, restored as a draft: ${page}; state Changed`,
      'nothing was published by that: Welcome | News | Read the blog',
      'discarded: Section {"tone":"plain"} > body: > Heading {"text":"Welcome"} > Heading {"text":"News"} > Button {"href":"/blog","label":"Read the blog"}; state Published',
      '— a change promised for the morning —',
      'editor: Scheduled; state Changed, scheduled',
      'tonight a visitor reads: Welcome | News | Read the blog',
      'the host asks what is due: [{"entry":"page-entry-1","error":null}]',
      'in the morning a visitor reads: Good morning | News | Read the blog',
      '— two people on one page —',
      'writer: Saved; editor: Conflict',
      'the editor saves over it: Saved',
      'and the row holds only what was published: [{"id":"page-1","title":"Home","slug":"home","published_at":"2026-03-01T09:00:00.000Z"}]',
    ])
  })
})
