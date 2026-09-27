# H44 - Invoice Database Foundation (revised Milestone 1)

Only the H44 migration, its SQL validation file and these notes are changed.
No UI, Milestone 2, unrelated table changes, production migration, new dependencies,
request synchronization or audit event implementation is included.

## Apply contract and dependencies

- Apply `supabase/h44-invoice-database-foundation.sql` as the database migration
  owner, using the existing numbered SQL patch convention. Run the WHOLE file.
- Requires existing `public.is_admin()` returning boolean, `auth.uid()`,
  `public.set_learning_updated_at()` returning trigger, and unique IDs on
  `auth.users`, `public.requests`, `public.service_items`.
- Repository `is_admin()` in `account-management-update.sql` supports both
  `admin_users` email membership and active `user_profiles` admin roles. The
  migration reuses it without inserting an email or redefining authorization.
  Do not replay the older `rls-backup.sql` over the newer helper.
- `set_learning_updated_at()` in RB01 only assigns `NEW.updated_at = now()` and
  returns NEW; despite its name it is generic and reused, as in H37. Check the
  deployed helper has the same behavior before applying.
- Payment configuration stays in existing `admin_payment_settings` (H5/H36).
  No duplicate `invoice_settings` is introduced. Prefix stays `GR-INV`.
- Four permanent tables: `invoice_catalog_items`, `invoices`, `invoice_items`,
  internal `invoice_number_counters`. Migration-only temp tables drop on COMMIT.
- ID types for request/service FKs come from deployed PostgreSQL metadata. No
  baseline type is guessed. Request/service/catalog/item-parent FKs use RESTRICT;
  deleting a referenced request/service will be rejected. Auth FKs use SET NULL.

## Aggregate and locking strategy

1. An item BEFORE ROW trigger locks affected invoice rows with FOR NO KEY UPDATE
   before INSERT/UPDATE/DELETE. A move locks both old/new parents in ascending UUID
   order, removing the avoidable opposite-direction parent-lock ordering problem.
   This lock mode is compatible with FK KEY SHARE locks.
2. AFTER STATEMENT triggers use transition tables to collect affected IDs and
   update each header once, after all rows in that statement have changed. UPDATE
   includes both old and new parents; DELETE and bulk edits are supported.
3. The header BEFORE INSERT/UPDATE trigger is the one calculation path:
   subtotal = SUM(stored generated item subtotals), or zero;
   discount_amount = round(subtotal * discount_percent / 100, 2);
   total = subtotal - discount_amount.
   Direct supplied totals are normalized, not trusted. Set discount_percent to
   change the discount. Omit item subtotal, which is GENERATED ALWAYS.
4. Header UPDATE holds the parent tuple lock itself. VOLATILE trigger queries use
   fresh READ COMMITTED snapshots after lock waits. Competing item/header writes
   therefore serialize without reading a stale aggregate after the wait.
5. PostgreSQL may still raise 40001 (serialization) or 40P01 (deadlock), especially
   for arbitrary multi-row/multi-statement transactions that already hold locks
   in different orders. Retry the ENTIRE transaction. For bulk writes across many
   invoices, prelock the full parent ID set in UUID order before touching items,
   and process shared item IDs consistently. No global application lock is added.
6. Normal SQL writes keep totals consistent by statement completion. Future save
   flows should group related edits in a transaction. A header RETURNING result
   from an earlier statement can become outdated after later item statements;
   fetch the header after the final item edit.

## Issuance and history

- DRAFT may have blank client/work fields, null due date and no items.
- WAITING_PAYMENT, PARTIALLY_PAID, PAID and EXPIRED require a nonblank client,
  finite invoice/due dates, due date >= invoice date and at least one item.
  Valid qty/prices are enforced on items and header totals are derived.
- Create a draft, insert items, then issue. Direct INSERT of an issued invoice
  without items fails. No full status-transition graph is introduced.
- First valid issuance sets issued_at using database statement time. Clients
  cannot supply/change/clear it. An issued invoice cannot return to DRAFT, even
  through VOID. VOID remains available for cancellation.
- Completeness is rechecked on all updates to issued invoices, including item
  changes. Deleting/moving the last issued line fails and rolls back that statement.
  Item edits are still supported; catalog edits do not rewrite price snapshots.
- Browser roles cannot delete invoices or catalog entries. Admin DELETE on items
  is explicitly allowed (10 admin policies total), with aggregate/history checks.
  Ordinary privileged DELETE of an issued invoice is also blocked by a trigger.
  Database owners can disable triggers or alter schema; this is not protection
  against a malicious database owner. Do not use TRUNCATE for maintenance.
