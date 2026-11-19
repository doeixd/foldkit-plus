/**
 * A post's Markdown drawn into a static region: the guides' own blocks
 * (`content/render.ts`, so code, tables and diagrams are the site's), except
 * that a paragraph holding only an image is a `<figure>` with its size in the
 * markup, so the page does not move as the picture loads. Nothing here
 * reaches the browser.
 */
import type { Image, RootContent } from 'mdast'
import type { Html, HtmlBuilder } from 'foldkit/html'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { block, type Context } from '../content/render.js'
import { imageSize } from './imageSize.js'
import { PUBLIC, type Post } from './posts.js'

type Ih = HtmlBuilder<never>

/** The first blocks of a post are likely in view when it opens: their images are not deferred. */
const ABOVE_THE_FOLD = 3

const figure = (ih: Ih, repository: string, post: Post, image: Image, eager: boolean): Html => {
  if (!image.url.startsWith('/'))
    throw new Error(
      `${post.file}: image ${image.url} is not a file under ${PUBLIC}, so its size is unknown`,
    )
  const file = join(repository, PUBLIC, image.url)
  const { width, height } = imageSize(`${post.file}: ${image.url}`, readFileSync(file))
  return ih.figure(
    [ih.Class('image')],
    [
      ih.img([
        ih.Src(image.url),
        ih.Alt(image.alt ?? ''),
        ih.Width(String(width)),
        ih.Height(String(height)),
        ih.Loading(eager ? 'eager' : 'lazy'),
        ih.Decoding('async'),
      ]),
      ...(image.title === null || image.title === undefined
        ? []
        : [ih.figcaption([], [image.title])]),
    ],
  )
}

/** The post's body as the page draws it, one element per block. */
export const bodyOf = (
  ih: Ih,
  context: Context,
  repository: string,
  post: Post,
): ReadonlyArray<Html | string> =>
  post.nodes.map((node: RootContent, at) => {
    const [only] = node.type === 'paragraph' && node.children.length === 1 ? node.children : []
    return only?.type === 'image'
      ? figure(ih, repository, post, only, at < ABOVE_THE_FOLD)
      : block(ih, context, node)
  })
