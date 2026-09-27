export type Draft = {
  url: string;
  mode: "video" | "playlist";
  tab: "download" | "library";
};
export function readDraft(): Draft {
  try {
    const draft = JSON.parse(sessionStorage.getItem("velora-draft") || "{}");
    return {
      url: typeof draft.url === "string" ? draft.url.slice(0, 2048) : "",
      mode: draft.mode === "playlist" ? "playlist" : "video",
      tab: draft.tab === "library" ? "library" : "download",
    };
  } catch {
    return { url: "", mode: "video", tab: "download" };
  }
}
export function normalizeLink(text: string) {
  const link = text.trim().match(/https:\/\/[^\s<>"']+/i)?.[0];
  return link ? link.replace(/[),.!?\]}]+$/, "") : text.trim();
}
