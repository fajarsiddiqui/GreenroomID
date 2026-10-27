// Isolated LOCAL PostgreSQL only. Never accepts a connection URL or Supabase secrets.
// Supply temporary, external tools via GAMBARIN_TEST_PG_BIN and GAMBARIN_TEST_PG_CLIENT.
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer } from 'node:net';
import process from 'node:process';

const exec = promisify(execFile);

export async function localPostgres() {
  const bin = process.env.GAMBARIN_TEST_PG_BIN;
  const client = process.env.GAMBARIN_TEST_PG_CLIENT;
  if (!bin || !client) throw new Error('Provide local PostgreSQL binaries and postgres.js module paths; no remote DB supported');
  const { default: postgres } = await import(pathToFileURL(resolve(client)).href);
  const directory = await mkdtemp(join(tmpdir(), 'gambarin-queue-test-'));
  const data = join(directory, 'data');
  const executable = name => join(bin, name + (process.platform === 'win32' ? '.exe' : ''));
  // pg_ctl's detached Windows server can inherit pipes; ignore stdio so start resolves.
  const run = (name, args) => name !== 'pg_ctl'
    ? exec(executable(name), args, { windowsHide: true })
    : new Promise((resolveRun, reject) => {
      const child = spawn(executable(name), args, { windowsHide: true, stdio: 'ignore' });
      child.on('error', reject);
      child.on('exit', code => code === 0 ? resolveRun() : reject(new Error(`pg_ctl exited ${code}`)));
    });
  const port = await new Promise((resolvePort, reject) => {
    const server = createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const selected = server.address().port;
      server.close(() => resolvePort(selected));
    });
  });
  const clients = [];
  let started = false;
  async function close() {
    await Promise.all(clients.map(sql => sql.end({ timeout: 1 })));
    if (started) await run('pg_ctl', ['-D', data, '-m', 'immediate', '-w', 'stop']);
    const root = resolve(tmpdir()) + sep;
    const target = resolve(directory);
    if (!target.startsWith(root) || !target.slice(root.length).startsWith('gambarin-queue-test-')) {
      throw new Error('Refusing cleanup outside isolated temporary test directory');
    }
    await rm(target, { recursive: true, force: true });
  }
  try {
    await run('initdb', ['-D', data, '-A', 'trust', '-U', 'postgres', '--locale=C', '--encoding=UTF8']);
    await run('pg_ctl', ['-D', data, '-l', join(directory, 'postgres.log'), '-o', `-h 127.0.0.1 -p ${port} -F`, '-w', 'start']);
    started = true;
    function connect() {
      const sql = postgres({ host: '127.0.0.1', port, username: 'postgres', database: 'postgres', max: 1, onnotice() {} });
      clients.push(sql);
      return sql;
    }
    const sql = connect();
    await sql.unsafe(`
      create role anon; create role authenticated; create role service_role bypassrls;
      create schema auth; create table auth.users(id uuid primary key);
      create schema cron; create table cron.job(jobname text);
      create schema net; create table net._http_response(id bigint primary key,status_code integer,content text);
      create function auth.uid() returns uuid language sql stable as $$
        select (nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'sub')::uuid $$;
      create function auth.role() returns text language sql stable as $$
        select nullif(current_setting('request.jwt.claims',true),'')::jsonb ->> 'role' $$;
      grant usage on schema auth, public to anon, authenticated, service_role;
      grant execute on all functions in schema auth to anon, authenticated, service_role;
    `);
    for (const name of ['001_accounts_packages.sql', '002_admin_account_create.sql', '003_admin_account_management.sql', '004_generation_queue_ledger.sql', '005_job_status_asset_resolution.sql', '007_paused_asset_access.sql', '009_submit_lease.sql', '010_manual_gallery_recovery.sql']) {
      await sql.unsafe(await readFile(new URL('../migrations/' + name, import.meta.url), 'utf8'));
    }
    return { sql, connect, close };
  } catch (error) {
    await close();
    throw error;
  }
}

export function asRole(sql, role, sub, work) {
  if (!['service_role', 'authenticated', 'anon'].includes(role)) throw new Error('Invalid test role');
  return sql.begin(async tx => {
    await tx.unsafe(`set local role ${role}`);
    await tx`select set_config('request.jwt.claims', ${JSON.stringify({ role, sub })}, true)`;
    return work(tx);
  });
}
