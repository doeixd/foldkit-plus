import { describe, expect, it } from 'vitest'
import { runDemo } from '../src/demo.js'

describe('foldkit-cms example', () => {
  it('takes a post from its first keystroke to being taken off show, from three chairs', async () => {
    expect(await runDemo()).toEqual([
      '— a writer starts a post —',
      'no title yet, so it could not be published, and it is saved: Saved; sent SaveDraft',
      'the address follows the title: hello-world',
      'worklist: Hello, World! (New)',
      'a visitor at /blog/hello-world: 404',
      "a visitor's worklist: empty",
      '— a preview, in the application’s own page, sending nothing —',
      'the writer\'s page: "Hello, World!" at /blog/hello-world: A first post.',
      'preview off: NotFound; sent nothing',
      '— the writer may not publish; the editor may —',
      'writer: PublishFailed (This author may not publish this entry)',
      'editor opens it: resumed from the Model; body "A first post."',
      'editor: Published; sent Publish; state Published',
      'a visitor at /blog/hello-world: "Hello, World!": A first post.',
      '— a change, promised for tomorrow morning —',
      'state Changed; a visitor still reads: "Hello, World!": A first post.',
      'editor: Scheduled; state Changed, scheduled',
      'the host asks what is due that evening: []',
      'and the next morning: [{"entry":"entry-1","error":null}]',
      'a visitor reads: "Hello, World!": A first post, revised.',
      '— two people on one entry —',
      'writer: Saved; editor: Conflict, with "Edda was here." still in the form',
      'the editor saves over it: Saved',
      '— going back —',
      'revisions: 1 "A first post.", 2 "A first post, revised.", 3 "Edda was here."',
      'restored as a draft: "A first post."; state Changed',
      'nothing was published by that: "Hello, World!": Edda was here.',
      'discarded: "Edda was here."; state Published',
      '— off show —',
      'state Unpublished; a visitor at /blog/hello-world: 404',
      "the editor's worklist still has it: Hello, World! (Unpublished)",
      'and the row was never a draft\'s to spoil: [{"id":"post-1","title":"Hello, World!","slug":"hello-world","published_at":null}]',
    ])
  })
})
