/**
 * The build's id, as the Worker reads it from the template: `vite.config.ts`
 * writes it into `index.html` as a `<meta>` of this name.
 */
import { Option } from 'effect'

export const BUILD_META = 'foldkit-build'

const pattern = new RegExp(`<meta name="${BUILD_META}" content="([^"]+)"`)

/** The id `template` carries, or none for a template no build of this app wrote. */
export const buildIdOf = (template: string): Option.Option<string> =>
  Option.fromNullOr(pattern.exec(template)?.[1] ?? null)
