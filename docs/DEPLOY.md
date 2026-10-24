# GreenroomID Shop deployment checklist

## Before deployment

- [ ] In Vercel, verify the public client variables exist: `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, and (if contact RPC fallback is needed) `VITE_SHOP_ADMIN_PHONE`.
- [ ] Verify any host server variables already used by the site: `SESSION_SIGNING_KEY`, `TOTP_ACCOUNTS_JSON`, `ENABLE_DEMO`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, and `TOTP_ENCRYPTION_KEY`.
- [ ] Never prefix secrets with `VITE_`. In particular `SESSION_SIGNING_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `TOTP_ENCRYPTION_KEY`, `ACCOUNT_ENC_KEY`, and `SHOP_CRON_SECRET` must remain server-side / Supabase secrets, never browser variables.
- [ ] Set the Supabase Edge Function secret `SHOP_ALLOWED_ORIGIN` to exactly `https://greenroomid.com`; add `,https://www.greenroomid.com` only if the www host is actively used. Remove `http://localhost` entries after final tests.
- [ ] Set Edge Function secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `SHOP_ALLOWED_ORIGIN`, `ACCOUNT_ENC_KEY`, and `SHOP_CRON_SECRET`. Store the same `SHOP_CRON_SECRET` in Vault for the scheduled pg_net call.
- [ ] Keep JWT verification enabled for shop functions except `shop-retention-cleanup`, which authenticates server-to-server with `x-internal-secret` and needs JWT verify OFF.
- [ ] Before any test-data reset, make a Supabase dashboard backup or a `pg_dump` backup and confirm it is recoverable.

## Test data and launch setup

- [ ] After backup, review and run `supabase/maintenance/reset_shop_test_data.sql` manually in Supabase SQL Editor only if clearing test orders is intended.
- [ ] Manually empty test files from Storage buckets `proofs` and `shop-images`.
- [ ] In Admin Akun, add real accounts and verify their availability; set real prices in Admin Produk.
- [ ] Keep only real active payment methods. Deactivate the DANA and GOPAY sample methods.
- [ ] Deploy the Vercel production build, then check the browser console and deployment logs for errors.

## Post-deploy smoke test

- [ ] Create a buyer order, upload its proof, and verify the payment in the admin page.
- [ ] Reveal credentials once; confirm TOTP matches the account authenticator.
- [ ] Create a draft order and confirm it expires after its payment window.
- [ ] Repeat the main buyer flow on a 360 px mobile viewport.

## Rollback

- [ ] Revert to the previous Vercel deployment. Keep the database and migrations in place; do not roll back the database as part of a frontend rollback.
