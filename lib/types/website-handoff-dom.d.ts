import type { ChatMessage } from './handoff-types.js';
export interface HandoffDomMessage extends ChatMessage {
    stable: boolean;
    complete?: boolean;
}
export interface HandoffDomFrame {
    url: string;
    title: string;
    branch: string;
    messages: HandoffDomMessage[];
    top: boolean;
    bottom: boolean;
    virtual: boolean;
    scrollTop: number;
    scrollHeight: number;
    clientHeight: number;
    busy: boolean;
}
export type HandoffDomCommand = {
    type: 'read';
} | {
    type: 'scroll';
    token: string;
    top: number;
} | {
    type: 'restore';
    token: string;
    top: number;
} | {
    type: 'prepare' | 'send';
    prompt: string;
    expected: {
        url: string;
        branch: string;
        messages: readonly ChatMessage[];
    };
};
export declare function websiteHandoffScript(command: HandoffDomCommand): string;
