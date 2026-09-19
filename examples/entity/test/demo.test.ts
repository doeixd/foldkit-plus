import { describe, expect, it } from 'vitest'
import { runDemo } from '../src/demo.js'

describe('foldkit-entity example', () => {
  it('reads one domain declaration through the server into SQL, then manages it: list, edit, save', async () => {
    expect(await runDemo()).toEqual([
      'plan: Post:p1 [title,published,commentCount,author,editor,comments]',
      'plan follows: author,editor,comments',
      'before fetch: Initial',
      'after fetch: Ready {"title":"Notes on the Engine","published":true,"commentCount":2,"author":{"name":"Ada"},"editor":null,"comments":[{"body":"Remarkable.","author":{"name":"Grace"}},{"body":"Thank you.","author":{"name":"Ada"}}]}',
      "matches the domain's Selection: true",
      'second plan: Author:a1 [posts]',
      'author: Ready {"name":"Ada","posts":[{"title":"Notes on the Engine","commentCount":2},{"title":"Compilers","commentCount":0}]}',
      'form controls: Title:Text*, Published:Toggle, Editor:RelationOne',
      'post list: p1 "Notes on the Engine", p2 "Compilers" (draft)',
      'row before: {"id":"p2","headline":"Compilers","published":0,"author_id":"a1","editor_id":"a2"}',
      'editor plan: Post:p2 [editor]; status Loading',
      'filled: Title="Compilers", Published=false, Editor="a2"; status Editing',
      'editor choices: a1 Ada, a2 Grace',
      'invalid submit: Title="" (Required), Published=false ok, Editor="a2" ok; status Editing',
      'valid submit:',
      '  command Remote.mutate(EditPost): MutationSucceeded',
      'status: Saved',
      'row after: {"id":"p2","headline":"Compilers, revised","published":1,"author_id":"a1","editor_id":"a1"}',
      'edited: Ready {"id":"p2","title":"Compilers, revised","published":true,"editor":{"entity":"Author","id":"a1"}}',
      'author again: Ready {"name":"Ada","posts":[{"title":"Notes on the Engine","commentCount":2},{"title":"Compilers, revised","commentCount":0}]}',
      'post list again: p1 "Notes on the Engine", p2 "Compilers, revised"',
    ])
  })
})
