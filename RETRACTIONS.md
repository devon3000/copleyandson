# Retractions

Commitments we have withdrawn, files we have corrected, and why. A withdrawal is an ordinary commit: history is never rewritten, so
every withdrawn file stays in this repository's git history and its Bitcoin timestamp stays verifiable.

## 2026-09-30: the September print was signed a day early (withdrawn 2026-10-01)

| stream | date | seq | root |
|---|---|---|---|
| `etf-growth/v8.0` | 2026-09-30 | 1 | `b6f7ac307566e224dfd82cf52878ff6bc2b867c9f0b0f155c433a8d70481c4a5` |
| `etf-preserve/v8.0` | 2026-09-30 | 1 | `3339e330ad8d69442bc14e4dc369fc9f8bebabf2eafe4f164287dc9429335645` |

Both proofs and their `.ots` timestamps were removed on 2026-10-01; the last commit containing them is `49cf8ba`.

**What happened.** The nightly job that should run after the market close was delayed by GitHub until 01:52 ET
on 2026-09-30, before that day's session had traded. Our pipeline used the wall-clock date as the signal date,
so it treated 2026-09-30 as the print night and signed the month's commitment at 06:04 UTC using prices from the
2026-09-29 close. The signatures, chain links and timestamps are genuine; the inputs were one session early.
These two commitments are therefore not the September signal and are not part of the track record.

**What replaces them.** The September signal is re-issued from the 2026-09-30 close. ETF Growth prints at the
same path, `signals/etf-growth/v8.0/2026-09-30.proof.json`, with a new root. ETF Preserve prints as a new
version, `signals/etf-preserve/v8.1/`, because its model changed before the re-issue and the withdrawn root
above remains bound to the old v8.0 configuration. Each new chain's genesis names the last valid commitment
(the `v7.0` 2026-08-31 tip) in `succeeds`, not the withdrawn roots.

**What could not be undone.** The model portfolio mirrored on Collective2 rebalanced ETF Growth at the
2026-09-30 open on the withdrawn signal, one session earlier than scheduled. The re-issued signal from the
2026-09-30 close has the same ETF Growth target, so no further orders follow from it.

**The fix.** The signal date is now the most recent NYSE session whose 16:00 ET close has passed, and the
pipeline refuses to sign unless the newest price it holds is from that session.

## 2026-08-31 v7.0 proof files republished as signed (corrected 2026-10-01)

Not a retraction: nothing signed was changed. `signals/etf-growth/v7.0/2026-08-31.proof.json` and
`signals/etf-preserve/v7.0/2026-08-31.proof.json` were first published correctly at 00:54 UTC on 2026-09-01
(`42e9961`). A second, delayed run of the same nightly job at 02:10 UTC (`12c26ef`) rewrote both files with its own
run metadata (`engine_sha256_run`, `engine_ok`) and without the `succeeds` field, while keeping the original root and
signature. The files then no longer matched what had been signed, so `verify.mjs` reported them as tampered. Both are
restored to the `42e9961` bytes, which are what the roots commit to. The roots, signatures and Bitcoin timestamps are
unchanged.

`verify.mjs` is also corrected: it rebuilt each entry without `succeeds`, the lineage pointer that the first entry of
a new version's chain carries, so it failed every such entry even when the file was intact.

## 2026-09-30 note: ETF Preserve v8.1 was cut on the evening of its first print

Not a retraction. ETF Preserve v8.1 was released at 20:44 ET on 2026-09-30, after that day's 16:00 ET close, and
its first commitment (`etf-preserve/v8.1`, root `fb7b9c48c542…`) was signed about 1.5 hours later from the same
close. The registry entry (`versions/etf-preserve/v8.1.json`) was committed before the proof, so the version
preceded the signal, but the decision was not made blind to the day's data: we had already seen what the
previous Preserve configuration would hold on that close (40% cash alongside a semiconductor position) and found
it hard to explain. v8.1 gives Preserve the same equity sleeve as ETF Growth, a change researched and backtested
beforehand and chosen for explainability; its full-cycle backtest is lower on return and on worst 12 months than
v8.0's, which we accepted.

`verify.mjs` is also corrected: it compared the release's UTC date with the signal's trading date, so a release
on the evening of a print night (after 20:00 ET) read as a day late. Both are now compared in New York time.
