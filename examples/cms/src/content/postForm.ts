/**
 * How posts are authored: the form with the rich-text editor for its body, the two publishing
 * mutations and the content type. Only the studio and the server import it, so the public
 * site, which reads posts through `domain.ts`, does not load the editor.
 */
import { Cms } from 'foldkit-cms'
import { FieldRecipes } from 'foldkit-form-recipes'
import { Entity } from 'foldkit-entity'
import { Form, Input } from 'foldkit-form'
import { Mutation } from 'foldkit-remote'
import * as RichText from 'foldkit-richtext'
import { EditorInput, richTextInput } from 'foldkit-richtext-dom/input'
import { markdownInputRules, print } from 'foldkit-richtext-markdown'
import { Post, PostId, PostInput } from './domain.js'
import { documentOf } from './markdownBody.js'

/** The id of the body editor's host element, which a Command finds the editor by. */
export const BODY_HOST = 'post-body'

export const PostForm = Form.make('PostForm', Entity.input(Post, PostInput), {
  // The address follows the title until the author writes it themselves.
  inputs: {
    slug: FieldRecipes.slug('title', { prefix: '/blog/' }).control,
    // A long title wraps, as it will on the page.
    title: Input.multiline(),
    excerpt: Input.multiline(),
    // The body is written in the rich-text editor and stored as Markdown.
    body: richTextInput(
      BODY_HOST,
      {
        vocabulary: {
          nodes: RichText.nodeRegistry(RichText.standardNodes),
          marks: RichText.markRegistry(RichText.standardMarks),
        },
        rendering: RichText.standardRendering,
        inputRules: markdownInputRules,
        placeholder: 'Begin writing your post…',
      },
      {
        codec: {
          blank: '',
          value: document => print(document).markdown.trimEnd(),
          // An empty text has no block for a caret to sit in: the editor's own blank stands in.
          fill: markdown => {
            const read = documentOf(markdown)
            return read.children.length === 0
              ? EditorInput.init({ hostId: BODY_HOST }).model.document
              : read
          },
        },
      },
    ),
  },
  debounce: 0,
}).pipe(
  // And says while it is typed what a publish would refuse. The post keeps its
  // own address because `Cms.editor` tells the form which row it is editing.
  // Asking needs `RemoteClient`; the step adds that to what the form needs.
  Form.checks({ slug: Cms.addressFree('posts') }),
)

export const CreatePost = Mutation.make('CreatePost', {
  Input: PostInput,
  Output: { id: PostId },
})
export const UpdatePost = Mutation.make('UpdatePost', {
  Input: { ...PostInput.fields, id: PostId },
  Output: {},
})

/** How posts are authored: a fact about the application. */
export const Posts = Cms.content('posts', {
  entity: Post,
  form: PostForm,
  publish: { create: CreatePost, update: UpdatePost },
  words: { one: 'Post', many: 'Posts' },
  // How a value would look in the store: what an optimistic publish would show.
  preview: (value, id) => [{ entity: 'Post', id, values: value }],
})
