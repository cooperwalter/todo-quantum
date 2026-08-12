import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { serve } from '@hono/node-server';
import { createApp } from './app';
import { openDb } from './db';

const dbPath = process.env.DB_PATH ?? './tmp/todo.db';
mkdirSync(dirname(dbPath), { recursive: true });
const port = Number(process.env.API_PORT ?? 3000);
serve({ fetch: createApp(openDb(dbPath)).fetch, port, hostname: '127.0.0.1' });
console.log(`todo-quantum api listening on ${port}, db at ${dbPath}`);
