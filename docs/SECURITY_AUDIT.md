# GreenroomID Shop — security audit

Date: 2026-10-23. Scope: current working tree, migrations 0001–0011, shop frontend/Edge Functions, permitted host admin SQL, config, scoped Git history and production build. No manual production probes, SQL execution, browser tests, or fixes were performed. The requested build included the existing postbuild prerender. Only this report and `supabase/tests/security_checks.sql` were created.

## Executive summary

**11 findings: Critical 0; High 1; Medium 6; Low 4; Info 0.** These are source findings, not claims that the deployed database has matching ACLs or code. Existing local modifications to 0001 and four Edge Functions predate this audit; deployment parity is **UNVERIFIED-needs-live-DB/config**. In particular, sensitive table protection and host admin membership must be checked in the live project before launch.

Fix first:
1. SEC-01: prevent anonymous stock exhaustion, including unpaid orders stuck in waiting_verification.
2. SEC-02: bound actual request bytes before body parsing and apply abuse quotas.
3. SEC-04: make account mutation and its immutable audit insert one transaction.
4. SEC-03: remove sleeping TOTP request amplification and deduplicate delivery audit.
5. SEC-07: apply shop response headers; run the supplied live ACL/storage/admin checks before release.

| ID | Severity | Title | Main location |
|---|---|---|---|
| SEC-01 | High | Anonymous reservations can exhaust stock indefinitely | `supabase/migrations/0011_payment_method_selection.sql:20` |
| SEC-02 | Medium | Request bodies are parsed before an application byte limit | `supabase/functions/proof-upload/index.ts:55` |
| SEC-03 | Medium | Concurrent TOTP calls multiply sleeping workers and audit writes | `supabase/functions/shop-issue-totp/index.ts:142` |
| SEC-04 | Medium | Account mutation can persist without its audit record | `supabase/functions/shop-admin-save-account/index.ts:79` |
| SEC-05 | Low | Proof MIME validation trusts client metadata | `supabase/functions/proof-upload/index.ts:69` |
| SEC-06 | Medium | Buyer bearer tokens persist on the shared host origin | `src/features/shop/lib/orderStorage.ts:7` |
| SEC-07 | Medium | Shop security, cache and indexing headers are absent | `vercel.json:1` |
| SEC-08 | Medium | No retention/anonymization job for buyer data and proofs | `supabase/maintenance/reset_shop_test_data.sql:1` |
| SEC-09 | Low | Active variants of inactive products remain public | `supabase/migrations/0001_shop_schema.sql:93` |
| SEC-10 | Low | Several dialogs lack keyboard focus management and height bounds | `src/features/shop/pages/admin/AdminPembayaran.tsx:85` |
| SEC-11 | Low | Control boundaries have insufficient nontext contrast | `src/features/shop/shop-theme.css:10` |

## Verified OK — static source checks

