type Listener = () => void;
type AccessTokenMessage = { type: "clear" };

let accessToken: string | null = null;
const listeners = new Set<Listener>();
const broadcastChannel =
  typeof globalThis.BroadcastChannel === "function"
    ? new globalThis.BroadcastChannel("potterdoc-auth-token")
    : null;

if (broadcastChannel) {
  broadcastChannel.onmessage = (
    event: MessageEvent<AccessTokenMessage>,
  ): void => {
    if (event.data?.type === "clear") {
      notifyAccessTokenChange(null);
    }
  };
}

function notifyAccessTokenChange(token: string | null): void {
  if (accessToken === token) return;
  accessToken = token;
  for (const listener of listeners) {
    listener();
  }
}

export function getAccessToken(): string | null {
  return accessToken;
}

export function setAccessToken(token: string | null): void {
  notifyAccessTokenChange(token);
}

export function clearAccessToken(): void {
  notifyAccessTokenChange(null);
  broadcastChannel?.postMessage({ type: "clear" } satisfies AccessTokenMessage);
}

export function subscribeAccessToken(listener: Listener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
