# Milestone 6: findings, fixes and release gate

This note supersedes the readiness claims in H45/H46 notes. No live SQL or
browser acceptance tests were executed. Do not deploy to production yet.

## Migration order
Apply H44, H45, H46, then the entire H47 patch in staging before using the UI.
H47 replaces functions, adds request-link validation and status audit triggers.
It does not delete invoice history. Do not replay H44 afterwards: its strict
unknown-trigger checks intentionally reject later H46/H47 triggers.
Run validation/h47-invoice-security-qa.sql in one staging session as postgres;
it impersonates an existing admin and rolls all fixtures back. A failing test
requires ROLLBACK. Run H44 validation before the later patches; some of its
link-move expectations are intentionally tightened by H47.

## Confirmed static findings and fixes
- H45 inserted IDs were missing from the retained set: every new line was then
  deleted. H47 retains inserted IDs; constraints/triggers still calculate totals.
- H46 EXECUTE does not set FOUND. H47 checks the returned row identity instead.
- H46 trusted client_user_id and did not check soft-deleted requests. H47 loads
  the request under caller RLS, derives its client and rejects mismatches.
- H46 UPDATE OF total missed totals modified by H44 BEFORE triggers. H47 runs
  summary synchronization for every header update and locks the request row.
- Multiple invoices formerly left a stale singular PAID/price summary. H47
  clears harga to NULL and uses legacy NOT_CREATED as an unavailable-summary
  sentinel. This is NOT an aggregate status. Admin history/list labels show
  linked invoice counts, including VOID; all actual invoices remain visible.
  Existing multi-invoice rows are corrected on their next invoice write, not
  by a silent migration backfill. Review/reconcile those rows before release.
- Existing request links cannot be silently moved to another request.
- Failed issuance of a newly saved invoice now retains the saved ID by navigation,
  avoiding another new invoice on retry.
- Live totals round each item; unchanged loaded headers use database totals.
- Print styles only affect pages containing an invoice, use normal page flow and
  repeating table headers instead of an absolutely positioned print document.

## Audit ownership
Existing createAuditLog/audit_logs remain the only audit system. Create/update
and catalog operations use the existing helper; disable through the edit form
now emits DISABLED. Helper catches both returned errors and rejected requests;
invoice/catalog users receive a warning without undoing the business operation.
H47 logs ISSUED, STATUS_CHANGED and VOIDED from status transitions, once per
transition. Frontend ISSUED logging is removed. Metadata is limited to IDs,
numbers, previous/new status and totals; no QRIS URLs or secrets.
Status audit failure emits a sanitized server WARNING and does not abort status
updates. Operators must monitor warnings: this is best-effort audit, not an
immutable/compliance-grade audit trail. Header/item saves are separate operations
from issuance and therefore may legitimately produce an update plus issue log.

## Security review boundaries
H44 enables admin-only business-table RLS using is_admin(), denies browser access
to counters/trigger helpers, derives invoice numbers via an atomic daily upsert,
and normalizes totals from stored line subtotals. H45/H46 remain SECURITY INVOKER
with explicit admin checks. H47 status audit is INVOKER, not elevated. Existing
H44 aggregate/counter and H46 summary definers use fixed qualified paths.
Issued invoices cannot revert to DRAFT or lose issued_at; cross-invoice item IDs
are rejected by RPC. Catalog writes remain admin-only. No service-role secret
or signed QRIS URL was added to invoice persistence/audit.
Direct admin table writes remain possible under H44 grants; this is not an
immutable ledger. Do not expose browser admin credentials to untrusted users.

## Required deferred acceptance tests
- Real two-session invoice number allocation, commit/rollback and Jakarta midnight.
- H47 forced H45 rollback test, mixed insert/update/delete, cross-invoice IDs,
  duplicate IDs, empty draft and unchanged catalog snapshots.
- Non-admin and anon H45/H46 denial, all RLS grants on deployed schema.
- H46 linked creation, invalid/deleted request and mismatched client rollback.
- Single request totals on item update; concurrent link/save/issue; multiple
  invoice summary clearing; VOID remains in history. Retry whole transactions
  on 40001/40P01, never individual item writes.
- Existing client request pages, request stats, archived/deleted admin screens and
  form/file authorization use legacy summaries: verify sentinel behavior and
  independent payment_status. No aggregate or new client invoice portal is added.
- Audit counts/metadata for all eight events; simulate audit INSERT failure.
- QRIS scan on screen and paper/PDF, missing config, signed URL expiry after the
  existing 600-second lifetime. Refresh before print when the URL has expired.
- Long A4 invoices, multi-page table rows, mobile preview, unrelated page printing.
- Auth/admin navigation, public routes, service catalog, request proof workflow.

Known limits: no status-management product feature was added; existing DB/admin
status mutations are audited. Old H45 saves may already have lost new items;
this patch cannot reconstruct them. Never infer production readiness from build.


## Local validation results
- Final isolated `npm run build`: PASS (exit 0), including 72 prerender routes
  and 71 sitemap URLs. Two intermediate overlapping build runs failed during
  prerender; the isolated final rerun passed.
- `npm run lint`: PASS (exit 0).
- `git diff --check`: PASS; existing AdminLayout line-ending warning only.
- Explicit whitespace check including new H47 files: PASS.
- Node assert for per-item rounding plus discount: PASS (30.04 / 3 / 27.04).
- No test script is configured; no framework was added.
- Invoice source scan found no service-role/secret-key markers. This is a static
  source check, not a credential audit of deployed environments.
- No PostgreSQL/Supabase CLI/Docker available; migrations and SQL validation
  were not executed. Authenticated invoice browser QA remains pending.
