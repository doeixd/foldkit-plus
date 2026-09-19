import { describe, expect, it } from 'vitest'
import { runDemo } from '../src/demo.js'

describe('foldkit-entity example', () => {
  it('reads one domain declaration from the client through the server into SQL', async () => {
    expect(await runDemo()).toEqual([
      'plan: Post:p1 [title,published,commentCount,author,editor,comments]',
      'plan follows: author,editor,comments',
      'before fetch: Initial',
      'after fetch: Ready {"title":"Notes on the Engine","published":true,"commentCount":2,"author":{"name":"Ada"},"editor":null,"comments":[{"body":"Remarkable.","author":{"name":"Grace"}},{"body":"Thank you.","author":{"name":"Ada"}}]}',
      "matches the domain's Selection: true",
      'second plan: Author:a1 [posts]',
      'author: Ready {"name":"Ada","posts":[{"title":"Notes on the Engine","commentCount":2},{"title":"Compilers","commentCount":0}]}',
    ])
  })
})
