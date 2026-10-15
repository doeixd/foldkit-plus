/**
 * Media beside the standard `Image`: a video and a sound played with the browser's own controls,
 * and a file to download. Opt-in vocabulary like footnotes: add `mediaNodes` to a kit and draw
 * them with `mediaRendering` under the rendering. Each is an atom holding where its media is
 * (`src`); where that is, a `data:` URL read from a file or a URL an upload returned, is the
 * application's to decide.
 */
import { Schema } from 'effect'
import { NodeId, type Block } from './document.js'
import { atom } from './kit.js'
import { rendering, type Rendering } from './rendering.js'
import { safeUrl } from './url.js'

const Width = Schema.optional(Schema.Number.check(Schema.isGreaterThan(0)))

/** A video, played with the browser's controls, at `width` CSS pixels when it says. */
export const Video = atom('Video', {
  Props: Schema.Struct({ src: Schema.String, title: Schema.optional(Schema.String), width: Width }),
})

/** A sound, played with the browser's controls. */
export const Audio = atom('Audio', {
  Props: Schema.Struct({ src: Schema.String, title: Schema.optional(Schema.String) }),
})

/** A file to download, under its name, with its size and type when they are known. */
export const Attachment = atom('Attachment', {
  Props: Schema.Struct({
    src: Schema.String,
    name: Schema.String,
    size: Schema.optional(Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))),
    type: Schema.optional(Schema.String),
  }),
})

export const mediaNodes = [Video, Audio, Attachment]

/** Types a page could run as script or markup if one were ever opened rather than saved. */
const ACTIVE = /^(text\/html|application\/xhtml\+xml|image\/svg\+xml|text\/xml|application\/xml)\b/i

/**
 * Where a media element may load from: what the URL policy allows, or a `data:` URL whose type
 * `accepts` admits. The policy refuses `data:` in general, since a link to one could carry a
 * page; a video's own bytes cannot.
 */
const mediaUrl = (value: unknown, accepts: (type: string) => boolean): string | undefined => {
  if (typeof value !== 'string') return undefined
  const data = /^data:([^;,]*)[;,]/i.exec(value.trim())
  if (data === null) return safeUrl(value)
  return accepts(data[1] ?? '') ? value.trim() : undefined
}

const text = (value: unknown): string => (typeof value === 'string' ? value : '')

/** A size as a reader says it: `820 B`, `12 KB`, `3.4 MB`. */
export const fileSize = (bytes: number): string => {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * How media draws: a `video` or `audio` with `controls`, which loads only its metadata until it
 * is played, and an attachment as a download link showing its name and size. A source the policy
 * refuses leaves the element without one, so it draws nothing playable.
 */
export const mediaRendering: Rendering = rendering({
  nodes: {
    Video: block => {
      const src = mediaUrl(block.props.src, type => type.toLowerCase().startsWith('video/'))
      const width = block.props.width
      return {
        tag: 'video',
        attributes: {
          ...(src === undefined ? {} : { src }),
          controls: '',
          preload: 'metadata',
          title: text(block.props.title),
          ...(typeof width === 'number' ? { width: String(width) } : {}),
        },
      }
    },
    Audio: block => {
      const src = mediaUrl(block.props.src, type => type.toLowerCase().startsWith('audio/'))
      return {
        tag: 'audio',
        attributes: {
          ...(src === undefined ? {} : { src }),
          controls: '',
          preload: 'metadata',
          title: text(block.props.title),
        },
      }
    },
    Attachment: block => {
      const href = mediaUrl(block.props.src, type => !ACTIVE.test(type))
      const name = text(block.props.name)
      const size = block.props.size
      return {
        tag: 'a',
        attributes: {
          ...(href === undefined ? {} : { href }),
          download: name,
          'data-attachment': '',
        },
        adornments: [
          { tag: 'span', attributes: { 'data-attachment-name': '' }, text: name },
          ...(typeof size === 'number'
            ? [{ tag: 'span', attributes: { 'data-attachment-size': '' }, text: fileSize(size) }]
            : []),
        ],
      }
    },
  },
})

/** A file a reader added, as its type says: where it is, and what it is called. */
export interface MediaFile {
  readonly src: string
  readonly name: string
  readonly type: string
  readonly size: number
}

/**
 * The block for a file a reader added: an `Image`, `Video` or `Audio` when its type is one, and
 * an `Attachment` otherwise. Its identity is a placeholder, which `InsertBlock` replaces.
 */
export const mediaBlock = (file: MediaFile): Block => {
  const family = file.type.toLowerCase().split('/')[0]
  const title = file.name.replace(/\.[^.]+$/, '')
  const node = (kind: string, props: Readonly<Record<string, string | number>>): Block => ({
    type: 'Node',
    kind,
    id: NodeId.make('media'),
    props,
    children: [],
  })
  if (family === 'image') return node('Image', { src: file.src, alt: title })
  if (family === 'video') return node('Video', { src: file.src, title })
  if (family === 'audio') return node('Audio', { src: file.src, title })
  return node('Attachment', {
    src: file.src,
    name: file.name,
    size: file.size,
    ...(file.type === '' ? {} : { type: file.type }),
  })
}
