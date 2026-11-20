import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocateMinutes,
  groupSharedRides,
  moneyRappen,
  rideDraft,
  splitRideSeconds,
  summary,
  wholeMinutes,
  type Action,
  type RpcArgs,
  type Snapshot,
} from "../lib/domain";
import {
  DEMO_USER,
  demoAction,
  demoSnapshot,
  normalizeDemoSnapshot,
} from "../lib/demo";
import {
  computeRideInsights,
  computeRouteRecords,
  matchGroupPlace,
  resolvePlaceLabel,
} from "../lib/location";
import { extractInviteToken } from "../lib/accounts";
import {
  buildLiveRidePayload,
  buildStartLiveActivityUrl,
  computeLiveRideMetrics,
  formatElapsedClock,
} from "../lib/live-activity";

function adminDemoSnapshot(): Snapshot {
  const snap = demoSnapshot();
  const oskar = snap.members.find((m) => m.user_id === DEMO_USER);
  if (oskar) oskar.role = "admin";
  return snap;
}

test("Fahrt und Pause werden addiert; Freischaltung gehört nicht zum Buchungsmodell", () => {
  assert.deepEqual(rideDraft("14", "1"), {
    duration_seconds: 840,
    pause_seconds: 60,
    charged_seconds: 900,
    source: "manual",
  });
  assert.throws(() => rideDraft("0", "0"));
  for (const invalid of ["-1", "1.4", "1e3", "NaN", "", "10000001"])
    assert.throws(() => wholeMinutes(invalid));
});
test("CHF werden ohne Gleitkomma-Abschneiden in Rappen umgerechnet", () => {
  assert.equal(moneyRappen("90.00"), 9000);
  assert.equal(moneyRappen("0,29"), 29);
  assert.equal(moneyRappen("1.1"), 110);
  for (const invalid of ["-1", "1.001", "abc", "1e3", "Infinity"])
    assert.throws(() => moneyRappen(invalid));
});
test("Storno erzeugt Gegenbuchung und nimmt Fahrt aus der Statistik", () => {
  const before = adminDemoSnapshot(),
    ride = before.rides[0],
    old = summary(before, ride.member_id);
  const after = demoAction(before, "void_ride", {
    p_request_id: "void-1",
    p_ride_id: ride.id,
    p_reason: "Doppelt",
  });
  assert.equal(summary(after, ride.member_id).balance, old.balance + 900);
  assert.equal(summary(after, ride.member_id).consumed, old.consumed - 900);
  assert.equal(after.rides.length, before.rides.length);
  const twice = demoAction(after, "void_ride", {
    p_request_id: "void-2",
    p_ride_id: ride.id,
    p_reason: "Doppelt",
  });
  assert.equal(twice.entries.length, after.entries.length);
});

test("Beiträge werden exakt nach Anteil verteilt, auch bei Rundung und hohen Rappenbeträgen", () => {
  const inputs = [
    { member_id: "a", amount_rappen: 3000 },
    { member_id: "b", amount_rappen: 4500 },
    { member_id: "c", amount_rappen: 1500 },
  ];
  assert.deepEqual(
    allocateMinutes(600, 9000, inputs).map((c) => c.minutes),
    [200, 300, 100],
  );
  assert.deepEqual(
    allocateMinutes(
      10,
      3,
      inputs.map((c) => ({ ...c, amount_rappen: 1 })),
    ).map((c) => c.minutes),
    [4, 3, 3],
  );
  assert.deepEqual(
    allocateMinutes(
      10,
      3,
      inputs.map((c) => ({ ...c, amount_rappen: 1 })).reverse(),
    ).map((c) => c.minutes),
    [3, 3, 4],
  );
  assert.deepEqual(
    allocateMinutes(10000000, 1000000000000, [
      { member_id: "a", amount_rappen: 999999999999 },
      { member_id: "b", amount_rappen: 1 },
    ]).map((c) => c.minutes),
    [10000000, 0],
  );
  assert.throws(() => allocateMinutes(600, 9000, inputs.slice(0, 1)));
  assert.throws(() => allocateMinutes(600, 9000, [inputs[0], inputs[0]]));
  assert.throws(() =>
    allocateMinutes(600, 0, [{ member_id: "a", amount_rappen: 0 }]),
  );
});
test("Kontingent enthält nur Gutschriften, keine Storno-Gegenbuchungen", () => {
  const data = adminDemoSnapshot();
  const after = demoAction(data, "void_ride", {
    p_request_id: "quota-void",
    p_ride_id: data.rides[0].id,
    p_reason: "Fehler",
  });
  assert.equal(summary(after, "demo-0").quota, 200 * 60);
  assert.equal(
    summary(after, "demo-0").balance + summary(after, "demo-0").consumed,
    200 * 60,
  );
});

