# Laws

What `Laws.check` says of every write `src/domain.ts` declares, written by
`test/laws.test.ts`: run it with `-u` after changing a write, and read the
difference.

```text
Product
  Draft -> Published   Publish   holds
  Published -> Draft   Revert    refused by publishedStaysPublished
  Archived -> Draft    Revert    undeclared
  Archived                       unreached

Rename    x reservedWithinStock       kept: writes no member it reads
Rename    x publishedStaysPublished   kept: 3 rows enumerated
Publish   x reservedWithinStock       kept: writes no member it reads
Publish   x publishedStaysPublished   kept: 1 row enumerated
Revert    x reservedWithinStock       kept: writes no member it reads
Revert    x publishedStaysPublished   refused: from {"status":"published"} it leaves {"status":"draft"}
Restock   x reservedWithinStock       undecided: stock is incremented
Restock   x publishedStaysPublished   kept: 3 rows enumerated
Sell      x reservedWithinStock       undecided: stock is incremented
Sell      x publishedStaysPublished   kept: 3 rows enumerated
```
