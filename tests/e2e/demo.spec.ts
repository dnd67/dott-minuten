import { test, expect } from "@playwright/test";
import { DEMO_USER, demoSnapshot } from "../../lib/demo";
import { availableFeatures } from "../../lib/onboarding";
test("Demo: Fahrt, Guthaben, Paket, Storno, Filter und Einladung", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Demo ausprobieren" }).click();
  await page.getByRole("button", { name: "Überspringen" }).click();
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
  await page.getByRole("button", { name: "Nach CHF-Beitrag" }).click();
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
  await page.getByRole("button", { name: "Überspringen" }).click();
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
  await page.getByRole("button", { name: "Nach CHF-Beitrag" }).click();
  await page.getByLabel("Paketpreis (CHF)").fill("10");
  await page.getByLabel("Oskar", { exact: true }).fill("3");
  await page.getByLabel("August", { exact: true }).fill("3");
  await page.getByLabel("Max", { exact: true }).fill("4");
  await expect(
    page.locator(".split-person").filter({ hasText: "Max" }),
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
  await page.getByRole("button", { name: "Überspringen" }).click();
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
  await page.getByRole("button", { name: "Nach CHF-Beitrag" }).click();
  await page.getByLabel("Paketpreis (CHF)").fill("90");
  await page.getByLabel("Oskar", { exact: true }).fill("30");
  await page.getByLabel("August", { exact: true }).fill("45");
  // Noch nicht vollständig finanziert: keine Buchung.
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Max", { exact: true }).fill("15");
  await expect(
    page.locator(".split-person").filter({ hasText: "Oskar" }),
  ).toContainText("200 Min.");
  await expect(
    page.locator(".split-person").filter({ hasText: "August" }),
  ).toContainText("300 Min.");
  await expect(
    page.locator(".split-person").filter({ hasText: "Max" }),
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
  for (const title of [
    "Ein Paket, eure Anteile",
    "Eine Fahrt gemeinsam abrechnen",
    "Deine Fahrt bleibt im Blick",
    "Eure Strecken und Bestzeiten",
    "Dein Zugang zur Crew",
    "Bereit für unterwegs",
  ]) {
    await page.getByRole("button", { name: "Weiter" }).click();
    await expect(page.getByRole("heading", { name: title })).toBeVisible();
  }
  // Darstellungsmodus im Onboarding auf Hell schalten
  await page.getByRole("button", { name: "Hell", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.getByRole("button", { name: "Loslegen" }).click();

  // Demo starten – noch KEIN Standortabruf beim blossen Laden!
  await page.getByRole("button", { name: "Demo ausprobieren" }).click();
  await expect(
    page.getByRole("heading", { name: "Dein Minutenpass" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Überspringen" }).click();
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

  // 5. Passwort- & Zurücksetzungs-Dashboard auf iPhone-Breite prüfen
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Mitglieder", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Passwort- & Zurücksetzungs-Dashboard",
    }),
  ).toBeVisible();
  await expect(
    page.locator(".pw-reset-row").getByText("@max", { exact: true }),
  ).toBeVisible();
  await page
    .locator(".pw-reset-row")
    .getByRole("button", { name: "Neues Passwort setzen" })
    .click();
  await page
    .getByRole("button", { name: "Passwort speichern", exact: true })
    .click();
  await expect(
    page.getByText(/Neues Passwort für Max gespeichert/),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  await context.close();
});

test("Rechtliches: Datenschutzerklärung, Nutzungsbedingungen und Impressum auf iPhone-Breite erreichbar", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  await page.goto("http://localhost:3100/");
  await page.getByRole("link", { name: "Datenschutzerklärung" }).click();
  await expect(page).toHaveURL(/\/datenschutz$/);
  await expect(
    page.getByRole("heading", {
      name: "Datenschutz, Nutzungsbedingungen & Haftung",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /1\. Datenschutzerklärung/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /4\. Nutzungsbedingungen & Haftungsausschluss/,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: /5\. Impressum, Betreiberhinweis & Markenrecht/,
    }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("link", { name: "Zurück zur App" }).click();
  await expect(
    page.getByRole("button", { name: "Demo ausprobieren" }),
  ).toBeVisible();
  await context.close();
});

test("Paket nach Teilnehmenden und Minutenbedarf aufteilen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Überspringen" }).click();
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Guthaben", exact: true })
    .click();
  const open = page.getByRole("button", { name: "Guthaben aufladen" });
  await open.click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Minuten", { exact: true }).fill("100");
  await dialog.getByLabel("Paketpreis (CHF)").fill("10");
  await expect(
    dialog.getByRole("button", { name: "Fair aufteilen" }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByRole("checkbox", { name: "August" }).uncheck();
  await expect(dialog.getByText(/2 von 3 · je 1\/2/)).toBeVisible();
  await expect(
    dialog.locator(".split-person").filter({ hasText: "Max" }),
  ).toContainText(/1\/2[\s\S]*50 Min.*5\.00/);
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(
    page.locator(".account-item").filter({ hasText: "Max" }),
  ).toContainText("197");
  await open.click();
  await dialog.getByLabel("Minuten", { exact: true }).fill("100");
  await dialog.getByLabel("Paketpreis (CHF)").fill("10");
  await dialog.getByRole("button", { name: "Nach Minutenbedarf" }).click();
  await dialog.getByLabel("Minutenbedarf von Oskar").fill("70");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(dialog).toBeVisible();
  await dialog.getByLabel("Minutenbedarf von August").fill("30");
  await expect(
    dialog.locator(".split-person").filter({ hasText: "Oskar" }),
  ).toContainText(/70 Min.*7\.00/);
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(
    page.locator(".account-item").filter({ hasText: "Oskar" }),
  ).toContainText("269");
  await expect(
    page.locator(".account-item").filter({ hasText: "August" }),
  ).toContainText("177");
});

test("Gemeinsame Fahrt auf dem gleichen Scooter während aktiver Fahrt auswählen und Zeit aufteilen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Überspringen" }).click();

  // 1. Scooter entsperren und Fahrt starten
  await page.getByRole("button", { name: "Dott entsperren" }).click();
  await page.getByRole("button", { name: "Fahrt starten" }).click();
  await expect(page.getByText(/Scooter entsperrt/)).toBeVisible();

  // 2. Während der laufenden Fahrt Max als Mitfahrenden im Live-Banner auswählen
  await page
    .locator(".unlock-live-card")
    .getByRole("button", { name: /\+ Max/ })
    .click();
  await expect(
    page.getByText(/Gemeinsam auf dem Scooter: Oskar & Max/),
  ).toBeVisible();
  await expect(page.locator(".live-clock")).toHaveText(/\d{2}:\d{2}/);
  await expect(
    page
      .locator(".unlock-live-card")
      .getByRole("link", { name: "Dynamic Island" }),
  ).toHaveAttribute(
    "href",
    /^shortcuts:\/\/run-shortcut\?name=Minutenclub%20Live/,
  );

  // Einrichtungs-Dialog für Dynamic Island öffnen & prüfen, dann wieder schliessen
  await page
    .locator(".unlock-live-card")
    .getByRole("button", { name: "Einrichten" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Dynamic Island & Sperrbildschirm" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Schliessen", exact: true }).click();

  // In anderen Tab wechseln -> schwebende In-App Dynamic Pill erscheint mit Timer
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Fahrten", exact: true })
    .click();
  await expect(page.locator(".dynamic-pill-bar")).toBeVisible();
  await expect(page.locator(".dynamic-pill-bar")).toContainText("Oskar & Max");
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Übersicht", exact: true })
    .click();

  // 3. Fahrt abschliessen -> Max ist bereits vorausgewählt, 14 + 1 = 15 Min. -> je 7,5 Min.
  await page.getByRole("button", { name: "Fahrt abschliessen" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Oskar & Max")).toBeVisible();
  await dialog.getByLabel("Fahrzeit (Minuten)").fill("14");
  await dialog.getByLabel("Pause (Minuten)").fill("1");
  await expect(dialog.locator(".sum-line")).toContainText(/je 7[.,]5 Min\./);
  await expect(dialog.locator(".shared-split-preview")).toContainText(
    /Max: −7[.,]5 Min\./,
  );
  await dialog.getByLabel("Notiz optional").fill("Zu zweit am See");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(dialog).toHaveCount(0);

  // 4. In Letzte Fahrten erscheint die geteilte Fahrt sauber gruppiert & beide Salden sind reduziert
  await expect(
    page.getByRole("row").filter({ hasText: "Zu zweit am See" }),
  ).toContainText(/Oskar & Max/);
  await expect(
    page.getByRole("row").filter({ hasText: "Zu zweit am See" }),
  ).toContainText(/je 7[.,]5 Min\./);
  await expect(page.locator(".balance-number")).toContainText(/141[.,]5/);
  await expect(
    page.locator(".crew-row").filter({ hasText: "Max" }),
  ).toContainText(/139[.,]5/);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("Admin Dev-Dashboard (GPS-Telemetrie, 100-m-Crew-Orte) und Strecken-Bestzeiten auf iPhone-Breite", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=1");
  await page.getByRole("button", { name: "Überspringen" }).click();

  // 1. Strecken-Bestzeiten in Statistik prüfen
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Statistik", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "Strecken-Bestzeiten · Wer ist am schnellsten?",
    }),
  ).toBeVisible();
  await expect(page.locator(".route-record-card").first()).toBeVisible();

  // 2. Admin Dev-Dashboard über Topbar öffnen
  await page.getByRole("button", { name: "Dev-Dashboard öffnen" }).click();
  await expect(
    page.getByRole("heading", { name: "Fahrt-Telemetrie & GPS-Inspektor" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Crew-Orte & 100-m-Adresszonen" }),
  ).toBeVisible();

  // 3. Neuen Crew-Ort mit Koordinaten anlegen
  await page.getByLabel("Name in Statistik").fill("Limmat-Spot");
  await page.getByLabel("Breitengrad (Lat)").fill("47.372");
  await page.getByLabel("Längengrad (Lng)").fill("8.541");
  await page.getByRole("button", { name: "Crew-Ort speichern" }).click();
  await expect(
    page.locator(".dev-place-card").filter({ hasText: "Limmat-Spot" }),
  ).toBeVisible();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("Bestehende Konten sehen nur Neuerungen und setzen eine unterbrochene Tour fort", async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.setViewportSize({ width: 320, height: 650 });
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("minutenclub-onboarding-done-v1", "1"),
  );
  await page.goto("/?demo=1");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText("Neu für dich")).toBeVisible();
  await expect(dialog.getByRole("heading")).toHaveText(
    "Ein Paket, eure Anteile",
  );
  await dialog.getByRole("button", { name: "Minutenbedarf" }).click();
  await expect(dialog.getByText("Du · 70 Min.")).toBeVisible();
  expect(
    await dialog
      .locator(".tour-slide")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await dialog.getByRole("button", { name: "Weiter" }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await page.reload();
  await expect(dialog.getByRole("heading")).toHaveText(
    "Eine Fahrt gemeinsam abrechnen",
  );
  for (const title of [
    "Deine Fahrt bleibt im Blick",
    "Eure Strecken und Bestzeiten",
    "Dein Zugang zur Crew",
    "Deine Werkzeuge als Admin",
  ]) {
    await dialog.getByRole("button", { name: "Weiter" }).click();
    await expect(dialog.getByRole("heading")).toHaveText(title);
  }
  await dialog.getByRole("button", { name: "Alles klar" }).click();
  await page.reload();
  await page
    .locator(".mobile-nav")
    .getByRole("button", { name: "Mitglieder" })
    .click();
  const replay = page.getByRole("button", { name: "Einführung", exact: true });
  await replay.click();
  await expect(dialog.getByRole("heading")).toHaveText("Dein Minutenpass");
  await page.keyboard.press("Escape");
  await expect(replay).toBeFocused();
});

test("Ein einzelnes neues Feature erscheint auf dem Mitgliedskonto ohne Admin-Karten", async ({
  page,
}) => {
  const data = demoSnapshot();
  data.members.find((m) => m.user_id === DEMO_USER)!.role = "member";
  await page.goto("/");
  await page.evaluate(
    ({ data, seen }) => {
      localStorage.setItem("minutenclub-demo-v1", JSON.stringify(data));
      localStorage.setItem("minutenclub-demo-tour-v2", JSON.stringify(seen));
    },
    {
      data,
      seen: availableFeatures(false).filter((id) => id !== "live-cockpit"),
    },
  );
  await page.goto("/?demo=1");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText(
    "Deine Fahrt bleibt im Blick",
  );
  await expect(dialog.getByLabel("Schritt 1 von 1")).toBeVisible();
  await dialog.getByRole("button", { name: "Anderer Tab" }).click();
  await expect(dialog.locator(".tour-live")).toHaveAttribute(
    "data-compact",
    "true",
  );
  await dialog.getByRole("button", { name: "Alles klar" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Fahrt eintragen" }).click();
  await expect(page.getByLabel("Fahrzeit (Minuten)")).toBeVisible();
});
