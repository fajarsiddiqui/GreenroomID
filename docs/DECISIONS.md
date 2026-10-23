# DECISIONS.md — locked decisions (override PRD where different)

## D1. Rejected orders and slots
Reject releases the slot (PRD A-05). The buyer button "Back to payment" calls `retry_payment(order_id, token)`, which atomically re-reserves a slot of the SAME variant, sets status back to `draft`, and restarts the 30-minute window. If no slot is left, show "Habis" and return to catalog.

## D2. Buyer status updates = polling, not Realtime
Buyers have no table access (RLS), so Realtime is not usable for them. The waiting page polls `get_order_status` every 3 seconds (meets the 3 s requirement). Admin panel uses Supabase Realtime.

## D3. What is RPC and what is an Edge Function
- Postgres RPC: `create_order`, `retry_payment`, `get_order_status`, `submit_payment`, `release_account`, admin verify/reject.
- Edge Functions (service role): `reveal_credentials`, `issue_next_totp`, `notify-admin`, `admin-reveal-secret`, `proof-signed-url`.
Reason: they need decryption keys and server clock logic that must not live in the browser.

## D4. Encryption
Application-level AES-256-GCM in Edge Functions. Key = Supabase secret `ACCOUNT_ENC_KEY`. Database stores ciphertext + nonce only. `accounts.password_enc` and `accounts.totp_secret_enc` are `bytea`/text ciphertext.

## D5. TOTP "next code" behavior (B-11)
Server computes the next 30 s window using SERVER time, waits until that window starts (max 30 s), returns `{code, expires_at}`. `totp_issued_at` is set once. If the HTTP response is lost, the SAME call with the same token may re-return the SAME code while that window has not expired; after expiry it never issues again. First successful call sets `access_started_at` and `access_expires_at`.

## D6. Credentials reveal (B-10)
Result page first shows a "Tampilkan akun" button. Only that click calls `reveal_credentials`, which sets `credentials_viewed_at` and refuses any later call. The "Saya sudah menyimpan" checkbox gates "Selesai".

## D7. Pricing and variant model
Price lives on `variants` (per product). Variant = account_type (sharing/private) x duration_days (1/3/7/14/30). Catalog UI therefore has TWO selectors per product (account type + duration), not one list. Sharing user-limit is described in product `terms` text only (not a field).

## D8. Late orders
`waiting_verification` never auto-expires. After 10 minutes since `paid_at`, show "Terlambat" (admin list + buyer page); buyer gets the Hubungi Admin button. Slot stays held.

## D9. Phone, codes
Phone: 9–13 digits, normalized to `62xxxxxxxxxx`. Order code format `GR-` + 5 chars from `23456789ABCDEFGHJKMNPQRSTUVWXYZ`.

## UI gaps vs PRD (the prototype is NOT final — implement these)
Buyer: variant selectors (type + duration); "Habis" state with disabled Beli; waiting page "Terlambat" state after 10 min; rejected state shows admin reason; "Tampilkan akun" gate; "authenticator page is open" checkbox enabling "Ambil kode"; remove the "Kontrol prototype" box; real order code shown; recover via `/order/:code?t=token`.
Admin: login page; order code + time columns; "Terlambat" flag; 2-step confirm on Verifikasi; reject-reason input (required); proof opens via signed URL; pages for produk / akun / pembayaran / log; sound + title badge on new order.

## Still open (owner to decide before the stage that needs it)
- Refund form (money back vs replacement account) and claim window → needed by Stage 5 (product terms text).
- Data retention: superseded by D16 (90 days).

## D10. Variant-owned stock
Accounts belong to a variant and track max_uses (null = unlimited) / used_count.
Limited accounts precede unlimited backups; allocation uses strict FOR UPDATE ordering within the same variant.
Orders snapshot price at creation/retry; rejection or draft expiry releases the reserved slot exactly once in the status-transition transaction.

## D11. Shop admin account secrets
The admin account functions are `shop-admin-save-account` and `shop-admin-reveal-secret`. Encrypted values use `base64(nonce12 || ciphertext+tag)` with AES-256-GCM.

## D12. Buyer credentials and TOTP window
Buyer functions are `shop-reveal-credentials` and `shop-issue-totp`.
TOTP uses `start` / `code` actions so countdowns use server time.
Repeated `code` calls within the claimed window return the same code.
Order tokens persist in localStorage; credentials and codes are never stored client-side outside React state.

## D14. Proof flow and abuse limits
Proof recording atomically moves draft -> waiting_verification; D8 still applies: waiting never expires and requires a proof.
Create/retry share 6 committed calls/IP/10 min (unknown IP: 40); at most 4 active drafts/IP and 2/normalized phone; create allows 6 orders/phone/24 h.
Service-only shop_rate_check stores transactional counters (failed RPCs roll back increments); IP headers must be supplied by a trusted gateway, raw IPs are never stored.
TOTP uses shop_rate_check: 6 calls/order/minute, sleep <=31 s, one delivery audit/order/window; counters older than one day are purged daily.
Service-only shop_admin_save_account_tx commits encrypted account changes and their audit together, or rolls back both.

## D15. Daily phone cap and retention assumption
Create allows 10 orders per normalized phone in a rolling 24-hour window; this supersedes the six-order cap in D14. Per-IP and active-draft caps in D14 remain unchanged.
Assume 12 months of retention for shop data pending an implemented deletion/anonymization policy; this does not authorize automatic deletion yet.
Refund form and claim window remain pending the owner's decision.

## D16. Shop retention after 90 days
This supersedes D15's 12-month assumption: delete proofs for verified/rejected/expired orders, anonymize buyer name/phone/city, and keep order rows, prices, status, payment method, and dates.
Waiting-verification orders remain untouched. Nullable TOTP ciphertext may be cleared only for consumed private accounts whose orders are all old; password ciphertext stays because the applied column is NOT NULL.
