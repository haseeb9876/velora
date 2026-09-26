import { test, expect } from "@playwright/test";
test.beforeEach(async ({ page }) => {
  let created = false;
  await page.route("**/api/**", async (route) => {
    const path = new URL(route.request().url()).pathname;
    let body: unknown = {};
    if (path.endsWith("/health"))
      body = {
        status: "online",
        ffmpeg: true,
        limits: {
          playlist: 10,
          duration: 1800,
          fileMb: 500,
          retentionHours: 2,
        },
      };
    else if (path.endsWith("/session")) body = { token: "test-session" };
    else if (path.endsWith("/inspect"))
      body = {
        id: "a1",
        kind: "video",
        title: "A moment in the mountains",
        creator: "Velora test fixture",
        platform: "YouTube",
        duration: 120,
        options: [
          {
            id: "1080",
            kind: "video",
            label: "1080p",
            height: 1080,
            ext: "mp4",
            size: 24000000,
            estimated: true,
          },
          {
            id: "720",
            kind: "video",
            label: "720p",
            height: 720,
            ext: "mp4",
            size: 14000000,
            estimated: false,
          },
          {
            id: "mp3",
            kind: "audio",
            label: "MP3 · 192 kbps",
            ext: "mp3",
            size: 2000000,
            estimated: true,
          },
        ],
      };
    else if (path.endsWith("/ticket"))
      body = { url: "data:video/mp4;base64,b3duZWQtdGVzdC1maXh0dXJl" };
    else if (path.endsWith("/jobs")) {
      const posting = route.request().method() === "POST";
      if (posting) created = true;
      body = {
        jobs: created
          ? [
              {
                id: "j1",
                title: "A moment in the mountains",
                label: "1080p · MP4",
                status: posting ? "queued" : "ready",
                progress: posting ? 0 : 100,
                created: Date.now() / 1000,
                expires: Date.now() / 1000 + 7200,
              },
            ]
          : [],
      };
    }
    await route.fulfill({ json: body });
  });
});
test("one quality click queues and automatically saves exactly once", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Drop a link.")
    .fill("https://youtube.com/watch?v=test");
  await page.getByRole("button", { name: "Find my video" }).click();
  await expect(
    page.getByRole("heading", { name: "A moment in the mountains" }),
  ).toBeVisible();
  await expect(page.getByText("≈ 22.9 MB")).toBeVisible();
  await page.getByRole("button", { name: "Audio only", exact: true }).click();
  await expect(
    page.getByRole("button", { name: /Download MP3/ }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Video + audio", exact: true })
    .click();
  let downloads = 0;
  page.on("download", () => downloads++);
  const posting = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/jobs" && r.method() === "POST",
  );
  const saving = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download 720p MP4" }).click();
  expect((await posting).postDataJSON()).toMatchObject({
    option_id: "720",
    profile: "compatible",
  });
  const download = await saving;
  expect(await download.failure()).toBeNull();
  expect(download.suggestedFilename()).toMatch(/\.mp4$/);
  await expect(page.getByRole("button", { name: "Save again" })).toBeVisible();
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect(
    page.getByText("Sent to browser", { exact: true }),
  ).toBeVisible();
  expect(downloads).toBe(1);
});
test("layout, theme, privacy dialog, and install help", async ({
  page,
}, testInfo) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: /Keep what/ })).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: `test-results/${testInfo.project.name}-home.png`,
    fullPage: true,
  });
  await page.getByRole("button", { name: "Use dark theme" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.getByRole("button", { name: "Privacy", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  if (testInfo.project.name === "mobile")
    await page.getByRole("button", { name: "Open navigation" }).click();
  await page.getByRole("button", { name: "Install Velora" }).click();
  await expect(page.getByText("iPhone or iPad", { exact: true })).toBeVisible();
});
test("source failures do not invent downloads", async ({ page }) => {
  await page.route("**/api/inspect", (route) =>
    route.fulfill({
      status: 422,
      json: { detail: "This platform requires sign-in." },
    }),
  );
  await page.goto("/");
  await page.getByLabel("Drop a link.").fill("https://instagram.com/reel/test");
  await page.getByRole("button", { name: "Find my video" }).click();
  await expect(page.getByRole("alert")).toContainText("requires sign-in");
  await expect(page.getByRole("button", { name: /Download \d+p/ })).toHaveCount(
    0,
  );
});

test("idle library stops polling and refreshes when the app returns", async ({
  page,
}) => {
  await page.clock.install();
  let historyReads = 0;
  let healthReads = 0;
  page.on("response", (response) => {
    const path = new URL(response.url()).pathname;
    if (path === "/api/jobs" && response.request().method() === "GET")
      historyReads++;
    if (path === "/api/health") healthReads++;
  });
  await page.goto("/");
  await expect.poll(() => historyReads).toBeGreaterThan(0);
  const initialReads = historyReads;
  const initialHealth = healthReads;
  await page.clock.runFor(16000);
  await expect.poll(() => healthReads).toBeGreaterThan(initialHealth);
  expect(historyReads).toBe(initialReads);
  await page.evaluate(() =>
    document.dispatchEvent(new Event("visibilitychange")),
  );
  await expect.poll(() => historyReads).toBeGreaterThan(initialReads);
});

test("install invitation repeats until installation and stays hidden afterwards", async ({
  page,
}) => {
  await page.goto("/");
  await expect(
    page.getByRole("complementary", { name: "Install Velora app" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Install app", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Install Velora app" }),
  ).toBeVisible();
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(
    page.getByRole("complementary", { name: "Install Velora app" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(
    page.getByRole("complementary", { name: "Install Velora app" }),
  ).toHaveCount(0);
});

test("original format can be requested without compatibility conversion", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByLabel("Drop a link.")
    .fill("https://youtube.com/watch?v=test");
  await page.getByRole("button", { name: "Find my video" }).click();
  await page.getByRole("button", { name: "Original · faster" }).click();
  const posting = page.waitForRequest(
    (r) => new URL(r.url()).pathname === "/api/jobs" && r.method() === "POST",
  );
  await page.getByRole("button", { name: "Download 1080p MP4" }).click();
  expect((await posting).postDataJSON().profile).toBe("original");
});