test("Ortszuordnung bevorzugt benannte Gruppenorte vor Zürich-Hubs und rundet unbekannte Orte", () => {
  const data = demoSnapshot();
  data.rides.push({
    ...data.rides[0],
    id: "custom-spot-ride",
    end_label: "Unser Büro",
    end_lat: 47.3781,
    end_lng: 8.5405,
  });
  // Innerhalb 220 m vom eigenen Gruppenort gewinnt der eigene Name vor "Zürich HB".
  assert.equal(resolvePlaceLabel(47.378, 8.5404, data.rides), "Unser Büro");
  // Bekannter Zürcher Ort ohne eigenen Gruppentreffer:
  assert.equal(resolvePlaceLabel(47.4083, 8.5067, []), "ETH Hönggerberg");
  // Ausserhalb bekannter Orte: keine externe API, sauber gerundeter Fallback.
  assert.equal(resolvePlaceLabel(46.948, 7.4474, []), "Standort (46.95, 7.45)");
});

test("Routen- und Uhrzeit-Statistik wertet Wer, Wie oft, Wann und Wohin ohne Stornos aus", () => {
  const before = adminDemoSnapshot();
  const withCustom = demoAction(before, "record_ride", {
    p_request_id: "loc-ride-1",
    p_drive_minutes: 11,
    p_pause_minutes: 1,
    p_occurred_at: "2026-06-15T06:30:00.000Z", // 08:30 Zürich-Sommerzeit (Morgen)
    p_note: "Pendeln",
    p_start_label: "Zürich HB",
    p_start_lat: 47.3779123,
    p_start_lng: 8.5403123,
    p_end_label: "ETH Polyterrasse",
    p_end_lat: 47.3763123,
    p_end_lng: 8.5476123,
  });
  const savedRide = withCustom.rides.find((r) => r.id === "loc-ride-1")!;
  assert.equal(savedRide.start_lat, 47.3779);
  assert.equal(savedRide.end_lng, 8.5476);

  const insights = computeRideInsights(withCustom.rides, withCustom.members);
  assert.equal(insights.totalRides, 13);
  assert.equal(insights.locatedRideCount, 13);
  const eth = insights.destinations.find((d) => d.label === "ETH Polyterrasse");
  assert.ok(eth);
  assert.equal(eth.count, 2);
  assert.equal(eth.riders.length, 2);

  // Stornierte Fahrt verschwindet aus Ziel- und Uhrzeit-Statistik:
  const afterVoid = demoAction(withCustom, "void_ride", {
    p_request_id: "void-loc-1",
    p_ride_id: "loc-ride-1",
    p_reason: "Teststorno",
  });
  const afterInsights = computeRideInsights(afterVoid.rides, afterVoid.members);
  assert.equal(afterInsights.totalRides, 12);
  assert.equal(
    afterInsights.destinations.find((d) => d.label === "ETH Polyterrasse")
      ?.count,
    1,
  );
});

test("Demo speichert Feedback idempotent und prüft Kategorien", () => {
  const base = demoSnapshot();
  const once = demoAction(base, "submit_feedback", {
    p_request_id: "fb-1",
    p_category: "idea",
    p_message: "Favoriten beim Entsperren",
    p_page: "Übersicht",
  });
  const twice = demoAction(once, "submit_feedback", {
    p_request_id: "fb-1",
    p_category: "idea",
    p_message: "Favoriten beim Entsperren",
    p_page: "Übersicht",
  });
  assert.equal(twice.feedback?.length, 1);
  assert.equal(twice.feedback?.[0].message, "Favoriten beim Entsperren");
  assert.throws(() =>
    demoAction(base, "submit_feedback", {
      p_request_id: "fb-bad",
      p_category: "idea",
      p_message: "   ",
      p_page: "Übersicht",
    }),
  );
});

test("extractInviteToken akzeptiert sowohl rohe Codes als auch ganze Einladungslinks", () => {
  assert.equal(extractInviteToken("  9f8e7d6c5b4a  "), "9f8e7d6c5b4a");
  assert.equal(
    extractInviteToken(
      "https://dott-minuten.vercel.app/?invite=9f8e7d6c5b4a#start",
    ),
    "9f8e7d6c5b4a",
  );
  assert.equal(extractInviteToken(""), "");
});