- Header normalization relies on table RLS for browser authorization and does
  not demand an admin JWT for every UPDATE. This preserves legitimate auth.users
  ON DELETE SET NULL maintenance while still calculating the complete item sum.

## RLS and rerun safety

- Uses existing public.is_admin() for SELECT/INSERT/UPDATE on the three business
  tables and DELETE on items only. No anonymous/client invoice access. Counter
  table has RLS, no browser grants and no policies. Trigger helper functions have
  an empty search_path, qualified persistent relations and no browser EXECUTE.
- Before replacing policies, existing tables are locked and checked for unknown
  policy/trigger names. Unknown names, including any counter policy, abort the
  transaction. Known H44 policies/triggers are recreated from this file.
- Four H44-specific temporary table definitions serve as exact expected schema
  contracts. PostgreSQL-parsed metadata is compared for ALL column types,
  typmods, nullability, collations, defaults, generated expressions and required
  PK/UNIQUE/CHECK definitions. Unique backing indexes must be valid/ready.
- Six FKs are checked for source/destination columns, delete/update action,
  validation state and deferrability. Existing RLS must already be enabled.
  Data checks reject inconsistent totals or incomplete issued rows on rerun.
- Compatible reruns preserve data/counters and refresh H44 functions/policies.
  A previously applied OLD H44 draft without issued_at intentionally FAILS;
  this revised file is for the still-unapplied migration, not a silent upgrade
  or reconciliation tool. Independently changed schemas require explicit review.
- No existing invoice data is silently repaired/deleted. Unknown policies outside
  the four invoice tables are neither inspected nor modified.

## Numbering and midnight

- Omit invoice_no on INSERT; read its database-assigned value with RETURNING.
  Supplied non-null numbers and changes to an existing number are rejected.
- Atomic daily counter upsert serializes allocation. Allocation and insertion
  commit/rollback together; invoice_no also has a UNIQUE constraint. No MAX+1.
- Uses statement_timestamp() AT TIME ZONE 'Asia/Jakarta', NOT transaction start,
  editable invoice_date or commit time. A statement that starts before midnight
  and waits across midnight retains its starting date. A later statement in the
  same transaction uses its own start date. Multi-row inserts in one statement
  share the numbering date. Three digits is a minimum: 999 advances to 1000.
- Do not reset/delete counters. Long invoice-create transactions block further
  allocation for that date until they commit/roll back.

## Automated SQL validation provided (not yet executed locally)

Run `supabase/validation/h44-invoice-database-foundation.sql` as postgres on
staging in one session. Requires a real non-admin auth user and at least one
existing admin. It tests a legacy admin and a profile-only admin separately when
available. Missing optional paths/positive FK fixtures print SKIP notices; they
are not reported as tested. Missing required users fail clearly.

The transaction checks:

- Duplicate SKU, negative catalog/item price, qty zero, invalid status.
- Stored item subtotal, decimal rounding, catalog price snapshot independence.
- Header aggregation on item insert/update/move/delete and bulk insert/delete.
- Discount recalculation and normalization of deliberately inconsistent totals.
- Negative request/service FK tests with actual deployed ID types, plus valid
  links where parent rows exist. Domain/custom types may require fixture adaptation;
  a cast failure does not count as successful FK enforcement.
- Empty issuance in all four payment lifecycle statuses; missing client/due date,
  invalid due date, direct issued INSERT; valid issuance and stable issued_at.
- Marker clearing/changing, return to DRAFT, incomplete issued edit, deletion or
  moving of the last issued line, and ordinary privileged invoice deletion.
- Non-admin SELECT returning no rows, INSERT rejection, UPDATE/DELETE affecting
  zero rows, including invoice_items. Anonymous denial and hidden counter/RPC.
- Supplied/changed invoice_no, sequential uniqueness, correct Jakarta statement
  date, timestamp helper, and exact UTC-to-Jakarta midnight examples.
- 999 -> 1000 when the current staging counter is below 1000 and that invoice
  number is unused. This only advances the locked counter inside the rollback
  transaction; never rewinds it. Otherwise prints SKIP and needs disposable staging.

All test fixtures and temporary counter changes end in ROLLBACK. If any assertion
fails, issue ROLLBACK before retrying. This file is not a migration.

## Exact staging application and rerun order

1. Confirm prerequisite tables/helpers and deploy role; use a disposable staging
   copy with representative existing schema and auth fixtures. No production run.
2. Apply the entire migration and confirm COMMIT. Inspect four tables, constraints,
   six FKs, generated subtotal, 10 explicit indexes, enabled RLS and 10 policies.
