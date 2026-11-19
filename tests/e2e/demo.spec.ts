import { test, expect } from "@playwright/test";
test("Demo: Fahrt, Guthaben, Paket, Storno, Filter und Einladung", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Demo ausprobieren" }).click();
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  await page.getByRole("button", { name: "Fahrt eintragen" }).click();
  await page.getByLabel("Fahrzeit (Minuten)").fill("14");
  await page.getByLabel("Pause (Minuten)").fill("1");
  await expect(page.locator(".sum-line")).toContainText("15 Min.");
  await page.getByLabel("Notiz optional").fill("Testfahrt");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.getByText("Testfahrt", { exact: true })).toBeVisible();
  const nav = (name: string) =>
    page.locator(".sidebar .nav-item").filter({ hasText: name });
  await nav("Guthaben").click();
  await page.getByRole("button", { name: "Guthaben geben" }).click();
  await page.getByLabel("Guthaben für").selectOption("demo-0");
  await page.getByLabel("Minuten", { exact: true }).fill("45");
  await page.getByLabel("Grund").fill("Testgutschrift");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Testgutschrift")).toBeVisible();
  await page.getByRole("button", { name: "Paket erfassen" }).click();
  await page.getByLabel("Minuten", { exact: true }).fill("300");
  await page.getByLabel("Paketpreis (CHF)").fill("45.00");
  await page.getByLabel("Notiz optional").fill("Testpaket");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("cell", { name: "Testpaket" })).toBeVisible();
  await nav("Fahrten").click();
  await page
    .getByRole("row")
    .filter({ hasText: "Testfahrt" })
    .getByRole("button", { name: "Stornieren" })
    .click();
  await page.getByLabel("Grund").fill("Doppelt");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Stornieren", exact: true })
    .click();
  await expect(page.getByText("Storniert · Doppelt")).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("voided");
  await expect(page.locator("tbody tr")).toHaveCount(1);
  await expect(page.getByText("+15 Min. zurückgebucht")).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("active");
  await expect(page.getByText("Storniert · Doppelt")).toHaveCount(0);
  await nav("Statistik").click();
  await page.getByLabel("Person", { exact: true }).selectOption("demo-0");
  await expect(page.locator(".stats-person")).toHaveCount(1);
  await nav("Mitglieder").click();
  await page
    .getByRole("button", { name: "Name ändern von Oskar", exact: true })
    .click();
  await page.getByLabel("Anzeigename").fill("Oskar Neu");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Oskar Neu (du)", { exact: true })).toBeVisible();
  await nav("Übersicht").click();
  await expect(
    page.getByRole("heading", { name: "Hoi Oskar Neu" }),
  ).toBeVisible();
  await nav("Mitglieder").click();
  await page.getByRole("button", { name: "Einladung erstellen" }).click();
  await expect(page.getByText("demo-einladung", { exact: true })).toBeVisible();
  await page.reload();
  await page.getByRole("button", { name: "Demo ausprobieren" }).click();
  await nav("Guthaben").click();
  await expect(page.getByText("Testgutschrift")).toBeVisible();
  expect(errors).toEqual([]);
});
test("iPhone-Abmessungen: alle Seiten bedienbar, Dialog und Offline-Hinweis", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3100/?demo=1");
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  for (const tab of [
    "Fahrten",
    "Guthaben",
    "Statistik",
    "Mitglieder",
    "Übersicht",
  ]) {
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name: tab, exact: true })
      .click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  }
  await page.getByRole("button", { name: "Fahrt eintragen" }).click();
  await page.getByLabel("Fahrzeit (Minuten)").fill("14");
  await page.getByLabel("Pause (Minuten)").fill("1");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await context.setOffline(true);
  await expect(
    page.getByText("Du bist offline.", { exact: false }),
  ).toBeVisible();
  await context.setOffline(false);
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Mitglieder", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Name ändern von Max", exact: true })
    .click();
  await page.getByLabel("Anzeigename").fill("Max Neu");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Max Neu", { exact: true })).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Demo ausprobieren" }),
  ).toBeVisible();
  await context.close();
});
