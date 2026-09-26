import { describe, expect, it } from 'vitest'
import { runArticleDemo } from '../src/articleDemo.js'

describe('foldkit-cms example, with a rich-text body', () => {
  it('takes an article from its first keystroke to a scheduled change, the body a document', async () => {
    expect(await runArticleDemo()).toEqual([
      '— a writer starts an article —',
      'the body: "# Tending\\n\\nWater **early**"; caret at 5',
      'every edit is a draft: Saved; 22 saves, each SaveDraft',
      '— a reload resumes the draft —',
      'resumed from the Model: "# Tending\\n\\nWater **early**"; caret at 5',
      '— a preview draws the document, sending nothing —',
      "the writer's preview: <h1>Tending</h1><p>Water <strong>early</strong></p>; sent nothing",
      '— the editor publishes —',
      'editor: Published; state Published',
      'a visitor at /articles/on-gardens: <h1>Tending</h1><p>Water <strong>early</strong></p>',
      '— a revision, then going back —',
      'published again: <h1>Tending</h1><p>Always Water <strong>early</strong></p>',
      'revisions: 1, 2',
      'restored as a draft: "# Tending\\n\\nWater **early**"; state Changed',
      'nothing was published by that: <h1>Tending</h1><p>Always Water <strong>early</strong></p>',
      '— promised for the morning —',
      'editor: Scheduled; state Changed, scheduled',
      'the host asks what is due: [{"entry":"entry-a","error":null}]',
      'a visitor reads: <h1>Tending</h1><p>Water <strong>early</strong></p>',
    ])
  })
})
