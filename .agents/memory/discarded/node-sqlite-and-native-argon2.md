# Node built in SQLite driver and the native argon2 package

## What was tried

Two candidate implementations: `drizzle-orm/node-sqlite` over the built in `node:sqlite` module for persistence, and the `argon2` npm package for the key derivation of the credential secrets.

## Why it was discarded

`drizzle-orm/node-sqlite` only exists in the 1.0 prerelease line, so adopting it would put the foundation of the project on an unreleased ORM. The `argon2` package is native, its install script is not covered by `allowScripts` on this machine, and it would add a build step and an install approval for something the runtime already provides.

## Alternative chosen

`better-sqlite3@13` with stable `drizzle-orm@0.45.x`, validated natively in ESM on Node 24, and `node:crypto` `argon2Sync` for the derivation (verified: argon2id works and is deterministic for the same message, nonce and parameters).

## Tags

persistence security dependencies windows