- Sensitive shop_accounts, shop_orders and shop_audit_logs have RLS enabled, explicit browser-role revocations and no direct read policy in these migrations. Authenticated Google users are not treated as admins by shop RPCs/Edge handlers. Actual grants, defaults and permissive host policies need the live checks below.
- Host `account-management-update.sql:39–57` uses JWT email membership in admin_users OR the caller's user_profiles ID with role admin and is_active=true. Both branches use EXISTS, returning a boolean. A mutable profile email is not trusted for this decision. Own-profile INSERT requires role client; the BEFORE UPDATE protection blocks non-admin role/is_active changes (`:63–108`). admin_users has RLS and no browser write policy in the reviewed source. The older definition in `rls-backup.sql:28–38` makes deployed definition verification necessary.
- `AdminGuard` is a UI guard; backend admin RPCs call is_admin and admin Edge Functions validate the JWT with getUser, then call is_admin with the caller JWT before using service credentials.
- `shop_record_proof_upload` explicitly revokes PUBLIC/anon/authenticated EXECUTE and grants service_role (`0003_shop_proof.sql:53–56`). It validates the order/token/state and order-UUID path prefix (`:37–49`). The proposed anonymous arbitrary-other-buyer-proof-path exploit is **not present in the reviewed source**; effective deployed privileges remain unverified.
- Slot allocation locks account rows and checks capacity; order status transitions lock the order and reject inappropriate states. Concurrent verify/reject/expire cannot each release the same reservation in the reviewed transaction logic. Price is copied from the variant, not accepted from a buyer. Retry requires rejected state, rotates the bearer and clears paid_at/proof; repeated retry without another admin rejection is denied.
- Tokens use 32 cryptographically random bytes; raw tokens are returned only to the buyer, and SHA-256 hashes are stored. SQL equality/JS equality is used, not constant-time comparison; no practical timing exploit was established for the fixed-length high-entropy bearer. Order code alone does not authorize status or credentials. No raw bearer token URL, Referer, audit detail or console output was found in shop source.
- Credential reveal decrypts before attempting an atomic conditional UPDATE with token/status/null checks (`shop-reveal-credentials/index.ts:62–65`). Only the winner receives credentials; losers get 410. Responses use no-store. Credentials/TOTP are React memory only, not fields persisted by orderStorage.
- TOTP start atomically claims one window; losers reread it. All code calls use the same next 30-second window; calls after expiry are denied. Repeated delivery within that one window is allowed; it does not generate a new window. SEC-03 concerns amplification, not a second access period.
- AES-256-GCM uses a validated 64-hex key and fresh random 12-byte nonce per encryption. Format is base64(nonce || ciphertext || authentication tag). Missing/wrong/rotated keys fail generically before a new claim. No plaintext password/TOTP/key was found in audit/console output. There is no key ID/version or AAD; rotation needs planned re-encryption, not just replacement of the secret.
- Proof paths are server-generated, upload uses upsert=false, and signed URLs are admin-gated with a 60-second TTL. No client-controlled path is passed to the upload endpoint. Rejected SVG/HTML MIME names alone are insufficient to validate bytes (SEC-05).
- React text rendering escapes buyer names, device/city/reasons and pretty audit JSON. No shop dangerouslySetInnerHTML or raw HTML rendering was found. wa.me numbers are normalized to digits and messages encoded; image paths go through getPublicUrl. External links use rel protections. Database-provided legacy image/logo URLs can still make third-party image requests; no javascript: execution path was established. Internal navigation prefixes route paths instead of accepting an external return URL.
- Tables use overflow-x-auto, most controls use min-h-11 (44 CSS px), and ShopGallery implements Tab trap, Esc, focus restoration, arrow navigation and swipe. Text contrast calculations pass: white/primary 6.57:1, ink/bg 15.36:1, muted/bg 6.40:1, muted/tint 5.92:1, warning 8.56:1, danger 6.73:1. Static review only; SEC-10/11 describe remaining issues.

## RLS and public column inventory

**Verified-OK in migration source; UNVERIFIED-needs-live-DB for effective privileges.** All seven tables enable RLS, none FORCE it; owner/service bypass is expected. Explicit grants are summarized below. Supabase defaults, PUBLIC and inherited ACLs can add permissions and must be queried, especially on newly created shop_images (no initial REVOKE ALL). TRUNCATE is not protected by RLS.

| Table | anon / non-admin authenticated | Admin authenticated | Policies / public column exposure |
|---|---|---|---|
| shop_products | SELECT active rows | CRUD all | shop_active_products; shop_admin_products_all. Every column public on active rows: ID/name/description/terms/order/active/timestamps/image_url. |
| shop_variants | SELECT is_active rows, even inactive parent (SEC-09) | CRUD all | shop_active_variants; shop_admin_variants_all. ID/product/type/duration/price and active status exposed; no credentials. |
| shop_payment_methods | SELECT active rows | CRUD all | shop_active_payment_methods; shop_admin_payment_methods_all. Full published ID/name, holder, number, logo, kind, QR path, sort_order and active status. This is intended payment information. |
| shop_images | SELECT when parent product active; includes inactive variant images | CRUD all | shop_images_active_read; shop_images_admin_all. All ID/product/variant/path/sort/created columns public. Public bucket means a known URL stays public regardless of row RLS. |
| shop_accounts | No direct read/write grant or policy | Guarded RPC/Edge only | Ciphertexts/email/usage are not directly browser-readable, even by admin. |
| shop_orders | No direct read/write grant or policy | Guarded RPC/Edge only | No authenticated SELECT policy; admin polls RPC. |
| shop_audit_logs | No direct read/write grant or policy | Guarded RPC/service only | Immutable row UPDATE/DELETE trigger. Owner TRUNCATE bypasses it; reset script is intentionally destructive and must stay offline. |
| shop_notifications | Not present in migrations | N/A | UNVERIFIED-needs-live-DB: inventory query will list it if deployed independently. |

