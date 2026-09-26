import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import {
  ArrowDown,
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
} from "lucide-react";
import { api, durationLabel, sizeLabel } from "./api";
import type { Analysis, Health, Job } from "./api";

type InstallEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: string }>;
};
const platformNames = [
  "YouTube",
  "Instagram",
  "TikTok",
  "Facebook",
  "X / Twitter",
  "Vimeo",
  "Reddit",
  "Pinterest",
];
const icons = ["▶", "◎", "♪", "f", "𝕏", "v", "●", "p"];
function Logo() {
  return (
    <span className="brand-mark">
      <ArrowDown strokeWidth={3} size={23} />
    </span>
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
  const [tab, setTab] = useState<"download" | "library">("download");
  const [url, setUrl] = useState(getSharedUrl);
  const [mode, setMode] = useState<"video" | "playlist">("video");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [mediaType, setMediaType] = useState<"video" | "audio">("video");
  const [choice, setChoice] = useState("");
  const [entries, setEntries] = useState<string[]>([]);
  const [preset, setPreset] = useState("best");
  const [busy, setBusy] = useState(false);
  const [queuing, setQueuing] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");
  const [jobs, setJobs] = useState<Job[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [connection, setConnection] = useState<
    "checking" | "online" | "offline"
  >("checking");
  const [installPrompt, setInstallPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(
    () => matchMedia("(display-mode: standalone)").matches,
  );
  const [modal, setModal] = useState<
    "install" | "privacy" | "terms" | "help" | null
  >(null);
  const [mobileNav, setMobileNav] = useState(false);
  const [theme, setTheme] = useState(
    () => localStorage.getItem("velora-theme") || "light",
  );
  const resultRef = useRef<HTMLDivElement>(null);
  const requestRef = useRef<AbortController | null>(null);
  const activeCount = jobs.filter(
    (j) => j.status === "queued" || j.status === "processing",
  ).length;

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
    };
    const complete = () => {
      setInstalled(true);
      setInstallPrompt(null);
      setModal(null);
    };
    window.addEventListener("beforeinstallprompt", capture);
    window.addEventListener("appinstalled", complete);
    return () => {
      window.removeEventListener("beforeinstallprompt", capture);
      window.removeEventListener("appinstalled", complete);
      requestRef.current?.abort();
    };
  }, []);
  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      try {
        const info = await api<Health>("/api/health");
        if (!alive) return;
        setHealth(info);
        setConnection("online");
        const data = await api<{ jobs: Job[] }>("/api/jobs");
        if (alive) setJobs(data.jobs);
      } catch {
        if (alive) setConnection("offline");
      }
      if (alive) timer = setTimeout(poll, document.hidden ? 30000 : 5000);
    }
    void poll();
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 4500);
    return () => clearTimeout(t);
  }, [toast]);

  async function analyze(event: FormEvent) {
    event.preventDefault();
    setError("");
    try {
      const parsed = new URL(url.trim());
      if (parsed.protocol !== "https:") throw new Error();
    } catch {
      setError("Paste a complete HTTPS video link to get started.");
      return;
    }
    requestRef.current?.abort();
    const controller = new AbortController();
    requestRef.current = controller;
    setBusy(true);
    setAnalysis(null);
    try {
      const data = await api<Analysis>("/api/inspect", {
        method: "POST",
        body: JSON.stringify({ url: url.trim(), mode }),
        signal: AbortSignal.any([
          controller.signal,
          AbortSignal.timeout(95000),
        ]),
      });
      setAnalysis(data);
      setMediaType("video");
      setChoice(
        data.options?.find((f) => f.kind === "video")?.id ||
          data.options?.[0]?.id ||
          "",
      );
      if (!data.options?.some((f) => f.kind === "video")) setMediaType("audio");
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
      setBusy(false);
    }
  }
  async function queueDownload() {
    if (!analysis) return;
    setQueuing(true);
    setError("");
    try {
      const data = await api<{ jobs: Job[] }>("/api/jobs", {
        method: "POST",
        body: JSON.stringify({
          analysis_id: analysis.id,
          option_id: choice || null,
          entry_ids: entries,
          preset,
        }),
      });
      setJobs((previous) => [...data.jobs, ...previous]);
      setToast(
        `${data.jobs.length === 1 ? "Your download is" : `${data.jobs.length} downloads are`} in the queue.`,
      );
      setTab("library");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setQueuing(false);
    }
  }
  async function saveFile(job: Job) {
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
      setToast(
        "Your browser will save the file. On iPhone, check Files → Downloads.",
      );
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function removeJob(job: Job) {
    try {
      await api(`/api/jobs/${job.id}`, { method: "DELETE" });
      setJobs((previous) =>
        previous.map((j) =>
          j.id === job.id ? { ...j, status: "cancelled" } : j,
        ),
      );
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function install() {
    if (!installPrompt) {
      setModal("install");
      return;
    }
    await installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  }
  async function paste() {
    try {
      setUrl(await navigator.clipboard.readText());
      setError("");
    } catch {
      setToast(
        "Use Paste in the link field. Your browser did not grant clipboard access.",
      );
    }
  }
  function changeType(type: "video" | "audio") {
    setMediaType(type);
    setChoice(analysis?.options?.find((f) => f.kind === type)?.id || "");
  }
  const displayedFormats =
    analysis?.options?.filter((f) => f.kind === mediaType) || [];

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
            <span>v1.0</span>
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
          {tab === "download" ? (
            <>
              <section className="hero">
                <div className="eyebrow">
                  <span className="eyebrow-spark">
                    <Sparkles size={13} />
                  </span>{" "}
                  LESS SCROLLING. MORE KEEPING.
                </div>
                <h1>
                  Good moments. <br />
                  <span>Yours to keep.</span>
                  <span className="hero-spark">✧</span>
                </h1>
                <p>
                  Save the videos you love, in the quality they deserve.
                  <br className="desktop-break" /> One link. Your format. Right
                  on your device.
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
                      Checking the source and finding available qualities. This
                      can take a moment.
                    </p>
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
                            (f) => f.kind === "video" && f.hasAudio !== false,
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
                      <div
                        className="format-list"
                        role="radiogroup"
                        aria-label="Download quality"
                      >
                        {displayedFormats.map((format, i) => (
                          <label
                            key={format.id}
                            className={`format-option ${choice === format.id ? "chosen" : ""}`}
                          >
                            <input
                              type="radio"
                              name="quality"
                              checked={choice === format.id}
                              onChange={() => setChoice(format.id)}
                            />
                            <span className="custom-radio">
                              {choice === format.id && <span />}
                            </span>
                            <span className="format-quality">
                              {format.label}
                              {i === 0 && mediaType === "video" && (
                                <span className="recommended">
                                  BEST AVAILABLE
                                </span>
                              )}
                              <small>
                                {format.ext.toUpperCase()}
                                {format.hasAudio === false
                                  ? " · Source has no audio"
                                  : ""}
                                {format.fps
                                  ? ` · ${Math.round(format.fps)} fps`
                                  : ""}
                                {format.ext === "mkv"
                                  ? " · May need a compatible player"
                                  : ""}
                              </small>
                            </span>
                            <span className="format-size">
                              {format.estimated && format.size ? "≈ " : ""}
                              {sizeLabel(format.size)}
                            </span>
                          </label>
                        ))}
                      </div>
                      {displayedFormats.length === 0 && (
                        <p className="muted">
                          No {mediaType} formats are available for this link.
                        </p>
                      )}
                      <p className="size-note">
                        Estimated sizes may change after processing. Quality is
                        limited by the original upload.
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
                  <button
                    className="primary-button result-download"
                    disabled={
                      queuing ||
                      (analysis.kind === "video" ? !choice : !entries.length)
                    }
                    onClick={queueDownload}
                  >
                    {queuing ? (
                      <LoaderCircle size={17} className="spin" />
                    ) : (
                      <ArrowDownToLine size={17} />
                    )}{" "}
                    {analysis.kind === "playlist"
                      ? `Prepare ${entries.length} videos`
                      : "Prepare download"}
                  </button>
                </section>
              )}
              <section className="platforms-section" id="platforms">
                <div className="section-heading">
                  <h2>All your favorites. One place.</h2>
                  <span>
                    {platformNames.length} platforms <ArrowUpRight size={13} />
                  </span>
                </div>
                <div className="platform-grid">
                  {platformNames.map((name, i) => (
                    <div className={`platform platform-${i}`} key={name}>
                      <span className="platform-logo">{icons[i]}</span>
                      <span>{name}</span>
                      {i > 3 && <small>EXTENDED</small>}
                    </div>
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
                <p>Prepare your files here, then save them to your device.</p>
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
                  {jobs
                    .filter((j) => j.status !== "cancelled")
                    .map((job) => (
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
                                {job.progress >= 95
                                  ? "Finishing your file…"
                                  : `Preparing · ${Math.round(job.progress)}%`}
                              </>
                            ) : job.status === "ready" ? (
                              <>
                                <Check size={13} /> Ready to save
                              </>
                            ) : job.status === "queued" ? (
                              <>
                                <Clock3 size={12} /> Waiting in queue
                              </>
                            ) : job.status === "expired" ? (
                              "File expired · Prepare it again to download"
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
                              <span>Save file</span>
                            </button>
                          )}
                          {(job.status === "failed" ||
                            job.status === "expired") && (
                            <button
                              className="secondary-button compact"
                              onClick={() => setTab("download")}
                            >
                              Try another link
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
          title={
            modal === "install"
              ? "Your moments, one tap away."
              : modal === "privacy"
                ? "Your privacy, in plain English."
                : modal === "terms"
                  ? "A few things to know."
                  : "From a link to your library."
          }
          onClose={() => setModal(null)}
        >
          {modal === "install" ? (
            <>
              <div className="modal-illustration">
                <Logo />
                <MonitorSmartphone size={46} />
              </div>
              <p>
                Install Velora for a dedicated app window and quick access from
                your home screen. Downloads still need an internet connection
                and an online worker.
              </p>
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
                Your IP address is used temporarily for rate limiting. The
                hosting and tunnel providers may also process connection
                information. Video thumbnails load from the source platform.
              </p>
              <p>
                Your theme preference and session token are stored on this
                device. There is no advertising or tracking analytics in this
                version. Clearing browser data removes access to your queue; it
                does not immediately delete worker files.
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
                    Prepare your download, then select Save file in My
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
  title,
  onClose,
  children,
}: {
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
      className="modal"
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
