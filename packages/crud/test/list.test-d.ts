import { Schema } from 'effect'
import { Entity } from 'foldkit-entity'
import { Query } from 'foldkit-remote'
import { liveQuery } from 'foldkit-remote/live'
import { Crud } from '../src/index.js'

const Post = Entity.define('Post', Schema.Struct({ id: Schema.String, title: Schema.String }))
const Posts = Query.make('Posts', { Input: {}, Result: Query.connection(Post) })
const selection = Entity.select(Post, { id: true, title: true })

// A live list takes Remote's live read itself.
Crud.list('Live', { query: Posts, selection, live: liveQuery })

// @ts-expect-error a flag is no live read: the page would have to keep the live modules for it
Crud.list('Flag', { query: Posts, selection, live: true })

Crud.list('Other', {
  query: Posts,
  selection,
  // @ts-expect-error nor is a function that is not `liveQuery`'s shape
  live: () => undefined,
})
