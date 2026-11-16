/**
 * What the page at an address is, as much as the browser needs to know. The
 * site's applications and its frame all name pages, so it stands apart from them.
 */
import { Schema } from 'effect'
import { defineTaggedUnion } from 'foldkit/schema'
import type { Scheme as ThemeScheme } from 'foldkit-mixins/theme'

/** What the page at an address is, as much as the browser needs to know. */
export const Page = defineTaggedUnion({
  Home: {},
  Demos: {},
  Components: {},
  Component: { slug: Schema.String },
  Create: {},
  Doc: { subsite: Schema.String, title: Schema.String, description: Schema.String },
  Missing: {},
})
export type Page = typeof Page.Type

export const Example = Schema.Literals(['view', 'agent', 'sync', 'mirror'])
export type Example = typeof Example.Type

/** The page's own light or dark, which the head script applied before the first paint. */
export const PageScheme: Schema.Codec<ThemeScheme> = Schema.Literals(['system', 'light', 'dark'])
export type PageScheme = ThemeScheme