## Complete function privilege inventory

PUBLIC means the pseudo-role, not schema public. Below is the final explicit migration intent; each effective live EXECUTE grant remains **UNVERIFIED-needs-live-DB** because Supabase defaults/old overloads can survive. The script enumerates every live overload and ACL, not just known signatures.

| Function/signature | PUBLIC | anon | authenticated | Service/internal and intended audience |
|---|---|---|---|---|
| create_order(uuid,text,text,text,text) | revoked | yes | yes | service_role yes; buyer creation |
| get_order_status(uuid,text) | revoked | yes | yes | service_role yes; matching bearer only |
| retry_payment(uuid,text) | revoked | yes | yes | service_role yes; rejected bearer only |
| submit_payment(uuid,text,timestamptz,uuid) | revoked | yes | yes | service_role yes; matching draft bearer; old 3-arg overload dropped |
| release_account(uuid) | revoked | revoked | revoked | service_role / owner / cron only |
| shop_take_slot(uuid) | revoked | revoked | revoked | owner-internal; no explicit service grant (defaults need check) |
| shop_release_slot(uuid) | revoked | revoked | revoked | owner-internal; no explicit service grant (defaults need check) |
| shop_record_proof_upload(uuid,text,text) | revoked | revoked | revoked | service_role only, plus owner |
| admin_verify_order(uuid) | revoked | revoked | yes, is_admin | admin only |
| admin_reject_order(uuid,text) | revoked | revoked | yes, is_admin | admin only |
| shop_admin_list_orders(text) | revoked | revoked | yes, is_admin | admin only; latest includes buyer_city/method_name |
| shop_admin_list_accounts() | revoked | revoked | yes, is_admin | admin only; flags rather than ciphertext/secret |
| shop_admin_set_account_status(uuid,bool) | revoked | revoked | yes, is_admin | admin only |
| shop_admin_update_account_meta(uuid,text,int,int) | revoked | revoked | yes, is_admin | admin only |
| shop_admin_stock_summary() | revoked | revoked | yes, is_admin | admin only |
| shop_admin_list_audit(int,int) | revoked | revoked | yes, is_admin | admin only |
| shop_variant_stock() | revoked | yes | yes | intended public boolean availability (SEC-09) |
| shop_public_contact() | revoked | yes | yes | intended public admin_name/normalized phone only |
| shop_audit_immutable() | default EXECUTE | inherited | inherited | trigger-only; recommend revoke browser/PUBLIC EXECUTE |
| shop_audit_admin_table_change() | default EXECUTE | inherited | inherited | trigger-only; recommend revoke browser/PUBLIC EXECUTE |
| shop_images_validate_variant() | default EXECUTE | inherited | inherited | trigger-only; recommend revoke browser/PUBLIC EXECUTE |

Trigger functions return trigger and cannot be invoked as ordinary RPC functions; default EXECUTE is a least-privilege hardening item, not a demonstrated direct mutation exploit. All SECURITY DEFINER functions set search_path=''; exception shop_public_contact uses public with a fully qualified table and implicit pg_catalog builtins. The image validation trigger is SECURITY INVOKER with search_path=public. Final create/retry call extensions.gen_random_bytes/digest explicitly; verify pgcrypto is actually installed in extensions. No unqualified attacker-resolvable pgcrypto call or demonstrated search_path exploit was found. Verify public CREATE is unavailable to browser roles.

## Edge / Storage / configuration matrix

