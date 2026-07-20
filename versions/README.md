# Version registry

Each file `<model-slug>/v<MAJOR.MINOR>.json` is an immutable, forward-only record of a published model
version: the SHA-256 of its (private) config, the SHA-256 fingerprint of the engine source that produces its
signals, and when it was released. Every signed trade signal (in `../signals/`) pins these hashes, so anyone
can confirm a signal was produced by a version that was committed here *before* the signal — no version can be
invented after the fact to fit a trade.

**What this proves publicly:** commitment and ordering. A signal maps to exactly one version fingerprint, and
that fingerprint was published + timestamped earlier. **What it does not prove yet:** that the engine code is
sound — the code repo is private, so `engine_sha256` is only fully reproducible by an auditor who is handed
the source, or once the engine is open-sourced. We disclose this rather than overclaim.
