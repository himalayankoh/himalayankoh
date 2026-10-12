# Git-history exposure — what was published, how far it is reversible, and the plan

Investigated **2026-10-11**. This is the finding the mission asked to verify: a per-record customer
export was committed to a **public** repository, was untracked afterwards, and is still reachable in
history. Everything below is measured from this clone and from GitHub's public API; no customer
value is reproduced in this document.

---

## 1. What was committed

| Fact | Value |
| --- | --- |
| Path | `docs/production/customer-cleanup-manifest-2026-10-11.csv` |
| Committed in | **`1140cc2`** — *"Report customers and orders from evidence, and correct unsupported claims"*, Sun Oct 11 16:54:49 2026 -0500 |
| Blob | `59d6bbfb6dd2f4b8f44c3889a136d6165580e181` |
| Size | 2,705 lines — one header + **2,704 data rows** (one row per customer account) |
| Columns | `id, registered, email_local_sha256, domain, local_shape, has_name, orders_linked, classification, intended_action, evidence` |
| Removed from the working tree | `ed575eb` (deletes the file) |

---

## 2. What it actually exposes

The column named `email_local_sha256` is **not** a bare hash: every one of the 2,704 rows holds a
value of the form

```
<10 hex characters>@<domain in clear>          e.g.  9f8e7d6c5b@mail.example
```

(That example is synthetic — this document deliberately reproduces **no** value from the export,
not even a digested one, because publishing a row is the exposure being described.)

The 10 hex characters are a **truncated, unsalted SHA-256 of the address's local part** — 40 bits of
a public digest — and `domain` is repeated in its own column in clear text. So each row discloses:

- an account **id** and its **registration date**;
- the address's **domain in the clear** (which mail provider the account uses);
- a **40-bit unsalted digest of the local part**, which is *reversible by targeted attack* for any
  guessable local part (first names, name+surname, names with digits, anything in a wordlist). A
  digest of this length is a pseudonym, not a one-way guarantee;
- whether a **name** was ever supplied, whether an **order** is linked, and the row's **classification**.

No passwords, password hashes, tokens, payment data, street addresses or phone numbers are in it —
this is not a credential leak. It is a **customer-list disclosure**: enough to confirm whether a
given person's address is in the store's account list, and to reconstruct a large share of those
addresses offline. Severity: material, and worth fixing deliberately.

---

## 3. Where it is reachable

| Question | Answer | How it was measured |
| --- | --- | --- |
| Is the repository public? | **Yes** | `GET https://api.github.com/repos/himalayankoh/himalayankoh` → **HTTP 200** without any credential (a private repo answers 404) |
| Was the commit pushed? | **Yes** | `git branch -a --contains 1140cc2` lists **`remotes/origin/integration/cloudflare-workers-migration`** |
| Is it on the default branch? | **No** | default branch is `main` (`git ls-remote --symref origin HEAD`); `git merge-base --is-ancestor 1140cc2 origin/main` → not an ancestor |
| Which remote ref carries it | `refs/remotes/origin/integration/cloudflare-workers-migration` only | `git for-each-ref --contains 1140cc2` |

**Conclusion:** the file is publicly fetchable from the branch, and the blob is retrievable by
anyone who knows the commit or blob SHA. Untracking it changed nothing about that; history is
history.

---

## 4. What has already been done about it

| Control | Where | Verified |
| --- | --- | --- |
| The file is deleted from the tree | `ed575eb` | working tree has no such file |
| Four ignore patterns so no `*-cleanup-*.csv`, `*-manifest-*.csv`, `*-census-*.csv`, `*-export-*.csv` or `*customer*.csv` can be committed under `docs/production/` | `.gitignore` (11 lines added in `ed575eb`) | `git check-ignore -v` matches the path |
| A **build gate** that fails the build if a tracked customer export reappears | `scripts/check-tracked-customer-data.mjs`, wired into `prebuild` alongside typecheck and lint | run today: *"No per-record customer export is tracked in this repository."* — **exit 0** |
| Future exports live outside the repository | `hk-backups/` and `.freebuff/`, both outside the git root | the batch-1 manifest was written to `.freebuff/` and `git status` cannot see it |

---

## 5. Other artefacts, checked

Every data-shaped file ever committed (excluding `node_modules/` and `dist/`) was listed and
reviewed: `CATALOGUE-MIGRATION-MANIFEST.json/.md` and the `content-corrections/*.json` files are
**catalogue and content** records; `dns-export-2026-10-08.json` is a DNS zone export (public by
design — MX/SPF/DKIM public keys, no customer data); `backup-restore-evidence-2026-10-09.txt` holds
counts only; `migrations/*.sql` and `scripts/fix-*.sql` are schema and demo-copy. The built admin
bundles under `dist/` are client code and carry no records.

**The customer export above is the only per-record customer artefact in this repository's history.**

---

## 6. The remediation plan (and what is not authorised)

`git` history is append-only by design, and every option below has a cost. They are ordered by how
much collateral they create, cheapest first.

1. **Owner decision on the branch (recommended).** The commit sits on
   `integration/cloudflare-workers-migration`, *not* on `main`. If that branch has served its
   purpose, the owner can ask GitHub Support to remove the branch's content (or archive/delete the
   branch) so the blob is no longer fetchable by ref, and let GitHub's own object cleanup retire the
   unreachable blob. **No local history is rewritten, no collaborator is disrupted, no force-push is
   needed.** A copy must first exist locally, because the remote branch is also the only remote home
   of the work on it.
2. **Treat the digests as disclosed.** Nothing needs rotating — there is no credential in the file —
   but the practical consequence is that this customer list should be considered known, which is
   itself an argument for the abuse-path fixes in `REGISTRATION-SURFACES-2026-10-11.md` and for not
   exporting per-record rows to shared locations again.
3. **History rewrite (`git filter-repo` + force-push).** This *would* remove the blob from every
   commit, at the cost of rewriting SHAs, invalidating every clone and open PR, and requiring a
   force-push to a public repository. **NOT AUTHORISED.** It needs explicit owner approval, a
   coordinated clone freeze, and a verified backup of the branch first. Do not run it as part of a
   cleanup sweep.
4. **Accept and monitor.** Defensible only if the owner judges the exposure minor; note that a
   public blob is also archived by third parties within minutes, so "accept" should be a decision
   about notification and diligence rather than about secrecy.

**What must not happen without separate owner approval:** force-push, branch deletion on the remote,
`git reset --hard`, `git clean -fd`, or any rewriting of published history. None of it was attempted.

---

## 7. Verdict

**GIT HISTORY DATA EXPOSURE: CONFIRMED, PUBLIC, NOT REMEDIATED.** A 2,704-row per-record customer
export is fetchable from a public repository at commit `1140cc2` on
`origin/integration/cloudflare-workers-migration`, in a form whose address digest is
brute-forceable and whose domains are in clear text. The leak is contained — off `main`, deleted
from the tree, blocked from recurring by a build gate — but it is not undone. Choosing between §6.1
and §6.3 is an **owner action**, and nobody should record this item as closed until that choice is
made.
