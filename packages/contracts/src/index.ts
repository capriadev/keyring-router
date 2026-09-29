/**
 * What a client of Keyring Router shares: the bytes the gateway answers with, on its own `/api` surface
 * and on the `/v1` surface a tool points at.
 *
 * This package owns the shapes, and only the shapes: no runtime code, no validation and no dependency.
 * The gateway keeps its domain types and its zod schemas, and asserts at compile time that they satisfy
 * what is declared here, which is what stops the answer and its description from drifting apart.
 */
export * from './api.js';
export * from './v1.js';
