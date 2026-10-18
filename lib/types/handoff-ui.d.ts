import type { PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots';
import type { HandoffController, HandoffViewState } from './handoff-client.js';
export interface HandoffProps {
    readonly controller: HandoffController;
}
export declare function useHandoff(controller: HandoffController): HandoffViewState;
/** Mounted in shell.overlay; capture and every billable operation require a user action. */
export declare function DshChatHandoffDialog({ controller }: HandoffProps): import("react/jsx-runtime").JSX.Element;
/** Register in the official session-scoped conversation.input.left slot. */
export declare function DshChatHandoffInsertion({ controller, sessionId, inputActions, useInput }: HandoffProps & {
    readonly sessionId: string;
} & PropsRuntime<'conversation.input.left'>): import("react/jsx-runtime").JSX.Element | null;
