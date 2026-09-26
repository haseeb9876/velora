// Opt-in real download check. Uses a public video you have permission to save.
// node scripts/smoke-browser.mjs APP_URL API_URL VIDEO_URL
import { chromium } from "@playwright/test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";

const [appUrl, apiUrl, videoUrl] = process.argv.slice(2);
if (!appUrl || !apiUrl || !videoUrl)
  throw new Error("Provide app, API, and permitted video URLs.");
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true,
  hasTouch: true,
  acceptDownloads: true,
});
const page = await context.newPage();
const folder = await mkdtemp(join(tmpdir(), "velora-browser-"));
const ids = [];
page.on("response", async (response) => {
  if (
    new URL(response.url()).pathname === "/api/jobs" &&
    response.request().method() === "POST" &&
    response.ok()
  ) {
    ids.push(...(await response.json()).jobs.map((job) => job.id));
  }
});
try {
  await page.goto(appUrl);
  await page
    .getByText("Worker online", { exact: true })
    .waitFor({ timeout: 30000 });
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Horizontal overflow");
  await page.getByLabel("Drop a link.").fill(videoUrl);
  const lookup = Date.now();
  await page.getByRole("button", { name: "Find my video" }).click();
  const quality = page
    .getByRole("button", { name: /^Download .* MP4$/ })
    .first();
  await quality.waitFor({ timeout: 100000 });
  console.log("Lookup seconds:", ((Date.now() - lookup) / 1000).toFixed(2));
  console.log("Chosen format:", await quality.getAttribute("aria-label"));
  await page
    .locator(".results-card")
    .evaluate((el) => Promise.all(el.getAnimations().map((a) => a.finished)));
  await page.screenshot({
    path: "test-results/real-mobile-formats.png",
    fullPage: true,
  });
  const started = Date.now();
  const saving = page.waitForEvent("download", { timeout: 240000 });
  await quality.click();
  const download = await saving;
  const path = join(folder, "saved-media");
  await download.saveAs(path);
  const info = JSON.parse(
    execFileSync(
      "ffprobe",
      ["-v", "error", "-show_streams", "-of", "json", path],
      { encoding: "utf8" },
    ),
  );
  console.log(
    "Automatic save seconds:",
    ((Date.now() - started) / 1000).toFixed(2),
  );
  console.log(
    "Tracks:",
    info.streams.map((s) => ({
      type: s.codec_type,
      codec: s.codec_name,
      width: s.width,
      height: s.height,
    })),
  );
  execFileSync(
    "ffmpeg",
    ["-v", "error", "-xerror", "-threads", "2", "-i", path, "-f", "null", "-"],
    { timeout: 60000 },
  );
  await page.getByRole("button", { name: "Save again", exact: true }).waitFor();
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Download notification overflow");
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await page.screenshot({
    path: "test-results/real-mobile-library-dark.png",
    fullPage: true,
  });
  console.log("Automatic browser save and full-file decoding passed.");
} finally {
  for (const id of ids) {
    await page.evaluate(
      async ({ apiUrl, id }) => {
        const response = await fetch(apiUrl + "/api/jobs/" + id, {
          method: "DELETE",
          headers: {
            Authorization: "Bearer " + localStorage.getItem("velora-session"),
          },
        });
        if (!response.ok) throw new Error("Test file cleanup failed");
      },
      { apiUrl, id },
    );
  }
  await browser.close();
  await rm(folder, { recursive: true, force: true });
}
