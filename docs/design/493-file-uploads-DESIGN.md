# #493: a `file` recipe, over an upload route that takes any file

Status: design, revised 2026-11-09 after an independent security review (five
blocking findings, all taken; see "What the review changed"). Not built.

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
cookies. And a private file is only private if nothing lets one person name
another's. Everything below is shaped by those two facts.

## What stays as the image route has it

- **A policy asked before the body is read, with no default.**
- **A size bound, enforced as the body streams.** A declared length is the
  client's to write, so it is not trusted.
- **Bytes kept under the hash of their content**, never under a name the
  client chose.
- **A refusal says only its kind**; the reason stays on the server, reported
  as a diagnostic.

## Decisions

### 1. Routes and services of their own

- `POST /_media/files` keeps a file.
- `GET /_media/files/:key` serves it back.

They form a separate `HttpApi` (`FileApi`). Mounting it is the opt-in: a
server that mounts only the image routes serves no file. `FileApi` needs
three services, none with a default:

- `FileUploadPolicy`: who may upload;
- `FileReadPolicy`: who may read which file;
- `FileStore`: where files are kept.

`FileStore` is its own store, not `Originals`, so no uploaded file can ever be
read by the variant server as an image to transform. That would skip the
`Inspector`'s check on the image route.

### 2. A file is named by a key the server mints, and its facts are the server's

The upload mints a random key: 128 bits from `SecureRandom`, written as 32
lowercase hex characters. It is not the content hash. A hash is no secret for
content someone can guess, and a key that only the uploader was ever told
cannot be guessed or enumerated.

The store keeps two things:

- the bytes, under their SHA-256, so one upload of the same bytes under two
  keys keeps one copy;
- a record under the key: the file's facts (`FileAsset`), and its owner.

```ts
FileAsset = { key: string, name: string, type: string, size: number }
```

The owner is what `FileUploadPolicy.admit(request)` answers: an opaque
string, such as the principal's id. That policy is a service apart from
`UploadPolicy` because it must say who is uploading, which `UploadPolicy`'s
`admit(request, route)` does not. `UploadRoute` is unchanged, so no existing
policy, route-blind ones such as `uploadPolicyBearer` included, admits file
uploads by accident.

A form submits a `FileAsset`, and a client can write any `key` into it. So
the application never stores the facts its client sent. Its mutation handler
calls `FileStore.claim(key, owner)`, which answers the server's `FileAsset`
for a key that `owner` uploaded, and fails with `FileUnclaimed` otherwise,
whether the key is unknown or someone else's. This is the file route's
`StoredFacts`: the server's facts, never facts a client sends back. A key
leaked through a shared link, a log or browser history gives nobody else a
claim on the file.

### 3. Who may read a file is asked first, and answered once

A download asks `FileReadPolicy.read(request, key)` before the store is read,
typically by looking up the application's row holding the key. Then:

- a key that does not match `^[0-9a-f]{32}$` is refused before either is
  asked, so no other part of the store can be named;
- an unreadable key and an unknown key get one answer, `404` with
  `no-store`, so a refusal never says whether a file exists.

### 4. What it serves cannot run on the application's origin, or leak to another

`GET /_media/files/:key` writes its own headers. It does not use
`headersFor`, whose `access-control-allow-origin: *`,
`cross-origin-resource-policy: cross-origin` and `timing-allow-origin: *` suit
public image variants and must never reach a private file.

- `Content-Type: application/octet-stream`. The declared type is never served.
- `Content-Disposition: attachment`, with the record's name (never a query
  parameter, which the route ignores). It is written as RFC 6266
  `filename*=UTF-8''…`, percent-encoding everything outside RFC 5987's
  attribute characters (`'`, `(`, `)` and `*` included), beside an ASCII
  fallback with every other character replaced by `_`.
- `X-Content-Type-Options: nosniff`.
- `Content-Security-Policy: sandbox; default-src 'none'`.
- `Cross-Origin-Resource-Policy: same-origin`, so another site's page cannot
  load the bytes into its own process.
- `Cache-Control: private, no-store`, on this answer and on every refusal.
- No `Access-Control-Allow-*`, no `Timing-Allow-Origin`, and no
  `cdn-cache-control`.

### 5. Cross-site uploads stay impossible: no CORS-safelisted request

- The body is sent as `application/octet-stream`, which is not CORS-
  safelisted. Any other request type is refused (415) before the body is
  read.
- The file's declared type and name travel in headers of the route's own,
  `x-foldkit-file-type` and `x-foldkit-file-name`; a non-safelisted header
  forces a preflight too. The route answers no preflight. A no-cors request
  drops a non-safelisted `content-type`, and so is refused.

This fails open if an application adds CORS middleware that answers
`OPTIONS` for these paths; the README will say so. The session resolver's own
CSRF check stays the main defence, as for every write.

### 6. Names and types are parsed, not matched

