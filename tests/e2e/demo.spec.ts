import { test, expect, type Page } from "@playwright/test";
import { DEMO_USER, demoSnapshot } from "../../lib/demo";
import type { Snapshot } from "../../lib/domain";

type NavMode = "desktop" | "mobile";
type TabLabel =
  | "Übersicht"
  | "Fahrten"
  | "Guthaben"
  | "Statistik"
  | "Mitglieder";

async function switchTab(page: Page, mode: NavMode, label: TabLabel) {
  if (mode === "desktop") {
    await page.locator(".sidebar .nav-item").filter({ hasText: label }).click();
  } else {
    await page
      .locator(".mobile-nav")
      .getByRole("button", { name: label, exact: true })
      .click();
  }
}

async function assertNoGlobalAdminOrDevChrome(page: Page, mode: NavMode) {
  await expect(
    page.locator(".sidebar").getByRole("button", { name: "Dev-Dashboard" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Dev-Dashboard öffnen" }),
  ).toHaveCount(0);
  await expect(page.locator(".dev-topbar-btn")).toHaveCount(0);
  await expect(page.locator(".dev-topbar-badge")).toHaveCount(0);
  await expect(page.locator(".nav-badge")).toHaveCount(0);
  await expect(page.locator(".feedback-inbox-panel")).toHaveCount(0);
  await expect(page.getByText("Nutzer-Feedback der Crew")).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Fahrt-Telemetrie & GPS-Inspektor" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Crew-Orte & 100-m-Adresszonen" }),
  ).toHaveCount(0);
  if (mode === "mobile") {
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
  }
}

async function assertNoAdminOrDevControls(
  page: Page,
  mode: NavMode,
  expectedOwnName = "Oskar",
) {
  // 1. Übersicht
  await switchTab(page, mode, "Übersicht");
  await assertNoGlobalAdminOrDevChrome(page, mode);
  await expect(page.locator(".reset-alert-banner")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Passwort-Dashboard öffnen" }),
  ).toHaveCount(0);

  // 2. Fahrten (6 Spalten sauber ausgerichtet, keine Stornieren-Aktion)
  await switchTab(page, mode, "Fahrten");
  await assertNoGlobalAdminOrDevChrome(page, mode);
  await expect(page.getByRole("button", { name: "Stornieren" })).toHaveCount(0);
  const headers = page.locator("main table thead th");
  await expect(headers).toHaveCount(6);
  await expect(headers).toHaveText([
    "Mitglied",
    "Fahrt",
    "Fahrzeit",
    "Pause",
    "Verbrauch",
    "Kosten¹",
  ]);
  const cellCounts = await page
    .locator("main table tbody tr")
    .evaluateAll((rows) =>
      rows.map((row) => (row as HTMLTableRowElement).cells.length),
    );
  expect(cellCounts.length).toBeGreaterThan(0);
  expect(cellCounts.every((n) => n === 6)).toBe(true);

  // 3. Guthaben (Minutenpakete für Mitglieder erlaubt, manuelle Admin-Gutschrift gesperrt)
  await switchTab(page, mode, "Guthaben");
  await assertNoGlobalAdminOrDevChrome(page, mode);
  await expect(
    page.getByRole("button", { name: "Minuten manuell geben" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Guthaben aufladen" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Minutenkonten" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Minutenpakete" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Buchungshistorie" }),
  ).toBeVisible();

  // 4. Statistik (Strecken-Bestzeiten sichtbar, kein Dev-Dashboard)
  await switchTab(page, mode, "Statistik");
  await assertNoGlobalAdminOrDevChrome(page, mode);
  await expect(
    page.getByRole("heading", {
      name: "Strecken-Bestzeiten · Wer ist am schnellsten?",
    }),
  ).toBeVisible();

  // 5. Mitglieder (keine Einladungen, Rollenwahl, Deaktivierung, Fremd-Umbenennung, Admin-Passwörter oder Dev-Row)
  await switchTab(page, mode, "Mitglieder");
  await assertNoGlobalAdminOrDevChrome(page, mode);
  await expect(
    page.getByRole("button", { name: "Einladung erstellen" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Links sperren" })).toHaveCount(
    0,
  );
  await expect(page.locator(".invite-box")).toHaveCount(0);
  await expect(page.locator('.members-list select[id^="role-"]')).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Deaktivieren" })).toHaveCount(
    0,
  );
  await expect(page.getByRole("button", { name: "Aktivieren" })).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Name ändern von August", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Name ändern von Max", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.locator(".members-list").getByRole("button", { name: /Name ändern/ }),
  ).toHaveCount(1);
  await expect(
    page.getByRole("button", {
      name: `Name ändern von ${expectedOwnName}`,
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByText("Admin Dev-Dashboard")).toHaveCount(0);
  await expect(
    page.getByText(
      "Alle aktiven Mitglieder können Fahrten und Minutenpakete erfassen.",
    ),
  ).toBeVisible();
  await expect(
    page.getByText("Ändere hier jederzeit dein eigenes Passwort.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Eigenes Passwort ändern (@oskar)" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Mitglied direkt anlegen" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Offene Zurücksetzungs-Anfragen" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", {
      name: "Mitglieder-Passwörter direkt verwalten",
    }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Passwort neu setzen" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Neues Passwort setzen" }),
  ).toHaveCount(0);
  await expect(page.locator(".pw-reset-row")).toHaveCount(0);
}

