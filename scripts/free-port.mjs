/**
 * Starts a server on a port nobody chose, again when the port was taken
 * before it bound. Vite 8 resolves `port: 0` by listening on a free port,
 * closing it, and binding that port again (`httpServerStart`), so another
 * process can take it in between and Vite fails "Port N is already in use";
 * a test that probes a free port itself has the same gap. `start` must pick
 * its port afresh each call, as `vite.listen()` with `port: 0` does: a port
 * a configuration names that is in use stays in use.
 */
export const onFreePort = async start => {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await start()
    } catch (error) {
      const taken = error instanceof Error && /^Port \d+ is already in use$/.test(error.message)
      if (!taken || attempt === 5) throw error
    }
  }
}
