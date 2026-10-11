/**
 * An article: its id and its Entity, shared by the server, whose guard set
 * rules who reads it, and the article story, which declares its content type
 * and form beside the editor that writes its body.
 */
import { Cms } from 'foldkit-cms'
import { Entity } from 'foldkit-entity'
import * as RichText from 'foldkit-richtext'
import { Schema } from 'effect'

export const ArticleId = Schema.String.pipe(Schema.brand('ArticleId'))
export type ArticleId = typeof ArticleId.Type

export const Article = Entity.define(
  'Article',
  Schema.Struct({
    id: ArticleId,
    title: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Title' }),
    slug: Schema.String.check(Schema.isMinLength(1)).annotate({ title: 'Address' }),
    body: RichText.Document.annotate({ title: 'Body' }),
    publishedAt: Schema.NullOr(Schema.String),
  }),
).pipe(Cms.roles({ label: 'title', slug: 'slug', published: 'publishedAt' }))
