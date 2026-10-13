/**
 * Signing in and out through Yielded's own routes, as the page does: what the
 * example's tests share. The cookie comes back as `name=value`.
 */
import { accounts } from '../src/server.js'

/** The page's origin, which the auth server trusts. Nothing listens there. */
export const PAGE_ORIGIN = 'http://127.0.0.1:5176'

const fromThePage = {
  origin: PAGE_ORIGIN,
  'x-effect-auth-csrf': '1',
  'content-type': 'application/json',
}

/** Signs in through Yielded's route at `server`; the session cookie it set. */
export const signIn = async (server: string, subjectId: 'ada' | 'grace'): Promise<string> => {
  const { email, password } = accounts.find(account => account.subjectId === subjectId)!
  const response = await fetch(`${server}/auth/signIn`, {
    method: 'POST',
    headers: fromThePage,
    body: JSON.stringify({ payload: { email, password } }),
  })
  if (response.status !== 200) throw new Error(`signing ${subjectId} in: ${response.status}`)
  return response.headers
    .getSetCookie()
    .find(cookie => cookie.includes('-session='))!
    .split(';')[0]!
}

/** Signs the session `cookie` names out, through Yielded's route at `server`. */
export const signOut = async (server: string, cookie: string): Promise<void> => {
  const response = await fetch(`${server}/auth/signOut`, {
    method: 'POST',
    headers: { ...fromThePage, cookie },
    body: '{}',
  })
  if (response.status !== 200) throw new Error(`signing out: ${response.status}`)
}