test("Demo (Desktop): normales Mitglied ohne Admin-/Dev-Rechte – Fahrt, Filter, Guthaben, Statistik, eigener Name, Passwort, Persistenz & Reset", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  await page.getByRole("button", { name: "Demo ausprobieren" }).click();
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  await expect(
    page.getByRole("img", {
      name: "Oskar: 51 von 200 Minuten verbraucht, 149 Minuten übrig.",
    }),
  ).toBeVisible();

  // Fahrt eintragen (inkl. Escape-Fokusrückkehr)
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

  // Übersicht aktualisiert Restguthaben, Kontingentdiagramm und Bestand
  await expect(page.locator(".balance-number")).toContainText("134");
  await expect(
    page.getByRole("img", {
      name: "Oskar: 66 von 200 Minuten verbraucht, 134 Minuten übrig.",
    }),
  ).toBeVisible();
  await expect(
    page.locator(".metric-card").filter({ hasText: "Von dir verbraucht" }),
  ).toContainText("66");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Gemeinsamer Bestand" }),
  ).toContainText("428");

  // Umfassende Negativprüfung auf Desktop: null Dev-Dashboard, null Admin-Steuerelemente
  await assertNoAdminOrDevControls(page, "desktop", "Oskar");

  // Fahrten-Filter & 6-Spalten-Tabelle
  await switchTab(page, "desktop", "Fahrten");
  await expect(page.locator("main table tbody tr")).toHaveCount(13);
  await page.getByLabel("Person", { exact: true }).selectOption("demo-0");
  await expect(page.locator("main table tbody tr")).toHaveCount(5);
  await expect(page.getByText("Testfahrt", { exact: true })).toBeVisible();
  await page.getByLabel("Person", { exact: true }).selectOption("all");
  await page.getByLabel("Status", { exact: true }).selectOption("voided");
  await expect(page.locator("main table tbody tr")).toHaveCount(0);
  await expect(page.getByText("Noch keine Fahrten")).toBeVisible();
  await page.getByLabel("Status", { exact: true }).selectOption("active");
  await expect(page.locator("main table tbody tr")).toHaveCount(13);

  // Guthaben: Konten, Pakete & Journal (inkl. Paket-Button, ohne manuelle Admin-Gutschrift)
  await switchTab(page, "desktop", "Guthaben");
  await expect(
    page.locator(".account-item").filter({ hasText: "Oskar" }),
  ).toContainText("134");
  await expect(
    page.locator(".account-item").filter({ hasText: "August" }),
  ).toContainText("147");
  await expect(
    page.locator(".account-item").filter({ hasText: "Max" }),
  ).toContainText("147");
  await expect(
    page.getByRole("cell", { name: "Gemeinsames Minutenpaket" }),
  ).toBeVisible();
  await expect(page.locator(".journal-row").first()).toBeVisible();

  // Statistik: Strecken-Bestzeiten & Personenfilter
  await switchTab(page, "desktop", "Statistik");
  await expect(page.locator(".route-record-card").first()).toBeVisible();
  await page.getByLabel("Person", { exact: true }).selectOption("demo-0");
  await expect(page.locator(".stats-person")).toHaveCount(1);

  // Mitglieder: Rollen prüfen, eigenen Namen und eigenes Passwort ändern
  await switchTab(page, "desktop", "Mitglieder");
  const oskarRow = page
    .locator(".member-row")
    .filter({ hasText: "Oskar (du)" });
  const augustRow = page.locator(".member-row").filter({ hasText: "August" });
  const maxRow = page.locator(".member-row").filter({ hasText: "Max" });
  await expect(oskarRow).toContainText("Mitglied");
  await expect(oskarRow).not.toContainText("Administrator");
  await expect(augustRow).toContainText("Administrator");
  await expect(maxRow).toContainText("Mitglied");

  await page
    .getByRole("button", { name: "Name ändern von Oskar", exact: true })
    .click();
  await page.getByLabel("Anzeigename").fill("Oskar Neu");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.getByText("Oskar Neu (du)", { exact: true })).toBeVisible();

  await page.locator("#own-new-pw").fill("OskarPass2026");
  await page.locator("#own-confirm-pw").fill("OskarPass2026");
  await page
    .getByRole("button", { name: "Eigenes Passwort speichern" })
    .click();
  await expect(
    page.getByText("Dein Passwort wurde aktualisiert."),
  ).toBeVisible();

  await switchTab(page, "desktop", "Übersicht");
  await expect(
    page.getByRole("heading", { name: "Hoi Oskar Neu" }),
  ).toBeVisible();

  // Persistenz über Reload prüfen
  await page.reload();
  await page.getByRole("button", { name: "Demo ausprobieren" }).click();
  await expect(
    page.getByRole("heading", { name: "Hoi Oskar Neu" }),
  ).toBeVisible();
  await expect(page.getByText("Testfahrt", { exact: true })).toBeVisible();
  await expect(page.locator(".balance-number")).toContainText("134");

  // Demo-Reset stellt Ausgangszustand wieder her
  await page
    .locator(".demo-notice")
    .getByRole("button", { name: "Zurücksetzen", exact: true })
    .click();
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  await expect(page.locator(".balance-number")).toContainText("149");
  await expect(page.getByText("Testfahrt", { exact: true })).toHaveCount(0);

  expect(errors).toEqual([]);
});

