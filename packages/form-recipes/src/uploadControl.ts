/** What the upload recipes (`image`, `file`) share: the options a browser would refuse, and the drop's Messages. */
import { Schema } from 'effect'
import type { UploadOptions } from 'foldkit-media/browser'

/** The request headers a browser sets itself, and drops from a script (Fetch, "forbidden request-header"). */
const forbidden =
  /^(?:accept-charset|accept-encoding|access-control-request-headers|access-control-request-method|connection|content-length|cookie2?|date|dnt|expect|host|keep-alive|origin|referer|set-cookie|te|trailer|transfer-encoding|upgrade|via|proxy-.*|sec-.*)$/i

/** Whether `url` is an address, relative or not; `URL.canParse` is too new for some browsers. */
const parses = (url: string): boolean => {
  try {
    new URL(url, 'http://localhost')
    return true
  } catch {
    return false
  }
}

/**
 * Throws, naming `recipe`, for an id, header or address that a browser would
 * refuse at the first upload (inside the Subscription, taking the runtime with
 * it) or drop without a word. The id is also a focus selector (`#cover`), so
 * it is an identifier CSS takes.
 */
export const checkUploadOptions = (
  recipe: string,
  options: UploadOptions & { readonly id: string },
): void => {
  if (!/^[A-Za-z_][\w-]*$/.test(options.id))
    throw new Error(`${recipe}: "${options.id}" is not an id a selector can name, such as "cover"`)
  for (const [name, value] of Object.entries(options.headers ?? {}))
    if (
      !/^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(name) ||
      forbidden.test(name) ||
      /[\r\n\0]|[^\x00-\xff]/.test(value)
    )
      throw new Error(`${recipe}: "${name}" is not a header a browser sends as given`)
  if (options.url !== undefined && !parses(options.url))
    throw new Error(`${recipe}: "${options.url}" is not an address`)
}

/** A chosen file, held while it is sent. */
export const FileSchema = Schema.instanceOf(File)

export const percentOf = (loaded: number, total: number) =>
  total === 0 ? 0 : Math.min(100, Math.round((loaded / total) * 100))
