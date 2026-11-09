# #493: a `file` recipe, over an upload route that takes any file

Status: design, revised twice on 2026-11-09 after two rounds of independent
security review: five blocking findings in the first, two in the second, all
taken (see "What the reviews changed"). Not built.

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
cookies. And a private file is only private if nothing lets one person name,
claim or detect another's. Everything below is shaped by those facts.

## What stays as the image route has it

- **A policy asked before the body is read, with no default.**
- **A size bound, enforced as the body streams.** A declared length is the
  client's to write, so it is not trusted.
- **Bytes kept under a name the server chose**, never one the client chose.
- **Bytes kept before the facts about them**, so kept facts mean kept bytes
  (`upload.ts`'s `Uploads.put`).
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

### 2. A file is named by a key the server mints, and stored under it alone

The upload mints a random key: 128 bits from `SecureRandom`, written as 32
lowercase hex characters. A content hash would be no secret for content
someone can guess. A key that only the uploader was ever told cannot be
guessed or enumerated.

The store keeps, under that key, the bytes and then a record:

```ts
FileAsset = { key: string, name: string, type: string, size: number }
FileRecord = { asset: FileAsset, owner: string, uploadedAt: number, row: Option<string> }
```

Bytes are not shared between uploads, even identical ones. Sharing them
would skip a write for bytes already stored, and the faster answer would tell
an uploader that someone else holds those exact bytes. That lets anyone test
guesses of another person's document. Every upload writes its bytes, and
deleting one file never touches another's.

### 3. A key is claimed once, by its uploader, for one row

A form submits a `FileAsset`, and a client can write any `key` into it. So
the application never stores the facts its client sent. Its mutation handler
calls `FileStore.claim(key, { owner, row })`, which answers the server's
`FileAsset` or fails with `FileUnclaimed`:

- **An unclaimed key** is claimed only by its `owner`, within `claimWithin`
  (default 24 hours) of its upload. The record is then bound to `row`, an
  opaque string naming where the application keeps it (`Post:p1#attachment`),
  for good.
- **A claimed key** succeeds only for the same `row`, whoever saves it. A
  teammate re-saving a row unchanged passes. Putting the key into any other
  row fails, its uploader included.
- **An unknown or expired key, or someone else's,** fails alike.

`owner` is what `FileUploadPolicy.admit(request)` answers: the uploader's id.
The policy is a service apart from `UploadPolicy` because it must say who is
uploading, which `UploadPolicy`'s `admit(request, route)` does not.
`UploadRoute` is unchanged, so no existing route-blind policy, such as
`uploadPolicyBearer`, admits file uploads by accident.

An empty owner is refused when the upload is made, and reported as a
diagnostic: a policy answering `""` would let every visitor claim every
other's upload. The id must also be stable and never reused. That is the
application's promise, and the README will say so. A reused id could claim
only the previous holder's unclaimed uploads, within `claimWithin`.

### 4. Who may read a file is asked first

A download asks `FileReadPolicy.read(request, key)` before the store is read,
typically by looking up the application's row holding the key. Then:

- a key that does not match `^[0-9a-f]{32}$` is refused before either is
  asked, so no other part of the store can be named;
- a policy that cannot tell who is asking answers `401`, which depends on the
  request and not on the key, so the recipe can ask the reader to sign in
  again;
- an unreadable key and an unknown key get one answer, `404`, so a refusal
  never says whether a file exists.

A policy that looks a row up may answer faster for a key without one. With a
minted key, that tells someone only what holding the key already did.

### 5. What it serves cannot run on the application's origin, or leak to another

`GET /_media/files/:key` writes its own headers, on its answer and on every
refusal. It does not use `headersFor`, whose `access-control-allow-origin: *`,
`cross-origin-resource-policy: cross-origin` and `timing-allow-origin: *` suit
public image variants and must never reach a private file.

- `Content-Type: application/octet-stream`. The declared type is never served.
- `Content-Disposition: attachment`, with the record's name (never a query
  parameter, which the route ignores):
  - as RFC 6266 `filename*=UTF-8''…`, percent-encoding everything outside
    RFC 5987's attribute characters, `'`, `(`, `)` and `*` included;
  - beside an ASCII fallback `filename="…"` keeping only letters, digits,
    space, `.`, `_` and `-`, with every other character as `_`. That keeps
    out `"`, `\` and `%`; Chromium percent-decodes the fallback.
- `X-Content-Type-Options: nosniff`.
- `Content-Security-Policy: sandbox; default-src 'none'`.
- `Cross-Origin-Resource-Policy: same-origin`, so another site's page cannot
  load the bytes into its own process.
- `Cache-Control: private, no-store`.
- No `Access-Control-Allow-*`, no `Timing-Allow-Origin`, and no
  `cdn-cache-control`.

### 6. Cross-site uploads stay impossible: no CORS-safelisted request

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

### 7. Names and types are parsed, not matched

