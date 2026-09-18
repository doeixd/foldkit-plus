// Values a module would export, so declaration emit must be able to name their types.
import { Entity } from '../src/index.js'
import { Blog } from './blogFixture.js'

export const AuthorOption = Entity.select(Blog.Author, { id: true, name: true })
export const PostRow = Entity.select(Blog.Post, { title: true, author: AuthorOption })
export const CmsPost = Blog.Post.pipe(
  Entity.annotateMembers({ title: AuthorOption.entity.metadata }),
)