test("Demo (Legacy/Tampered localStorage): Admin-Rolle und Reset-Anfragen werden beim Start bereinigt und persistiert", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  const tampered = demoSnapshot();
  tampered.members[0].role = "admin";
  tampered.members[0].active = false;
  tampered.members[1].role = "member";
  tampered.members[2].role = "member";
  tampered.reset_requests = [
    {
      id: "legacy-reset-max",
      group_id: tampered.group.id,
      member_id: "demo-2",
      target_user_id: "user-2",
      username: "max",
      note: "Passwort vergessen",
      status: "open",
      requested_at: "2026-11-19T18:00:00.000Z",
      resolved_at: null,
    },
  ];
  tampered.feedback = [
    {
      id: "legacy-fb-own",
      group_id: tampered.group.id,
      member_id: "demo-0",
      category: "idea",
      message: "Eigenes Feedback bleibt",
      page: "Übersicht",
      created_at: "2026-11-19T19:00:00.000Z",
    },
    {
      id: "legacy-fb-foreign",
      group_id: tampered.group.id,
      member_id: "demo-1",
      category: "bug",
      message: "Fremdes Feedback wird entfernt",
      page: "Fahrten",
      created_at: "2026-11-19T19:05:00.000Z",
    },
  ];
  tampered.rides.unshift({
    ...tampered.rides[0],
    id: "legacy-own-ride",
    member_id: "demo-0",
    occurred_at: new Date().toISOString(),
    note: "Bleibende Altfahrt",
  });

  await page.goto("/");
  await page.evaluate((serialized) => {
    localStorage.setItem("minutenclub-demo-v1", serialized);
  }, JSON.stringify(tampered));

  await page.goto("/?demo=1");
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  await expect(
    page.getByText("Bleibende Altfahrt", { exact: true }),
  ).toBeVisible();

  await assertNoAdminOrDevControls(page, "desktop", "Oskar");

  const oskarRow = page
    .locator(".member-row")
    .filter({ hasText: "Oskar (du)" });
  const augustRow = page.locator(".member-row").filter({ hasText: "August" });
  const maxRow = page.locator(".member-row").filter({ hasText: "Max" });
  await expect(oskarRow).toContainText("Mitglied");
  await expect(oskarRow).not.toContainText("Administrator");
  await expect(augustRow).toContainText("Administrator");
  await expect(maxRow).toContainText("Mitglied");

  const persistedRaw = await page.evaluate(() =>
    localStorage.getItem("minutenclub-demo-v1"),
  );
  expect(persistedRaw).not.toBeNull();
  const persisted = JSON.parse(persistedRaw!) as Snapshot;
  expect(persisted.members.find((m) => m.user_id === DEMO_USER)).toMatchObject({
    id: "demo-0",
    role: "member",
    active: true,
  });
  expect(persisted.members.find((m) => m.id === "demo-1")).toMatchObject({
    role: "admin",
    active: true,
  });
  expect(persisted.members.find((m) => m.id === "demo-2")).toMatchObject({
    role: "member",
  });
  expect(persisted.reset_requests).toEqual([]);
  expect(persisted.feedback?.map((f) => f.id)).toEqual(["legacy-fb-own"]);
  expect(persisted.rides.some((r) => r.id === "legacy-own-ride")).toBe(true);

  // Auch im Feedback-Dialog erscheinen im Demo-Modus weder Admin-Shortcut noch fremdes Feedback:
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Feedback", exact: true })
    .click();
  const feedbackDialog = page.getByRole("dialog");
  await expect(feedbackDialog).toBeVisible();
  await expect(
    feedbackDialog.getByText("Alle im Dev-Dashboard ansehen"),
  ).toHaveCount(0);
  await expect(feedbackDialog.getByText("Rückmeldungen der Crew")).toHaveCount(
    0,
  );
  await expect(feedbackDialog.locator(".feedback-admin-bar")).toHaveCount(0);
  await expect(
    feedbackDialog.getByText("Deine bisherigen Rückmeldungen (1)"),
  ).toBeVisible();
  await feedbackDialog.getByText("Deine bisherigen Rückmeldungen (1)").click();
  await expect(
    feedbackDialog.getByText("Eigenes Feedback bleibt"),
  ).toBeVisible();
  await expect(
    feedbackDialog.getByText("Fremdes Feedback wird entfernt"),
  ).toHaveCount(0);
  await feedbackDialog
    .getByRole("button", { name: "Abbrechen", exact: true })
    .click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await assertNoGlobalAdminOrDevChrome(page, "desktop");

  // Auch nach Reload bleibt der bereinigte Zustand ohne Admin-/Dev-Rechte bestehen
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  await assertNoGlobalAdminOrDevChrome(page, "desktop");
  await expect(page.locator(".reset-alert-banner")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("iPhone-Abmessungen: alle Seiten bedienbar, keine Admin-/Dev-Steuerung, Dialog, eigener Name und Offline-Hinweis", async ({
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

  // Vollständige Negativprüfung + 390px-Überlaufprüfung über alle mobilen Tabs
  await assertNoAdminOrDevControls(page, "mobile", "Oskar");

  await switchTab(page, "mobile", "Übersicht");
  await page.getByRole("button", { name: "Fahrt eintragen" }).click();
  await page.getByLabel("Fahrzeit (Minuten)").fill("14");
  await page.getByLabel("Pause (Minuten)").fill("1");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.locator(".balance-number")).toContainText("134");

  await context.setOffline(true);
  await expect(
    page.getByText("Du bist offline.", { exact: false }),
  ).toBeVisible();
  await context.setOffline(false);

  await switchTab(page, "mobile", "Mitglieder");
  await page
    .getByRole("button", { name: "Name ändern von Oskar", exact: true })
    .click();
  await page.getByLabel("Anzeigename").fill("Oskar Mobil");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Oskar Mobil (du)", { exact: true }),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  await page.getByRole("button", { name: "Abmelden", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Demo ausprobieren" }),
  ).toBeVisible();
  await context.close();
});