test("Geteilte Fahrt auf dem gleichen Scooter teilt Zeit exakt auf, gruppiert Anzeige und erstattet alle bei Storno", () => {
  // 14 Min. Fahrt + 1 Min. Pause = 900s auf 2 Personen -> exakt 420s + 30s = 450s (7,5 Min.) pro Person
  const two = splitRideSeconds(14, 1, ["demo-0", "demo-2"]);
  assert.deepEqual(two, [
    {
      member_id: "demo-0",
      duration_seconds: 420,
      pause_seconds: 30,
      charged_seconds: 450,
    },
    {
      member_id: "demo-2",
      duration_seconds: 420,
      pause_seconds: 30,
      charged_seconds: 450,
    },
  ]);

  // 10 Min. auf 3 Personen -> exakt 200s pro Person (600s gesamt)
  const three = splitRideSeconds(10, 0, ["m3", "m1", "m2"]);
  assert.equal(
    three.reduce((n, s) => n + s.charged_seconds, 0),
    600,
  );
  assert.deepEqual(
    three.map((s) => s.charged_seconds),
    [200, 200, 200],
  );

  // Demo-Buchung + Storno für Oskar & Max auf einem Scooter:
  const base = adminDemoSnapshot();
  const oskarBefore = summary(base, "demo-0").balance;
  const maxBefore = summary(base, "demo-2").balance;
  const groupBefore = summary(base).inventory;

  const afterShared = demoAction(base, "record_ride", {
    p_request_id: "shared-ride-1",
    p_occurred_at: new Date().toISOString(),
    p_drive_minutes: 14,
    p_pause_minutes: 1,
    p_note: "Zu zweit zum See",
    p_start_label: "Zürich HB",
    p_end_label: "Bürkliplatz",
    p_co_rider_ids: ["demo-2"],
  });

  assert.equal(summary(afterShared, "demo-0").balance, oskarBefore - 450);
  assert.equal(summary(afterShared, "demo-2").balance, maxBefore - 450);
  assert.equal(summary(afterShared).inventory, groupBefore - 900);

  // Anzeige gruppiert beide Zeilen zu 1 Fahrt, Statistik zählt 1 Fahrt aber beide Personen:
  const grouped = groupSharedRides(afterShared.rides);
  const sharedGroup = grouped.find((g) => g.key === "shared-ride-1");
  assert.ok(sharedGroup);
  assert.equal(sharedGroup.parts.length, 2);
  assert.equal(sharedGroup.charged_seconds, 900);

  const insights = computeRideInsights(afterShared.rides, afterShared.members);
  assert.equal(
    insights.totalRides,
    computeRideInsights(base.rides, base.members).totalRides + 1,
  );

  // Storno erstattet BEIDEN ihre 450s zurück:
  const afterVoid = demoAction(afterShared, "void_ride", {
    p_request_id: "void-shared-1",
    p_ride_id: "shared-ride-1",
    p_reason: "Teststorno geteilt",
  });
  assert.equal(summary(afterVoid, "demo-0").balance, oskarBefore);
  assert.equal(summary(afterVoid, "demo-2").balance, maxBefore);
  assert.equal(summary(afterVoid).inventory, groupBefore);
});

test("Live-Fahrt-Metriken und iPhone-Kurzbefehl-URL für Dynamic Island werden korrekt berechnet", () => {
  assert.equal(formatElapsedClock(0), "00:00");
  assert.equal(formatElapsedClock(252), "04:12");
  assert.equal(formatElapsedClock(3735), "1:02:15");

  const start = "2026-11-19T20:00:00.000Z";
  const now = new Date("2026-11-19T20:10:00.000Z").getTime();
  const metrics = computeLiveRideMetrics({
    startedAt: start,
    nowMs: now,
    ownBalanceSeconds: 12000, // 200 Min.
    riderCount: 2,
    costPerSecondRappen: 15 / 60, // 15 Rp./Min.
  });
  assert.equal(metrics.elapsedClock, "10:00");
  assert.equal(metrics.ownShareSeconds, 300); // 5 Min. pro Person
  assert.equal(metrics.projectedBalanceSeconds, 11700); // 195 Min. übrig
  assert.equal(metrics.estimatedCostRappen, 75); // CHF 0.75

  const payload = buildLiveRidePayload({
    riderNames: ["Oskar", "Max"],
    startLabel: "Zürich HB",
    remainingSeconds: 11700,
    groupName: "Zürich Crew",
    startedAt: start,
  });
  assert.equal(payload.title, "Dott · Oskar & Max (÷2)");
  assert.match(payload.subtitle, /Zürich HB/);
  assert.match(payload.subtitle, /195 Min\. übrig/);

  const url = buildStartLiveActivityUrl(payload);
  assert.ok(
    url.startsWith(
      "shortcuts://run-shortcut?name=Minutenclub%20Live&input=text&text=",
    ),
  );
});

