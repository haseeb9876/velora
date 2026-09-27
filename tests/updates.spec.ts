import { test, expect } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, extname, resolve } from "node:path";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";

let folder: string;
test.beforeAll(() => {
  folder = mkdtempSync(join(tmpdir(), "velora-releases-"));
  for (const version of ["a", "b"]) {
    execFileSync(
      process.execPath,
      [
        "node_modules/vite/bin/vite.js",
        "build",
        "--outDir",
        join(folder, version),
        "--emptyOutDir",
      ],
      {
        env: {
          ...process.env,
          VELORA_BUILD_ID: `release-${version}`,
          VITE_API_URL: "",
        },
        stdio: "pipe",
        timeout: 60000,
      },
    );
  }
});
test.afterAll(() => rmSync(folder, { recursive: true, force: true }));

async function deployment(active = false) {
  const state = { release: "a", active };
  const server = createServer((request, response) => {
    const path = new URL(request.url!, "http://localhost").pathname;
    response.setHeader("Cache-Control", "no-store");
    if (path.startsWith("/api/")) {
      response.setHeader("Content-Type", "application/json");
      const data =
        path === "/api/health"
          ? {
              status: "online",
              ffmpeg: true,
              limits: {
                playlist: 10,
                duration: 1800,
                fileMb: 500,
                retentionHours: 2,
              },
            }
          : path === "/api/session"
            ? { token: "owned-test-session" }
            : {
                jobs: state.active
                  ? [
                      {
                        id: "active",
                        title: "In-progress fixture",
                        label: "1080p",
                        status: "processing",
                        progress: 25,
                        created: Date.now() / 1000,
                      },
                    ]
                  : [],
              };
      response.end(JSON.stringify(data));
      return;
    }
    const file = resolve(
      folder,
      state.release,
      path === "/" ? "index.html" : path.slice(1),
    );
    if (!file.startsWith(resolve(folder, state.release) + "/")) {
      response.writeHead(400).end();
      return;
    }
    try {
      const types: Record<string, string> = {
        ".html": "text/html",
        ".js": "application/javascript",
        ".css": "text/css",
        ".json": "application/json",
        ".webmanifest": "application/manifest+json",
        ".svg": "image/svg+xml",
        ".png": "image/png",
        ".woff2": "font/woff2",
      };
      response.setHeader("Vary", "Origin");
      response.setHeader(
        "Content-Type",
        types[extname(file)] || "application/octet-stream",
      );
      response.end(readFileSync(file));
    } catch {
      response.writeHead(404).end();
    }
  });
  await new Promise<void>((done) => server.listen(0, "127.0.0.1", done));
  return {
    state,
    url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`,
    close: () =>
      new Promise<void>((done) => {
        server.closeAllConnections();
        server.close(() => done());
      }),
  };
}

test("new release is detected by periodic checks, preserves draft, and works offline", async ({
  page,
  context,
}) => {
  test.setTimeout(90000);
  const site = await deployment();
  try {
    await page.clock.install();
    await page.goto(site.url);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);
    await page
      .getByLabel("Drop a link.")
      .fill("https://youtube.com/watch?v=keep-my-draft");
    site.state.release = "b";
    await page.clock.runFor(61000);
    await expect(page.getByText("A fresh version is ready.")).toBeVisible({
      timeout: 15000,
    });
    await page.clock.resume();
    await page.getByRole("button", { name: "Update now" }).click();
    await expect(
      page.getByRole("button", { name: "Check updates" }),
    ).toHaveAttribute("title", "Build release-b");
    await expect(page.getByLabel("Drop a link.")).toHaveValue(
      "https://youtube.com/watch?v=keep-my-draft",
    );
    await context.setOffline(true);
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(
      page.getByRole("heading", { name: /Keep what/ }),
    ).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Check updates" }),
    ).toHaveAttribute("title", "Build release-b");
  } finally {
    await context.setOffline(false).catch(() => {});
    await site.close();
  }
});

test("active downloads defer installation, then the new release applies automatically", async ({
  page,
}) => {
  test.setTimeout(90000);
  const site = await deployment(true);
  try {
    await page.clock.install();
    await page.goto(site.url);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect(
      page.getByText("Worker online", { exact: true }),
    ).toBeVisible();
    site.state.release = "b";
    await page.clock.runFor(61000);
    await expect(page.getByRole("button", { name: "Update now" })).toBeDisabled(
      { timeout: 15000 },
    );
    await expect(
      page.getByRole("button", { name: "Check updates" }),
    ).toHaveAttribute("title", "Build release-a");
    site.state.active = false;
    await page.clock.runFor(2000);
    await expect(
      page.getByRole("button", { name: "Update now" }),
    ).toBeEnabled();
    await page.clock.resume();
    await expect(
      page.getByRole("button", { name: "Check updates" }),
    ).toHaveAttribute("title", "Build release-b", { timeout: 15000 });
  } finally {
    await site.close();
  }
});

test("another tab can update without disrupting the focused link draft", async ({
  page,
  context,
}) => {
  const site = await deployment();
  try {
    await page.goto(site.url);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);
    await page
      .getByLabel("Drop a link.")
      .fill("https://youtube.com/watch?v=another-tab-draft");
    const second = await context.newPage();
    await second.goto(site.url);
    await expect(
      second.getByText("Worker online", { exact: true }),
    ).toBeVisible();
    site.state.release = "b";
    await second.getByRole("button", { name: "Check updates" }).click();
    await expect(
      second.getByRole("button", { name: "Update now" }),
    ).toBeVisible();
    await second.getByRole("button", { name: "Update now" }).click();
    await expect(
      second.getByRole("button", { name: "Check updates" }),
    ).toHaveAttribute("title", "Build release-b");
    await expect(
      page.getByRole("button", { name: "Check updates" }),
    ).toHaveAttribute("title", "Build release-a");
    await expect(page.getByLabel("Drop a link.")).toHaveValue(
      "https://youtube.com/watch?v=another-tab-draft",
    );
    await page.bringToFront();
    await page.getByRole("button", { name: "Update now" }).click();
    await expect(
      page.getByRole("button", { name: "Check updates" }),
    ).toHaveAttribute("title", "Build release-b");
    await expect(page.getByLabel("Drop a link.")).toHaveValue(
      "https://youtube.com/watch?v=another-tab-draft",
    );
  } finally {
    await site.close();
  }
});
