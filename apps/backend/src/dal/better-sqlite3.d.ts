/**
 * `better-sqlite3` ships no type declarations of its own and adding `@types/better-sqlite3` would be
 * a new dependency, which this slice forbids. Only the surface `dal/` uses is declared here.
 * `skipLibCheck` keeps drizzle-orm's own driver typings working against this module.
 */
declare module 'better-sqlite3' {
  export interface RunResult {
    readonly changes: number;
    readonly lastInsertRowid: number | bigint;
  }

  export interface Statement {
    run(...params: unknown[]): RunResult;
    get(...params: unknown[]): unknown;
    all(...params: unknown[]): unknown[];
  }

  export interface Options {
    readonly readonly?: boolean;
    readonly fileMustExist?: boolean;
  }

  export interface Database {
    pragma(source: string): unknown;
    prepare(source: string): Statement;
    close(): void;
  }

  const Database: {
    new (filename: string, options?: Options): Database;
  };

  export default Database;
}
