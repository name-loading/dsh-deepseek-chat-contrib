import type { WebsiteHandoffPort } from './handoff-types.js';
interface WebsiteHandoffOptions {
    execute: (script: string) => Promise<unknown>;
    identity: (allowModeChange?: boolean) => string;
    lifetime: AbortSignal;
    subscribeIdentityChange?: (listener: () => void) => () => void;
}
/** On-demand only. The guest owner provides its URL/document/auth generation identity. */
export declare function createWebsiteHandoffPort(options: WebsiteHandoffOptions): WebsiteHandoffPort;
export {};
