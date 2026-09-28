# H45 - Atomic Invoice Draft Save RPC

This focused Milestone 3 patch replaces the browser's separate header, item
insert, item update and item delete requests with `public.save_invoice_draft`.
It adds no Invoice UI, QRIS, printing, request integration or Milestone 4 work.

## Dependency and application order

1. Apply the complete `supabase/h44-invoice-database-foundation.sql` migration.
2. Run `supabase/validation/h44-invoice-database-foundation.sql` on staging as
   documented in its companion update note.
3. Apply the complete `supabase/h45-invoice-draft-save-rpc.sql` migration.
4. Reload PostgREST schema (the H45 migration sends `NOTIFY pgrst, 'reload schema'`).
5. Run the runtime checks below using an authenticated GreenroomID admin.

H45 uses existing H44 tables, triggers, RLS policies and `public.is_admin()`.
It must not be applied before H44.

## Transaction and authorization behavior

One RPC invocation is one PostgreSQL statement and therefore one transaction.
The function either commits the header and the complete replacement item set, or
an exception rolls all of those writes back. It does not use transaction control
inside the function.

The function uses `SECURITY INVOKER`, explicitly checks `auth.uid()` and the
existing `public.is_admin()`, and writes through the normal table grants/RLS.
It does not use the service role, relax policies, or accept an invoice number,
issued status, calculated totals, `created_by`, or `issued_at` from the client.
Existing invoices are locked and must be `DRAFT`; issued invoices cannot be
edited through this function.

`p_items` is the complete desired set. An item with an `id` must already belong
to the target invoice. The function updates those rows, inserts rows without an
`id`, and deletes rows omitted from the set only after every submitted item has
validated. It writes the submitted snapshot fields (`catalog_item_id`, `sku`,
`name`, `description`, `qty`, `unit_price`) directly and does not look up or
modify the SKU catalog. H44's existing triggers remain the sole source of
`subtotal`, `discount_amount`, and `total`.

## Required runtime checks after H45

Use a disposable staging invoice and a real authenticated admin session:

1. Save a new draft with two items, reload it, then save an edit that changes
   the header, updates one item, removes one item and adds one item. Confirm the
   returned/reloaded header total equals the stored item subtotals and the list
   exactly matches the submitted set.
2. Repeat the same edit but submit an invalid second item (for example `qty: 0`).
   The RPC must fail. Reload the invoice and confirm *none* of that edit's header,
   inserts, updates or removals persisted.
3. Attempt the RPC as a non-admin and expect `42501`. Attempt an existing issued
   invoice and expect `23514`; confirm both the header and items remain unchanged.
4. Change a selected catalog item's current `base_price`, reload the older
   invoice and confirm its stored item `unit_price` did not change.
5. Simultaneously save two edits of the same draft from separate admin sessions.
   One waits on the parent lock; after both complete, each committed result must
   be a complete set from one save, never a mixture. A `40001`/`40P01` from
   PostgreSQL still requires the client to retry the whole RPC.

## Local validation status

No live Supabase/PostgreSQL connection is configured in this workspace, so H45
has not been applied or runtime-tested here. Local build, lint and whitespace
checks are recorded with the implementation change.
