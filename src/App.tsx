import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpRight,
  Check,
  CheckCheck,
  ChevronDown,
  CircleHelp,
  Clipboard,
  Clock3,
  Download,
  Film,
  Headphones,
  Layers,
  Link2,
  ListVideo,
  LoaderCircle,
  Menu,
  MonitorSmartphone,
  Moon,
  Music2,
  Plus,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  WifiOff,
  X,
  Zap,
  RefreshCw,
  Search,
} from "lucide-react";
import { api, durationLabel, sizeLabel } from "./api";
import type { Analysis, Health, Job } from "./api";
import platforms from "../shared/platforms.json";
import { readDraft, normalizeLink } from "./preferences";
import {
  appBuild,
  applyUpdate,
  blockUpdates,
  checkForUpdate,
  noteInteraction,
  updateState,
} from "./pwa";
import type { UpdateState } from "./pwa";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const platformNames = platforms.slice(0, 8).map((item) => item.name);
const icons = platforms.slice(0, 8).map((item) => item.mark);
function Logo() {
  return (
    <img
      className="brand-mark"
      src="/brand-mark.svg"
      alt=""
      width="42"
      height="42"
    />
  );
}
function rememberedDownloads(): string[] {
  try {
    const value = JSON.parse(
      sessionStorage.getItem("velora-auto-downloads") || "[]",
    );
    return Array.isArray(value)
      ? value.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    return [];
  }
}
function isInstalled() {
  return (
    matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true ||
    localStorage.getItem("velora-installed") === "true"
  );
}
function getSharedUrl() {
  const params = new URLSearchParams(location.search);
  return (
    params.get("url") ||
    (params.get("text") || "").match(/https:\/\/\S+/)?.[0] ||
    ""
  );
}

