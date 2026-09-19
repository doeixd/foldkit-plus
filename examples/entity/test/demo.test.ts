import { describe, expect, it } from 'vitest'
import { runDemo } from '../src/demo.js'

describe('foldkit-entity example', () => {
  it('reads one domain declaration through the server into SQL, then edits it through a form', async () => {
    expect(await runDemo()).toEqual([
      'plan: Post:p1 [title,published,commentCount,author,editor,comments]',
      'plan follows: author,editor,comments',
      'before fetch: Initial',
      'after fetch: Ready {"title":"Notes on the Engine","published":true,"commentCount":2,"author":{"name":"Ada"},"editor":null,"comments":[{"body":"Remarkable.","author":{"name":"Grace"}},{"body":"Thank you.","author":{"name":"Ada"}}]}',
      "matches the domain's Selection: true",
      'second plan: Author:a1 [posts]',
      'author: Ready {"name":"Ada","posts":[{"title":"Notes on the Engine","commentCount":2},{"title":"Compilers","commentCount":0}]}',
      'form controls: Title:Text*, Published:Toggle, Editor:RelationOne',
      'row before: {"id":"p2","headline":"Compilers","published":0,"author_id":"a1","editor_id":"a2"}',
      'filled: Title="Compilers", Published=false, Editor="a2"',
      'invalid submit: Title="" (Required), Published=false ok, Editor="a2" ok',
      'valid submit:',
      '  command Remote.mutate(EditPost): MutationSucceeded',
      'row after: {"id":"p2","headline":"Compilers, revised","published":1,"author_id":"a1","editor_id":null}',
      'edited: Ready {"title":"Compilers, revised","published":true,"editor":null}',
      'author again: Ready {"name":"Ada","posts":[{"title":"Notes on the Engine","commentCount":2},{"title":"Compilers, revised","commentCount":0}]}',
    ])
  })
})
