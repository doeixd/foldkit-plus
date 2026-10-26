import { Schema } from 'effect'
import { defineMessageUnion } from 'foldkit/message'
import { Crud } from 'foldkit-crud'

const PostId = Schema.String.pipe(Schema.brand('PostId'))
const AuthorId = Schema.String.pipe(Schema.brand('AuthorId'))
const Posts = Crud.screen('Post', { id: PostId })
const Message = defineMessageUnion({ ...Posts.messages })
type Root = { readonly n: number }
const step = () => (model: Root) => ({ model })
const after =
  <M, R extends { readonly model: Root }>(update: (model: Root, message: M) => R) =>
  (model: Root, message: M) =>
    update(model, message)

// The Messages carry the screen's id: an author's id is not a post's.
Message.OpenedPost({ id: PostId.make('p1') })
// @ts-expect-error an AuthorId is not a PostId
Message.OpenedPost({ id: AuthorId.make('a1') })

Posts.update(
  {
    editor: { after },
    editing: { helpers: { open: (_: string) => step(), blank: step, close: step } },
  },
  (model: Root, _: typeof Message.Type) => ({ model }),
)

Posts.update(
  {
    editor: { after },
    // @ts-expect-error the editor's placement opens a post by its id, not by a number
    editing: { helpers: { open: (_: number) => step(), blank: step, close: step } },
  },
  (model: Root, _: typeof Message.Type) => ({ model }),
)
