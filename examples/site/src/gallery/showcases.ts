/**
 * Every showcase, drawn: what the server and the tests ask. The browser never
 * imports this: a page loads the showcase it shows (`previewLoader.ts`).
 */
import { Option } from 'effect'

import { catalogue } from './catalogue.js'
import type { Showcase } from './showcase.js'

const modules = import.meta.glob<Showcase>('./previews/*.ts', { eager: true, import: 'showcase' })

export const showcases: ReadonlyArray<Showcase> = catalogue.map(about =>
  Option.getOrThrowWith(
    Option.fromNullishOr(modules[`./previews/${about.slug}.ts`]),
    () => new Error(`previews/${about.slug}.ts is missing`),
  ),
)

const bySlug = new Map(showcases.map(showcase => [showcase.slug, showcase]))

export const showcaseOf = (slug: string): Option.Option<Showcase> =>
  Option.fromNullishOr(bySlug.get(slug))
