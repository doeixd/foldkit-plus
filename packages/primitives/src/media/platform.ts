/**
 * Platform detection as pure functions. `platformFromUA` reads a user-agent
 * string (passed in, so tests pin it without stubbing globals); order
 * matters — Android contains "Linux", iPhones mention "Mac" — so mobile
 * checks come first. `isBrowser`/`isServer` split SSR from client for init
 * defaults. Desktop-mode iPads report `mac` — their UA hides the tablet;
 * touch detection stays the application's job.
 */
export const Platform = ['mac', 'windows', 'linux', 'android', 'ios', 'unknown'] as const
export type Platform = (typeof Platform)[number]

export const platformFromUA = (userAgent: string): Platform => {
  const ua = userAgent.toLowerCase()
  if (ua.includes('android')) return 'android'
  if (ua.includes('iphone') || ua.includes('ipad') || ua.includes('ipod')) return 'ios'
  if (ua.includes('windows') || ua.includes('win32') || ua.includes('win64')) return 'windows'
  if (ua.includes('macintosh') || ua.includes('mac os')) return 'mac'
  if (ua.includes('linux')) return 'linux'
  return 'unknown'
}

/** Whether a window exists: the client side of an SSR split. */
export const isBrowser = (): boolean => typeof window !== 'undefined'

/** Whether no window exists: the server side of an SSR split. */
export const isServer = (): boolean => !isBrowser()
