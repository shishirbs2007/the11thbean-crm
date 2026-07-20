import { assertWritesAllowed } from "./environment";

/**
 * Fails the staging run before a single browser starts if the environment is
 * not an explicitly flagged staging target. Better to abort here than to
 * discover the mistake as rows appearing in the café's real records.
 */
export default function globalSetup(): void {
  assertWritesAllowed();
}
