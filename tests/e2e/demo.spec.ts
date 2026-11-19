import { test, expect } from "@playwright/test";
test("Demo: Fahrt, Guthaben, Paket, Storno, Filter und Einladung", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Demo ausprobieren" }).click();
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  const addRide = page.getByRole("button", { name: "Fahrt eintragen" });
  await addRide.click();
  await page.keyboard.press("Escape");
  await expect(addRide).toBeFocused();
  await addRide.click();
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
  await page.getByRole("button", { name: "Minuten manuell geben" }).click();
  await page.getByLabel("Guthaben für").selectOption("demo-0");
  await page.getByLabel("Minuten", { exact: true }).fill("45");
  await page.getByLabel("Grund").fill("Testgutschrift");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Testgutschrift")).toBeVisible();
  await page.getByRole("button", { name: "Guthaben aufladen" }).click();
  await page.getByLabel("Minuten", { exact: true }).fill("300");
  await page.getByLabel("Paketpreis (CHF)").fill("45.00");
  await page.getByLabel("Oskar", { exact: true }).fill("15");
  await page.getByLabel("August", { exact: true }).fill("30");
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
    .getByRole("button", { name: "Guthaben", exact: true })
    .click();
  await page.getByRole("button", { name: "Guthaben aufladen" }).click();
  await page.getByLabel("Minuten", { exact: true }).fill("100");
  await page.getByLabel("Paketpreis (CHF)").fill("10");
  await page.getByLabel("Oskar", { exact: true }).fill("3");
  await page.getByLabel("August", { exact: true }).fill("3");
  await page.getByLabel("Max", { exact: true }).fill("4");
  await expect(
    page.locator(".contribution-row").filter({ hasText: "Max" }),
  ).toContainText("40 Min.");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
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

test("Aufladen nach Beiträgen aktualisiert Home, Restguthaben und Kontingentdiagramm", async ({
  page,
}) => {
  await page.goto("/?demo=1");
  await expect(
    page.getByRole("img", {
      name: "Oskar: 51 von 200 Minuten verbraucht, 149 Minuten übrig.",
    }),
  ).toBeVisible();
  await page
    .locator(".sidebar .nav-item")
    .filter({ hasText: "Guthaben" })
    .click();
  await page.getByRole("button", { name: "Guthaben aufladen" }).click();
  await page.getByLabel("Minuten", { exact: true }).fill("600");
  await page.getByLabel("Paketpreis (CHF)").fill("90");
  await page.getByLabel("Oskar", { exact: true }).fill("30");
  await page.getByLabel("August", { exact: true }).fill("45");
  // Noch nicht vollständig finanziert: keine Buchung.
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Max", { exact: true }).fill("15");
  await expect(
    page.locator(".contribution-row").filter({ hasText: "Oskar" }),
  ).toContainText("200 Min.");
  await expect(
    page.locator(".contribution-row").filter({ hasText: "August" }),
  ).toContainText("300 Min.");
  await expect(
    page.locator(".contribution-row").filter({ hasText: "Max" }),
  ).toContainText("100 Min.");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".sidebar .nav-item")
    .filter({ hasText: "Übersicht" })
    .click();
  await expect(page.locator(".balance-number")).toContainText("349");
  await expect(
    page.getByRole("img", {
      name: "Oskar: 51 von 400 Minuten verbraucht, 349 Minuten übrig.",
    }),
  ).toBeVisible();
  await expect(
    page.locator(".metric-card").filter({ hasText: "Von dir verbraucht" }),
  ).toContainText("51");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Gemeinsamer Bestand" }),
  ).toContainText(/1['’]043/);
  await expect(
    page.locator(".crew-row").filter({ hasText: "August" }),
  ).toContainText("447");
});

test("Onboarding, Hell/Dunkel-Modus, Feedback-Vorschau und Dott-Entsperrung mit Einmal-Standort", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    permissions: ["geolocation"],
    geolocation: { latitude: 47.3779, longitude: 8.5403 },
  });
  const page = await context.newPage();

  // Überwache im Browser, dass watchPosition NIEMALS aufgerufen wird und getCurrentPosition nur auf Klick.
  await page.addInitScript(() => {
    const w = window as unknown as {
      __geoCalls: number;
      __watchCalls: number;
    };
    w.__geoCalls = 0;
    w.__watchCalls = 0;
    const origGet = navigator.geolocation.getCurrentPosition.bind(
      navigator.geolocation,
    );
    navigator.geolocation.getCurrentPosition = (success, error, options) => {
      w.__geoCalls++;
      return origGet(success, error, options);
    };
    navigator.geolocation.watchPosition = () => {
      w.__watchCalls++;
      throw new Error("watchPosition darf nicht verwendet werden!");
    };
  });

  await page.goto("http://localhost:3100/");
  // 1. Interaktive Onboarding-Tour von der Startseite aus testen
  await page.getByRole("button", { name: "So funktioniert's" }).click();
  await expect(
    page.getByRole("heading", { name: /Dein Minutenpass/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "22 Min." }).click();
  await page.getByRole("button", { name: "3 Min." }).click();
  await expect(page.locator(".sim-pass-preview")).toContainText("25 Min.");
  await page.getByRole("button", { name: "Weiter" }).click();
  await expect(
    page.getByRole("heading", { name: "Dott entsperren & Ort auf Wunsch" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Weiter" }).click();
  // Darstellungsmodus im Onboarding auf Hell schalten
  await page.getByRole("button", { name: "Hell", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Loslegen" }).click();

  // Demo starten – noch KEIN Standortabruf beim blossen Laden!
  await page.getByRole("button", { name: "Demo ausprobieren" }).click();
  expect(
    await page.evaluate(
      () => (window as unknown as { __geoCalls: number }).__geoCalls,
    ),
  ).toBe(0);

  // 2. Dott entsperren mit einmaliger Standortfreigabe (Zürich HB)
  await page.getByRole("button", { name: "Dott entsperren" }).click();
  await page
    .getByRole("button", { name: "Aktuellen Startort übernehmen" })
    .click();
  await expect(page.locator('input[name="unlock_start"]')).toHaveValue(
    "Zürich HB",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { __geoCalls: number }).__geoCalls,
    ),
  ).toBe(1);
  await page.getByRole("button", { name: "Fahrt starten" }).click();
  await expect(page.getByText(/Scooter entsperrt/)).toBeVisible();
  await expect(page.getByText(/Start: Zürich HB/)).toBeVisible();

  // Zielkoordinaten auf ETH Polyterrasse ändern und Fahrt beenden
  await context.setGeolocation({ latitude: 47.3763, longitude: 8.5476 });
  await page.getByRole("button", { name: "Fahrt abschliessen" }).click();
  await expect(page.getByLabel("Startort", { exact: true })).toHaveValue(
    "Zürich HB",
  );
  await page
    .getByRole("button", { name: "Aktuellen Zielort einmalig erfassen" })
    .click();
  await expect(page.getByLabel("Zielort", { exact: true })).toHaveValue(
    "ETH Polyterrasse",
  );
  expect(
    await page.evaluate(
      () => (window as unknown as { __geoCalls: number }).__geoCalls,
    ),
  ).toBe(2);
  expect(
    await page.evaluate(
      () => (window as unknown as { __watchCalls: number }).__watchCalls,
    ),
  ).toBe(0);
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByText("Zürich HB → ETH Polyterrasse")).toBeVisible();

  // 3. Neue Uhrzeit- & Zielstatistik auf iPhone-Breite prüfen
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Statistik", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Um welche Uhrzeit seid ihr unterwegs?",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Wohin, wie oft & wer?" }),
  ).toBeVisible();
  await expect(
    page.locator(".destination-row").filter({
      has: page.locator(".destination-title strong", {
        hasText: "ETH Polyterrasse",
      }),
    }),
  ).toContainText("2×");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  // 4. Feedback-Fenster (Vorschau für späteren Launch) prüfen
  await page.getByRole("button", { name: "Feedback geben" }).click();
  await expect(page.getByText("Vorbereitet für Launch")).toBeVisible();
  await page.getByLabel(/Deine Nachricht/).fill("Super schnelle Entsperrung!");
  await page.getByRole("button", { name: "Feedback senden" }).click();
  await expect(
    page.getByRole("heading", { name: "Danke für deine Rückmeldung!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fertig" }).click();

  await context.close();
});
