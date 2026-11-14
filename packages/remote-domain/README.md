# foldkit-remote-domain

Experimental: a bridge from an [Alchemy Domain](https://github.com/alchemy-run/alchemy)
Api to Remote. It tracks a beta and pins the exact `@alchemy.run/domain` and
`alchemy` releases it was checked against.

It exports `Receipt` (the `{ stream, version }` a command answers with) and
`DomainRemote`, the `RemoteClient` over an Api; the lowering of a write and the
import of the graph land in later releases.

A View is bound by a numeric revision field that every event of a key's stream
moves, and that must keep rising across the stream's whole life: rows are
ordered by it, and once a key reads as deleted or hidden at a revision, no row
of that revision or an earlier one is let back in for who asks. A key created
again at a lower revision stays absent to them.
