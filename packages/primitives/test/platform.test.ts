/**
 * Platform detection reads the passed UA string; order pins the mobile
 * checks before the desktop substrings they contain.
 */
import { describe, expect, it } from 'vitest'
import { isBrowser, isServer, platformFromUA, type Platform } from '../src/media/index.js'

describe('platformFromUA', () => {
  const cases: ReadonlyArray<readonly [ua: string, platform: Platform]> = [
    [
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'mac',
    ],
    [
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
      'windows',
    ],
    ['Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36', 'linux'],
    [
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36',
      'android',
    ],
    [
      'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1',
      'ios',
    ],
    ['curl/8.0', 'unknown'],
    ['', 'unknown'],
  ]
  for (const [ua, platform] of cases) {
    it(`reads ${platform} from ${ua.slice(0, 40)}`, () => {
      expect(platformFromUA(ua)).toBe(platform)
    })
  }
})

describe('isBrowser/isServer', () => {
  it('splits on the window', () => {
    // Exactly one side holds, whichever environment this runs in.
    expect(isBrowser()).toBe(!isServer())
  })
})
