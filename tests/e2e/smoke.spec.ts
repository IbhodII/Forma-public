import { expect, test } from "@playwright/test";

test.describe("Smoke", () => {
  test("главная → /workouts, API без 5xx, таблица силовых", async ({ page }) => {
    const apiResponses: { url: string; status: number }[] = [];
    page.on("response", (res) => {
      const url = res.url();
      if (url.includes("/api/")) {
        apiResponses.push({ url, status: res.status() });
      }
    });

    await page.goto("/");
    await expect(page).toHaveURL(/\/workouts/);
    await expect(page).toHaveTitle(/Health Dashboard/i);
    await expect(page.getByRole("heading", { name: "Health Dashboard", level: 1 })).toBeVisible();

    await expect(page.getByRole("heading", { name: "Тренировки", level: 2 })).toBeVisible();

    const sessionsResponse = await page.waitForResponse(
      (res) =>
        res.url().includes("/api/strength/sessions") &&
        res.request().method() === "GET",
      { timeout: 45_000 },
    );
    expect(sessionsResponse.status()).toBeLessThan(500);
    expect(sessionsResponse.status()).toBeGreaterThanOrEqual(200);

    await expect(page.getByRole("alert")).toHaveCount(0);

    await expect(page.getByRole("button", { name: /Добавить тренировку/ })).toBeVisible();
    await expect(page.locator("table").first()).toBeVisible();

    const failedApi = apiResponses.filter((r) => r.status >= 500);
    expect(failedApi, `API 5xx: ${JSON.stringify(failedApi)}`).toEqual([]);
  });
});