test("100-m-Crew-Orte werden exakt erkannt und Strecken-Bestzeiten nutzen volle Scooter-Fahrzeit", () => {
  const places = [
    {
      id: "p1",
      group_id: "g1",
      label: "Test-Treffpunkt",
      address: "Bahnhofplatz 1, 8001 Zürich",
      lat: 47.3779,
      lng: 8.5403,
      radius_meters: 100,
      active: true,
    },
  ];
  // ~45 m entfernt -> Treffer innerhalb 100 m
  assert.equal(
    matchGroupPlace(47.3783, 8.5403, places)?.label,
    "Test-Treffpunkt",
  );
  assert.equal(
    resolvePlaceLabel(47.3783, 8.5403, [], places),
    "Test-Treffpunkt",
  );
  // ~220 m entfernt -> ausserhalb 100 m
  assert.equal(matchGroupPlace(47.3799, 8.5403, places), null);

  // Strecken-Bestzeiten: geteilte 14-Min.-Fahrt zählt als 14 Min. (nicht 7 Min.!)
  const base = demoSnapshot();
  const withShared = demoAction(base, "record_ride", {
    p_request_id: "speed-shared-1",
    p_occurred_at: new Date().toISOString(),
    p_drive_minutes: 14,
    p_pause_minutes: 0,
    p_note: "Geteilte Strecke",
    p_start_label: "Zürich HB",
    p_start_lat: 47.3779,
    p_start_lng: 8.5403,
    p_end_label: "ETH Polyterrasse",
    p_end_lat: 47.3763,
    p_end_lng: 8.5476,
    p_co_rider_ids: ["demo-2"],
    p_start_gps: true,
    p_end_gps: true,
    p_unlocked_via_app: true,
  });
  const records = computeRouteRecords(withShared.rides, withShared.members, []);
  const hbToEth = records.find(
    (r) => r.startLabel === "Zürich HB" && r.endLabel === "ETH Polyterrasse",
  );
  assert.ok(hbToEth);
  // Geteilte 14-Min.-Fahrt zählt als 840s (14 Min.) volle Scooter-Zeit, NICHT 420s (7 Min.)!
  assert.equal(hbToEth.fastest.seconds, 14 * 60);

  // Eine schnellere 10-Min.-Solofahrt übernimmt den Streckenrekord:
  const withFastSolo = demoAction(withShared, "record_ride", {
    p_request_id: "speed-solo-1",
    p_occurred_at: new Date().toISOString(),
    p_drive_minutes: 10,
    p_pause_minutes: 0,
    p_note: "Schnelle Fahrt",
    p_start_label: "Zürich HB",
    p_start_lat: 47.3779,
    p_start_lng: 8.5403,
    p_end_label: "ETH Polyterrasse",
    p_end_lat: 47.3763,
    p_end_lng: 8.5476,
    p_co_rider_ids: [],
    p_start_gps: true,
    p_end_gps: true,
    p_unlocked_via_app: false,
  });
  const updated = computeRouteRecords(
    withFastSolo.rides,
    withFastSolo.members,
    [],
  ).find(
    (r) => r.startLabel === "Zürich HB" && r.endLabel === "ETH Polyterrasse",
  );
  assert.ok(updated);
  assert.equal(updated.tripCount, 2);
  assert.equal(updated.fastest.seconds, 10 * 60);
});

test("Demo-Standardzustand: Oskar ist normales aktives Mitglied, August ist Admin, keine Reset-Anfragen", () => {
  const snap = demoSnapshot();
  const oskar = snap.members.find((m) => m.id === "demo-0");
  const august = snap.members.find((m) => m.id === "demo-1");
  const max = snap.members.find((m) => m.id === "demo-2");

  assert.ok(oskar);
  assert.equal(oskar.user_id, DEMO_USER);
  assert.equal(oskar.display_name, "Oskar");
  assert.equal(oskar.role, "member");
  assert.equal(oskar.active, true);

  assert.ok(august);
  assert.equal(august.display_name, "August");
  assert.equal(august.role, "admin");
  assert.equal(august.active, true);

  assert.ok(max);
  assert.equal(max.display_name, "Max");
  assert.equal(max.role, "member");
  assert.equal(max.active, true);

  assert.deepEqual(snap.reset_requests, []);
});