- **The name** is percent-encoded UTF-8 in its header. A malformed encoding
  is a `400`, not a defect. After decoding it must be at most 255 bytes,
  non-empty, and hold no C0 or C1 control character, no bidi or format
  character (U+200E, U+200F, U+202A to U+202E, U+2066 to U+2069), no `/` and
  no `\`.
- **The type** is parsed with the MIME grammar (`type/subtype`, tokens,
  parameters dropped), never prefix-matched. `text/html;x=image/png` is
  `text/html`.

### 7. Types: an allowlist the application gives, and no claim it is a check

`FileOptions.accept` is required: a list of MIME types or `type/*` patterns,
or `'*'`, said deliberately. The upload refuses a declared type outside it
(415). The declared type is the client's to write, so the allowlist shapes
the product and does not secure the server; section 4 does that. An
application that must know a file's content (magic bytes, a malware scan)
gives `inspect: (bytes, declared) => Effect<void, FileRefused>`, run before
anything is kept.

### 8. Memory and rate

`bodyOf` holds the chunks and then one whole copy, so an upload holds about
twice `maxBytes`. File uploads are bounded by `maxConcurrent` (default 2, a
semaphore), so the route never holds more than `2 × maxBytes × maxConcurrent`.
`maxBytes` defaults to 20 MB, as for images. The upload asks `Admission` when
one is provided, as the variant server does. (The image upload route asks
none today; that is a gap of its own, not fixed here.)

### 9. The recipe: `foldkit-form-recipes/file`

`FieldRecipes.file({ url?, accept?, maxBytes? })` mirrors `image`: a Bundle
control (`Input.bundle`, with `busy` and `settled`) holding a picker, then the
upload with its progress, which can be cancelled, and a refusal, which can be
retried. Its value is the `FileAsset` the route answered, and the
application claims it on save (section 2). Its display shows the name and
size, linking to the download. The browser side is `foldkit-media/browser`'s
`uploadFile(file, options)`, beside `upload`, which sets the request type and
the two headers. `accept` on the client only filters the picker; the server's
list decides.

## What the review changed

| Finding | Before | Now |
| --- | --- | --- |
| B1: a client names another's file | the content hash as the key; facts from the client | a minted key; `FileStore.claim` answers the server's facts for its owner only |
| B2: the download name from the URL | `?name=` | the record's name; the parameter is ignored |
| B3: shared headers leak a private file | unspecified | headers of its own: CORP `same-origin`, no ACAO or TAO, `no-store` everywhere |
| B4: a 404 confirms a file exists | order unspecified | the policy first; unknown and unreadable answered alike |
| B5: the keyspace was shared | any `:key` | the key's grammar checked first; a store apart from `Originals` |
| A1: the rate-limit claim | "applies as to the image routes" (false) | `Admission` asked when given; the image route's gap named |
| A2: memory | not bounded | `maxConcurrent` |
| A3: "refuses until configured" | true only for guard | mounting `FileApi` is the opt-in; `UploadRoute` unchanged |
| A5: names and types | control characters only; prefix-matched type | full rules, MIME grammar |

## Considered and rejected

- **Serving the declared type inline** (a PDF in a browser tab). It is one
  trusted type list away from stored XSS through a mis-declared HTML file.
- **`multipart/form-data` uploads.** That type is CORS-safelisted.
- **The content hash as the key.** It is guessable for known content, and so
  turns one leak into a read.
- **A default `accept` of everything.** "Any file" should be a choice written
  down.

## Left out

- Resumable or chunked uploads, and range requests on download.
- Removing bytes and records no row references any longer.
- Quotas per principal, beyond `Admission`.
- Hashing as the body streams. It would halve memory, but needs an
  incremental SHA-256, which Web Crypto lacks.

## Checks the build must have

- **Upload refusals, each by a test:**
  - a policy that refuses;
  - a safelisted request type (`text/plain`, `multipart/form-data`,
    `application/x-www-form-urlencoded`);
  - a body over `maxBytes`, stopped while streaming;
  - a declared type outside `accept`, including `text/html;x=image/png`;
  - a name malformed in its encoding, over 255 bytes, empty, or holding a
    control, bidi or format character, `/` or `\`;
  - an `inspect` refusal.
- **Claims:** a key uploaded by one owner, claimed by another, fails
  `FileUnclaimed`, as an unknown key does; the facts `claim` answers are the
  server's, whatever a client sent.
- **Downloads:**
  - the policy is asked before the store;
  - unknown and unreadable keys get the same answer;
  - a key outside the grammar, or `facts%2F…`, is refused before either is
    asked;
  - every header in section 4, and none of `headersFor`'s three;
  - a `name` query parameter is ignored;
  - `filename*` encodes non-ASCII characters and `'()*`;
  - the variant server cannot read a file's bytes.
- **Concurrency:** a third upload waits while two are in flight.
- **A browser test** that a downloaded HTML file is not rendered and runs no
  script.
- **The recipe:** the image recipe's tests, mirrored.
- **Mutation specs** for each refusal and each header.
