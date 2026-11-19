/**
 * The pixels of a PNG or a JPEG, read from its header, so an image the blog
 * draws or names has its size in the page before it loads (no layout shift,
 * and `og:image:width`). Other formats are refused rather than guessed at.
 */
export interface Size {
  readonly width: number
  readonly height: number
}

const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]

/** The JPEG markers that start a frame, which holds the size (not DHT, JPG or DAC). */
const isFrame = (marker: number): boolean =>
  marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc

const jpegSize = (file: string, bytes: Uint8Array): Size => {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
  let at = 2
  while (at + 9 < bytes.length) {
    if (bytes[at] !== 0xff) throw new Error(`${file}: a JPEG with a broken marker at byte ${at}`)
    const marker = bytes[at + 1]!
    if (isFrame(marker)) return { height: view.getUint16(at + 5), width: view.getUint16(at + 7) }
    at += 2 + view.getUint16(at + 2)
  }
  throw new Error(`${file}: a JPEG with no frame, so no size`)
}

/** The size of the image `bytes` hold; `file` names it in an error. */
export const imageSize = (file: string, bytes: Uint8Array): Size => {
  if (PNG.every((byte, at) => bytes[at] === byte)) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength)
    return { width: view.getUint32(16), height: view.getUint32(20) }
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegSize(file, bytes)
  throw new Error(`${file}: only PNG and JPEG images are read for their size`)
}
