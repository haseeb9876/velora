export type UpdateState = "current" | "ready" | "applying";
declare const __APP_BUILD__: string;
export const appBuild = __APP_BUILD__;
let state: UpdateState = "current";
let registration: ServiceWorkerRegistration | undefined;
let blocked = true;
let held = false;
let controllerChanged = false;
let lastInteraction = Date.now();
let checking = false;
let started = false;
let reloading = false;

export function updateState() {
  return state;
}
function isEditing() {
  return Boolean(
    document.activeElement?.matches(
      "input,textarea,select,[contenteditable=true]",
    ),
  );
}
function announce(next: UpdateState) {
  state = next;
  window.dispatchEvent(new CustomEvent("velora-update", { detail: state }));
}
export function blockUpdates(value: boolean, hold = false) {
  blocked = value;
  held = hold;
}
export function noteInteraction() {
  lastInteraction = Date.now();
}
export function applyUpdate(manual = false) {
  if (blocked || (!manual && held) || !navigator.onLine) return;
  if (manual) {
    held = false;
    lastInteraction = 0;
  }
  if (registration?.waiting) {
    announce("applying");
    registration.waiting.postMessage({ type: "SKIP_WAITING" });
  } else if (controllerChanged && !reloading) {
    reloading = true;
    window.location.reload();
  }
}
export async function checkForUpdate() {
  if (!registration || checking || document.hidden || !navigator.onLine) return;
  checking = true;
  try {
    await registration.update();
    if (registration.waiting) announce("ready");
  } catch {
    /* Keep the current offline-capable app available. */
  } finally {
    checking = false;
  }
}

export async function startUpdates() {
  if (started || !import.meta.env.PROD || !("serviceWorker" in navigator))
    return;
  started = true;
  let hadController = Boolean(navigator.serviceWorker.controller);
  navigator.serviceWorker.addEventListener("controllerchange", () => {
    if (!hadController) {
      hadController = true;
      return;
    }
    if (reloading) return;
    // Another tab may activate a release; let this tab finish its work too.
    controllerChanged = true;
    const requested = state === "applying";
    if (!requested) announce("ready");
    const reloadWhenIdle = () => {
      if (
        blocked ||
        held ||
        (!requested && isEditing()) ||
        document.hidden ||
        !navigator.onLine ||
        Date.now() - lastInteraction < 10000
      ) {
        window.setTimeout(reloadWhenIdle, 1000);
        return;
      }
      if (!reloading) {
        reloading = true;
        window.location.reload();
      }
    };
    if (requested) lastInteraction = 0;
    reloadWhenIdle();
  });
  try {
    registration = await navigator.serviceWorker.register("/sw.js", {
      updateViaCache: "none",
    });
    const waiting = () => {
      if (registration?.waiting) announce("ready");
    };
    registration.addEventListener("updatefound", () => {
      const worker = registration?.installing;
      worker?.addEventListener("statechange", () => {
        if (worker.state === "installed" && navigator.serviceWorker.controller)
          waiting();
      });
    });
    waiting();
    window.addEventListener("online", () => void checkForUpdate());
    window.addEventListener("focus", () => void checkForUpdate());
    document.addEventListener("visibilitychange", () => {
      if (!document.hidden) void checkForUpdate();
    });
    window.addEventListener("pointerdown", noteInteraction, { passive: true });
    window.addEventListener("keydown", noteInteraction);
    window.setInterval(() => void checkForUpdate(), 60000);
    window.setInterval(() => {
      const editing = isEditing();
      if (
        state === "ready" &&
        !blocked &&
        !held &&
        !document.hidden &&
        !editing &&
        Date.now() - lastInteraction >= 10000
      )
        applyUpdate();
    }, 1000);
    void checkForUpdate();
  } catch {
    /* Installation may be disabled by the browser; the website still works. */
  }
}
