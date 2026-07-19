import { describe, expect, it } from "vitest";

describe("validation framework", () => {
  it("runs in a browser-like environment", () => {
    expect(document).toBeDefined();
    expect(window).toBeDefined();
  });

  it("supports application path aliases", async () => {
    const supabaseModule = await import("@/lib/supabase/server");

    expect(supabaseModule).toBeDefined();
  });
});