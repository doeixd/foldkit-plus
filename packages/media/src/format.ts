import { Schema } from 'effect'

/** An encoding a variant can be written in. */
export const Format = Schema.Literals(['avif', 'webp', 'jpeg', 'png'])
export type Format = typeof Format.Type

/**
 * What a provider is asked for: a format, or `auto` for a provider that picks
 * the format itself from the request's `Accept`.
 */
export type Encoding = Format | 'auto'

const mimeTypes: Readonly<Record<Format, string>> = {
  avif: 'image/avif',
  webp: 'image/webp',
  jpeg: 'image/jpeg',
  png: 'image/png',
}

/** The media type a `source` element names. */
export const mimeType = (format: Format): string => mimeTypes[format]
