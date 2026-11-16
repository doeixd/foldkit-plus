/**
 * How the dev server's page gets the classes its static regions drew. Foldkit's
 * pipeline renders the page, and the template's head is written by the Vite
 * plugin in `vite.config.ts`, which cannot load the application a second time
 * (its modules register themselves once). The render hands its classes across
 * on `globalThis`, where either side may arrive first.
 */
interface Entry {
  readonly promise: Promise<string>
  readonly resolve: (css: string) => void
}

declare global {
  // eslint-disable-next-line no-var
  var __foldkitSiteDevStyle: Map<string, Entry> | undefined
}

const entryFor = (path: string): Entry => {
  const entries = (globalThis.__foldkitSiteDevStyle ??= new Map())
  const known = entries.get(path)
  if (known !== undefined) return known
  let resolve: (css: string) => void = () => undefined
  const promise = new Promise<string>(done => {
    resolve = done
  })
  const entry = { promise, resolve }
  entries.set(path, entry)
  return entry
}

/** The render of `path` is done: its classes, as a style element. */
export const publishStyle = (path: string, css: string): void => {
  entryFor(path).resolve(`<style>${css}</style>`)
}

/** What the render of `path` drew, once it has; nothing if no render comes within a few seconds. */
export const styleFor = async (path: string): Promise<string> => {
  const entry = entryFor(path)
  const timeout = new Promise<string>(resolve => setTimeout(() => resolve(''), 5000))
  const css = await Promise.race([entry.promise, timeout])
  globalThis.__foldkitSiteDevStyle?.delete(path)
  return css
}
