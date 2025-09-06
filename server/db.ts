import pg from "pg";
const { Pool } = pg;

const connectionString = process.env.DATABASE_URL;
export const pool = new Pool({
  connectionString,
  max: 10,
  idleTimeoutMillis: 30_000,
});

export async function migrate() {
  const client = await pool.connect();
  try {
    await client.query(`create extension if not exists pgcrypto;`);
    await client.query(`
      create table if not exists admins (
        id uuid primary key default gen_random_uuid(),
        name text not null,
        email text not null unique,
        company text,
        password_hash text not null,
        email_verified boolean not null default false,
        verification_token text,
        created_at timestamptz not null default now()
      );
    `);
  } finally {
    client.release();
  }
}
