import { afterEach, describe, expect, it, vi } from "vitest";
import { idempotentPost, safeRead, writeOnce } from "../src/http.ts";
import { BridgeError } from "../src/errors.ts";

function timeoutError(): Error {
  const e = new Error("timed out");
  e.name = "TimeoutError";
  return e;
}

function okResponse(text: string) {
  return { ok: true, status: 200, text: () => Promise.resolve(text) } as unknown as Response;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("safeRead", () => {
  it("retries on timeout then succeeds", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce(okResponse("ok"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await safeRead({ url: "http://x", timeoutMs: 50 }, { retries: 2, backoffMs: 1 });
    expect(res.text).toBe("ok");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("gives up after exhausting retries and classifies the error", async () => {
    const fetchMock = vi.fn().mockRejectedValue(timeoutError());
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      safeRead({ url: "http://x", timeoutMs: 50 }, { retries: 1, backoffMs: 1 }),
    ).rejects.toMatchObject({ code: "timeout" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe("writeOnce", () => {
  it("never retries a write", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("boom"));
    vi.stubGlobal("fetch", fetchMock);

    await expect(writeOnce({ url: "http://x", timeoutMs: 50 })).rejects.toBeInstanceOf(BridgeError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe("idempotentPost", () => {
  it("retries an idempotent POST read", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(timeoutError())
      .mockResolvedValueOnce(okResponse("[]"));
    vi.stubGlobal("fetch", fetchMock);

    const res = await idempotentPost({ url: "http://x", timeoutMs: 50 }, { retries: 2, backoffMs: 1 });
    expect(res.text).toBe("[]");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