test("normalizeDemoSnapshot bereinigt veraltete oder manipulierte Admin-Snapshots und bewahrt eigene Nutzerdaten", () => {
  const withUserChanges = demoAction(
    demoAction(demoSnapshot(), "record_ride", {
      p_request_id: "keep-own-ride",
      p_occurred_at: "2026-11-19T12:00:00.000Z",
      p_drive_minutes: 8,
      p_pause_minutes: 2,
      p_note: "Eigene Fahrt bleibt",
      p_start_label: "Zürich HB",
      p_end_label: "Bellevue",
    }),
    "rename_member",
    {
      p_member_id: "demo-0",
      p_display_name: "Oskar Privat",
    },
  );
  const customPwTimestamp = "2026-11-20T07:15:00.000Z";
  const tampered: Snapshot = structuredClone(withUserChanges);
  tampered.members[0].role = "admin";
  tampered.members[0].active = false;
  tampered.members[1].role = "member";
  tampered.members[2].role = "member";
  const oskarAcc = tampered.accounts?.find((a) => a.user_id === DEMO_USER);
  assert.ok(oskarAcc);
  oskarAcc.password_updated_at = customPwTimestamp;
  tampered.reset_requests = [
    {
      id: "reset-legacy-1",
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
      id: "fb-own",
      group_id: tampered.group.id,
      member_id: "demo-0",
      category: "idea",
      message: "Eigenes Feedback",
      page: "Übersicht",
      created_at: "2026-11-19T19:00:00.000Z",
    },
    {
      id: "fb-august",
      group_id: tampered.group.id,
      member_id: "demo-1",
      category: "bug",
      message: "Fremdes Feedback von August",
      page: "Fahrten",
      created_at: "2026-11-19T19:05:00.000Z",
    },
    {
      id: "fb-max",
      group_id: tampered.group.id,
      member_id: "demo-2",
      category: "praise",
      message: "Fremdes Feedback von Max",
      page: "Statistik",
      created_at: "2026-11-19T19:10:00.000Z",
    },
  ];

  const clean = normalizeDemoSnapshot(tampered);

  const cleanOskar = clean.members.find((m) => m.user_id === DEMO_USER);
  const cleanAugust = clean.members.find((m) => m.id === "demo-1");
  const cleanMax = clean.members.find((m) => m.id === "demo-2");

  assert.ok(cleanOskar);
  assert.equal(cleanOskar.role, "member");
  assert.equal(cleanOskar.active, true);
  assert.equal(cleanOskar.display_name, "Oskar Privat");

  assert.ok(cleanAugust);
  assert.equal(cleanAugust.role, "admin");
  assert.equal(cleanAugust.active, true);

  assert.ok(cleanMax);
  assert.equal(cleanMax.role, "member");

  assert.deepEqual(clean.reset_requests, []);
  assert.deepEqual(
    clean.feedback?.map((f) => f.id),
    ["fb-own"],
  );
  assert.ok(clean.rides.some((r) => r.id === "keep-own-ride"));
  assert.equal(
    clean.accounts?.find((a) => a.user_id === DEMO_USER)?.password_updated_at,
    customPwTimestamp,
  );

  // Wenn alle Mitglieder nur "member" sind, wird ein aktives Nicht-DEMO_USER-Mitglied zum Admin:
  const allMembers = demoSnapshot();
  for (const m of allMembers.members) m.role = "member";
  const promotedDefault = normalizeDemoSnapshot(allMembers);
  assert.equal(
    promotedDefault.members.find((m) => m.user_id === DEMO_USER)?.role,
    "member",
  );
  assert.ok(
    promotedDefault.members.some(
      (m) => m.user_id !== DEMO_USER && m.active && m.role === "admin",
    ),
  );

  // Wenn demo-1 inaktiv ist, wird ein anderes aktives Nicht-DEMO_USER-Mitglied Admin:
  const inactiveAugust = demoSnapshot();
  for (const m of inactiveAugust.members) m.role = "member";
  inactiveAugust.members[1].active = false;
  const promotedActiveOther = normalizeDemoSnapshot(inactiveAugust);
  assert.equal(
    promotedActiveOther.members.find((m) => m.id === "demo-2")?.role,
    "admin",
  );
  assert.equal(
    promotedActiveOther.members.find((m) => m.id === "demo-2")?.active,
    true,
  );

  // Wenn alle anderen Mitglieder inaktiv sind, wird demo-1 reaktiviert und zum Admin gemacht:
  const allOthersInactive = demoSnapshot();
  for (const m of allOthersInactive.members) m.role = "member";
  allOthersInactive.members[1].active = false;
  allOthersInactive.members[2].active = false;
  const reactivatedAdmin = normalizeDemoSnapshot(allOthersInactive);
  assert.equal(
    reactivatedAdmin.members.find((m) => m.id === "demo-1")?.role,
    "admin",
  );
  assert.equal(
    reactivatedAdmin.members.find((m) => m.id === "demo-1")?.active,
    true,
  );

  // Wenn nur DEMO_USER als Mitglied existiert, wird ein aktiver Nicht-DEMO_USER-Admin ergänzt:
  const onlyDemoUser = demoSnapshot();
  onlyDemoUser.members = [
    { ...onlyDemoUser.members[0], role: "admin", active: false },
  ];
  const withRestoredAdmin = normalizeDemoSnapshot(onlyDemoUser);
  assert.equal(
    withRestoredAdmin.members.find((m) => m.user_id === DEMO_USER)?.role,
    "member",
  );
  assert.equal(
    withRestoredAdmin.members.find((m) => m.user_id === DEMO_USER)?.active,
    true,
  );
  assert.ok(
    withRestoredAdmin.members.some(
      (m) => m.user_id !== DEMO_USER && m.active && m.role === "admin",
    ),
  );

  // Ungültiger Snapshot fällt sicher auf Standardwerte zurück:
  const fromCorrupt = normalizeDemoSnapshot(null as unknown as Snapshot);
  assert.equal(
    fromCorrupt.members.find((m) => m.user_id === DEMO_USER)?.role,
    "member",
  );
  assert.equal(
    fromCorrupt.members.find((m) => m.id === "demo-1")?.role,
    "admin",
  );
});

