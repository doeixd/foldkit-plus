import { describe, expect, it } from 'vitest'
import { runPageDemo } from '../src/pageDemo.js'

describe('a page in foldkit-cms, built with foldkit-builder', () => {
  it('builds, saves, resumes, previews, publishes, revises, restores, schedules, conflicts, reads, picks, follows a link and takes an agent’s edit', async () => {
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
      '— a Block that lists the site’s pages —',
      'at once, from the pages the editor read to pick from: Good morning | News | All posts | Home',
      'read through Remote, as the editor may see it: Good morning | News | All posts | Home',
      'it may leave out one of: none, Home',
      'leaving out the page it is on: Good morning | News | All posts',
      '— a link to a Block —',
      'while the page loads, nothing is selected: nothing',
      'once it is open, the Block the link names: Button',
      'a link to a Block the page lacks is let go: nothing waits; Button selected',
      '— an agent edits the page, as a person does —',
      'it adds a heading: done',
      'the page: Written by an agent | Good morning | News | All posts',
      'a Block outside the Catalog: AgentInvalidInputError',
      "and undo takes the agent's edit back: Good morning | News | All posts",
      'and the row holds only what was published: [{"id":"page-1","title":"Home","slug":"home","published_at":"2026-03-01T09:00:00.000Z"}]',
    ])
  })
})
