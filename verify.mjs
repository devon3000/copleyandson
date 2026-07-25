#!/usr/bin/env node
// Independent verifier for the Monthly Momentum public trade-proof repo (copleyandson).
// Zero dependencies: Node 18+ and its built-in crypto only. Run from the repo root:
//
//     node verify.mjs                 # verify every published signal
//     node verify.mjs --stream etf-growth/v4.3
//     node verify.mjs /path/to/repo   # verify a checkout elsewhere
//
// It checks, using nothing but the files in this repo and the published public key:
//   1. signature   - each commitment is Ed25519-signed by the published key
//   2. chain       - per (model, version) stream, seq is contiguous and prev_root links the prior entry
//   3. content     - the signed root recomputes from the commitment (nothing was edited)
//   4. version     - the commitment's config/engine fingerprints match a registry entry released earlier
//   5. reveal      - once the actual trades are published (~90 days later), they re-hash to the commitment
//
// It does NOT need the private code repo or any database. The Bitcoin (OpenTimestamps) anchor is a separate,
// optional check: see the README section "Verifying the Bitcoin timestamps".

import { readFileSync, existsSync, readdirSync, statSync } from "node:fs";
import { createHash, createPublicKey, verify as edVerify } from "node:crypto";
import { join, dirname, resolve } from "node:path";

const args = process.argv.slice(2);
const streamFilter = (() => { const i = args.indexOf("--stream"); return i >= 0 ? args[i + 1] : null; })();
const ROOT = resolve(args.find((a) => !a.startsWith("--") && a !== streamFilter) ?? process.cwd());
const GENESIS_PREV = "0".repeat(64);
const TODAY = new Date().toISOString().slice(0, 10);

// ---- crypto, identical to the publisher (lib/signing.ts) ----
function sortKeys(v) {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys(v[k])]));
  return v;
}
const canonicalJSON = (v) => JSON.stringify(sortKeys(v));
const sha256Hex = (s) => createHash("sha256").update(s).digest("hex");
const computeRoot = (entry) => sha256Hex(canonicalJSON(entry));

// The commitment over the withheld holdings. Target is sorted by a code-unit comparison (NOT locale-aware),
// weights rounded to 6dp. Must byte-match the publisher so a reveal re-hashes to the committed value.
function signalSha256(date, strategy, target) {
  return sha256Hex(JSON.stringify({
    date, strategy,
    target: [...target].sort((a, b) => (a.symbol < b.symbol ? -1 : a.symbol > b.symbol ? 1 : 0))
      .map((p) => ({ symbol: p.symbol, weight: Math.round(p.weight * 1e6) / 1e6 })),
  }));
}
function keyIdOf(pem) {
  const der = createPublicKey(pem).export({ type: "spki", format: "der" });
  return createHash("sha256").update(der).digest("hex").slice(0, 16);
}
function verifySig(root, sigB64, keyObj) {
  try { return edVerify(null, Buffer.from(root, "hex"), keyObj, Buffer.from(sigB64, "base64")); }
  catch { return false; }
}

// The signed entry, reconstructed exactly as it was signed, from the public commitment file.
const entryFromProof = (p) => ({ stream: p.stream, date: p.date, seq: p.seq, prev_root: p.prev_root, reveal_date: p.reveal_date, key_id: p.key_id, strategies: [p.strategy] });

function loadKeys() {
  const keys = new Map();
  const cands = [];
  if (existsSync(join(ROOT, "pubkey.pem"))) cands.push(join(ROOT, "pubkey.pem"));
  const keysDir = join(ROOT, "keys");
  if (existsSync(keysDir)) for (const f of readdirSync(keysDir)) if (f.endsWith(".pem")) cands.push(join(keysDir, f));
  for (const p of cands) { const pem = readFileSync(p, "utf8"); keys.set(keyIdOf(pem), createPublicKey(pem)); }
  return keys;
}

function collectProofs(dir, out) {
  if (!existsSync(dir)) return;
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) collectProofs(full, out);
    else if (name.endsWith(".proof.json")) {
      try { out.push({ path: full, p: JSON.parse(readFileSync(full, "utf8")) }); }
      catch (e) { out.push({ path: full, parseError: String(e) }); }
    }
  }
}

