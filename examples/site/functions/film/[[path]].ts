/**
 * The walkthrough film, answered by byte range. Pages serves a static file
 * whole whatever the request's `Range`, and Safari plays a video only from a
 * server that answers a range with 206.
 */

/** The part of a file one `Range` header asks for, or why it cannot be had. */
export const rangeOf = (
  header: string,
  size: number,
): { readonly start: number; readonly end: number } | 'whole' | 'unsatisfiable' => {
  const asked = /^bytes=(\d*)-(\d*)$/.exec(header.trim())
  // Several ranges, another unit, or no header: the whole file, as Pages sends it.
  if (asked === null) return 'whole'
  const [, from = '', to = ''] = asked
  if (from === '' && to === '') return 'unsatisfiable'
  if (from === '') {
    const last = Number(to)
    return last === 0 ? 'unsatisfiable' : { start: Math.max(0, size - last), end: size - 1 }
  }
  const start = Number(from)
  const end = to === '' ? size - 1 : Math.min(Number(to), size - 1)
  return start >= size || start > end ? 'unsatisfiable' : { start, end }
}

interface Context {
  readonly request: Request
  readonly env: { readonly ASSETS: { readonly fetch: (url: URL) => Promise<Response> } }
}

export const onRequestGet = async ({ request, env }: Context): Promise<Response> => {
  const file = await env.ASSETS.fetch(new URL(new URL(request.url).pathname, request.url))
  const headers = new Headers(file.headers)
  headers.set('accept-ranges', 'bytes')
  if (!file.ok) return new Response(file.body, { status: file.status, headers })
  const body = await file.arrayBuffer()
  const range = rangeOf(request.headers.get('range') ?? '', body.byteLength)
  if (range === 'whole') return new Response(body, { status: 200, headers })
  if (range === 'unsatisfiable') {
    return new Response(null, {
      status: 416,
      headers: { 'content-range': `bytes */${body.byteLength}` },
    })
  }
  headers.set('content-range', `bytes ${range.start}-${range.end}/${body.byteLength}`)
  headers.set('content-length', String(range.end - range.start + 1))
  return new Response(body.slice(range.start, range.end + 1), { status: 206, headers })
}
