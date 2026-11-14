/** Why the gate opened. The dialog's title names it, so the adult knows what they allow. */
export type ParentGateReason = 'parent-corner' | 'export' | 'print' | 'quit' | 'closing';

/** Asks the adult. Resolves true when they pass the gate and false when they cancel. */
export type RequestParentGate = (reason: ParentGateReason) => Promise<boolean>;
