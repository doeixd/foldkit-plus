import { Option } from 'effect'
import type { ImageAsset } from './asset.js'
import type { Encoding, Format } from './format.js'
import * as Widths from './widths.js'

/** One variant asked of a provider: a ladder width, in an encoding. */
export interface Request {
  readonly width: number
  readonly encoding: Encoding
}

/**
 * Writes the URL of a variant. A provider performs no I/O: it knows a host's
 * URL scheme, the widths it makes, and the encodings worth offering.
 */
export interface Provider {
  readonly widths: Widths.Widths
  /** Formats offered as `source`s before the `img`, most preferred first. */
  readonly sources: ReadonlyArray<Format>
  /** What the `img` itself asks for; `auto` lets the host choose. */
  readonly fallback: Encoding
  /** The variant's URL, or none when this provider has no such variant. */
  readonly url: (asset: ImageAsset, request: Request) => Option.Option<string>
}

/** A file a build emitted: one width of one original, in one format. */
export interface File {
  readonly width: number
  readonly format: Format
  readonly url: string
}

/**
 * The provider of one image whose variants a build already wrote: a table of
 * files, no URL scheme. Its ladder is the widths it has, and it answers none
 * for a variant it lacks. Refuses no files, and two files for one variant.
 */
export const fromFiles = (
  files: ReadonlyArray<File>,
  formats: { readonly sources: ReadonlyArray<Format>; readonly fallback: Format },
): Provider => {
  if (files.length === 0) throw new Error('Provider.fromFiles: no files')
  const byVariant = new Map<string, string>()
  for (const file of files) {
    const variant = `${file.width}:${file.format}`
    if (byVariant.has(variant)) {
      throw new Error(`Provider.fromFiles: two files for ${file.width}px ${file.format}`)
    }
    byVariant.set(variant, file.url)
  }
  return {
    widths: Widths.make([...new Set(files.map(file => file.width))]),
    sources: formats.sources,
    fallback: formats.fallback,
    url: (_asset, { width, encoding }) =>
      Option.fromNullishOr(byVariant.get(`${width}:${encoding}`)),
  }
}

const HOSTNAME = /^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i

/**
 * Cloudflare's own resizing, as URLs under `/cdn-cgi/image/` on a zone that
 * has it on. No Worker of ours runs: the zone fetches the original by its
 * `key` (a path on the zone, or an absolute URL it may fetch), scales it down
 * without enlarging, and picks the format from `Accept`.
 */
export const cdnCgi = (
  options: {
    /** The zone's host; omitted, URLs are relative to the page's. */
    readonly zone?: string
    readonly widths?: Widths.Widths
    /** 1 to 100. Cloudflare's default when omitted. */
    readonly quality?: number
  } = {},
): Provider => {
  const { zone, widths = Widths.standard, quality } = options
  if (zone !== undefined && !HOSTNAME.test(zone)) {
    throw new Error(`Provider.cdnCgi: "${zone}" is not a host name`)
  }
  if (quality !== undefined && (!Number.isInteger(quality) || quality < 1 || quality > 100)) {
    throw new Error(`Provider.cdnCgi: quality ${quality} is not an integer from 1 to 100`)
  }
  const base = zone === undefined ? '' : `https://${zone}`
  const qualityOption = quality === undefined ? '' : `,quality=${quality}`
  return {
    widths,
    sources: [],
    fallback: 'auto',
    url: (asset, { width, encoding }) => {
      const operations = `width=${width},format=${encoding},fit=scale-down${qualityOption}`
      return Option.some(`${base}/cdn-cgi/image/${operations}/${cdnCgiSource(asset.key)}`)
    },
  }
}

const cdnCgiSource = (key: string): string => {
  if (!/^https?:\/\//.test(key)) return key.replace(/^\/+/, '')
  // A query in an absolute source would be read as the image URL's own.
  return key.includes('?') ? encodeURIComponent(key) : key
}