- **The name** is percent-encoded UTF-8 in its header. A malformed encoding
  is a `400`, not a defect. After decoding, the name must:
  - be non-empty and at most 255 bytes;
  - hold no character of Unicode categories Cc (control), Cf (format, which
    covers the bidi marks and overrides, zero-width characters, U+061C and
    U+FEFF), Zl or Zp;
  - hold no `/` and no `\`.
- **The type** is parsed with the MIME grammar (`type/subtype`, tokens,
  parameters dropped) and compared without regard to case, never
  prefix-matched. `text/html;x=image/png` is `text/html`.

### 8. Types: an allowlist the application gives, and no claim it is a check

`FileOptions.accept` is required: a list of MIME types or `type/*` patterns,
or `'*'`, said deliberately. The upload refuses a declared type outside it
(415). The declared type is the client's to write, so the allowlist shapes
the product and does not secure the server; section 5 does that. An
application that must know a file's content (magic bytes, a malware scan)
gives `inspect: (bytes, declared) => Effect<void, FileRefused>`, run before
anything is kept.

### 9. Memory, time and rate

- **Memory.** `bodyOf` holds the chunks and then one whole copy, so an upload
  holds about twice `maxBytes`. At most `maxConcurrent` uploads (default 2)
  run at once, through a semaphore built with the layer (once per server, so
  once per Worker isolate). One past it answers `503` at once and does not
  queue, so slow uploads cannot hold every other upload waiting.
- **Time.** Reading a body has a deadline, `bodyWithin` (default 60 seconds),
  past which it answers `408`. A client trickling bytes cannot hold a slot.
- **Rate.** The upload asks `Admission` when one is provided, as the variant
  server does. (The image upload route asks none today; that is a gap of its
  own, not fixed here.)

`maxBytes` defaults to 20 MB, as for images. The defaults hold
`2 × 20 MB × 2 = 80 MB` at most, within a 128 MB Worker; the README will say
to lower them where an `inspect` copies the bytes.

### 10. The recipe: `foldkit-form-recipes/file`

`FieldRecipes.file({ url?, accept?, maxBytes? })` mirrors `image`: a Bundle
control (`Input.bundle`, with `busy` and `settled`) holding a picker, then the
upload with its progress, which can be cancelled, and a refusal, which can be
retried. Its value is the `FileAsset` the route answered, and the
application claims it on save (section 3). Its display shows the name and
size, linking to the download. The browser side is `foldkit-media/browser`'s
`uploadFile(file, options)`, beside `upload`, which sets the request type and
the two headers. `accept` on the client only filters the picker; the server's
list decides.

## What the reviews changed

| Finding | First draft | Now |
| --- | --- | --- |
| B1: a client names another's file | the content hash as the key; facts from the client | a minted key, claimed once by its uploader for one row |
| B2: the download name from the URL | `?name=` | the record's name; the parameter is ignored |
| B3: shared headers leak a private file | unspecified | headers of its own on every answer: CORP `same-origin`, no ACAO or TAO, `no-store` |
| B4: a 404 confirms a file exists | order unspecified | the policy first; unknown and unreadable answered alike |
| B5: the keyspace was shared | any `:key` | the key's grammar checked first; a store apart from `Originals` |
| N1: `claim` repeatable, unbound, trusting | (second draft) claim by owner, any number of times | once, for one row; the same row after; an empty owner refused; unclaimed keys expire |
| N2: shared bytes leak by timing | (second draft) bytes deduplicated by hash | none shared: every upload writes its own |
| N3 and A2: memory and waiting | unbounded | `maxConcurrent` answering 503 when full; `bodyWithin` |
| A1: the rate-limit claim | "applies as to the image routes" (false) | `Admission` asked when given; the image route's gap named |
| A3: "refuses until configured" | true only for guard | mounting `FileApi` is the opt-in; `UploadRoute` unchanged |
| A5: names and types | control characters only; prefix-matched type | categories Cc, Cf, Zl and Zp refused; MIME grammar, any case; a strict fallback |

## Considered and rejected

- **Serving the declared type inline** (a PDF in a browser tab). It is one
  trusted type list away from stored XSS through a mis-declared HTML file.
- **`multipart/form-data` uploads.** That type is CORS-safelisted.
- **The content hash as the key**, and bytes shared by hash. One turns a leak
  into a read, the other turns an upload into a probe.
- **A claim by owner alone.** A teammate could not re-save, so applications
  would skip it.
- **A default `accept` of everything.** "Any file" should be a choice written
  down.

## Left out

- Resumable or chunked uploads, and range requests on download.
- Removing the bytes of expired or unreferenced files. `claimWithin` stops an
  expired upload being used; reclaiming its space is a sweep left to come.
- Quotas per principal, beyond `Admission`.
- Hashing as the body streams. It would halve memory, but needs an
  incremental SHA-256, which Web Crypto lacks.

## Checks the build must have

- **Upload refusals, each by a test:**
  - a policy that refuses, and one answering an empty owner;
  - a safelisted request type (`text/plain`, `multipart/form-data`,
    `application/x-www-form-urlencoded`);
  - a body over `maxBytes`, stopped while streaming;
  - a body slower than `bodyWithin`, cut off;
  - an upload past `maxConcurrent`, answered 503 at once;
  - a declared type outside `accept`, including `text/html;x=image/png`, and
    one inside it in another case;
  - a name malformed in its encoding, over 255 bytes, empty, or holding a
    Cc, Cf, Zl or Zp character, `/` or `\`;
  - an `inspect` refusal.
- **Two uploads of the same bytes** take the same path and keep two copies.
- **Claims:**
  - a key claimed by another owner fails, as an unknown key does;
  - a key claimed after `claimWithin` fails;
  - a second claim for the same row succeeds, whoever makes it;
  - a claim of a claimed key for another row fails, its owner included;
  - the facts `claim` answers are the server's, whatever a client sent.
- **Downloads:**
  - the policy is asked before the store;
  - unknown and unreadable keys get the same `404`;
  - a policy that cannot tell who asks answers `401`;
  - a key outside the grammar, or `facts%2F…`, is refused before either is
    asked;
  - every header in section 5, on the answer and on each refusal, and none
    of `headersFor`'s three;
  - a `name` query parameter is ignored;
  - `filename*` encodes non-ASCII characters and `'()*`, and the fallback
    holds no `"`, `\` or `%`;
  - the variant server cannot read a file's bytes.
- **A browser test** that a downloaded HTML file is not rendered and runs no
  script.
- **The recipe:** the image recipe's tests, mirrored.
- **Mutation specs** for each refusal, each header and each claim rule.