// Registry + reveal checks for one commitment. Returns a short status suffix; pushes any problems.
function checkVersionAndReveal(path, p, problems) {
  const st = p.strategy;
  if (!st || !st.version) return "";
  const slug = String(p.stream).split("/")[0];
  const regPath = join(ROOT, "versions", slug, `${st.version}.json`);
  if (!existsSync(regPath)) problems.push(`no registry entry versions/${slug}/${st.version}.json (unpublished version)`);
  else {
    const reg = JSON.parse(readFileSync(regPath, "utf8"));
    if (reg.config_sha256 !== st.config_sha256) problems.push("config_sha256 does not match the version registry");
    if (st.engine_sha256 && reg.engine_sha256 !== st.engine_sha256) problems.push("engine_sha256 does not match the version registry");
    if (reg.released_at && String(reg.released_at).slice(0, 10) > p.date) problems.push("version was registered AFTER the signal (ordering violation)");
  }
  if (st.engine_ok === false) problems.push("engine drift at signal time (engine_ok=false)");

  const trPath = path.replace(/\.proof\.json$/, ".trades.json");
  if (existsSync(trPath)) {
    const tr = JSON.parse(readFileSync(trPath, "utf8"));
    if (signalSha256(p.date, tr.strategy, tr.target) !== st.signal_sha256) problems.push("revealed trades do NOT match the commitment (signal_sha256)");
    if (tr.config_sha256 !== st.config_sha256 || (st.engine_sha256 && tr.engine_sha256 !== st.engine_sha256)) problems.push("revealed version fingerprint mismatch");
    return " reveal:ok";
  }
  if (p.reveal_date && TODAY >= p.reveal_date) { problems.push(`reveal OVERDUE (reveal_date ${p.reveal_date} passed, no trades.json)`); return " reveal:OVERDUE"; }
  return " reveal:pending";
}

function main() {
  const keys = loadKeys();
  if (!keys.size) console.warn("!  no public key found (pubkey.pem or keys/*.pem) - signatures cannot be checked; everything else still is.\n");

  const proofs = [];
  collectProofs(join(ROOT, "signals"), proofs);
  if (!proofs.length) { console.log("No signed commitments published yet (no signals/**/*.proof.json)."); return; }

  const byStream = new Map();
  for (const x of proofs) {
    if (x.parseError) { console.log(`!  ${x.path}: unparseable (${x.parseError})`); continue; }
    const s = x.p.stream ?? "(unknown)";
    if (!byStream.has(s)) byStream.set(s, []);
    byStream.get(s).push(x);
  }

  let ok = true, nStreams = 0, nEntries = 0;
  for (const [stream, entries] of [...byStream].sort()) {
    if (streamFilter && stream !== streamFilter) continue;
    nStreams++;
    console.log(`\n> ${stream}`);
    const signed = entries.filter((x) => x.p.root).sort((a, b) => a.p.seq - b.p.seq);
    const unsigned = entries.filter((x) => !x.p.root).sort((a, b) => String(a.p.date).localeCompare(String(b.p.date)));

    let prevRoot = GENESIS_PREV, expectedSeq = 1;
    for (const { path, p } of signed) {
      const problems = [];
      const entry = entryFromProof(p);
      if (computeRoot(entry) !== p.root) problems.push("root does NOT recompute from the commitment (content tampered)");
      const key = keys.get(p.key_id);
      if (keys.size && !key) problems.push(`no public key for key_id ${p.key_id}`);
      else if (key && !verifySig(p.root, p.signature, key)) problems.push("signature INVALID");
      if (p.seq !== expectedSeq) problems.push(`seq gap (expected ${expectedSeq}, got ${p.seq})`);
      if (p.prev_root !== prevRoot) problems.push("prev_root does not link to the prior entry");
      const meta = checkVersionAndReveal(path, p, problems);
      console.log(`  seq ${String(p.seq).padStart(3)} ${p.date} [${p.key_id ?? "-"}] root ${String(p.root).slice(0, 12)}...${meta} ${problems.length ? "FAIL: " + problems.join("; ") : "ok"}`);
      if (problems.length) ok = false;
      prevRoot = p.root; expectedSeq = p.seq + 1; nEntries++;
    }
    for (const { path, p } of unsigned) {
      const problems = [];
      const meta = checkVersionAndReveal(path, p, problems);
      console.log(`  (unsigned) ${p.date} - commitment only, signing inactive${meta} ${problems.length ? "FAIL: " + problems.join("; ") : "ok"}`);
      if (problems.length) ok = false;
      nEntries++;
    }
  }

  console.log(ok
    ? `\nOK: ${nEntries} commitment(s) across ${nStreams} stream(s) verify - signatures valid, chains intact, reveals match.`
    : `\nFAILED: see the lines marked FAIL above.`);
  if (!ok) process.exitCode = 1;
}
main();
