/**
 * Media: a file becomes the block its type says, and each kind draws with the browser's own
 * controls, loading only from a source the policy allows.
 */
import { describe, expect, it } from 'vitest'
import * as RichText from 'foldkit-richtext'

const file = (type: string, name = 'clip.bin') => ({
  src: 'https://x.test/f',
  name,
  type,
  size: 2048,
})

describe('the block for a file', () => {
  it.each([
    ['image/png', 'Image', { src: 'https://x.test/f', alt: 'clip' }],
    ['video/mp4', 'Video', { src: 'https://x.test/f', title: 'clip' }],
    ['audio/mpeg', 'Audio', { src: 'https://x.test/f', title: 'clip' }],
    [
      'application/pdf',
      'Attachment',
      { src: 'https://x.test/f', name: 'clip.bin', size: 2048, type: 'application/pdf' },
    ],
    ['', 'Attachment', { src: 'https://x.test/f', name: 'clip.bin', size: 2048 }],
  ])('of type %s is a %s', (type, kind, props) => {
    const block = RichText.mediaBlock(file(type))
    expect(block.type === 'Node' ? [block.kind, block.props] : undefined).toEqual([kind, props])
  })
})

const html = (kind: string, props: Record<string, unknown>) =>
  RichText.toHtml(
    RichText.decodeDocument({
      version: 1,
      children: [{ type: 'Node', kind, id: 'm', props, children: [] }],
    }).children,
    RichText.mediaRendering,
  )

describe('how media draws', () => {
  it.each([
    ['Video', 'https://x.test/v.mp4', true],
    ['Video', 'data:video/mp4;base64,AAAA', true],
    ['Video', 'data:text/html;base64,AAAA', false],
    ['Video', 'javascript:alert(1)', false],
    ['Audio', 'data:audio/mpeg;base64,AAAA', true],
    ['Audio', 'data:video/mp4;base64,AAAA', false],
  ])('a %s from %s plays: %s', (kind, src, plays) => {
    expect(html(kind, { src }).includes(` src="${src}"`)).toBe(plays)
  })

  it('plays with the browser’s controls, loading only metadata until played', () => {
    expect(html('Video', { src: 'https://x.test/v.mp4', title: 'Clip', width: 320 })).toBe(
      '<video src="https://x.test/v.mp4" controls="" preload="metadata" title="Clip" width="320"></video>',
    )
  })

  it.each([
    ['data:application/pdf;base64,AAAA', true],
    ['https://x.test/report.pdf', true],
    ['data:text/html;base64,AAAA', false],
    ['data:image/svg+xml;base64,AAAA', false],
  ])('an attachment from %s links to it: %s', (src, links) => {
    expect(html('Attachment', { src, name: 'report.pdf' }).includes(` href="${src}"`)).toBe(links)
  })

  it('shows an attachment’s name and size, and downloads it under its name', () => {
    expect(
      html('Attachment', { src: 'https://x.test/r.pdf', name: 'r.pdf', size: 3_500_000 }),
    ).toBe(
      '<a href="https://x.test/r.pdf" download="r.pdf" data-attachment=""><span data-attachment-name="" data-adornment="">r.pdf</span><span data-attachment-size="" data-adornment="">3.3 MB</span></a>',
    )
  })
})

it.each([
  [820, '820 B'],
  [12 * 1024, '12 KB'],
  [3_500_000, '3.3 MB'],
])('says %i bytes as %s', (bytes, said) => {
  expect(RichText.fileSize(bytes)).toBe(said)
})