test("demoAction verweigert im Standard-Demo-Modus alle 10 Admin-Aktionen und fremde Umbenennungen", () => {
  const base = demoSnapshot();
  const adminCases: [Action, RpcArgs][] = [
    [
      "credit_minutes",
      {
        p_request_id: "adm-credit",
        p_member_id: "demo-0",
        p_minutes: 30,
        p_reason: "Test",
      },
    ],
    [
      "record_topup",
      {
        p_request_id: "adm-topup",
        p_payer_id: "demo-0",
        p_minutes: 100,
        p_price_rappen: 1000,
        p_purchased_at: "2026-11-19T10:00:00.000Z",
        p_note: "Paket",
        p_contributions: [
          { member_id: "demo-0", amount_rappen: 500 },
          { member_id: "demo-1", amount_rappen: 500 },
        ],
      },
    ],
    [
      "record_package",
      {
        p_request_id: "adm-pkg",
        p_payer_id: "demo-0",
        p_minutes: 100,
        p_price_rappen: 1000,
        p_purchased_at: "2026-11-19T10:00:00.000Z",
        p_note: "Altes Paket",
      },
    ],
    [
      "void_ride",
      {
        p_request_id: "adm-void",
        p_ride_id: base.rides[0].id,
        p_reason: "Doppelt",
      },
    ],
    [
      "update_member",
      {
        p_request_id: "adm-update",
        p_member_id: "demo-2",
        p_role: "admin",
        p_active: true,
      },
    ],
    ["create_invite", { p_request_id: "adm-invite" }],
    ["revoke_invites", { p_request_id: "adm-revoke" }],
    [
      "dismiss_password_reset",
      { p_request_id: "adm-dismiss", p_reset_id: "reset-1" },
    ],
    [
      "upsert_group_place",
      {
        p_request_id: "adm-place",
        p_label: "Test-Ort",
        p_address: "Bahnhofstrasse 1",
        p_lat: 47.372,
        p_lng: 8.541,
        p_radius_meters: 100,
      },
    ],
    [
      "deactivate_group_place",
      { p_request_id: "adm-place-del", p_place_id: "demo-place-1" },
    ],
  ];

  assert.equal(adminCases.length, 10);
  for (const [action, args] of adminCases) {
    assert.throws(
      () => demoAction(base, action, args),
      { message: "Keine Berechtigung für diese Gruppe." },
      `Admin-Aktion ${action} muss im Demo-Modus abgelehnt werden`,
    );
  }

  for (const otherId of ["demo-1", "demo-2"]) {
    assert.throws(
      () =>
        demoAction(base, "rename_member", {
          p_request_id: `rename-${otherId}`,
          p_member_id: otherId,
          p_display_name: "Fremdname",
        }),
      { message: "Du darfst nur deinen eigenen Namen ändern." },
    );
  }

  assert.throws(
    () =>
      demoAction(base, "rename_member", {
        p_request_id: "rename-missing",
        p_member_id: "demo-unknown",
        p_display_name: "Niemand",
      }),
    { message: "Mitglied nicht gefunden." },
  );

  const inactiveActor = structuredClone(base);
  inactiveActor.members[0].active = false;
  assert.throws(
    () =>
      demoAction(inactiveActor, "record_ride", {
        p_request_id: "inactive-ride",
        p_occurred_at: "2026-11-19T12:00:00.000Z",
        p_drive_minutes: 5,
        p_pause_minutes: 0,
      }),
    { message: "Keine Berechtigung für diese Gruppe." },
  );
});

