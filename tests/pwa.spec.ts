import { test, expect } from "@playwright/test";
test("production manifest, icons, share target, and offline shell", async ({
  page,
  context,
  request,
}) => {
  const manifest = await (await request.get("/manifest.webmanifest")).json();
  expect(manifest.display).toBe("standalone");
  expect(manifest.share_target.params.url).toBe("url");
  for (const icon of manifest.icons) {
    const response = await request.get(icon.src);
    expect(response.ok()).toBe(true);
    expect(response.headers()["content-type"]).toContain("image/png");
  }
  await page.goto("/");
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await page.reload();
  await page.evaluate(() => document.fonts.ready.then(() => true));
  await expect(
    page.getByRole("heading", { name: /Good moments/ }),
  ).toBeVisible();
  await context.setOffline(true);
  await page.reload({ waitUntil: "domcontentloaded" });
  await expect(
    page.getByRole("heading", { name: /Good moments/ }),
  ).toBeVisible();
  await expect(page.getByText("Worker offline", { exact: true })).toBeVisible();
});
