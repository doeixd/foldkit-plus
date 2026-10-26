# Field recipes, one page each

A gallery of every recipe in
[`foldkit-form-recipes`](../../packages/form-recipes/README.md). Each entry is a
key's schema, a stored value, something a person might type and something the
recipe refuses; the gallery runs each through a real one-key form and says what
the form made of it. Only each recipe's call and its failures are written by
hand, the failures restating the package README.

```bash
pnpm --filter foldkit-example-fields demo    # the trace below
pnpm --filter foldkit-example-fields build   # dist/, a page per recipe
```

For each recipe the trace says:

| Line | What it is |
| --- | --- |
| `stored` | the key's value as it is stored: the schema's encoded side, as JSON |
| `draft` | what the control shows once the form is filled with it |
| `typed` | a draft, and what the form stores for it or why it refuses it |
| `follows` | for `slug`, what it writes from the key it follows on a blank form |
| `in a list` | the recipe's display, as a table or a detail reads the value |

```text
money-minor: FieldRecipes.money({ currency: 'EUR', unit: 'minor', locale: 'de-DE' })
  stored 123456
  draft "1.234,56 €"
  typed "1.234,5" stores 123450
  typed "12.3" refused: Enter an amount
  in a list "1.234,56 €"
```

`build` renders each page on the server with the recipes' plain renderers
(`foldkit-form-recipes/html`), with no script: the control holds the stored
value's draft, and `image`, a control backed by a Bundle, shows its kept image.

- `src/gallery.ts`: the entries.
- `src/read.ts`: one entry through a real form.
- `src/demo.ts`: the trace; `src/render.ts` and `src/build.ts`: the pages.
- `test/demo.test.ts` pins the whole trace; `test/pages.test.ts` parses every
  page back.
