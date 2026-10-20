/**
 * Every icon the theme ships, as a browser reads it: each mask is a data URL
 * it decodes as an image, escaped as little as it is (`Icon.maskUrl` leaves
 * spaces, `=` and `/` as they are).
 */
import { Theme } from 'foldkit-mixins/theme'
import { expect, test } from 'vitest'

const decoded = (url: string) =>
  new Promise<{ readonly width: number }>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve({ width: image.naturalWidth })
    image.onerror = () => reject(new Error(`not an image: ${url.slice(0, 80)}`))
    image.src = url
  })

test('the browser decodes every shipped icon’s mask as an image', async () => {
  for (const [name, mask] of Object.entries(Theme.tokens.icon)) {
    const url = /^url\("(.+)"\)$/.exec(mask)?.[1]
    expect(url, name).toBeDefined()
    const { width } = await decoded(url!)
    expect(width, name).toBeGreaterThan(0)
    // A quote left in the URL would end the CSS string, and the declaration would be dropped.
    const element = document.createElement('span')
    element.style.maskImage = mask
    document.body.append(element)
    expect(getComputedStyle(element).maskImage, name).not.toBe('none')
    element.remove()
  }
})