All six shop Edge handlers parse comma-separated exact Origin allowlists, send Vary: Origin, handle POST/OPTIONS, and allow authorization/apikey/content-type. proof-upload omits x-client-info; its plain-fetch caller works. A missing Origin returns 403, including legitimate server-to-server requests; decide whether such clients are required. CORS is browser policy, not authentication: a scripted caller can forge Origin. No rate limiting was found in these handlers; gateway limits are unverified.

| Function | Recommended gateway verify_jwt | Actual authorization |
|---|---|---|
| proof-upload | OFF | order UUID + raw token hashed and checked by handler/RPC |
| shop-reveal-credentials | OFF | order UUID + raw token, status, atomic claim |
| shop-issue-totp | OFF | order UUID + raw token, status, one window |
| proof-signed-url | ON if gateway supports host signing algorithm | getUser + caller-JWT is_admin before service signing |
| shop-admin-save-account | ON if gateway supports host signing algorithm | getUser + caller-JWT is_admin |
| shop-admin-reveal-secret | ON if gateway supports host signing algorithm | getUser + caller-JWT is_admin + audit |
| create-donation | OFF | guest endpoint; unrelated shop path, inspected only as Edge inventory |
| midtrans-webhook | OFF | own SHA-512 signature validation |
| trigger-content-deploy | ON | getUser + is_admin |
| trigger-tool-deploy | ON | getUser + is_admin |

Dashboard settings/signing algorithm/deployed handlers are **UNVERIFIED-needs-live-DB/config**. OFF for buyer functions retains application bearer checks; do not disable admin checks to resolve a gateway signing mismatch. Non-shop wildcard CORS does not itself bypass JWT/signature authorization. Never place service_role in a browser environment variable.

Storage source: proofs is private; shop policies disallow browser SELECT/INSERT. These restrictive policies are permissive false policies, not a global veto: additional host policies could OR-allow access, including UPDATE/DELETE, so inspect every live storage.objects policy. Reviewed host request-files policies are bucket-specific. shop-images is public, 2 MiB, JPEG/PNG/WebP, with is_admin SELECT/INSERT/UPDATE/DELETE policies. ON CONFLICT DO NOTHING does not repair settings of an existing bucket. Public product and QRIS files are intentionally downloadable; row deactivation is not revocation of a public URL. Image canvas processing strips metadata on normal admin gallery uploads; QRIS intentionally preserves original bytes. Both client checks can be bypassed; bucket limits/MIME configuration and byte-validation assumptions need live checks. Failed cleanup and row-first deletion can leave orphan objects (SEC-08).

## Findings

### SEC-01 — High — Anonymous reservations can exhaust stock indefinitely
Location: `supabase/migrations/0006_variant_stock_model.sql:45`, `supabase/migrations/0011_payment_method_selection.sql:20`, `supabase/migrations/0002_shop_rpcs.sql:239`.

Evidence (3 lines):
- create_order reserves capacity for a draft; there are no per-IP/phone/device/active-order caps.
- submit_payment needs an active method and non-null timestamp, but no actual payment or proof.
- The cron job/release_account expire only draft orders; waiting_verification has no deadline.

Exploit:
1. An anonymous script reads public availability and repeatedly creates orders with syntactically valid buyer details until finite slots are held.
2. It calls submit_payment with each returned bearer and any active method, without paying or uploading proof.
3. Orders remain waiting_verification indefinitely, preventing legitimate buyers from allocating those slots and growing admin queue/storage.

Specific fix sketch (requires owner timeout policy; effort **M**):
```text
Gate creation through a rate-limited endpoint; restrict direct create RPC accordingly.
Cap concurrent reservations per verified phone/device and per-IP at the gateway.
Give waiting-without-proof orders a server-enforced deadline.
Expire/release under the same order-row lock and audit the transition.
Add global abuse quotas; do not trust client-supplied IP headers.
```

### SEC-02 — Medium — Request bodies are parsed before an application byte limit
Location: `supabase/functions/proof-upload/index.ts:55`, `shop-reveal-credentials/index.ts:35`, `shop-issue-totp/index.ts:75` (all paths under supabase/functions).

