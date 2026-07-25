# Monthly Momentum: the public trade-proof record

This repository is the public, tamper-evident audit trail for the **Monthly Momentum** trade signals. Its
purpose is simple: to let anyone confirm that our published trades were decided on the dates we claim, before
the outcomes were known, and were never edited afterward. You do not have to trust us. Everything here is
verifiable from the files in this repository plus one public key, with a short script and no special access.

## How it works, in one minute

The strategy reallocates monthly. Each reallocation leaves two records here:

1. **A commitment, on the trade date.** We publish a cryptographic fingerprint (a SHA-256 hash) of that
   month's target holdings, without revealing the holdings themselves. The commitment is signed with an
   Ed25519 key and linked to the previous commitment in a hash chain, so nothing can be inserted, removed, or
   edited after the fact.
2. **The actual trades, about 90 days later.** We publish the real holdings. Anyone can hash them and check
   that the result matches the fingerprint we posted three months earlier. If a single weight had changed, the
   hashes would not match.

The commitment is public the day we trade, so the honesty property is there immediately. The 90-day delay is
only on the human-readable trades, to protect the live product for members. The signature proves the record is
ours; the hash chain proves nothing was reordered; and (see below) a Bitcoin timestamp proves the commitment
existed when we say it did, which is what removes the need to trust us at all.

Each model and each version of it is its own independent chain, so you can follow and verify one specific
model version on its own.

## What is in here

```
signals/<model>/<version>/<date>.proof.json    the commitment (hashes + signature + chain link). Holdings withheld.
signals/<model>/<version>/<date>.trades.json   the actual trades for that date, published ~90 days later.
signals/<model>/<version>/<date>.proof.root.ots  a Bitcoin (OpenTimestamps) proof of the commitment.
versions/<model>/v<MAJOR.MINOR>.json           the version registry: fingerprints of the config and engine
                                               that produced a version, recorded when the version was released.
pubkey.pem                                     the Ed25519 public key that signs the commitments.
verify.mjs                                     the independent verifier (this file's instructions).
```

Older `signals/<date>.json` files (no subfolder) are legacy pre-activation commitments and are unsigned.

## Verify it yourself

You need only Node.js (version 18 or later). No installation, no dependencies.

```
git clone https://github.com/devon3000/copleyandson.git
cd copleyandson
node verify.mjs
```

For every signed commitment, the verifier checks five things:

1. **Signature**: the commitment is signed by the key in `pubkey.pem`.
2. **Chain**: within each model version, the sequence numbers are contiguous and each entry links to the one
   before it.
3. **Content**: the signed value recomputes exactly from the commitment, so nothing was edited.
4. **Version**: the commitment's config and engine fingerprints match a `versions/` entry that was released
   on or before the signal date, so no version was invented after the fact to fit a trade.
5. **Reveal**: once a `<date>.trades.json` is published, the actual trades re-hash to the original commitment.
   If a reveal is overdue (its date has passed and the trades are missing), that is reported as a failure.

It exits 0 if everything verifies and non-zero otherwise. To check a single model version:

```
node verify.mjs --stream etf-growth/v4.3
```

## Verifying the Bitcoin timestamps

`verify.mjs` deliberately has zero dependencies, so it does not re-check the Bitcoin anchors itself. To confirm
independently that a commitment existed by a given time, use the OpenTimestamps client on the `.proof.root.ots`
files:

```
pip install opentimestamps-client        # or: npm i -g javascript-opentimestamps
ots verify signals/<model>/<version>/<date>.proof.root.ots
```

The `.ots` file attests that the commitment's root hash was stamped into the Bitcoin blockchain, which no one,
including us, can backdate.

## What this proves, and what it does not

**Proven publicly, by anyone:** each signal was committed and signed on its date, in an unbroken chain, tied to
a specific model version that was published earlier, and the later-revealed trades are exactly what was
committed. In short, the record cannot be reordered or backdated.

**Not proven here (stated plainly rather than glossed over):** that the strategy's code is sound. The engine
source is private, so the `engine_sha256` fingerprint pins *which* code produced a signal and *when* it was
registered, but reproducing that fingerprint from the source is an auditor-level check available on request,
and it becomes fully public if and when the engine is open-sourced.

**Coverage:** the chain begins on its activation date and covers every signal from then forward. It makes no
claim about anything before that date.
