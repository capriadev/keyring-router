---
name: drizzle-orm
description: Safety procedure for schema, migration and direct database operations in Keyring Router. Use after persistence tooling is chosen and before any command that can change schema or data.
---

# Database safety

Keyring Router has not selected an ORM or database package yet. This skill defines the safety bar, not a command name or schema path. Read it before editing a schema, generating a migration, applying a migration or making a direct database change.

## Mandatory flow

1. Read the active feature spec and relevant architecture section. Confirm the selected persistence engine and tool.
2. Validate the schema change with the project's typecheck or tool-native validation before generating a migration.
3. Generate a reviewable migration when the selected tool supports migrations. Do not apply it automatically.
4. **Read the generated migration in full before doing anything else.** Specifically check for:
   - `DROP TABLE`, `DROP COLUMN`, `ALTER COLUMN ... TYPE` (data-loss risk)
   - Any statement affecting a table that may already hold real user data
5. If the migration contains any destructive statement, **stop and show it to the user explicitly, in plain language**. Follow the repository's double-confirmation rule before applying it.
6. Apply only the reviewed migration, then verify the expected schema and application behavior.

## Tool-specific commands

| Command | Effect | When to use |
|---|---|---|
Add exact commands, schema paths and review requirements in the same spec that introduces Drizzle, Prisma or another database tool. Do not infer them from a previous project.

## Hard restrictions

- **Never run an unreviewed schema-push command if the database contains data the user has not explicitly said is disposable.**
- **Never apply a destructive migration without the repository's double confirmation for that specific migration.**
- **Never write raw SQL directly against the database outside of the generate → review → migrate flow**, even for "quick fixes."
- **Never delete data (`DROP`, `DELETE`, `TRUNCATE`) via any path without asking for the required double confirmation**, each time restating exactly what will be deleted and that it is irreversible.

## Don't
- Don't skip the `tsc` check to save time.
- Don't apply a migration you haven't personally read.
- Don't assume "it's probably fine" for any `DROP`/`ALTER` — always flag it.
