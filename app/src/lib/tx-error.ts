import { AnchorError } from "@coral-xyz/anchor";

/**
 * A failed on-chain call's Error#message is not fit to show a user as-is:
 * for a custom program error, Anchor's own message is a full dump (source
 * file:line, error code, error number) wrapped around the one line that
 * actually matters — the #[msg(...)] text, available separately as
 * error.error.errorMessage. Anything else that still carries a raw
 * simulation-log dump ("Program log: ...") falls back to a generic
 * message instead of surfacing that to the UI.
 */
export function describeTxError(error: unknown, fallback: string): string {
  if (error instanceof AnchorError) {
    return error.error.errorMessage;
  }
  if (error instanceof Error && !error.message.includes("Program log:")) {
    return error.message;
  }
  return fallback;
}
