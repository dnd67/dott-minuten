import { test, expect, type Page } from "@playwright/test";
import { DEMO_USER, demoSnapshot } from "../../lib/demo";
import type { Snapshot } from "../../lib/domain";
import { availableFeatures } from "../../lib/onboarding";

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
  await expect(page.locator(".nav-badge")).toHaveCount(0);
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

  // 3. Guthaben (Nur-Lese-Ansicht ohne Admin-Buchungen)
  await switchTab(page, mode, "Guthaben");
  await assertNoGlobalAdminOrDevChrome(page, mode);
  await expect(
    page.getByRole("button", { name: "Minuten manuell geben" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Guthaben aufladen" }),
  ).toHaveCount(0);
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
  await page.getByRole("button", { name: "Überspringen" }).click();
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

  // Guthaben: schreibgeschützte Konten, Pakete & Journal
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
  const tour = page.getByRole("dialog");
  await expect(tour.getByText("Neu für dich")).toBeVisible();
  await expect(
    tour.getByRole("button", { name: /Deine Werkzeuge als Admin/ }),
  ).toHaveCount(0);
  await tour.getByRole("button", { name: "Überspringen" }).click();
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
  await page.getByRole("button", { name: "Überspringen" }).click();
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
  // 1. Interaktive Onboarding-Tour von der Startseite aus testen
  await page.getByRole("button", { name: "So funktioniert's" }).click();
  await expect(
    page.getByRole("heading", { name: /Dein Minutenpass/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "22 Min." }).click();
  await page.getByRole("button", { name: "3 Min." }).click();
  await expect(page.locator(".sim-pass-preview")).toContainText("25 Min.");
  await page.keyboard.press("ArrowRight");
  await expect(
    page.getByRole("heading", { name: "Ein Paket, eure Anteile" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Nach CHF", exact: true }).click();
  await expect(page.locator(".ob-split-legend")).toContainText("150 Min.");
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(390);
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page.getByRole("button", { name: "+ Max" }).click();
  await expect(page.locator(".ob-rider-avatars")).toContainText("je 7,5 Min.");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(page.locator(".ob-island-clock")).toHaveText(/\d{2}:\d{2}/);
  await page.getByRole("button", { name: "Kompakt", exact: true }).click();
  await expect(page.locator(".ob-island-capsule")).toHaveClass(/compact/);
  await page.getByRole("button", { name: "Erweitert", exact: true }).click();
  await expect(page.locator(".ob-island-capsule")).toHaveClass(/expanded/);
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await page
    .getByRole("button", { name: "Bellevue → Seefeld", exact: true })
    .click();
  await expect(page.locator(".ob-podium-bars")).toContainText("5 Min.");
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Dein Zugang zur Crew" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Weiter", exact: true }).click();
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

  // 4. Feedback-Fenster (Vorschau für späteren Launch) prüfen
  await page.getByRole("button", { name: "Feedback geben" }).click();
  await expect(page.getByText("Vorbereitet für Launch")).toBeVisible();
  await page.getByLabel(/Deine Nachricht/).fill("Super schnelle Entsperrung!");
  await page.getByRole("button", { name: "Feedback senden" }).click();
  await expect(
    page.getByRole("heading", { name: "Danke für deine Rückmeldung!" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Fertig" }).click();

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
  await page.getByRole("button", { name: "Überspringen" }).click();

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
  await expect(dialog.locator(".ob-split-legend")).toContainText("210 Min.");
  expect(
    await dialog
      .locator(".tour-slide")
      .evaluate((el) => getComputedStyle(el).animationName),
  ).toBe("none");
  expect(await dialog.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
    true,
  );
  await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
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
  ]) {
    await dialog.getByRole("button", { name: "Weiter", exact: true }).click();
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
  await page.goto("/");
  await page.evaluate(
    (seen) =>
      localStorage.setItem("minutenclub-demo-tour-v2", JSON.stringify(seen)),
    availableFeatures(false).filter((id) => id !== "live-cockpit"),
  );
  await page.goto("/?demo=1");
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading")).toHaveText(
    "Deine Fahrt bleibt im Blick",
  );
  await expect(dialog.getByLabel("Schritt 1 von 1")).toBeVisible();
  await dialog.getByRole("button", { name: "Kompakt" }).click();
  await expect(dialog.locator(".ob-island-capsule")).toHaveClass(/compact/);
  await dialog.getByRole("button", { name: "Alles klar" }).click();
  await page.reload();
  await page.getByRole("button", { name: "Fahrt eintragen" }).click();
  await expect(page.getByLabel("Fahrzeit (Minuten)")).toBeVisible();
});

test("Die abgeschlossene Fünf-Schritt-Tour wird in der Demo übernommen", async ({
  page,
}) => {
  await page.goto("/");
  await page.evaluate(() =>
    localStorage.setItem("minutenclub-onboarding-done-v2", "1"),
  );
  await page.goto("/?demo=1");
  await expect(page.getByRole("dialog").getByRole("heading")).toHaveText(
    "Dein Zugang zur Crew",
  );
  await expect(
    page.getByLabel("Schritt 1 von 1", { exact: true }),
  ).toBeVisible();
});
