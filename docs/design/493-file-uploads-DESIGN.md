# #493: a `file` recipe, over an upload route that takes any file

Status: design, 2026-11-09. Not built.

## The problem

`foldkit-form-recipes/image` uploads where an image is chosen, through
`foldkit-media/browser`'s `upload` and the server's `POST /_media/upload`. That
route takes only `image/*` and keeps only what `describe` reads as an image. A
form key holding any other file (a PDF, a spreadsheet, an archive) has no
route, so no recipe.

Serving arbitrary bytes back is the risk. Images reach a browser only through
the variant server, transformed, so no uploaded byte is ever served as it
came. A file route would serve the bytes themselves. Served carelessly, an
uploaded HTML or SVG file runs script on the application's origin, with its
cookies: stored cross-site scripting. Everything below is shaped by that.

## What stays as the image route has it

- **A policy first, with no default.** `UploadPolicy.admit(request, route)` is
  asked before the body is read. A server that serves files names who may
  upload. `foldkit-guard/media` reads `config[route] ?? []`, so a route an
  application has not configured refuses everyone.
- **A size bound, enforced as the body streams** (`bodyOf`). A declared length
  is the client's to write, so it is not trusted.
- **Content-addressed storage.** Bytes are kept under the hash of their
  content, never under a name the client chose, so no path, no traversal and
  no overwrite of another's file can be asked for.
- **A refusal says only its kind** (`Forbidden`, `TooLarge`, `Unsupported`);
  the reason stays on the server, reported as a diagnostic.

## Decisions

### 1. Two routes of their own, beside the image routes

- `POST /_media/files` keeps a file's bytes.
- `GET /_media/files/:key` serves them back.

They are a separate `HttpApi` group (`FileApi`) with their own services, so a
server that serves images takes no file service, and the reverse. They are
not folded into `/_media/upload`: an image's answer is facts its `Inspector`
read, while a file's bytes are opaque.

### 2. Cross-site uploads stay impossible: no CORS-safelisted body

The image route's guard against a cross-site upload is its content type:
`image/*` is not CORS-safelisted, so a browser preflights a cross-origin
POST, and the route never answers a preflight. Any file's own type could be
`text/plain`, which is safelisted. So the file route does not use the file's
type as the request's:

- The body is sent as `application/octet-stream`, which is not safelisted.
  Any other request type is refused (415) before the body is read.
- The file's declared type and name travel in headers of the route's own
  (`x-foldkit-file-type`, and `x-foldkit-file-name` percent-encoded as UTF-8).
  A non-safelisted header forces a preflight too. Each is decoded on the
  server, and refused (400) past 255 bytes or holding a control character.

### 3. What it serves cannot run on the application's origin

`GET /_media/files/:key` answers with these headers, whatever the file is:

- `Content-Type: application/octet-stream`. The declared type is never served.
  It is a fact for the application's interface, not something the browser
  acts on.
- `Content-Disposition: attachment`, with the name from the request's `name`
  parameter, encoded as RFC 6266's `filename*=UTF-8''…` beside an ASCII
  fallback. CR, LF and quotes are refused, so the header cannot be split.
- `X-Content-Type-Options: nosniff`, so the browser does not guess a type.
- `Content-Security-Policy: sandbox`, defence in depth should the file ever be
  rendered.
- `Cache-Control: private, no-store` by default. A file may be private, unlike
  a public image variant.

A deployment may also serve files from a separate origin. The README will say
so; the route does not require it.

### 4. Who may read a file is the application's decision, asked per file

Image variants are public by their hash. A file may be a private document,
and a content hash is no secret for content an attacker can guess. So a
download asks its own service, `FileReadPolicy.read(request, key)`, which has
no default: a server that serves files says who may read each one, typically
by looking up the row that holds the key. It is a service apart from
`UploadPolicy` because it is asked with the file's key, which the upload
policy's `admit(request, route)` is not, and because reading an upload is a
different question from making one. `UploadRoute` gains `'UploadFile'` for the
upload, which `foldkit-guard/media` refuses until configured.

### 5. Types: an allowlist the application gives, and no claim it is a check

`FileOptions.accept` is required: a list of MIME types or `type/*` patterns,
or `'*'`, said deliberately, for any file. The upload refuses a declared type
outside it (415). The declared type is the client's to write, so the
allowlist shapes the product and does not secure the server. Section 3 does
that, whatever the type. An application that must know a file's content
(magic bytes, a malware scan) gives `inspect: (bytes, declared) =>
Effect<void, FileRefused>`, run before the bytes are kept.

### 6. What a file is: `FileAsset`, the facts the route answers

```ts
FileAsset = { key: string, name: string, type: string, size: number }
```

The route answers it with `201`. `key` and `size` are the server's, the hash
and the length it read. `name` and `type` are the declared values, validated
as in section 2. The application stores the `FileAsset` in its own row, as it
stores an `ImageAsset`. The store keeps only bytes by key: one upload of the
same bytes under two names keeps one copy, and each row names its own.

### 7. The recipe: `foldkit-form-recipes/file`

`FieldRecipes.file({ url?, accept?, maxBytes? })` mirrors `image`: a Bundle
control (`Input.bundle`, with `busy` and `settled`) holding a picker, then the
upload with its progress, which can be cancelled, and a refusal, which can be
retried. Its value is the `FileAsset` the route kept. A file on its way, or
refused, is nothing entered. Its display shows the name and size, linking to
the download. The browser side is `foldkit-media/browser`'s
`uploadFile(file, options)`, beside `upload`, which sets the request type and
the two headers. `accept` on the client only filters the picker; the server's
list decides.

## Considered and rejected

- **Serving the declared type inline** (a PDF in a browser tab). It is
  convenient, but one trusted type list away from stored XSS through a
  mis-declared HTML file. An application that wants inline PDFs can serve
  them through a route of its own that checks the bytes.
- **`multipart/form-data` uploads.** That type is CORS-safelisted, and so open
  to cross-site posts.
- **Storing the name with the bytes.** It would give one hash two names, and
  move a fact the application owns into the store.
- **A default `accept` of everything.** "Any file" should be a choice written
  down, not an omission.

## Left out

- Resumable or chunked uploads, and range requests on download.
- Removing bytes no row references any longer. The image store has the same
  gap.
- Quotas per principal. The admission rate limiter
  (`admissionRateLimiter`) applies to these routes as to the image routes.

## Checks the build must have

- **Upload refusals, each by a test:**
  - a policy that refuses;
  - a safelisted request type (`text/plain`, `multipart/form-data`,
    `application/x-www-form-urlencoded`);
  - a body over `maxBytes`, stopped while streaming;
  - a declared type outside `accept`;
  - a name with CR, LF or a quote, or over 255 bytes;
  - an `inspect` refusal.
- **Download:**
  - asks `FileReadPolicy`, and refuses without it;
  - answers the headers in section 3 for a file declared `text/html` and
    one declared `image/svg+xml`;
  - writes a name with non-ASCII characters into `filename*`, correctly.
- **A browser test** that a downloaded HTML file is not rendered, and runs no
  script.
- **The recipe:** the image recipe's tests, mirrored.
- **Mutation specs** for each refusal and each header.
