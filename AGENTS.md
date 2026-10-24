# AGENTS.md — GreenroomID Shop (read this first, every session)

Project: manual-payment web shop that sells OpenAI accounts. Stack: React 18 + Vite + TypeScript + React Router + TanStack Query + Tailwind, Supabase (Postgres/RLS/Auth/Realtime/Storage/Edge Functions/pg_cron). Hosting: Vercel or Netlify.

## Source of truth (read ONLY what your task names)
- `docs/PRD.md` — requirements. Cite by section/ID (e.g. §5, B-11, A-04).
- `docs/DECISIONS.md` — locked decisions. They override the PRD where they differ.
- `docs/ui-reference/*.reference.html` — visual/behavior reference (copy, colors, layout, states). Port to React + Tailwind; do not ship the raw HTML.

## Working rules (credit discipline)
1. Do exactly the task in the prompt. No extra features, no refactors outside scope, no speculative abstractions.
2. Do not scan the whole repo. Open only files you need. Do not re-read a file you just wrote.
3. Do not paste large file contents or long command output into your reply or reports.
4. Run only targeted checks (typecheck, lint, the tests for this stage). Do not run the full suite unless asked.
5. Prefer editing existing files over creating new ones. Keep files small and named by feature.
6. If something is ambiguous or contradicts DECISIONS.md, STOP and list the question. Do not guess on security or data-model matters.
7. Never put secrets in code, commits, or the frontend. Use env vars and Supabase secrets. Keep `.env.example` current.
   Supabase Edge Function secret/config: `SHOP_ALLOWED_ORIGIN` (the shop website origin).
   Supabase Edge Function secret: `ACCOUNT_ENC_KEY` (64 hex characters for AES-256-GCM).
8. Commit at the end of the stage with message `stage-N: <short summary>`.

## Hard security rules
- `accounts` table is never readable by role `anon`. Buyers touch data only through RPC / Edge Functions with `order_id + token`.
- Passwords and TOTP secrets are stored encrypted only; keys live in Supabase secrets, never in the browser.
- Order token: 32 random bytes, only its hash is stored. Order code alone never reveals credentials.
- Every admin action that changes state or reveals a secret writes an immutable `audit_logs` row.

## Final report format (max 15 lines, no code dumps)
```
STAGE: <n> <name>
DONE: <bullets, one line each>
FILES: <count> changed (list only new top-level folders/files)
CHECKS: typecheck/lint/tests -> pass|fail (+ names of failing ones)
DEVIATIONS: <anything differing from the prompt or DECISIONS.md, or "none">
OPEN QUESTIONS: <or "none">
HOW TO VERIFY: <max 3 steps>
```