test("demoAction erlaubt normalen Mitgliedern eigene Fahrten (solo & geteilt), eigene Umbenennung und Feedback", () => {
  const base = demoSnapshot();
  const oskarBefore = summary(base, "demo-0").balance;
  const maxBefore = summary(base, "demo-2").balance;

  const afterSolo = demoAction(base, "record_ride", {
    p_request_id: "member-solo-1",
    p_occurred_at: "2026-11-19T15:00:00.000Z",
    p_drive_minutes: 10,
    p_pause_minutes: 2,
    p_note: "Solo-Fahrt",
    p_start_label: "Zürich HB",
    p_end_label: "Bellevue",
  });
  assert.equal(summary(afterSolo, "demo-0").balance, oskarBefore - 720);
  assert.equal(summary(afterSolo, "demo-2").balance, maxBefore);

  const afterShared = demoAction(afterSolo, "record_ride", {
    p_request_id: "member-shared-1",
    p_occurred_at: "2026-11-19T16:00:00.000Z",
    p_drive_minutes: 10,
    p_pause_minutes: 0,
    p_note: "Gemeinsam zum See",
    p_co_rider_ids: ["demo-2"],
  });
  assert.equal(summary(afterShared, "demo-0").balance, oskarBefore - 720 - 300);
  assert.equal(summary(afterShared, "demo-2").balance, maxBefore - 300);

  const afterRename = demoAction(afterShared, "rename_member", {
    p_request_id: "member-rename-self",
    p_member_id: "demo-0",
    p_display_name: "Oskar Mitglied",
  });
  assert.equal(
    afterRename.members.find((m) => m.id === "demo-0")?.display_name,
    "Oskar Mitglied",
  );

  const afterFeedback = demoAction(afterRename, "submit_feedback", {
    p_request_id: "member-fb-1",
    p_category: "praise",
    p_message: "Funktioniert super als Mitglied",
    p_page: "Mitglieder",
  });
  assert.equal(afterFeedback.feedback?.length, 1);
  assert.equal(afterFeedback.feedback?.[0].member_id, "demo-0");
  assert.equal(
    afterFeedback.feedback?.[0].message,
    "Funktioniert super als Mitglied",
  );
});

