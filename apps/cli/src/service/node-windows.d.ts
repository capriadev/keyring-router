/**
 * The surface of `node-windows` this command line uses. The package ships no types of its own, so only
 * what is called here is declared: the service wrapper is the one place that talks to Windows, and a
 * narrow declaration keeps the rest of the command line typed without pulling a type package for it.
 *
 * Recorded as debt: if a types package appears, this file goes away instead of growing.
 */
declare module 'node-windows' {
  export interface ServiceOptions {
    readonly name: string;
    readonly description?: string;
    /** The entry point the service runs, as an absolute path. */
    readonly script: string;
    readonly nodeOptions?: readonly string[];
    readonly env?: readonly { readonly name: string; readonly value: string }[];
    readonly workingDirectory?: string;
    /** Seconds to wait before a restart, and how fast that wait grows per attempt. */
    readonly wait?: number;
    readonly grow?: number;
    readonly maxRestarts?: number;
    readonly allowServiceLogon?: boolean;
  }

  export interface WindowsService {
    install(): void;
    uninstall(): void;
    start(): void;
    stop(): void;
    restart(): void;
    on(event: string, listener: (...args: unknown[]) => void): void;
    readonly exists: boolean;
  }

  export const Service: {
    new (options: ServiceOptions): WindowsService;
  };
}