Evidence (3 lines):
- formData buffers multipart before checking file.size or the order bearer.
- JSON handlers, including admin endpoints, have no application body byte cap.
- No Content-Length check plus actual stream bound is present; deployed gateway bounds are unknown.

Exploit:
1. A script sends an allowed Origin header and a very large/chunked multipart or JSON body to a public buyer endpoint.
2. It repeats requests concurrently; parsing consumes memory/CPU before the handler rejects invalid tokens or file sizes.

Specific fix sketch (effort **M**):
```text
Reject excessive declared Content-Length, but do not rely on that header alone.
Read at most a configured byte limit from request.body; abort overflow with 413.
Use ~16 KiB for JSON; bound multipart to 5 MiB plus limited overhead/fields.
Parse only after bounding bytes; apply per-IP and per-order quotas.
```

### SEC-03 — Medium — TOTP calls multiply sleeping workers and audit writes
Location: `supabase/functions/shop-issue-totp/index.ts:142`.

Evidence (2 lines):
- Every valid code request can sleep until the next window, up to 35 seconds.
- Each repeated successful delivery adds a separate audit row, with no per-order single-flight or quota.

Exploit:
1. A malicious legitimate buyer starts the TOTP window for their verified order.
2. They issue hundreds of parallel code requests with that bearer.
3. Each holds work until the boundary and performs delivery/audit, amplifying one purchase into compute/database load.

Specific fix sketch (effort **M**):
```text
Return not-ready + retry_after instead of sleeping an Edge worker.
Rate-limit attempts per order and source IP.
Make delivery audit idempotent per order/window; keep one window claim.
```

### SEC-04 — Medium — Account mutation can persist without its audit record
Location: `supabase/functions/shop-admin-save-account/index.ts:79`.

Evidence (2 lines):
- The account insert/update commits before a separate audit_logs insert.
- An audit failure returns 500, although the encrypted account mutation is already persistent.

Exploit/failure sequence:
1. An admin creates/changes an account while audit insertion fails from a transient connection/constraint/capacity error.
2. The caller sees failure, but the mutation exists without the required immutable record; retrying create can add another account.

Specific fix sketch (effort **M**):
```text
Encrypt in the authorized Edge handler as today.
Call one service-only RPC with the ciphertext and safe metadata.
Inside that transaction mutate account and insert immutable audit.
Any audit failure must roll back the mutation; add an idempotency key for create.
```

### SEC-05 — Low — Proof MIME validation trusts client metadata
Location: `supabase/functions/proof-upload/index.ts:69`.

Evidence (2 lines):
- file.type selects an allowed extension and stored Content-Type without byte validation.
- SVG/HTML MIME labels are rejected, but the caller chooses the multipart type of arbitrary bytes.

Exploit:
1. A buyer labels malformed or unexpected bytes image/png or application/pdf and uploads a proof.
2. An admin opens the short-lived signed URL and the viewer encounters an unvalidated document. Application-origin script execution was **not** demonstrated; this is not a confirmed stored-XSS finding.

Specific fix sketch (effort **M**):
```text
Validate magic bytes plus successful decoding for accepted raster formats.
Validate supported PDF structure; reject mismatches and oversized decoded images.
Serve unsupported document previews as download with nosniff; consider malware scanning.
```

### SEC-06 — Medium — Buyer bearer tokens persist on the shared host origin
Location: `src/features/shop/lib/orderStorage.ts:7`, `src/features/shop/pages/ShopOrderStatus.tsx:156`, `src/features/shop/pages/ShopResult.tsx:182`.

Evidence (3 lines):
- Raw tokens are persisted in localStorage for recovery; readStoredOrder does not enforce retention TTL.
- Expired-state cleanup removes sessionStorage, not the corresponding persistent entry.
- Persistent removal normally depends on the buyer pressing Selesai; the host and shop share an origin.

Exploit:
1. A buyer leaves an order unfinished on a shared device, or another same-origin host feature suffers XSS.
2. A subsequent user/script reads gr_order entries and replays a bearer while its order/access period is valid.
3. They can operate that order or win its still-unused credential reveal. No existing host/shop XSS was established by this audit.