3. Run the entire validation file and confirm ROLLBACK with no exceptions. Review
   SKIP notices and add appropriate staging fixtures before declaring full coverage.
4. Record table row counts, invoice numbers and counters. Reapply the SAME migration;
   it must commit without changing those values. Run validation again.
5. On disposable staging, test each drift case below separately. Begin a transaction,
   introduce ONE deliberate change, then run the migration in that SAME connection.
   It must raise the stated compatibility error; issue ROLLBACK to undo everything.
   Do not COMMIT these deliberately incompatible fixtures. The migration's BEGIN
   inside this test transaction may emit an already-in-transaction warning.

   - `CREATE POLICY h44_unexpected ON public.invoices FOR SELECT TO authenticated USING (true);`
     Must fail with unexpected policy.
   - `ALTER TABLE public.invoices DISABLE ROW LEVEL SECURITY;`
     Must fail with RLS-enabled requirement.
   - `ALTER TABLE public.invoices ALTER COLUMN client_name TYPE varchar(500);`
     Must fail column compatibility.
   - Drop the invoice_no UNIQUE constraint found through pg_constraint;
     must fail constraint compatibility.
   - `ALTER TABLE public.invoices DROP CONSTRAINT invoices_request_id_fkey;`
     Must fail FK compatibility.
   - `ALTER TABLE public.invoice_items ALTER COLUMN subtotal DROP EXPRESSION;`
     Must fail generated-expression compatibility.
   - `ALTER TABLE public.invoice_items DROP CONSTRAINT invoice_items_qty_check;`
     Must fail required-constraint compatibility.

6. Perform the two-session tests below. Only after all relevant tests pass can the
   revised migration be considered runtime-validated for a subsequent deployment.

## Two-session tests (manual, not simulated by sequential inserts)

Use two persistent staging PostgreSQL connections. In EACH connection, BEGIN,
set request.jwt.claims from an existing authorized auth user (same JSON structure
as the validation script), then SET LOCAL ROLE authenticated. Do not use untrusted
client-supplied claims in production; these are postgres-owned test sessions.

Number allocation:

1. A: INSERT INTO public.invoices DEFAULT VALUES RETURNING id, invoice_no; leave
   the transaction open.
2. B: run the same INSERT. It should block on the daily counter.
3. A: COMMIT. B should finish with a different number. B: COMMIT.
4. Repeat with A: ROLLBACK instead. B must succeed without any committed duplicate.
   Rolled-back numbers may be reused; this is expected. Keep tests away from
   midnight for the same-day lock test, then separately test midnight behavior.

Aggregate/issuance races (use committed draft fixtures):

1. A inserts an item into invoice X and holds its transaction. B inserts a different
   item into X; B must wait. Commit A then B. Check header equals SUM(items).
2. Repeat with A rolling back. Check that only B contributes to the total.
3. Race a qty/price update in A against discount_percent update in B, in both
   starting orders. After commits, header must use the final item sum and discount.
4. On invoices X/Y, race opposite-direction moves of distinct items. Parent UUID
   ordering should serialize these moves. Check both totals after commit.
5. Race issuance with deletion/moving of the last item. Either issuance fails
   after removal or item removal fails after issuance; an empty issued invoice
   must never commit.
6. Repeat representative tests at REPEATABLE READ and SERIALIZABLE. A 40001 is an
   expected retry outcome, never a reason to accept inconsistent data. For wider
   arbitrary bulk transactions, handle 40P01 by retrying the complete transaction.

## Local checks

The environment has no psql, Supabase CLI, Docker or installed PostgreSQL parser.
No direct SQL connection or migration execution was used. Runtime migration/RLS/
concurrency/rerun tests remain pending staging. Static checks are not SQL execution.

Results for this revision:

- `npm run build`: passed, including prerender of 72 routes (71 sitemap URLs).
  Existing prerender may read public content through the existing Supabase client.
- `npm run lint`: passed, exit 0.
- `git diff --check`: passed. Since these H44 files are currently untracked, a
  separate whitespace check explicitly included all three new files.
- Inline Python lexical checks: balanced SQL quotes, dollar bodies and brackets;
  all six new function definitions have browser EXECUTE revocation; ten explicit
  indexes; no destructive top-level table/data statements or credential literals.
  This is a lexical/static check, not a PostgreSQL grammar or runtime validator.
- No npm test script exists; no test framework/dependency was added.

Locking/snapshot design references:
[PostgreSQL row locks](https://www.postgresql.org/docs/17/explicit-locking.html),
[VOLATILE query snapshots](https://www.postgresql.org/docs/17/xfunc-volatility.html).