test("Onboarding, Hell/Dunkel-Modus, Feedback-Vorschau, eigenes Passwort und Dott-Entsperrung mit Einmal-Standort", async ({
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
  // 1. Animierte 5-Schritt Onboarding-Tour von der Startseite aus testen
  await page.getByRole("button", { name: "So funktioniert's" }).click();
  await expect(
    page.getByRole("heading", { name: /Dein Minutenpass/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "22 Min." }).click();
  await page.getByRole("button", { name: "3 Min." }).click();
  await expect(page.locator(".sim-pass-preview")).toContainText("25 Min.");
  await page.getByRole("button", { name: "Nach CHF", exact: true }).click();
  await expect(page.locator(".ob-split-legend")).toContainText("150 Min.");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  // Schritt 2: Gemeinsamer Scooter & Live-Split
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: /Zu zweit unterwegs\?/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "+ Max" }).click();
  await expect(page.locator(".ob-rider-avatars")).toContainText(/je 7,5 Min\./);

  // Schritt 3: Live-Cockpit & Dynamic Island Vorschau
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Live auf Dynamic Island & Sperrbildschirm",
    }),
  ).toBeVisible();
  await expect(page.locator(".ob-island-clock")).toHaveText(/\d{2}:\d{2}/);
  await page.getByRole("button", { name: "Kompakt", exact: true }).click();
  await expect(page.locator(".ob-island-capsule")).toHaveClass(/compact/);
  await page.getByRole("button", { name: "Erweitert", exact: true }).click();
  await expect(page.locator(".ob-island-capsule")).toHaveClass(/expanded/);

  // Schritt 4: Adressen statt Koordinaten & Strecken-Bestzeiten
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(
    page.getByRole("heading", {
      name: "Adressen statt Koordinaten & Bestzeiten",
    }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Bellevue → Seefeld", exact: true })
    .click();
  await expect(page.locator(".ob-podium-bars")).toContainText("5 Min.");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  // Schritt 5: Darstellungsmodus im Onboarding auf Hell schalten & abschliessen
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
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
  await switchTab(page, "mobile", "Statistik");
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

  // 4. Feedback-Fenster (Vorschau für späteren Launch) prüfen – ohne Admin-Verknüpfung oder Crew-Ansicht
  await page.getByRole("button", { name: "Feedback geben" }).click();
  const feedbackDialog = page.getByRole("dialog");
  await expect(feedbackDialog).toBeVisible();
  await expect(
    feedbackDialog.getByText("Vorbereitet für Launch"),
  ).toBeVisible();
  await expect(
    feedbackDialog.getByText("Alle im Dev-Dashboard ansehen"),
  ).toHaveCount(0);
  await expect(feedbackDialog.getByText("Rückmeldungen der Crew")).toHaveCount(
    0,
  );
  await expect(feedbackDialog.locator(".feedback-admin-bar")).toHaveCount(0);
  await feedbackDialog
    .getByLabel(/Deine Nachricht/)
    .fill("Super schnelle Entsperrung!");
  await feedbackDialog.getByRole("button", { name: "Feedback senden" }).click();
  await expect(
    feedbackDialog.getByRole("heading", {
      name: "Danke für deine Rückmeldung!",
    }),
  ).toBeVisible();
  await expect(
    feedbackDialog.getByText("Deine bisherigen Rückmeldungen (1)"),
  ).toBeVisible();
  await expect(
    feedbackDialog.getByText("Alle im Dev-Dashboard ansehen"),
  ).toHaveCount(0);
  await expect(feedbackDialog.getByText("Rückmeldungen der Crew")).toHaveCount(
    0,
  );
  await feedbackDialog.getByText("Deine bisherigen Rückmeldungen (1)").click();
  await expect(
    feedbackDialog
      .locator(".feedback-list")
      .getByText("Super schnelle Entsperrung!"),
  ).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await feedbackDialog.getByRole("button", { name: "Fertig" }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await assertNoGlobalAdminOrDevChrome(page, "mobile");

  // 5. Passwort-Dashboard für normale Mitglieder (@oskar) auf iPhone-Breite prüfen
  await switchTab(page, "mobile", "Mitglieder");
  await expect(
    page.getByRole("heading", {
      name: "Passwort- & Zurücksetzungs-Dashboard",
    }),
  ).toBeVisible();
  await expect(
    page.getByText("Ändere hier jederzeit dein eigenes Passwort.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.locator(".pw-reset-row")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Mitglied direkt anlegen" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("heading", { name: "Eigenes Passwort ändern (@oskar)" }),
  ).toBeVisible();
  await page.locator("#own-new-pw").fill("MobilPass2026");
  await page.locator("#own-confirm-pw").fill("MobilPass2026");
  await page
    .getByRole("button", { name: "Eigenes Passwort speichern" })
    .click();
  await expect(
    page.getByText("Dein Passwort wurde aktualisiert."),
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

test("Gemeinsame Fahrt auf dem gleichen Scooter während aktiver Fahrt auswählen und Zeit aufteilen", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=1");

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
  const launch = page
    .locator(".unlock-live-card")
    .getByRole("link", { name: "Dynamic Island" });
  const nativeUrl = "shortcuts://run-shortcut?name=Minutenclub%20Live";
  await expect(launch).toHaveAttribute("href", nativeUrl);

  const setup = page
    .locator(".unlock-live-card")
    .getByRole("button", { name: "Einrichten" });
  await setup.click();
  const islandGuide = page.getByRole("dialog", {
    name: "Dynamic Island & Sperrbildschirm",
  });
  const startTest = islandGuide.getByRole("link", { name: "Start testen" });
  await expect(startTest).toHaveAttribute("href", nativeUrl);
  await islandGuide.getByRole("button", { name: "Mit Fahrtdaten" }).click();
  const richUrl = await startTest.getAttribute("href");
  expect(richUrl).toMatch(/&input=text&text=/);
  await islandGuide.getByRole("button", { name: "Schliessen" }).click();
  await expect(launch).toHaveAttribute("href", richUrl!);

  await page.reload();
  await expect(launch).toHaveAttribute("href", richUrl!);

  // In anderen Tab wechseln -> schwebende In-App Dynamic Pill erscheint mit Timer
  await switchTab(page, "mobile", "Fahrten");
  await expect(page.locator(".dynamic-pill-bar")).toBeVisible();
  await expect(page.locator(".dynamic-pill-bar")).toContainText("Oskar & Max");
  await switchTab(page, "mobile", "Übersicht");

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

test("Statistik & Strecken-Bestzeiten auf iPhone-Breite ohne Dev-Dashboard-Zugang", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/?demo=1");

  // 1. Strecken-Bestzeiten in Statistik für normale Mitglieder prüfen
  await switchTab(page, "mobile", "Statistik");
  await expect(
    page.getByRole("heading", {
      name: "Strecken-Bestzeiten · Wer ist am schnellsten?",
    }),
  ).toBeVisible();
  await expect(page.locator(".route-record-card").first()).toBeVisible();

  // 2. Keinerlei Dev-Dashboard-Zugang in Topbar, Statistik oder Mitglieder-Einstellungen
  await assertNoGlobalAdminOrDevChrome(page, "mobile");
  await switchTab(page, "mobile", "Mitglieder");
  await assertNoGlobalAdminOrDevChrome(page, "mobile");
  await expect(page.getByText("Admin Dev-Dashboard")).toHaveCount(0);
  await expect(
    page.getByText(
      "Alle aktiven Mitglieder können Fahrten und Minutenpakete erfassen.",
    ),
  ).toBeVisible();

  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
});

test("Demo (Desktop): normales Mitglied legt Minutenpakete an (Equal-, Minuten- & CHF-Split), inkl. Persistenz & Reset", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/?demo=1");
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();

  await switchTab(page, "desktop", "Guthaben");
  const topupBtn = page.getByRole("button", { name: "Guthaben aufladen" });
  await expect(topupBtn).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Minuten manuell geben" }),
  ).toHaveCount(0);

  // Dialog öffnet sauber und schliesst per Escape mit Fokusrückkehr
  await topupBtn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Guthaben aufladen" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(topupBtn).toBeFocused();

  const packagesTable = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: "Minutenpakete" }) })
    .locator("table");
  await expect(packagesTable.locator("tbody tr")).toHaveCount(1);
  await expect(page.locator(".journal-row")).toHaveCount(15);

  // 1. Fair aufteilen (equal): August bezahlt 100 Min. / CHF 20.00 für Oskar & August (ohne Max)
  await topupBtn.click();
  await expect(
    dialog.getByRole("button", { name: "Fair aufteilen" }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByLabel("Paket gekauft von").selectOption("demo-1");
  await dialog.getByLabel("Minuten", { exact: true }).fill("100");
  await dialog.getByLabel("Paketpreis (CHF)").fill("20.00");
  await dialog.getByLabel("Max", { exact: true }).uncheck();
  await expect(dialog.locator(".allocation-status")).toContainText(
    /100 Minuten · CHF\s*20[.,]00 aufgeteilt/,
  );
  await expect(
    dialog.locator(".split-person").filter({ hasText: "Oskar" }),
  ).toContainText(/50 Min\. · CHF\s*10[.,]00/);
  await expect(
    dialog.locator(".split-person").filter({ hasText: "August" }),
  ).toContainText(/50 Min\. · CHF\s*10[.,]00/);
  await dialog.getByLabel("Notiz optional").fill("Herbstpass Equal");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);

  await expect(packagesTable.locator("tbody tr")).toHaveCount(2);
  const equalRow = packagesTable
    .locator("tbody tr")
    .filter({ hasText: "Herbstpass Equal" });
  await expect(equalRow).toContainText("August");
  await expect(equalRow).toContainText("100 Min.");
  await expect(equalRow).toContainText(/CHF\s*20[.,]00/);
  await expect(equalRow.locator(".package-shares")).toContainText(
    /Oskar:\s*CHF\s*10[.,]00\s*→\s*50 Min\./,
  );
  await expect(equalRow.locator(".package-shares")).toContainText(
    /August:\s*CHF\s*10[.,]00\s*→\s*50 Min\./,
  );
  await expect(equalRow.locator(".package-shares")).not.toContainText("Max");

  await expect(
    page.locator(".account-item").filter({ hasText: "Oskar" }),
  ).toContainText("199");
  await expect(
    page.locator(".account-item").filter({ hasText: "August" }),
  ).toContainText("197");
  await expect(
    page.locator(".account-item").filter({ hasText: "Max" }),
  ).toContainText("147");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Dein Guthaben" }),
  ).toContainText("199");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Noch nicht zugewiesen" }),
  ).toContainText("0");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Paketkäufe insgesamt" }),
  ).toContainText(/CHF\s*110[.,]00/);
  await expect(
    page.locator(".metric-card").filter({ hasText: "Paketkäufe insgesamt" }),
  ).toContainText("700 Minuten gekauft");

  await expect(page.locator(".journal-row")).toHaveCount(17);
  const creditRowsAfterEqual = page
    .locator(".journal-row")
    .filter({ hasText: "Anteil am Minutenpaket" });
  await expect(creditRowsAfterEqual).toHaveCount(2);
  await expect(creditRowsAfterEqual.filter({ hasText: "Oskar" })).toContainText(
    "+50",
  );
  await expect(
    creditRowsAfterEqual.filter({ hasText: "August" }),
  ).toContainText("+50");

  await switchTab(page, "desktop", "Übersicht");
  await expect(page.locator(".balance-number")).toContainText("199");
  await expect(
    page.getByRole("img", {
      name: "Oskar: 51 von 250 Minuten verbraucht, 199 Minuten übrig.",
    }),
  ).toBeVisible();
  await expect(
    page.locator(".metric-card").filter({ hasText: "Gemeinsamer Bestand" }),
  ).toContainText("543");

  // 2. Nach Minutenbedarf (minutes): Oskar bezahlt 90 Min. / CHF 18.00 (Oskar 60, Max 30, ohne August)
  await switchTab(page, "desktop", "Guthaben");
  await topupBtn.click();
  await dialog.getByLabel("Minuten", { exact: true }).fill("90");
  await dialog.getByLabel("Paketpreis (CHF)").fill("18.00");
  await dialog.getByRole("button", { name: "Nach Minutenbedarf" }).click();
  await expect(
    dialog.getByRole("button", { name: "Nach Minutenbedarf" }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.getByLabel("August", { exact: true }).uncheck();
  await dialog
    .getByLabel("Minutenbedarf von Oskar", { exact: true })
    .fill("60");
  await dialog.getByLabel("Minutenbedarf von Max", { exact: true }).fill("30");
  await expect(dialog.locator(".allocation-status")).toContainText(
    /90 Minuten · CHF\s*18[.,]00 aufgeteilt/,
  );
  await dialog.getByLabel("Notiz optional").fill("Winterpass Bedarf");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);

  await expect(packagesTable.locator("tbody tr")).toHaveCount(3);
  const minutesRow = packagesTable
    .locator("tbody tr")
    .filter({ hasText: "Winterpass Bedarf" });
  await expect(minutesRow).toContainText("Oskar");
  await expect(minutesRow).toContainText("90 Min.");
  await expect(minutesRow.locator(".package-shares")).toContainText(
    /Oskar:\s*CHF\s*12[.,]00\s*→\s*60 Min\./,
  );
  await expect(minutesRow.locator(".package-shares")).toContainText(
    /Max:\s*CHF\s*6[.,]00\s*→\s*30 Min\./,
  );
  await expect(
    page.locator(".account-item").filter({ hasText: "Oskar" }),
  ).toContainText("259");
  await expect(
    page.locator(".account-item").filter({ hasText: "August" }),
  ).toContainText("197");
  await expect(
    page.locator(".account-item").filter({ hasText: "Max" }),
  ).toContainText("177");

  // 3. Nach CHF-Beitrag (amount): Oskar bezahlt 60 Min. / CHF 12.00 (6 / 4 / 2 CHF)
  await topupBtn.click();
  await dialog.getByLabel("Minuten", { exact: true }).fill("60");
  await dialog.getByLabel("Paketpreis (CHF)").fill("12.00");
  await dialog.getByRole("button", { name: "Nach CHF-Beitrag" }).click();
  await expect(
    dialog.getByRole("button", { name: "Nach CHF-Beitrag" }),
  ).toHaveAttribute("aria-pressed", "true");
  await dialog.locator("#share-demo-0").fill("6.00");
  await dialog.locator("#share-demo-1").fill("4.00");
  await dialog.locator("#share-demo-2").fill("2.00");
  await expect(dialog.locator(".sum-line")).toContainText(
    /CHF\s*12[.,]00\s*\/\s*CHF\s*12[.,]00/,
  );
  await expect(dialog.locator(".allocation-status")).toContainText(
    /60 Minuten · CHF\s*12[.,]00 aufgeteilt/,
  );
  await dialog.getByLabel("Notiz optional").fill("Frühlingspass CHF");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);

  await expect(packagesTable.locator("tbody tr")).toHaveCount(4);
  const amountRow = packagesTable
    .locator("tbody tr")
    .filter({ hasText: "Frühlingspass CHF" });
  await expect(amountRow.locator(".package-shares")).toContainText(
    /Oskar:\s*CHF\s*6[.,]00\s*→\s*30 Min\./,
  );
  await expect(amountRow.locator(".package-shares")).toContainText(
    /August:\s*CHF\s*4[.,]00\s*→\s*20 Min\./,
  );
  await expect(amountRow.locator(".package-shares")).toContainText(
    /Max:\s*CHF\s*2[.,]00\s*→\s*10 Min\./,
  );
  await expect(
    page.locator(".account-item").filter({ hasText: "Oskar" }),
  ).toContainText("289");
  await expect(
    page.locator(".account-item").filter({ hasText: "August" }),
  ).toContainText("217");
  await expect(
    page.locator(".account-item").filter({ hasText: "Max" }),
  ).toContainText("187");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Paketkäufe insgesamt" }),
  ).toContainText(/CHF\s*140[.,]00/);
  await expect(
    page.locator(".metric-card").filter({ hasText: "Paketkäufe insgesamt" }),
  ).toContainText("850 Minuten gekauft");
  await expect(page.locator(".journal-row")).toHaveCount(22);
  await expect(
    page.locator(".journal-row").filter({ hasText: "Anteil am Minutenpaket" }),
  ).toHaveCount(7);

  // 4. Persistenz über Reload prüfen
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  await expect(page.locator(".balance-number")).toContainText("289");
  await expect(
    page.getByRole("img", {
      name: "Oskar: 51 von 340 Minuten verbraucht, 289 Minuten übrig.",
    }),
  ).toBeVisible();
  await expect(
    page.locator(".metric-card").filter({ hasText: "Gemeinsamer Bestand" }),
  ).toContainText("693");

  await switchTab(page, "desktop", "Guthaben");
  await expect(packagesTable.locator("tbody tr")).toHaveCount(4);
  await expect(packagesTable).toContainText("Herbstpass Equal");
  await expect(packagesTable).toContainText("Winterpass Bedarf");
  await expect(packagesTable).toContainText("Frühlingspass CHF");
  await expect(
    page.locator(".account-item").filter({ hasText: "Oskar" }),
  ).toContainText("289");
  await expect(page.locator(".journal-row")).toHaveCount(22);
  await expect(
    page.getByRole("button", { name: "Minuten manuell geben" }),
  ).toHaveCount(0);

  // 5. Demo-Reset stellt Ausgangspaket wieder her & erneutes Aufladen funktioniert sauber
  await page
    .locator(".demo-notice")
    .getByRole("button", { name: "Zurücksetzen", exact: true })
    .click();
  await expect(packagesTable.locator("tbody tr")).toHaveCount(1);
  await expect(packagesTable).toContainText("Gemeinsames Minutenpaket");
  await expect(packagesTable).not.toContainText("Herbstpass Equal");
  await expect(
    page.locator(".account-item").filter({ hasText: "Oskar" }),
  ).toContainText("149");
  await expect(
    page.locator(".account-item").filter({ hasText: "August" }),
  ).toContainText("147");
  await expect(
    page.locator(".account-item").filter({ hasText: "Max" }),
  ).toContainText("147");
  await expect(page.locator(".journal-row")).toHaveCount(15);
  await expect(
    page.locator(".metric-card").filter({ hasText: "Paketkäufe insgesamt" }),
  ).toContainText("600 Minuten gekauft");

  await topupBtn.click();
  await dialog.getByLabel("Minuten", { exact: true }).fill("30");
  await dialog.getByLabel("Paketpreis (CHF)").fill("9.00");
  await dialog.getByLabel("Notiz optional").fill("Nach Reset Paket");
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(packagesTable.locator("tbody tr")).toHaveCount(2);
  await expect(packagesTable).toContainText("Nach Reset Paket");
  await expect(
    page.locator(".account-item").filter({ hasText: "Oskar" }),
  ).toContainText("159");
  await expect(
    page.locator(".account-item").filter({ hasText: "August" }),
  ).toContainText("157");
  await expect(
    page.locator(".account-item").filter({ hasText: "Max" }),
  ).toContainText("157");
  await expect(page.locator(".journal-row")).toHaveCount(18);

  await assertNoGlobalAdminOrDevChrome(page, "desktop");
  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("Demo (Mobil 390px): Minutenpaket als Mitglied anlegen – Dialog, alle Split-Modi & Persistenz ohne Überlauf oder Fehler", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("http://localhost:3100/?demo=1");
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();

  await switchTab(page, "mobile", "Guthaben");
  const topupBtn = page.getByRole("button", { name: "Guthaben aufladen" });
  await expect(topupBtn).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Minuten manuell geben" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  // Dialog auf 390px öffnen, alle drei Split-Modi auf Überlauf prüfen & Escape testen
  await topupBtn.click();
  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Guthaben aufladen" }),
  ).toBeVisible();

  for (const modeLabel of [
    "Fair aufteilen",
    "Nach Minutenbedarf",
    "Nach CHF-Beitrag",
    "Fair aufteilen",
  ]) {
    await dialog.getByRole("button", { name: modeLabel }).click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(390);
    expect(
      await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
    ).toBe(true);
  }

  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);

  // Paket auf Mobilgerät erfassen (Max bezahlt 150 Min. / CHF 30.00 fair für alle 3)
  await topupBtn.click();
  await dialog.getByLabel("Paket gekauft von").selectOption("demo-2");
  await dialog.getByLabel("Minuten", { exact: true }).fill("150");
  await dialog.getByLabel("Paketpreis (CHF)").fill("30.00");
  await expect(dialog.locator(".allocation-status")).toContainText(
    /150 Minuten · CHF\s*30[.,]00 aufgeteilt/,
  );
  await dialog.getByLabel("Notiz optional").fill("Mobilpaket Zürich");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await dialog.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);

  const packagesTable = page
    .locator("section.panel")
    .filter({ has: page.getByRole("heading", { name: "Minutenpakete" }) })
    .locator("table");
  await expect(packagesTable.locator("tbody tr")).toHaveCount(2);
  const mobilePkgRow = packagesTable
    .locator("tbody tr")
    .filter({ hasText: "Mobilpaket Zürich" });
  await expect(mobilePkgRow).toContainText("Max");
  await expect(mobilePkgRow).toContainText("150 Min.");
  await expect(mobilePkgRow).toContainText(/CHF\s*30[.,]00/);
  await expect(mobilePkgRow.locator(".package-shares")).toContainText(
    /Oskar:\s*CHF\s*10[.,]00\s*→\s*50 Min\./,
  );
  await expect(
    page.locator(".account-item").filter({ hasText: "Oskar" }),
  ).toContainText("199");
  await expect(
    page.locator(".account-item").filter({ hasText: "August" }),
  ).toContainText("197");
  await expect(
    page.locator(".account-item").filter({ hasText: "Max" }),
  ).toContainText("197");
  await expect(
    page.locator(".journal-row").filter({ hasText: "Anteil am Minutenpaket" }),
  ).toHaveCount(3);
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  // Übersicht & Reload-Persistenz auf 390px prüfen
  await switchTab(page, "mobile", "Übersicht");
  await expect(page.locator(".balance-number")).toContainText("199");
  await expect(
    page.locator(".metric-card").filter({ hasText: "Gemeinsamer Bestand" }),
  ).toContainText("593");
  await assertNoGlobalAdminOrDevChrome(page, "mobile");

  await page.reload();
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  await expect(page.locator(".balance-number")).toContainText("199");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await context.close();
});

