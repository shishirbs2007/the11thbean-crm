/**
 * The adapter registry.
 *
 * Features resolve a capability to whichever adapter is enabled and properly
 * configured. When nothing is available the answer is null and the caller
 * degrades honestly — a queued message stays queued rather than silently
 * disappearing.
 */

import {
  environmentSatisfied,
  hasCapability,
  missingEnvironment,
  type Capability,
  type IntegrationAdapter,
  type OutboundMessage,
  type SendResult,
} from "./types";

/**
 * The adapter used when no provider is configured. It refuses to send rather
 * than pretending to, so a café never believes a message went out when it did
 * not. This is the shipping default.
 */
export const unconfiguredAdapter: IntegrationAdapter = {
  key: "unconfigured",
  label: "No provider configured",
  capabilities: [],
  requiredEnv: [],
  isConfigured: () => false,
  async send(): Promise<SendResult> {
    return {
      ok: false,
      error:
        "No messaging provider is configured. Enable an adapter in Integrations and supply its credentials.",
      retryable: false,
    };
  },
};

const adapters = new Map<string, IntegrationAdapter>();

export function registerAdapter(adapter: IntegrationAdapter): void {
  adapters.set(adapter.key, adapter);
}

export function getAdapter(key: string): IntegrationAdapter | null {
  return adapters.get(key) ?? null;
}

export function listAdapters(): IntegrationAdapter[] {
  return [...adapters.values()];
}

/**
 * The adapter that should handle a capability: registered, declaring it, and
 * with its environment actually satisfied. An adapter that is enabled but
 * missing credentials is not returned, because using it would fail anyway.
 */
export function resolveCapability(
  capability: Capability,
): IntegrationAdapter | null {
  for (const adapter of adapters.values()) {
    if (hasCapability(adapter, capability) && adapter.isConfigured()) {
      return adapter;
    }
  }

  return null;
}

/**
 * Sends through whichever adapter carries this capability. Returns a typed
 * failure rather than throwing, so the send pipeline can record the reason
 * against the message and retry later if it is worth retrying.
 */
export async function sendVia(
  capability: Capability,
  message: OutboundMessage,
): Promise<SendResult> {
  const adapter = resolveCapability(capability);

  if (!adapter?.send) {
    return unconfiguredAdapter.send!(message);
  }

  try {
    return await adapter.send(message);
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
      retryable: true,
    };
  }
}

export { environmentSatisfied, missingEnvironment };