Specific fix sketch (effort **S**, recovery policy decision required):
```text
Set a documented recovery retention window and purge stale persisted entries.
Remove tokens at safe terminal states; distinguish draft expiry from verified access expiry.
Prefer session-only storage or an isolated shop origin if recovery requirements allow it.
Keep credentials/TOTP out of all persistent stores.
```

### SEC-07 — Medium — Shop security, cache and indexing headers are absent
Location: `vercel.json:1`, `index.html:24`.

Evidence (3 lines):
- vercel.json has redirects/rewrites but no headers block, CSP, frame, referrer or cache policy.
- index.html explicitly uses index, follow; no shop order/admin X-Robots-Tag exists.
- Secret JSON responses use no-store, but shop HTML/history URLs lack an explicit sensitive-route policy.

Exploit:
1. An attacker frames an authenticated admin route and uses misleading overlays to induce actions, where the live host supplies no frame protection.
2. Missing CSP increases the impact of a future script injection; indexed/shared order URLs can expose order identifiers, though identifiers alone do not authorize data.

Specific fix sketch (effort **S**):
```text
Apply the header set below to /shop and /shop/**, including fallback responses.
Use frame-ancestors 'none' and X-Frame-Options DENY.
Use Cache-Control no-store and X-Robots-Tag noindex,nofollow on order/admin HTML.
Deploy CSP Report-Only first; pin approved asset/analytics origins before enforcement.
```

### SEC-08 — Medium — No retention/anonymization job for buyer data and proofs
Location: `supabase/maintenance/reset_shop_test_data.sql:1`, `docs/DECISIONS.md:38`, `supabase/functions/proof-upload/index.ts:102`.

Evidence (3 lines):
- Orders hold buyer name/phone/device/city and proof references; proof files can include bank/personal information.
- Audit persists admin identities, action metadata and some proof paths/rejection reasons; rows are immutable.
- No production retention job is supplied; the reset script deletes all orders/audit and requires manual proof cleanup, and failed object cleanup is best effort.

Exploit/failure sequence:
1. Buyer data and orphan proof files accumulate after their business purpose ends.
2. A later admin/service compromise exposes a larger historical dataset than needed; bulk reset is not a safe production erasure mechanism.

Specific fix sketch (effort **M**, owner retention decision required):
```text
Choose retention periods for orders/proofs/audit with the owner's obligations in mind.
Schedule service-only archival/anonymization and proof deletion with retries.
Inventory orphan objects against references and reconcile failures.
Preserve minimal immutable audit while removing unnecessary personal payloads.
```

### SEC-09 — Low — Active variants of inactive products remain public
Location: `supabase/migrations/0001_shop_schema.sql:93`, `supabase/migrations/0006_variant_stock_model.sql:311`.

Evidence (2 lines):
- shop_active_variants checks only variant.is_active, without checking parent product state.
- shop_variant_stock likewise returns all active variant IDs and stock booleans without filtering active parents.

Exploit:
1. An anonymous caller queries variants/stock directly instead of using the catalog.
2. They infer IDs, prices/durations and availability for an unpublished/inactive product. create_order still checks the parent, so this does not bypass checkout validation.

Specific fix sketch (effort **S**):
```text
Require an active parent product in the public variant SELECT policy.
Join/filter active shop_products in shop_variant_stock.
Retain the separate is_admin policy so admins can manage inactive rows.
```

### SEC-10 — Low — Dialogs lack focus management and height bounds
Location: `src/features/shop/pages/admin/AdminPembayaran.tsx:85`, `AdminProduk.tsx:138`, `AdminAkun.tsx:199`, `AdminVerifikasi.tsx:185`, `src/features/shop/pages/ShopOrderStatus.tsx:316`.

Evidence (2 lines):
- These admin/QRIS dialogs use role/aria-modal without the gallery's focus trap, initial focus, Escape or focus restoration.
- Several variant/payment dialogs have no bounded vertical scrolling; controls can fall outside a 360 px/zoomed viewport.

Failure scenario:
1. A keyboard user opens a dialog and Tabs into the page behind it.
2. On a short viewport the submit/close controls can also be off-screen, preventing reliable completion.