test("Demo (Desktop): Konto selbst löschen – sicherer Fokus, Escape-Fokusrückkehr, lokaler Speicher-Reset & sauberer Neustart", async ({
  page,
}) => {
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("/?demo=1");
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  await expect(page.locator(".balance-number")).toContainText("149");

  // 1. Eigene Fahrt anlegen, Live-Entsperr-Timer starten, Feedback-Vorschau-Key setzen & eigenen Namen ändern
  await page.getByRole("button", { name: "Fahrt eintragen" }).click();
  await page.getByLabel("Fahrzeit (Minuten)").fill("14");
  await page.getByLabel("Pause (Minuten)").fill("1");
  await page.getByLabel("Notiz optional").fill("Löschtest-Fahrt");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Löschtest-Fahrt", { exact: true }),
  ).toBeVisible();
  await expect(page.locator(".balance-number")).toContainText("134");

  await page.getByRole("button", { name: "Dott entsperren" }).click();
  await page.getByRole("button", { name: "Fahrt starten" }).click();
  await expect(page.getByText(/Scooter entsperrt/)).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem(
      "minutenclub-feedback-preview-v1",
      JSON.stringify([
        {
          id: "preview-delete-1",
          group_id: "demo-group",
          member_id: "demo-0",
          category: "idea",
          message: "Lokale Vorschau vor Löschung",
          page: "Übersicht",
          created_at: new Date().toISOString(),
        },
      ]),
    );
  });

  await switchTab(page, "desktop", "Mitglieder");
  await page
    .getByRole("button", { name: "Name ändern von Oskar", exact: true })
    .click();
  await page.getByLabel("Anzeigename").fill("Oskar Löschtest");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Oskar Löschtest (du)", { exact: true }),
  ).toBeVisible();

  // Alle bestehenden Negativprüfungen für normale Mitglieder bleiben vollständig intakt
  await assertNoAdminOrDevControls(page, "desktop", "Oskar Löschtest");

  const storageBeforeDelete = await page.evaluate(() => ({
    demo: localStorage.getItem("minutenclub-demo-v1"),
    unlock: localStorage.getItem("minutenclub-active-unlock-v1"),
    feedbackPreview: localStorage.getItem("minutenclub-feedback-preview-v1"),
  }));
  expect(storageBeforeDelete.demo).not.toBeNull();
  expect(storageBeforeDelete.unlock).not.toBeNull();
  expect(storageBeforeDelete.feedbackPreview).not.toBeNull();

  // 2. "Konto löschen" in "Dein Zugang" öffnen -> sicherer Fokus auf "Abbrechen", Escape gibt Fokus zurück
  const deleteTrigger = page
    .locator(".preference-row.danger-row")
    .getByRole("button", { name: "Konto löschen", exact: true });
  await expect(deleteTrigger).toBeVisible();
  await deleteTrigger.click();

  const dialog = page.locator("dialog.delete-account-dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Konto löschen" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Lokale Demo:", { exact: false }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Abbrechen", exact: true }),
  ).toBeFocused();

  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(deleteTrigger).toBeFocused();

  // Nach Abbruch per Escape sind alle lokalen Daten weiterhin vorhanden
  expect(
    await page.evaluate(() => localStorage.getItem("minutenclub-demo-v1")),
  ).not.toBeNull();

  // 3. Erneut öffnen und endgültig löschen -> Startseite ohne ?demo=1, Status-Banner, alle Storage-Keys gelöscht
  await deleteTrigger.click();
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Abbrechen", exact: true }),
  ).toBeFocused();
  await dialog
    .getByRole("button", { name: "Konto endgültig löschen", exact: true })
    .click();

  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Demo ausprobieren" }),
  ).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
  await expect(page).toHaveURL(/\/$/);

  const statusBanner = page.locator('.status-banner[role="status"]');
  await expect(statusBanner).toBeVisible();
  await expect(statusBanner).toHaveText(
    "Demo-Konto gelöscht und lokale Beispieldaten zurückgesetzt.",
  );

  const storageAfterDelete = await page.evaluate(() => ({
    demo: localStorage.getItem("minutenclub-demo-v1"),
    unlock: localStorage.getItem("minutenclub-active-unlock-v1"),
    feedbackPreview: localStorage.getItem("minutenclub-feedback-preview-v1"),
  }));
  expect(storageAfterDelete).toEqual({
    demo: null,
    unlock: null,
    feedbackPreview: null,
  });

  // 4. Erneuter Klick auf "Demo ausprobieren" startet eine komplett frische Demo-Sitzung
  await page.getByRole("button", { name: "Demo ausprobieren" }).click();
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  await expect(page.locator(".balance-number")).toContainText("149");
  await expect(page.getByText("Löschtest-Fahrt", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Oskar Löschtest")).toHaveCount(0);
  await expect(page.locator(".unlock-live-card")).toHaveCount(0);
  await expect(page.locator(".dynamic-pill-bar")).toHaveCount(0);
  await assertNoGlobalAdminOrDevChrome(page, "desktop");

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
});

