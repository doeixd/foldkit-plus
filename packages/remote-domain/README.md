# foldkit-remote-domain

Experimental: a bridge from an [Alchemy Domain](https://github.com/alchemy-run/alchemy)
Api to Remote. It tracks a beta and pins the exact `@alchemy.run/domain` and
`alchemy` releases it was checked against.

Only `Receipt` (the `{ stream, version }` a command answers with) is exported
so far; the adapter, the lowering of a write and the import of the graph land
in later releases.
