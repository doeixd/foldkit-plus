/**
 * Platform detection as pure functions. `platformFromUA` reads a user-agent
 * string (passed in, so tests pin it without stubbing globals); order
 * matters — Android contains "Linux", iPhones mention "Mac" — so mobile
 * checks come first. `isBrowser`/`isServer` split SSR from client for init
 * defaults.
 */
export const Platform = ['mac', 'windows', 'linux', 'android', 'ios', 'unknown'] as const
export type Platform = (typeof Platform)[number]

/**
 * Client Hints (`navigator.userAgentData`) plus touch points
 * (`navigator.maxTouchPoints`), passed in so detection stays pure and
 * pinned. Only `platform` and `touchPoints` can change the answer — the
 * `mobile` flag never disambiguates on its own, so it is not accepted.
 */
export interface PlatformHints {
  readonly platform?: string | undefined
  readonly touchPoints?: number | undefined
}

const hintedPlatform = (platform: string): Platform | null => {
  switch (platform.toLowerCase()) {
    case 'macos':
      return 'mac'
    case 'windows':
      return 'windows'
    case 'linux':
      return 'linux'
    case 'android':
      return 'android'
    case 'ios':
      return 'ios'
    default:
      return null
  }
}

export const platformFromUA = (userAgent: string, hints: PlatformHints = {}): Platform => {
  const hinted = hints.platform === undefined ? null : hintedPlatform(hints.platform)
  const ua = userAgent.toLowerCase()
  let sniffed: Platform = 'unknown'
  if (ua.includes('android')) sniffed = 'android'
  else if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) sniffed = 'ios'
  else if (ua.includes('windows') || ua.includes('win32') || ua.includes('win64')) {
    sniffed = 'windows'
  } else if (ua.includes('macintosh') || ua.includes('mac os')) sniffed = 'mac'
  else if (ua.includes('linux')) sniffed = 'linux'
  const candidate = hinted ?? sniffed
  // Desktop-mode iPads report "macOS" with a tablet touchscreen: only a
  // multi-touch Mac UA is really an iPad. Touchscreen Windows and Linux
  // machines keep their platform.
  return candidate === 'mac' && (hints.touchPoints ?? 0) > 1 ? 'ios' : candidate
}

/** Whether a window exists: the client side of an SSR split. */
export const isBrowser = (): boolean => typeof window !== 'undefined'

/** Whether no window exists: the server side of an SSR split. */
export const isServer = (): boolean => !isBrowser()