test("Demo (Mobil 390px): Konto selbst löschen – kein Überlauf, Escape-Fokusrückkehr, lokaler Speicher-Reset & frischer Neustart", async ({
  browser,
}) => {
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  const consoleErrors: string[] = [];
  page.on("pageerror", (e) => pageErrors.push(e.message));
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  await page.goto("http://localhost:3100/?demo=1");
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  await expect(page.locator(".balance-number")).toContainText("149");

  // 1. Eigene Fahrt anlegen, Live-Entsperr-Timer starten, Feedback-Vorschau-Key setzen & eigenen Namen ändern
  await page.getByRole("button", { name: "Fahrt eintragen" }).click();
  await page.getByLabel("Fahrzeit (Minuten)").fill("14");
  await page.getByLabel("Pause (Minuten)").fill("1");
  await page.getByLabel("Notiz optional").fill("Mobil-Löschfahrt");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(page.locator(".balance-number")).toContainText("134");

  await page.getByRole("button", { name: "Dott entsperren" }).click();
  await page.getByRole("button", { name: "Fahrt starten" }).click();
  await expect(page.getByText(/Scooter entsperrt/)).toBeVisible();

  await page.evaluate(() => {
    localStorage.setItem(
      "minutenclub-feedback-preview-v1",
      JSON.stringify([
        {
          id: "preview-delete-mobile-1",
          group_id: "demo-group",
          member_id: "demo-0",
          category: "bug",
          message: "Mobile Vorschau vor Löschung",
          page: "Mitglieder",
          created_at: new Date().toISOString(),
        },
      ]),
    );
  });

  await switchTab(page, "mobile", "Mitglieder");
  await page
    .getByRole("button", { name: "Name ändern von Oskar", exact: true })
    .click();
  await page.getByLabel("Anzeigename").fill("Oskar Mobiltest");
  await page.getByRole("button", { name: "Speichern", exact: true }).click();
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(
    page.getByText("Oskar Mobiltest (du)", { exact: true }),
  ).toBeVisible();

  // Vollständige Negativprüfung + 390px-Überlaufprüfung über alle Tabs
  await assertNoAdminOrDevControls(page, "mobile", "Oskar Mobiltest");

  const storageBeforeDelete = await page.evaluate(() => ({
    demo: localStorage.getItem("minutenclub-demo-v1"),
    unlock: localStorage.getItem("minutenclub-active-unlock-v1"),
    feedbackPreview: localStorage.getItem("minutenclub-feedback-preview-v1"),
  }));
  expect(storageBeforeDelete.demo).not.toBeNull();
  expect(storageBeforeDelete.unlock).not.toBeNull();
  expect(storageBeforeDelete.feedbackPreview).not.toBeNull();

  // 2. "Konto löschen" öffnen -> Fokus auf "Abbrechen", 390px-Check, Escape gibt Fokus zurück
  const deleteTrigger = page
    .locator(".preference-row.danger-row")
    .getByRole("button", { name: "Konto löschen", exact: true });
  await expect(deleteTrigger).toBeVisible();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await deleteTrigger.click();

  const dialog = page.locator("dialog.delete-account-dialog");
  await expect(dialog).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Konto löschen" }),
  ).toBeVisible();
  await expect(
    dialog.getByRole("button", { name: "Abbrechen", exact: true }),
  ).toBeFocused();
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  expect(
    await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth + 1),
  ).toBe(true);

  await page.keyboard.press("Escape");
  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(deleteTrigger).toBeFocused();

  // 3. Erneut öffnen und endgültig löschen -> Startseite ohne ?demo=1, Status-Banner, alle Storage-Keys gelöscht
  await deleteTrigger.click();
  await expect(dialog).toBeVisible();
  await dialog
    .getByRole("button", { name: "Konto endgültig löschen", exact: true })
    .click();

  await expect(page.locator("dialog")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Demo ausprobieren" }),
  ).toBeVisible();
  expect(new URL(page.url()).search).toBe("");
  await expect(page).toHaveURL(/\/$/);

  const statusBanner = page.locator('.status-banner[role="status"]');
  await expect(statusBanner).toBeVisible();
  await expect(statusBanner).toHaveText(
    "Demo-Konto gelöscht und lokale Beispieldaten zurückgesetzt.",
  );
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);

  const storageAfterDelete = await page.evaluate(() => ({
    demo: localStorage.getItem("minutenclub-demo-v1"),
    unlock: localStorage.getItem("minutenclub-active-unlock-v1"),
    feedbackPreview: localStorage.getItem("minutenclub-feedback-preview-v1"),
  }));
  expect(storageAfterDelete).toEqual({
    demo: null,
    unlock: null,
    feedbackPreview: null,
  });

  // 4. "Demo ausprobieren" startet komplett frisch ohne alten Namen, alte Fahrt oder Live-Timer
  await page.getByRole("button", { name: "Demo ausprobieren" }).click();
  await expect(page.getByRole("heading", { name: "Hoi Oskar" })).toBeVisible();
  await expect(page.locator(".balance-number")).toContainText("149");
  await expect(page.getByText("Mobil-Löschfahrt", { exact: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Oskar Mobiltest")).toHaveCount(0);
  await expect(page.locator(".unlock-live-card")).toHaveCount(0);
  await expect(page.locator(".dynamic-pill-bar")).toHaveCount(0);
  await assertNoGlobalAdminOrDevChrome(page, "mobile");

  expect(pageErrors).toEqual([]);
  expect(consoleErrors).toEqual([]);
  await context.close();
});