test("normalizeDemoSnapshot wehrt JSON-Arrays, kaputte Array-Einträge, fehlerhafte Mitglieder und doppelte DEMO_USER ab", () => {
  // 1. JSON-Array [] darf nicht als Array zurückgegeben oder als "[]" serialisiert werden:
  const fromArray = normalizeDemoSnapshot([] as unknown as Snapshot);
  assert.equal(Array.isArray(fromArray), false);
  assert.equal(JSON.stringify(fromArray).startsWith("{"), true);
  assert.equal(
    fromArray.members.find((m) => m.user_id === DEMO_USER)?.role,
    "member",
  );
  assert.equal(fromArray.members.find((m) => m.id === "demo-1")?.role, "admin");

  // 2. {"accounts":[null]} und kaputte/null/Array-Einträge in allen Listen crashen nicht:
  const base = demoSnapshot();
  const withNullAccounts = normalizeDemoSnapshot({
    accounts: [
      null,
      [],
      { user_id: "", username: "leer" },
      { user_id: "user-1", username: "august" },
    ],
  } as unknown as Snapshot);
  assert.equal(
    withNullAccounts.accounts?.some((a) => a.user_id === DEMO_USER),
    true,
  );
  const coercedAugust = withNullAccounts.accounts?.find(
    (a) => a.user_id === "user-1",
  );
  assert.ok(coercedAugust);
  assert.equal(coercedAugust.username, "august");
  assert.equal(
    Number.isFinite(Date.parse(coercedAugust.password_updated_at)),
    true,
  );

  const malformedCollections = normalizeDemoSnapshot({
    ...base,
    rides: [
      null,
      [],
      { id: "bad-date", member_id: "demo-0", occurred_at: "not-a-date" },
      base.rides[0],
    ],
    entries: [
      null,
      [],
      { id: "bad-entry", member_id: "demo-0" },
      base.entries[0],
    ],
    packages: [null, [], { id: "bad-pkg", seconds: "600" }, base.packages[0]],
    contributions: [null, [], { id: "bad-contrib" }, base.contributions![0]],
    places: [
      null,
      [],
      { id: "bad-place", label: "Ungültig", lat: 999, lng: 8.5 },
      base.places![0],
    ],
    feedback: [
      null,
      [],
      {
        id: "bad-fb-date",
        group_id: base.group.id,
        member_id: "demo-0",
        category: "idea",
        message: "Kaputtes Datum",
        page: "Übersicht",
        created_at: "ungueltig",
      },
      {
        id: "good-own-fb",
        group_id: base.group.id,
        member_id: "demo-0",
        category: "idea",
        message: "Gültiges Feedback",
        page: "Übersicht",
        created_at: "2026-11-19T12:00:00.000Z",
      },
    ],
  } as unknown as Snapshot);
  assert.deepEqual(
    malformedCollections.rides.map((r) => r.id),
    [base.rides[0].id],
  );
  assert.deepEqual(
    malformedCollections.entries.map((e) => e.id),
    [base.entries[0].id],
  );
  assert.deepEqual(
    malformedCollections.packages.map((p) => p.id),
    [base.packages[0].id],
  );
  assert.deepEqual(
    malformedCollections.contributions?.map((c) => c.id),
    [base.contributions![0].id],
  );
  assert.deepEqual(
    malformedCollections.places?.map((p) => p.id),
    [base.places![0].id],
  );
  assert.deepEqual(
    malformedCollections.feedback?.map((f) => f.id),
    ["good-own-fb"],
  );

  // 3a. Fehlerhafte Member-Objekte ohne id/display_name fallen sicher auf Standard-Mitglieder zurück:
  const fromMalformedMembers = normalizeDemoSnapshot({
    members: [{ user_id: DEMO_USER, role: "admin" }, {}, null, []],
  } as unknown as Snapshot);
  assert.equal(fromMalformedMembers.members.length, 3);
  assert.deepEqual(
    fromMalformedMembers.members.map((m) => [m.id, m.role, m.active]),
    [
      ["demo-0", "member", true],
      ["demo-1", "admin", true],
      ["demo-2", "member", true],
    ],
  );

  // 3b. Doppelte DEMO_USER-Einträge (inkl. Hijack-Eintrag vor demo-0) werden auf demo-0 dedupliziert:
  const withDupDemo = normalizeDemoSnapshot({
    ...base,
    members: [
      {
        id: "evil",
        group_id: "wrong-group",
        user_id: DEMO_USER,
        display_name: "Evil Oskar",
        role: "admin",
        active: false,
      },
      {
        id: "demo-0",
        group_id: "wrong-group",
        user_id: DEMO_USER,
        display_name: "Oskar Echt",
        role: "admin",
        active: false,
      },
      {
        id: "demo-1",
        group_id: "wrong-group",
        user_id: "user-1",
        display_name: "August",
        role: "member",
        active: true,
      },
      {
        id: "demo-1",
        group_id: "wrong-group",
        user_id: "user-dup",
        display_name: "August Doppelt",
        role: "member",
        active: true,
      },
    ],
  } as unknown as Snapshot);
  const demoUsers = withDupDemo.members.filter((m) => m.user_id === DEMO_USER);
  assert.equal(demoUsers.length, 1);
  assert.equal(demoUsers[0].id, "demo-0");
  assert.equal(demoUsers[0].display_name, "Oskar Echt");
  assert.equal(demoUsers[0].role, "member");
  assert.equal(demoUsers[0].active, true);
  assert.equal(demoUsers[0].group_id, withDupDemo.group.id);
  assert.equal(withDupDemo.members.filter((m) => m.id === "demo-1").length, 1);
  assert.equal(
    withDupDemo.members.find((m) => m.id === "demo-1")?.role,
    "admin",
  );

  // 3c. Doppelte DEMO_USER-Einträge ohne demo-0 behalten genau den ersten gültigen Eintrag als member:
  const dupCustomDemo = normalizeDemoSnapshot({
    ...base,
    members: [
      {
        id: "custom-1",
        group_id: base.group.id,
        user_id: DEMO_USER,
        display_name: "Oskar Eins",
        role: "admin",
        active: false,
      },
      {
        id: "custom-2",
        group_id: base.group.id,
        user_id: DEMO_USER,
        display_name: "Oskar Zwei",
        role: "admin",
        active: true,
      },
    ],
  } as unknown as Snapshot);
  const customDemos = dupCustomDemo.members.filter(
    (m) => m.user_id === DEMO_USER,
  );
  assert.equal(customDemos.length, 1);
  assert.equal(customDemos[0].id, "custom-1");
  assert.equal(customDemos[0].role, "member");
  assert.equal(customDemos[0].active, true);
  assert.ok(
    dupCustomDemo.members.some(
      (m) => m.user_id !== DEMO_USER && m.active && m.role === "admin",
    ),
  );
});