export default function App() {
  const [tab, setTab] = useState<"download" | "library">(() => {
    const params = new URLSearchParams(location.search);
    if (params.get("view") === "library") return "library";
    if (
      params.get("view") === "download" ||
      params.get("type") === "audio" ||
      getSharedUrl()
    )
      return "download";
    return readDraft().tab;
  });
  const [url, setUrl] = useState(
    () => normalizeLink(getSharedUrl()) || readDraft().url,
  );
  const [mode, setMode] = useState<"video" | "playlist">(
    () => readDraft().mode,
  );
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mediaType, setMediaType] = useState<"video" | "audio">(() =>
    new URLSearchParams(location.search).get("type") === "audio" ||
    localStorage.getItem("velora-format") === "audio"
      ? "audio"
      : "video",
  );
  const [profile, setProfile] = useState<"compatible" | "original">(() =>
    localStorage.getItem("velora-playback") === "original"
      ? "original"
      : "compatible",
  );
  const autoDownloads = useRef(new Set(rememberedDownloads()));
  const [sentDownloads, setSentDownloads] = useState<Set<string>>(new Set());
  const [analysisSeconds, setAnalysisSeconds] = useState(0);
  const [entries, setEntries] = useState<string[]>([]);
  const [preset, setPreset] = useState("best");
  const [busy, setBusy] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [historyChecked, setHistoryChecked] = useState(false);
  const [connection, setConnection] = useState<
    "checking" | "online" | "offline"
  >("checking");
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(isInstalled);
  const [modal, setModal] = useState<
    "install" | "privacy" | "terms" | "help" | "platforms" | null
  >(null);
  const [release, setRelease] = useState<UpdateState>(updateState);
  const [libraryQuery, setLibraryQuery] = useState("");
  const [libraryFilter, setLibraryFilter] = useState("all");
  const [platformQuery, setPlatformQuery] = useState("");
  const [retrying, setRetrying] = useState<string | null>(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("velora-theme") || "light",
  );
  const resultRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const pendingJobs = useRef(false);
  const activeCount = jobs.filter(
    (j) => j.status === "queued" || j.status === "processing",
  ).length;

  useEffect(() => {
    sessionStorage.setItem("velora-draft", JSON.stringify({ url, mode, tab }));
  }, [url, mode, tab]);
  useEffect(() => {
    localStorage.setItem("velora-playback", profile);
  }, [profile]);
  useEffect(() => {
    localStorage.setItem("velora-format", mediaType);
  }, [mediaType]);
  useEffect(() => {
    blockUpdates(
      !historyChecked ||
        busy ||
        queuing ||
        Boolean(retrying) ||
        activeCount > 0,
      Boolean(modal) || (tab === "download" && Boolean(analysis)),
    );
  }, [
    historyChecked,
    busy,
    queuing,
    retrying,
    activeCount,
    modal,
    tab,
    analysis,
  ]);
  useEffect(() => {
    const changed = () => setRelease(updateState());
    window.addEventListener("velora-update", changed);
    return () => window.removeEventListener("velora-update", changed);
  }, []);
  useEffect(() => {
    const mobile =
      matchMedia("(pointer: coarse)").matches ||
      /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
    const last = Number(localStorage.getItem("velora-install-reminded") || 0);
    if (
      !mobile ||
      installed ||
      modal ||
      busy ||
      queuing ||
      analysis ||
      activeCount ||
      Date.now() - last < 86400000
    )
      return;
    let timer: ReturnType<typeof setTimeout>;
    const offerInstall = () => {
      if (
        document.hidden ||
        document.activeElement?.matches("input,textarea")
      ) {
        timer = setTimeout(offerInstall, 2000);
        return;
      }
      localStorage.setItem("velora-install-reminded", String(Date.now()));
      setModal("install");
    };
    timer = setTimeout(offerInstall, 1600);
    return () => clearTimeout(timer);
  }, [installed, modal, busy, queuing, analysis, activeCount]);

  useEffect(() => {
    pendingJobs.current = activeCount > 0;
  }, [activeCount]);

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("velora-theme", theme);
  }, [theme]);
  useEffect(() => {
    if (location.search) history.replaceState(null, "", location.pathname);
  }, []);
  useEffect(() => {
    const capture = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallEvent);
      setInstalled(false);
      localStorage.removeItem("velora-installed");
    };
    const complete = () => {
      localStorage.setItem("velora-installed", "true");
      setInstalled(true);
      setInstallPrompt(null);
      setModal(null);
    };
    const displayMode = matchMedia("(display-mode: standalone)");
    const checkDisplay = () => {
      if (
        displayMode.matches ||
        (navigator as Navigator & { standalone?: boolean }).standalone
      )
        complete();
    };
    checkDisplay();
    displayMode.addEventListener("change", checkDisplay);
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    return () => {
      displayMode.removeEventListener("change", checkDisplay);
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
      requestRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    let alive = true;
    let refreshHistory = true;
    let polling = false;
    const onVisible = () => {
      if (!document.hidden) {
        refreshHistory = true;
        clearTimeout(timer);
        void poll();
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("velora-jobs-changed", onVisible);
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (polling || !alive) return;
      polling = true;
      try {
        const info = await api<Health>("/api/health");
        if (!alive) return;
        setHealth(info);
        setConnection("online");
        if (refreshHistory || pendingJobs.current) {
          const data = await api<{ jobs: Job[] }>("/api/jobs");
          if (alive) setJobs(data.jobs);
          refreshHistory = false;
        } else {
          setJobs((current) =>
            current.some(
              (j) =>
                j.status === "ready" &&
                j.expires &&
                j.expires * 1000 <= Date.now(),
            )
              ? current.map((j) =>
                  j.status === "ready" &&
                  j.expires &&
                  j.expires * 1000 <= Date.now()
                    ? { ...j, status: "expired" }
                    : j,
                )
              : current,
          );
        }
      } catch {
        if (alive) setConnection("offline");
      }
      if (alive) setHistoryChecked(true);
      polling = false;
      if (alive)
        timer = setTimeout(
          poll,
          document.hidden ? 30000 : pendingJobs.current ? 1200 : 15000,
        );
    }
    void poll();
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("velora-jobs-changed", onVisible);
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  useEffect(() => {
    if (!busy) return;
    const timer = setInterval(
      () => setAnalysisSeconds((value) => value + 1),
      1000,
    );
    return () => clearInterval(timer);
  }, [busy]);
  useEffect(() => {
    if (document.hidden) return;
    for (const job of jobs) {
      if (!autoDownloads.current.has(job.id)) continue;
      if (["failed", "cancelled", "expired"].includes(job.status))
        autoDownloads.current.delete(job.id);
      if (job.status === "ready") {
        autoDownloads.current.delete(job.id);
        void saveFile(job, true);
      }
    }
    sessionStorage.setItem(
      "velora-auto-downloads",
      JSON.stringify([...autoDownloads.current]),
    );
  }, [jobs]);

  async function analyze(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const parsed = new URL(normalizeLink(url));
      if (parsed.protocol !== "https:") throw new Error();
    } catch {
      setError("Paste a complete HTTPS video link to get started.");
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setAnalysisSeconds(0);
    setBusy(true);
    setAnalysis(null);
    try {
      const data = await api<Analysis>("/api/inspect", {
        method: "POST",
        body: JSON.stringify({ url: normalizeLink(url), mode }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(95000),
        ]),
      });
      setAnalysis(data);
      if (
        data.kind === "video" &&
        !data.options?.some((f) => f.kind === mediaType)
      )
        setMediaType(data.options?.[0]?.kind || "video");
      setEntries(data.entries?.map((e) => e.id) || []);
      setTimeout(
        () =>
          resultRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "nearest",
          }),
        100,
      );
    } catch (e) {
      if (!(e instanceof DOMException && e.name === "AbortError"))
        setError((e as Error).message);
    } finally {
      if (requestRef.current === controller) setBusy(false);
    }
  }
  async function queueDownload(optionId?: string) {
    if (!analysis) return;
    setQueuing(true);
    setError("");
    try {
      const data = await api<{ jobs: Job[] }>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          analysis_id: analysis.id,
          option_id: optionId || null,
          profile,
          entry_ids: entries,
          preset,
        }),
      });
      data.jobs.forEach((job) => autoDownloads.current.add(job.id));
      sessionStorage.setItem(
        "velora-auto-downloads",
        JSON.stringify([...autoDownloads.current]),
      );
      pendingJobs.current = true;
      setJobs((previous) => [...data.jobs, ...previous]);
      window.dispatchEvent(new Event("velora-jobs-changed"));
      setToast(
        `${data.jobs.length === 1 ? "Your download is" : `${data.jobs.length} downloads are`} on the way. Saving starts automatically when ready.`,
      );
      setTab("library");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQueuing(false);
    }
  }
  async function saveFile(job: Job, automatic = false) {
    noteInteraction();
    try {
      const data = await api<{ url: string }>(`/api/jobs/${job.id}/ticket`, {
        method: "POST",
      });
      const a = document.createElement("a");
      a.href = data.url;
      a.rel = "noreferrer";
      a.download = "";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setSentDownloads((previous) => new Set([...previous, job.id]));
      setToast(
        automatic
          ? "Download sent to your browser. If it does not start, tap Save again."
          : "Download sent to your browser. Check your Downloads folder.",
      );
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function removeJob(job: Job) {
    try {
      await api(`/api/jobs/${job.id}`, { method: "DELETE" });
      autoDownloads.current.delete(job.id);
      sessionStorage.setItem(
        "velora-auto-downloads",
        JSON.stringify([...autoDownloads.current]),
      );
      setJobs((previous) =>
        previous.map((j) =>
          j.id === job.id ? { ...j, status: "cancelled" } : j,
        ),
      );
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function retryJob(job: Job) {
    setRetrying(job.id);
    try {
      const data = await api<{ jobs: Job[] }>(`/api/jobs/${job.id}/retry`, {
        method: "POST",
      });
      data.jobs.forEach((item) => autoDownloads.current.add(item.id));
      sessionStorage.setItem(
        "velora-auto-downloads",
        JSON.stringify([...autoDownloads.current]),
      );
      pendingJobs.current = true;
      setJobs((previous) => [...data.jobs, ...previous]);
      setLibraryFilter("all");
      setLibraryQuery("");
      window.dispatchEvent(new Event("velora-jobs-changed"));
      setToast("Trying that download again with fresh source details.");
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setRetrying(null);
    }
  }
  function closeModal() {
    if (modal === "install")
      localStorage.setItem("velora-install-reminded", String(Date.now()));
    setModal(null);
  }
  async function install() {
    localStorage.setItem("velora-install-reminded", String(Date.now()));
    if (!installPrompt) {
      setModal("install");
      return;
    }
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === "accepted") setModal(null);
    } catch {
      setModal("install");
    } finally {
      setInstallPrompt(null);
    }
  }
  async function paste() {
    try {
      setUrl(normalizeLink(await navigator.clipboard.readText()));
      setAnalysis(null);
      setError("");
    } catch {
      setToast(
        "Use Paste in the link field. Your browser did not grant clipboard access.",
      );
    }
  }
  function changeType(type: "video" | "audio") {
    setMediaType(type);
  }
  const displayedFormats =
    analysis?.options?.filter((f) => f.kind === mediaType) || [];

  const visibleJobs = jobs.filter(
    (job) =>
      job.status !== "cancelled" &&
      job.title.toLowerCase().includes(libraryQuery.toLowerCase()) &&
      (libraryFilter === "all" ||
        (libraryFilter === "active"
          ? ["queued", "processing"].includes(job.status)
          : libraryFilter === "ready"
            ? job.status === "ready"
            : ["failed", "expired"].includes(job.status))),
  );
  const directory = platforms.filter((item) =>
    `${item.name} ${item.hint}`
      .toLowerCase()
      .includes(platformQuery.toLowerCase()),
  );

  return (
    <div className="app-shell">
      <aside className={`sidebar ${mobileNav ? "is-open" : ""}`}>
        <a href="/" className="brand" aria-label="Velora home">
          <Logo />
          <span>
            velora<span className="brand-dot">.</span>
          </span>
        </a>
        <button
          className="mobile-close icon-button"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        >
          <X size={20} />
        </button>
        <div className="workspace-label">YOUR WORKSPACE</div>
        <nav aria-label="Main navigation">
          <button
            className={`nav-item ${tab === "download" ? "active" : ""}`}
            onClick={() => {
              setTab("download");
              setMobileNav(false);
            }}
          >
            <ArrowDownToLine size={19} /> Downloader{" "}
            <span className="nav-active-dot" />
          </button>
          <button
            className={`nav-item ${tab === "library" ? "active" : ""}`}
            onClick={() => {
              setTab("library");
              setMobileNav(false);
            }}
          >
            <Layers size={19} /> My downloads{" "}
            {jobs.length > 0 && <span className="count">{jobs.length}</span>}
          </button>
        </nav>
        <div className="sidebar-divider" />
        <div className="workspace-label">DISCOVER</div>
        <button
          className="nav-item"
          onClick={() => {
            setTab("download");
            setMobileNav(false);
            setTimeout(
              () =>
                document
                  .getElementById("platforms")
                  ?.scrollIntoView({ behavior: "smooth" }),
              50,
            );
          }}
        >
          <MonitorSmartphone size={19} /> Supported platforms
        </button>
        <button className="nav-item" onClick={() => setModal("help")}>
          <CircleHelp size={19} /> How it works{" "}
          <ArrowUpRight className="nav-end" size={15} />
        </button>
        <div className="sidebar-bottom">
          {!installed && (
            <div className="install-card">
              <div className="install-card-icon">
                <MonitorSmartphone size={21} />
                <span>✦</span>
              </div>
              <h3>
                A little closer. <br />A lot more convenient.
              </h3>
              <p>
                Your favorite downloader,
                <br />
                right on your home screen.
              </p>
              <button onClick={install}>
                Install Velora <Plus size={16} />
              </button>
            </div>
          )}
          <div className="sidebar-foot">
            <span>
              <span className="tiny-spark">✦</span> Made for your moments
            </span>
            <span title={`Build ${appBuild}`}>v1.2</span>
          </div>
        </div>
      </aside>
      {mobileNav && (
        <button
          className="nav-backdrop"
          aria-label="Close navigation"
          onClick={() => setMobileNav(false)}
        />
      )}
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumb">
            <button
              className="icon-button mobile-menu"
              aria-label="Open navigation"
              onClick={() => setMobileNav(true)}
            >
              <Menu size={21} />
            </button>
            <span>Workspace</span>
            <span className="slash">/</span>
            <strong>
              {tab === "download" ? "Downloader" : "My downloads"}
            </strong>
          </div>
          <div className="topbar-right">
            <span className="beta-label">
              <span /> FREE BETA
            </span>
            <button
              className="icon-button theme-button"
              aria-label={`Use ${theme === "light" ? "dark" : "light"} theme`}
              onClick={() => setTheme(theme === "light" ? "dark" : "light")}
            >
              {theme === "light" ? <Moon size={18} /> : <Sun size={18} />}
            </button>
            <button
              className="avatar"
              aria-label="About your guest session"
              onClick={() => setModal("privacy")}
            >
              G
            </button>
          </div>
        </header>
        <main>
          {release !== "current" && (
            <aside className="update-banner" role="status">
              <RefreshCw
                size={20}
                className={release === "applying" ? "spin" : ""}
              />
              <div>
                <strong>
                  {release === "applying"
                    ? "Refreshing your Velora…"
                    : "A fresh version is ready."}
                </strong>
                <p>
                  {busy || activeCount || queuing
                    ? "Your current task can finish first. The update will follow."
                    : "Your link and preferences stay with you."}
                </p>
              </div>
              <button
                disabled={
                  !historyChecked ||
                  release === "applying" ||
                  busy ||
                  activeCount > 0 ||
                  queuing ||
                  Boolean(retrying)
                }
                onClick={() => applyUpdate(true)}
              >
                Update now
              </button>
            </aside>
          )}
          {!installed && (
            <aside className="install-banner" aria-label="Install Velora app">
              <Logo />
              <div>
                <strong>A little closer to your next download.</strong>
                <p>
                  Keep Velora on your home screen. Free, with no app store
                  needed.
                </p>
              </div>
              <button className="install-banner-button" onClick={install}>
                Install app <ArrowUpRight size={16} />
              </button>
            </aside>
          )}
          {tab === "download" ? (
            <>
              <section className="hero">
                <div className="eyebrow">
                  <span className="eyebrow-spark">
                    <Sparkles size={13} />
                  </span>{" "}
                  YOUR LINKS. YOUR LIBRARY.
                </div>
                <h1>
                  Keep what
                  <br />
                  <span>moves you.</span>
                </h1>
                <p>
                  Beautiful videos deserve a place beyond your feed.
                  <br className="desktop-break" /> Paste a link. Tap a quality.
                  We’ll handle the rest.
                </p>
              </section>
              <section className="download-card" aria-label="Video downloader">
                <div className="card-tabs">
                  <div role="tablist" aria-label="Download type">
                    <button
                      role="tab"
                      aria-selected={mode === "video"}
                      className={mode === "video" ? "selected" : ""}
                      disabled={busy}
                      onClick={() => {
                        setMode("video");
                        setAnalysis(null);
                        setError("");
                      }}
                    >
                      <Film size={17} /> Single video
                    </button>
                    <button
                      role="tab"
                      aria-selected={mode === "playlist"}
                      className={mode === "playlist" ? "selected" : ""}
                      disabled={busy}
                      onClick={() => {
                        setMode("playlist");
                        setAnalysis(null);
                        setError("");
                      }}
                    >
                      <ListVideo size={18} /> Playlist{" "}
                      <span className="small-badge">BATCH</span>
                    </button>
                  </div>
                  <span className="card-private">
                    <ShieldCheck size={14} /> No sign-up needed
                  </span>
                </div>
                <form onSubmit={analyze} className="link-form">
                  <label htmlFor="video-url">
                    {mode === "video"
                      ? "Drop a link. We’ll take it from here."
                      : "Your whole playlist, one link away."}
                  </label>
                  <div className={`input-wrap ${error ? "has-error" : ""}`}>
                    <Link2 size={20} />
                    <input
                      id="video-url"
                      type="url"
                      required
                      autoComplete="off"
                      placeholder={
                        mode === "video"
                          ? "Paste your video link here…"
                          : "Paste a public playlist link…"
                      }
                      value={url}
                      disabled={busy}
                      onPaste={(e) => {
                        const text = e.clipboardData.getData("text");
                        const link = normalizeLink(text);
                        if (link !== text.trim()) {
                          e.preventDefault();
                          setUrl(link);
                          setAnalysis(null);
                          setError("");
                        }
                      }}
                      onChange={(e) => {
                        setUrl(e.target.value);
                        setError("");
                        setAnalysis(null);
                      }}
                    />
                    {url && !busy ? (
                      <button
                        className="icon-button clear-link"
                        type="button"
                        aria-label="Clear link"
                        onClick={() => {
                          setUrl("");
                          setAnalysis(null);
                          setError("");
                        }}
                      >
                        <X size={17} />
                      </button>
                    ) : (
                      <button
                        className="paste-button"
                        type="button"
                        onClick={paste}
                      >
                        <Clipboard size={14} /> Paste
                      </button>
                    )}
                  </div>
                  <button
                    className="primary-button analyze-button"
                    disabled={busy || !url.trim()}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle className="spin" size={18} /> Finding
                        available formats…
                      </>
                    ) : (
                      <>
                        <span>
                          Find my {mode === "video" ? "video" : "playlist"}
                        </span>
                        <ArrowRight size={19} />
                      </>
                    )}
                  </button>
                  <div className="form-note">
                    <span>
                      <span className="status-dot" /> Original quality, whenever
                      available
                    </span>
                    <span>
                      Video + audio <span className="note-dot">·</span> Audio
                      only
                    </span>
                  </div>
                </form>
                {error && (
                  <div className="error-message" role="alert">
                    <CircleHelp size={17} />
                    <span>{error}</span>
                  </div>
                )}
                {busy && (
                  <div className="analysis-loading" aria-live="polite">
                    <span className="loading-line" />
                    <p>
                      {analysisSeconds < 5
                        ? "Finding your video and its available qualities…"
                        : analysisSeconds < 15
                          ? "Reading formats from the source. Some platforms take a little longer…"
                          : "The source is taking longer to respond. You can cancel and try another link."}
                    </p>
                    <button
                      className="text-button"
                      onClick={() => {
                        requestRef.current?.abort();
                        setBusy(false);
                      }}
                    >
                      Cancel lookup
                    </button>
                  </div>
                )}
              </section>
              {analysis && (
                <section
                  className="results-card"
                  ref={resultRef}
                  aria-label="Available downloads"
                >
                  <div className="result-heading">
                    <span className="success-pill">
                      <CheckCheck size={14} />{" "}
                      {analysis.kind === "playlist"
                        ? "Playlist found"
                        : "Ready to make it yours"}
                    </span>
                    <span className="platform-tag">{analysis.platform}</span>
                  </div>
                  <div className="video-summary">
                    {analysis.thumbnail ? (
                      <img
                        src={analysis.thumbnail}
                        alt="Video thumbnail"
                        referrerPolicy="no-referrer"
                        onError={(e) => {
                          e.currentTarget.style.display = "none";
                        }}
                      />
                    ) : (
                      <div className="thumbnail-placeholder">
                        {analysis.kind === "playlist" ? (
                          <ListVideo size={26} />
                        ) : (
                          <Film size={26} />
                        )}
                      </div>
                    )}
                    <div>
                      <h2>{analysis.title}</h2>
                      <p>
                        {analysis.creator}
                        {analysis.creator && analysis.duration ? " · " : ""}
                        {durationLabel(analysis.duration)}
                        {analysis.kind === "playlist" &&
                          `${analysis.entries?.length} videos · Up to ${analysis.limit} per playlist`}
                      </p>
                    </div>
                  </div>
                  {analysis.kind === "video" ? (
                    <>
                      <div className="format-tabs">
                        <button
                          className={mediaType === "video" ? "active" : ""}
                          onClick={() => changeType("video")}
                        >
                          <Film size={15} />{" "}
                          {analysis.options?.some(
                            (f) => f.kind === "video" && f.hasAudio === true,
                          )
                            ? "Video + audio"
                            : "Video"}
                        </button>
                        <button
                          className={mediaType === "audio" ? "active" : ""}
                          onClick={() => changeType("audio")}
                        >
                          <Headphones size={15} /> Audio only
                        </button>
                      </div>
                      {mediaType === "video" && (
                        <div className="playback-preference">
                          <span>Playback</span>
                          <div role="group" aria-label="Playback format">
                            <button
                              aria-pressed={profile === "compatible"}
                              onClick={() => setProfile("compatible")}
                            >
                              Compatible MP4
                            </button>
                            <button
                              aria-pressed={profile === "original"}
                              onClick={() => setProfile("original")}
                            >
                              Original · faster
                            </button>
                          </div>
                        </div>
                      )}
                      <div className="quality-heading">
                        <span>CHOOSE QUALITY</span>
                        <span>ONE TAP TO DOWNLOAD</span>
                      </div>
                      <div
                        className="format-list"
                        aria-label="Download quality"
                      >
                        {displayedFormats.map((format, i) => {
                          const converting =
                            mediaType === "video" &&
                            profile === "compatible" &&
                            format.requiresConversion;
                          const ext =
                            profile === "original"
                              ? format.sourceExt || format.ext
                              : format.ext;
                          return (
                            <button
                              key={format.id}
                              className="format-option download-quality"
                              disabled={queuing}
                              aria-label={`Download ${format.label} ${ext.toUpperCase()}`}
                              onClick={() => void queueDownload(format.id)}
                            >
                              <span className="quality-symbol">
                                {mediaType === "audio" ? (
                                  <Headphones size={20} />
                                ) : (
                                  <Film size={20} />
                                )}
                              </span>
                              <span className="format-quality">
                                {format.label}
                                {i === 0 && mediaType === "video" && (
                                  <span className="recommended">BEST</span>
                                )}
                                <small>
                                  {ext.toUpperCase()}
                                  {format.fps
                                    ? ` · ${Math.round(format.fps)} fps`
                                    : ""}
                                  {format.hasAudio === false
                                    ? " · Silent source"
                                    : ""}
                                  {format.hasAudio === null ||
                                  format.audioUnconfirmed
                                    ? " · Audio checked during download"
                                    : ""}
                                  {converting
                                    ? " · Optimized for playback"
                                    : profile === "original" && format.codec
                                      ? ` · ${format.codec.split(".")[0].toUpperCase()}`
                                      : ""}
                                </small>
                              </span>
                              <span className="format-size">
                                {converting
                                  ? "Output size varies"
                                  : `${format.estimated && format.size ? "≈ " : ""}${sizeLabel(format.size)}`}
                                {converting && format.size ? (
                                  <small>{sizeLabel(format.size)} source</small>
                                ) : null}
                              </span>
                              <span className="quality-download">
                                {queuing ? (
                                  <LoaderCircle className="spin" size={18} />
                                ) : (
                                  <ArrowDownToLine size={18} />
                                )}
                              </span>
                            </button>
                          );
                        })}
                      </div>
                      {displayedFormats.length === 0 && (
                        <p className="muted">
                          No {mediaType} formats are available for this link.
                        </p>
                      )}
                      <p className="size-note">
                        Tap a quality to start. Your file saves automatically
                        when ready. Compatible MP4 may take longer for 4K;
                        Original keeps the source codec and may need a
                        compatible player.
                      </p>
                    </>
                  ) : (
                    <>
                      <div className="playlist-toolbar">
                        <label>
                          <input
                            type="checkbox"
                            checked={
                              entries.length === analysis.entries?.length
                            }
                            onChange={(e) =>
                              setEntries(
                                e.target.checked
                                  ? analysis.entries!.map((x) => x.id)
                                  : [],
                              )
                            }
                          />{" "}
                          Select all
                        </label>
                        <div className="select-wrap">
                          <select
                            aria-label="Playlist format"
                            value={preset}
                            onChange={(e) => setPreset(e.target.value)}
                          >
                            <option value="best">Best available video</option>
                            <option value="1080">Up to 1080p</option>
                            <option value="720">Up to 720p</option>
                            <option value="480">Up to 480p</option>
                            <option value="mp3">Audio · MP3</option>
                            <option value="m4a">Audio · M4A</option>
                          </select>
                          <ChevronDown size={14} />
                        </div>
                      </div>
                      <div className="playlist-list">
                        {analysis.entries?.map((entry, index) => (
                          <label key={entry.id} className="playlist-entry">
                            <input
                              type="checkbox"
                              checked={entries.includes(entry.id)}
                              onChange={(e) =>
                                setEntries((previous) =>
                                  e.target.checked
                                    ? [...previous, entry.id]
                                    : previous.filter((x) => x !== entry.id),
                                )
                              }
                            />
                            <span className="entry-number">
                              {String(index + 1).padStart(2, "0")}
                            </span>
                            <span>{entry.title}</span>
                            <small>{durationLabel(entry.duration)}</small>
                          </label>
                        ))}
                      </div>
                      <p className="size-note">
                        Each video is checked and prepared separately.
                        Individual file sizes appear when ready.
                      </p>
                    </>
                  )}
                  {analysis.kind === "playlist" && (
                    <button
                      className="primary-button result-download"
                      disabled={queuing || !entries.length}
                      onClick={() => void queueDownload()}
                    >
                      {queuing ? (
                        <LoaderCircle size={17} className="spin" />
                      ) : (
                        <ArrowDownToLine size={17} />
                      )}{" "}
                      Download {entries.length} videos
                    </button>
                  )}
                </section>
              )}
              <section className="platforms-section" id="platforms">
                <div className="section-heading">
                  <h2>All your favorites. One place.</h2>
                  <button
                    onClick={() => {
                      setPlatformQuery("");
                      setModal("platforms");
                    }}
                  >
                    {platforms.length} platforms <ArrowUpRight size={13} />
                  </button>
                </div>
                <div className="platform-grid">
                  {platformNames.map((name, i) => (
                    <button
                      className={`platform platform-${i}`}
                      key={name}
                      onClick={() => {
                        setPlatformQuery(name);
                        setModal("platforms");
                      }}
                    >
                      <span className="platform-logo">{icons[i]}</span>
                      <span>{name}</span>
                      {i > 3 && <small>EXTENDED</small>}
                    </button>
                  ))}
                </div>
                <p className="platform-note">
                  Public links only. Availability varies by platform and video.
                </p>
              </section>
              <section className="benefits">
                <div>
                  <span className="benefit-icon">
                    <Sparkles size={21} />
                  </span>
                  <h3>Every detail, preserved.</h3>
                  <p>
                    Choose the best available quality. <br />
                    Keep the moment as it was.
                  </p>
                </div>
                <div>
                  <span className="benefit-icon">
                    <Music2 size={21} />
                  </span>
                  <h3>Your format. Your call.</h3>
                  <p>
                    Video with sound or just the audio. <br />
                    Make it work for you.
                  </p>
                </div>
                <div>
                  <span className="benefit-icon">
                    <ShieldCheck size={21} />
                  </span>
                  <h3>Less friction. More freedom.</h3>
                  <p>
                    No account. No subscription. <br />
                    All features free during beta.
                  </p>
                </div>
              </section>
              <section className="how-strip">
                <div className="how-intro">
                  <span className="tiny-spark">✦</span>
                  <strong>Three steps. That’s it.</strong>
                </div>
                <div>
                  <span className="step-number">01</span> Copy a link
                </div>
                <ArrowRight size={14} />
                <div>
                  <span className="step-number">02</span> Pick your quality
                </div>
                <ArrowRight size={14} />
                <div>
                  <span className="step-number">03</span> Keep the moment
                </div>
              </section>
            </>
          ) : (
            <section className="library">
              <div className="library-header">
                <div className="eyebrow">YOUR PERSONAL QUEUE</div>
                <h1>
                  Your moments,
                  <br />
                  <span>almost home.</span>
                </h1>
                <p>Your downloads start saving automatically when ready.</p>
                <button
                  className="secondary-button"
                  onClick={() => setTab("download")}
                >
                  <Plus size={16} /> New download
                </button>
              </div>
              {activeCount > 0 && (
                <div className="queue-notice">
                  <LoaderCircle size={16} className="spin" /> {activeCount}{" "}
                  {activeCount === 1 ? "download" : "downloads"} in progress.
                  Keep this page handy to save your files.
                </div>
              )}
              {jobs.some((job) => job.status !== "cancelled") && (
                <div className="library-controls">
                  <label className="library-search">
                    <Search size={17} />
                    <input
                      aria-label="Search your downloads"
                      type="search"
                      placeholder="Find a download…"
                      value={libraryQuery}
                      onChange={(e) => setLibraryQuery(e.target.value)}
                    />
                  </label>
                  <div
                    className="library-filters"
                    role="group"
                    aria-label="Filter downloads"
                  >
                    {[
                      ["all", "All"],
                      ["active", "In progress"],
                      ["ready", "Ready"],
                      ["attention", "Needs attention"],
                    ].map(([value, label]) => (
                      <button
                        key={value}
                        aria-pressed={libraryFilter === value}
                        onClick={() => setLibraryFilter(value)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {jobs.filter((j) => j.status !== "cancelled").length === 0 ? (
                <div className="empty-library">
                  <div className="empty-icon">
                    <Download size={32} />
                  </div>
                  <h2>A little space for your favorites.</h2>
                  <p>
                    Your downloads will appear here. <br />
                    Start with a link to a moment worth keeping.
                  </p>
                  <button
                    className="primary-button"
                    onClick={() => setTab("download")}
                  >
                    Find your first video <ArrowRight size={17} />
                  </button>
                </div>
              ) : (
                <div className="job-list">
                  {visibleJobs.map((job) => (
                    <article className="job-card" key={job.id}>
                      <div className="job-icon">
                        {job.label.includes("MP3") ||
                        job.label.includes("M4A") ? (
                          <Headphones size={23} />
                        ) : (
                          <Film size={23} />
                        )}
                      </div>
                      <div className="job-info">
                        <h2>{job.title}</h2>
                        <p>
                          {job.label} <span>·</span>{" "}
                          {job.size
                            ? sizeLabel(job.size)
                            : new Date(job.created * 1000).toLocaleTimeString(
                                [],
                                { hour: "2-digit", minute: "2-digit" },
                              )}
                        </p>
                        <div className={`job-status status-${job.status}`}>
                          {job.status === "processing" ? (
                            <>
                              <LoaderCircle className="spin" size={12} />
                              {job.progress >= 98
                                ? "Checking video and audio…"
                                : job.progress >= 96
                                  ? "Optimizing playback…"
                                  : job.progress >= 95
                                    ? "Finishing your file…"
                                    : `Preparing · ${Math.round(job.progress)}%`}
                            </>
                          ) : job.status === "ready" ? (
                            <>
                              <Check size={13} />{" "}
                              {sentDownloads.has(job.id)
                                ? "Sent to browser"
                                : "Ready to save"}
                            </>
                          ) : job.status === "queued" ? (
                            <>
                              <Clock3 size={12} /> Waiting in queue
                            </>
                          ) : job.status === "expired" ? (
                            "File expired · Download it again"
                          ) : (
                            job.error || "Download failed"
                          )}
                        </div>
                        {job.status === "processing" && (
                          <div
                            className="progress-track"
                            role="progressbar"
                            aria-label="Download progress"
                            aria-valuenow={job.progress}
                            aria-valuemin={0}
                            aria-valuemax={100}
                          >
                            <span
                              style={{
                                width: `${Math.max(3, job.progress)}%`,
                              }}
                            />
                          </div>
                        )}
                      </div>
                      <div className="job-actions">
                        {job.status === "ready" && (
                          <button
                            className="primary-button compact"
                            onClick={() => saveFile(job)}
                          >
                            <ArrowDownToLine size={16} />
                            <span>
                              {sentDownloads.has(job.id)
                                ? "Save again"
                                : "Save file"}
                            </span>
                          </button>
                        )}
                        {(job.status === "failed" ||
                          job.status === "expired") && (
                          <button
                            className="secondary-button compact"
                            disabled={Boolean(retrying)}
                            onClick={() => void retryJob(job)}
                          >
                            {retrying === job.id
                              ? "Retrying…"
                              : "Retry download"}
                          </button>
                        )}
                        <button
                          className="icon-button"
                          aria-label={
                            job.status === "processing" ||
                            job.status === "queued"
                              ? `Cancel ${job.title}`
                              : `Remove ${job.title}`
                          }
                          onClick={() => removeJob(job)}
                        >
                          {job.status === "processing" ||
                          job.status === "queued" ? (
                            <X size={17} />
                          ) : (
                            <Trash2 size={16} />
                          )}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              )}
              {jobs.some((job) => job.status !== "cancelled") &&
                visibleJobs.length === 0 && (
                  <div className="no-matches">
                    <Search size={24} />
                    <h2>No matching downloads.</h2>
                    <p>Try another search or filter.</p>
                    <button
                      onClick={() => {
                        setLibraryQuery("");
                        setLibraryFilter("all");
                      }}
                    >
                      Clear filters
                    </button>
                  </div>
                )}
              <p className="library-note">
                <ShieldCheck size={15} /> Files are removed from the worker
                after {health?.limits.retentionHours || 2} hours. Saved files
                stay on your device.
              </p>
            </section>
          )}
          <footer>
            <span>
              © {new Date().getFullYear()} Velora{" "}
              <span className="footer-dot">·</span> Keep the moment.
            </span>
            <div>
              <button onClick={() => setModal("privacy")}>Privacy</button>
              <button onClick={() => setModal("terms")}>Terms</button>
              <button
                title={`Build ${appBuild}`}
                onClick={() => {
                  void checkForUpdate();
                  setToast(
                    navigator.onLine
                      ? "Checking for app updates…"
                      : "Reconnect to check for updates.",
                  );
                }}
              >
                Check updates
              </button>
              <span
                className={`connection ${connection}`}
                title={
                  connection === "online"
                    ? "The download worker is reachable"
                    : "Your Ubuntu download worker must be running"
                }
              >
                {connection === "offline" ? (
                  <WifiOff size={12} />
                ) : (
                  <span className="status-dot" />
                )}
                {connection === "online"
                  ? "Worker online"
                  : connection === "checking"
                    ? "Connecting…"
                    : "Worker offline"}
              </span>
            </div>
          </footer>
          {connection === "offline" && (
            <div className="offline-note">
              <WifiOff size={14} /> The interface is available, but downloads
              need the Ubuntu worker online.
            </div>
          )}
        </main>
      </div>
      {toast && (
        <div className="toast" role="status">
          <Check size={17} />
          <span>{toast}</span>
          <button
            className="icon-button"
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {modal && (
        <Modal
          variant={modal}
          title={
            modal === "install"
              ? "Make yourself at home."
              : modal === "privacy"
                ? "Your privacy, in plain English."
                : modal === "terms"
                  ? "A few things to know."
                  : modal === "platforms"
                    ? "Your favorite platforms, together."
                    : "From a link to your library."
          }
          onClose={closeModal}
        >
          {modal === "install" ? (
            <>
              <div className="modal-illustration">
                <Logo />
                <MonitorSmartphone size={46} />
              </div>
              <p>
                Add Velora to your home screen. Next time, tap the Velora icon
                to come straight back to your downloads. No app store, no
                account, no subscription.
              </p>
              <div className="install-benefits">
                <span>
                  <Zap size={16} /> Quick access
                </span>
                <span>
                  <RefreshCw size={16} /> Fresh updates
                </span>
                <span>
                  <ShieldCheck size={16} /> No sign-up
                </span>
              </div>
              {installPrompt ? (
                <button className="primary-button" onClick={install}>
                  Install Velora <Plus size={17} />
                </button>
              ) : (
                <>
                  <div className="instruction-block">
                    <strong>iPhone or iPad</strong>
                    <p>
                      Open Velora in Safari. Tap Share, then “Add to Home
                      Screen.”
                    </p>
                  </div>
                  <div className="instruction-block">
                    <strong>Android or desktop</strong>
                    <p>
                      Open your browser menu and look for “Install app” or “Add
                      to Home screen.” Installation availability depends on your
                      browser.
                    </p>
                  </div>
                </>
              )}
              <p className="muted">
                On compatible devices, you can also share a video link directly
                to Velora from another app.
              </p>
              <button className="install-later" onClick={closeModal}>
                Not now, continue browsing
              </button>
            </>
          ) : modal === "platforms" ? (
            <>
              <p>
                Paste a public link from any platform below. Available formats
                depend on the source; private, protected and live content is not
                supported.
              </p>
              <label className="library-search">
                <Search size={17} />
                <input
                  aria-label="Search platforms"
                  placeholder="Find your platform…"
                  value={platformQuery}
                  onChange={(e) => setPlatformQuery(e.target.value)}
                />
              </label>
              <div className="platform-directory">
                {directory.map((item) => (
                  <article key={item.name}>
                    <span>{item.mark}</span>
                    <div>
                      <h3>{item.name}</h3>
                      <p>{item.hint}</p>
                    </div>
                  </article>
                ))}
              </div>
              {directory.length === 0 && (
                <p>No match yet. Try one of the listed platforms.</p>
              )}
            </>
          ) : modal === "privacy" ? (
            <>
              <p>
                No account is required. A random session token stored in your
                browser keeps your download queue separate from other visitors.
              </p>
              <p>
                The worker processes the links you submit, video titles, format
                choices, and job status. Temporary media files expire after{" "}
                {health?.limits.retentionHours || 2} hours; job records expire
                after 24 hours and analyses after 30 minutes.
              </p>
              <p>
                Expired metadata is removed during an hourly cleanup. Your IP
                address is used temporarily for rate limiting. The hosting and
                tunnel providers may also process connection information. Video
                thumbnails load from the source platform.
              </p>
              <p>
                Your session, theme, format and installation preferences are
                stored on this device. Your current link is kept in this tab so
                it survives app updates. There is no advertising or tracking
                analytics in this version. Clearing browser data removes access
                to your queue; it does not immediately delete worker files.
              </p>
              <p>
                Use the remove button in My downloads to delete a prepared file
                early. Anyone with a temporary file link can access it until it
                expires.
              </p>
            </>
          ) : modal === "terms" ? (
            <>
              <p>
                Use Velora only for content you own or have permission to
                download, and follow the source platform’s terms. You are
                responsible for how you use downloaded content.
              </p>
              <p>
                Velora supports available public videos. It does not provide
                access to private accounts, paid content, or DRM-protected
                media. Platform changes and restrictions can prevent downloads.
              </p>
              <p>
                This free beta runs on limited infrastructure. Downloads may be
                queued, rate limited, interrupted, or unavailable when the
                worker is offline. The original upload determines the maximum
                quality.
              </p>
              <p>
                Default limits:{" "}
                {health?.limits.duration ? health.limits.duration / 60 : 30}{" "}
                minutes per video, {health?.limits.fileMb || 500} MB per file,
                and {health?.limits.playlist || 10} items per playlist. Limits
                may change as the beta evolves.
              </p>
              <p>
                Velora is independent and is not affiliated with the platforms
                shown.
              </p>
            </>
          ) : (
            <>
              <div className="help-step">
                <span>01</span>
                <div>
                  <h3>Find a moment worth keeping.</h3>
                  <p>
                    Copy the public video’s link from a supported social
                    platform. For multiple videos, choose Playlist.
                  </p>
                </div>
              </div>
              <div className="help-step">
                <span>02</span>
                <div>
                  <h3>Make it yours.</h3>
                  <p>
                    Paste the link and select Find my video. Choose a resolution
                    or audio-only format. “≈” means the file size is estimated.
                  </p>
                </div>
              </div>
              <div className="help-step">
                <span>03</span>
                <div>
                  <h3>Save it for later.</h3>
                  <p>
                    Tap your preferred quality. Saving starts automatically when
                    ready. If your browser blocks it, use Save file in My
                    downloads. Your browser handles saving to the device. On
                    iPhone, look in the Files app.
                  </p>
                </div>
              </div>
              <div className="instruction-block">
                <Zap size={18} />
                <p>
                  No upscaling, no account, and no subscription during beta. If
                  a platform refuses a link, try another public video.
                </p>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}

function Modal({
  variant,
  title,
  onClose,
  children,
}: {
  variant: string;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const node = ref.current;
    node?.showModal();
    return () => node?.close();
  }, []);
  return (
    <dialog
      ref={ref}
      className={`modal modal-${variant}`}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      aria-labelledby="modal-title"
    >
      <div className="modal-body">
        <button
          className="icon-button modal-close"
          aria-label="Close dialog"
          onClick={onClose}
        >
          <X size={20} />
        </button>
        <div className="eyebrow">THE VELORA WAY</div>
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
