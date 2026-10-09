/**
 * Pages cannot define a Durable Object class. `/sync` is forwarded to the
 * class exported by the `foldkit-cloudflare` Worker. A service binding drops
 * the socket's replies, so this calls the object itself. `/remote` is the
 * Worker's fetch, which reads D1.
 */
export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url)
    if (pathname === '/sync') {
      return env.SYNC_HOST.get(env.SYNC_HOST.idFromName('todos')).fetch(request)
    }
    if (pathname === '/remote') return env.API.fetch(request)
    return env.ASSETS.fetch(request)
  },
}
