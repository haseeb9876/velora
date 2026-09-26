export type Format = {
  id: string;
  label: string;
  height?: number;
  ext: string;
  kind: "video" | "audio";
  size: number | null;
  estimated: boolean;
  fps?: number;
  hasAudio?: boolean;
};
export type Entry = {
  id: string;
  title: string;
  duration?: number;
  url: string;
};
export type Analysis = {
  id: string;
  kind: "video" | "playlist";
  title: string;
  creator?: string;
  thumbnail?: string;
  duration?: number;
  platform: string;
  options?: Format[];
  entries?: Entry[];
  limit?: number;
};
export type Job = {
  id: string;
  title: string;
  label: string;
  status:
    | "queued"
    | "processing"
    | "ready"
    | "failed"
    | "cancelled"
    | "expired";
  progress: number;
  error?: string;
  size?: number;
  created: number;
  expires?: number;
};
export type Health = {
  status: string;
  ffmpeg: boolean;
  limits: {
    playlist: number;
    duration: number;
    fileMb: number;
    retentionHours: number;
  };
};
const base = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
let token = localStorage.getItem("velora-session") || "";
let sessionRequest: Promise<void> | null = null;

async function session() {
  if (token) return;
  if (!sessionRequest)
    sessionRequest = (async () => {
      const response = await fetch(base + "/api/session", {
        method: "POST",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok)
        throw new Error("Could not start a session. The worker may be busy.");
      const result = await response.json();
      token = result.token;
      localStorage.setItem("velora-session", token);
    })().finally(() => {
      sessionRequest = null;
    });
  await sessionRequest;
}

export async function api<T>(
  path: string,
  options: RequestInit = {},
  retried = false,
): Promise<T> {
  try {
    if (path !== "/api/health") await session();
    const response = await fetch(base + path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...options.headers,
      },
      signal:
        options.signal ||
        AbortSignal.timeout(path === "/api/inspect" ? 95000 : 20000),
    });
    if (response.status === 401 && !retried) {
      token = "";
      localStorage.removeItem("velora-session");
      return api(path, options, true);
    }
    const data = await response.json();
    if (!response.ok)
      throw new Error(
        typeof data.detail === "string"
          ? data.detail
          : "Please check your request and try again.",
      );
    return data;
  } catch (error) {
    if (error instanceof TypeError || error instanceof SyntaxError)
      throw new Error(
        "The download worker is offline or unreachable. Please try again when it is back online.",
      );
    if (error instanceof DOMException && error.name === "TimeoutError")
      throw new Error("This request took too long. Please try again.");
    throw error;
  }
}

export const sizeLabel = (bytes?: number | null) =>
  bytes
    ? bytes >= 1024 ** 3
      ? `${(bytes / 1024 ** 3).toFixed(2)} GB`
      : `${(bytes / 1024 ** 2).toFixed(1)} MB`
    : "Size unavailable";
export function durationLabel(seconds?: number) {
  if (!seconds) return "";
  const s = Math.round(seconds);
  return s >= 3600
    ? `${Math.floor(s / 3600)}:${String(Math.floor(s / 60) % 60).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`
    : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}
