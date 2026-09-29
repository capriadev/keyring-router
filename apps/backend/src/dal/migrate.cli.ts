import { loadEnv } from '../config/env.js';
import { runMigrations } from './migrate.js';

const env = loadEnv();

runMigrations(env.dbPath);

console.log(`migrations applied to ${env.dbPath}`);
