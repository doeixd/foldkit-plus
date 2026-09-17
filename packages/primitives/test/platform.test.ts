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

  it('prefers Client Hints over the string when recognized', () => {
    expect(platformFromUA('curl/8.0', { platform: 'Windows' })).toBe('windows')
    expect(platformFromUA('curl/8.0', { platform: 'macOS' })).toBe('mac')
    // Unrecognized hint platforms fall back to the string.
    expect(
      platformFromUA(
        'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 Chrome/120 Safari/537.36',
        { platform: 'ChromeOS' },
      ),
    ).toBe('linux')
    expect(platformFromUA('curl/8.0', { platform: 'Fuchsia' })).toBe('unknown')
  })

  it('reads a multi-touch Mac UA as iOS, and leaves touch PCs alone', () => {
    const desktopMac =
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15'
    expect(platformFromUA(desktopMac, { touchPoints: 0 })).toBe('mac')
    expect(platformFromUA(desktopMac, { touchPoints: 5 })).toBe('ios')
    expect(platformFromUA(desktopMac, { platform: 'macOS', touchPoints: 5 })).toBe('ios')
    expect(platformFromUA('Mozilla/5.0 (Windows NT 10.0; Win64; x64)', { touchPoints: 10 })).toBe(
      'windows',
    )
  })
})

describe('isBrowser/isServer', () => {
  it('splits on the window', () => {
    // Exactly one side holds, whichever environment this runs in.
    expect(isBrowser()).toBe(!isServer())
  })
})
