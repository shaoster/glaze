import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type BroadcastMessage = { type: "clear" };

const mockPostMessage = vi.fn();
const mockClose = vi.fn();
const broadcastInstances: Array<{
  onmessage: ((event: MessageEvent<BroadcastMessage>) => void) | null;
  postMessage: typeof mockPostMessage;
  close: typeof mockClose;
}> = [];

class MockBroadcastChannel {
  onmessage: ((event: MessageEvent<BroadcastMessage>) => void) | null = null;
  constructor(public name: string) {
    broadcastInstances.push(this);
  }
  postMessage = mockPostMessage;
  close = mockClose;
}

vi.stubGlobal("BroadcastChannel", MockBroadcastChannel);

async function loadStore() {
  vi.resetModules();
  return import("../authTokenStore");
}

beforeEach(() => {
  vi.clearAllMocks();
  broadcastInstances.length = 0;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("authTokenStore", () => {
  it("broadcasts token clears to sibling tabs", async () => {
    const { clearAccessToken, setAccessToken } = await loadStore();

    setAccessToken("access-token");
    clearAccessToken();

    expect(broadcastInstances).toHaveLength(1);
    expect(mockPostMessage).toHaveBeenCalledWith({ type: "clear" });
  });

  it("clears local token state when a sibling tab broadcasts a clear", async () => {
    const { getAccessToken, setAccessToken } = await loadStore();

    setAccessToken("access-token");
    expect(getAccessToken()).toBe("access-token");

    broadcastInstances[0]?.onmessage?.({
      data: { type: "clear" },
    } as MessageEvent<BroadcastMessage>);

    expect(getAccessToken()).toBeNull();
  });
});