Specific fix sketch (effort **M**):
```text
Reuse ShopGallery focus capture/trap/restore and Esc behavior for these dialogs.
Add max-h-[90vh] overflow-y-auto; give each input an accessible label.
Verify 360 px width, short height and zoom with keyboard before release.
```

### SEC-11 — Low — Control boundaries have insufficient nontext contrast
Location: `src/features/shop/shop-theme.css:10`, `src/features/shop/pages/admin/AdminPembayaran.tsx:12`.

Evidence (2 lines):
- input-border #BFCDC3 against white is about 1.65:1; border #DCE5DD against white is 1.29:1.
- White controls on white cards can rely on these borders as their only visible boundary; text contrast itself passes.

Failure scenario:
1. A low-vision user views normal, unfocused white inputs/secondary controls.
2. The weak outline makes the interactive area difficult to identify.

Specific fix sketch (effort **S**):
```text
Use a shop control-boundary token with at least 3:1 adjacent-background contrast.
Preserve a high-contrast focus indicator and 44 px targets.
Recheck all enabled/disabled/selected states; do not darken decorative card borders unnecessarily.
```

## Concrete shop response headers (proposal only)

For `/shop` and `/shop/**`, including rewritten SPA responses:

```text
Content-Security-Policy-Report-Only: default-src 'self'; script-src 'self' https://va.vercel-scripts.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https://<project>.supabase.co wss://<project>.supabase.co https://vitals.vercel-insights.com; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'; upgrade-insecure-requests
X-Frame-Options: DENY
Referrer-Policy: no-referrer
Permissions-Policy: camera=(), microphone=(), geolocation=(), payment=(), clipboard-write=(self)
Strict-Transport-Security: max-age=31536000
X-Content-Type-Options: nosniff
```

For `/shop/order/**` and `/shop/admin/**` also set `Cache-Control: no-store, max-age=0` and `X-Robots-Tag: noindex, nofollow, noarchive`. Do not apply no-store to fingerprinted static assets globally. Replace the project placeholder with the actual allowed origin; include a custom Supabase domain if configured. Google Fonts are covered. wa.me is a top-level link, so it needs no connect-src exception; no Telegram/WhatsApp API or notification script origins are needed. HTTPS images currently permit legacy external logos; pin reviewed image hosts when possible. Test any inline JSON-LD/analytics against CSP reports and use hashes/nonces where required; then enforce CSP (Report-Only alone does not enforce frame-ancestors). TLS and live header delivery remain unverified. These are recommendations, not changes made by this audit.

## Build, secret/config and dependency evidence

