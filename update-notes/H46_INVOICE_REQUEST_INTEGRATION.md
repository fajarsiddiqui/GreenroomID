# H46 - Invoice Request Integration

Apply `supabase/h46-invoice-request-integration.sql` after H44 and H45.

H44 creates a non-unique `invoices.request_id` foreign key and only a normal
index. Therefore the deployed invoice schema supports **many invoices for one
request**. H46 preserves that relationship and adds no unique constraint.

`save_invoice_draft_for_request()` delegates header/item persistence to H45,
then attaches the request and optional `client_user_id` in the same PostgreSQL
statement/transaction. Request ID types are read from the deployed schema, as
H44 does, so bigint/UUID request IDs are supported without guessing.

The `requests` table has only one legacy `invoice_status` and `harga` summary.
The H46 trigger updates those fields only when exactly one invoice is linked,
which is the only unambiguous representation. It maps DRAFT/VOID to
`NOT_CREATED`, PARTIALLY_PAID to `WAITING_PAYMENT`, and maps the other shared
status values directly. `payment_status` is never written by H46 because it
has independent proof/verification semantics. For multiple linked invoices,
open the request detail to inspect the actual invoice list; invoice rows and
items remain the billing source of truth.

Runtime staging checks:

1. Open a request and create an invoice. Verify client/request prefill, link,
   request `harga`, and request `invoice_status` after saving/issuing.
2. Add a second invoice for the same request. Verify both are shown and H46
   does not overwrite the singular request summary with an ambiguous value.
3. Verify non-admin RPC invocation fails with `42501`, invalid request IDs roll
   back the invoice creation, and payment_status remains unchanged.