- `npm run build`: **pass**, including existing postbuild prerender (72 routes). No lint/browser/SQL tests were run because this audit requests build, npm audit and static review only.
- `npm audit --omit=dev --json`: command completed with vulnerability exit status 1; metadata reports **7 High packages, 0 Critical**, plus 1 Moderate. These counts include build tooling because @tailwindcss/vite is in dependencies; they are not seven reachable shop runtime exploits.
- **Reachable High/Critical entries in the inspected shop runtime: none established.** React Router High inefficient matching explicitly applies only to Framework Mode, not this declarative SPA ([maintainer advisory](https://github.com/remix-run/react-router/security/advisories/GHSA-chx6-hx7r-mcp5)); the other High Router item is RSC action CSRF, and no RSC handlers are present. Vite/editor, PostCSS, nanoid and source-map tooling findings are build/dev paths, not buyer input handlers in the deployed SPA. Keep tooling updates on the owner backlog; no dependency was changed. Host runtime paths outside the allowed scope were not exhaustively audited.
- Dist scan decoded **only JWT role claims**: 6 matches, all anon. No service_role JWT or sb_secret key pattern was found. No residual VITE_ identifiers were found after Vite replacement; shop source uses only VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and VITE_SHOP_ADMIN_PHONE. An anon key is intentionally public and depends on database policies for security.
- `.gitignore` ignores .env* except .env.example. Only root .env.example and functions/.env.example are tracked under those names; reviewed values are empty/placeholders. Scoped git grep and git log -S were run for service_role, secret, token, ACCOUNT_ENC_KEY, and service-key assignments; no verified real secret was identified in the inspected scope. This is not a guarantee that every historical blob or excluded host asset is clean. If a live key is later found in Git, record only location and **ROTATE**; never paste it back.
- Live ACCOUNT_ENC_KEY/SHOP_ALLOWED_ORIGIN values, service-role handling in deployed env, Supabase JWT verification toggles, project keys/rotation, CDN responses and provider platform limits remain unverified. Secret values are not requested by the live SQL file.

## Checklist disposition

| # | Item | Disposition |
|---|---|---|
| 1 | RLS/grants/public columns | Verified-OK source sensitive isolation; SEC-09; UNVERIFIED-needs-live-DB effective table/default/PUBLIC grants and notifications |
| 2 | Every function/default grants/search_path/helpers | Verified-OK explicit RPC revocations and helper checks; trigger hardening noted; UNVERIFIED-needs-live-DB overloads/defaults/pgcrypto |
| 3 | Tokens/code/replay/storage/Referer | Verified-OK entropy/hash/code authorization/no token URLs; SEC-06 persistence |
| 4 | Once-only credential claim/concurrency/failure | Verified-OK conditional claim; delivery-loss recovery and best-effort audit need owner decision |
| 5 | TOTP state/window/replay/sleep | Verified-OK single window; SEC-03; live concurrency untested |
| 6 | AES-GCM/key/nonce/plaintext | Verified-OK source; key rotation/recovery decision; live secrets unverified |
| 7 | All Edge CORS/JWT/size/service/rate | Verified-OK caller authorization; SEC-02/03; actual gateway config unverified |
| 8 | Storage/private/public/MIME/path/orphans | Verified-OK generated paths/short signed URL; SEC-05/08; live buckets/all policies unverified |
| 9 | XSS/React text/URL handling | Verified-OK static rendering/encoded wa.me/protected links; no stored-XSS established |
| 10 | Host admin trust chain | Verified-OK source policy/trigger; deployed definition/memberships unverified |
| 11 | Reservations/retry/price/races/phones/info | SEC-01/09; Verified-OK price locks/transition locks. Phone regex/length differs for 08 vs 62 representation; not identity verification or an abuse quota. Public contact returns only name/normalized phone; token-gated status returns intended buyer details. |
| 12 | Secrets/config/Git/build/dist | Verified-OK limited pattern scan/build; no production secret certification |
| 13 | Hosting/headers/indexing/cache | SEC-07; live CDN headers unverified |
| 14 | Dependencies | npm audit completed; no reachable High/Critical shop runtime advisory established |
| 15 | Personal data/retention/delete | SEC-08; owner decision required |
| 16 | Static 360 px/touch/ARIA/contrast | Verified-OK text contrast/table containment/gallery; SEC-10/11; no browser test |

## Needs owner decision / live follow-up

1. Run `supabase/tests/security_checks.sql` catalog queries, then each negative transaction separately, and return only its safe output. Confirm sensitive grants, every overload, default ACLs (especially TRUNCATE), storage bucket settings/all policies, pgcrypto location, active successful cron, is_admin/protect trigger and intended admin emails. Do not send keys, token hashes, account data or proof files.
2. Confirm whether current working-tree changes are deployed. Existing migrations were previously edited; applied migration version numbers alone cannot certify their definitions. Provide gateway JWT toggle names/status, allowlist origins and rate/size limits without secret values.
3. Choose pending-payment deadlines, reservation quotas and any verification requirement that bounds stock abuse.
4. Choose data retention and bearer recovery duration, and whether a separate shop origin is required for host-XSS isolation.
5. Decide audited admin recovery for a once-only claim whose network response was lost; decide whether best-effort buyer credential/TOTP audit is acceptable. No reset/reissue feature was found and none was added.
6. Plan encrypted-account key versioning/re-encryption and rollback/recovery before rotating ACCOUNT_ENC_KEY. A new key alone makes old ciphertext unreadable.
7. Review the header proposal against the real host/CDN/analytics and HTTPS image origins, then enforce it. Run keyboard/360 px tests after the accessibility fixes, outside this read-only audit.
