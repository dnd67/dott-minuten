import { test } from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  allocateMinutes,
  groupSharedRides,
  moneyRappen,
  rideDraft,
  splitPackage,
  splitRideSeconds,
  summary,
  wholeMinutes,
  type Action,
  type FeedbackCategory,
  type FeedbackItem,
  type Member,
  type PasswordResetRequest,
  type RpcArgs,
  type Snapshot,
  type TopupPlan,
  type UserAccount,
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
import { deleteOwnAccount, extractInviteToken } from "../lib/accounts";
import {
  buildLiveRidePayload,
  buildStartLiveActivityUrl,
  computeLiveRideMetrics,
  formatElapsedClock,
} from "../lib/live-activity";
import {
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  FEEDBACK_SEEN_KEY_PREFIX,
  computeFeedbackSeenCursor,
  countUnreadFeedback,
  feedbackSeenStorageKey,
  filterFeedback,
  isFeedbackUnread,
  loadFeedbackSeenAt,
  mergeFeedbackLists,
  resolveFeedbackAuthor,
  saveFeedbackSeenAt,
  sortFeedbackNewest,
  summarizeFeedback,
} from "../lib/feedback";
import { FeedbackInbox } from "../components/feedback-inbox";
import { DevDashboard } from "../components/dev-dashboard";
import { FeedbackDialog } from "../components/feedback-dialog";
import { PasswordDashboard } from "../components/password-dashboard";
import { DeleteAccountDialog } from "../components/delete-account-dialog";

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

  const url = new URL(buildStartLiveActivityUrl(payload, "rich"));
  assert.equal(url.protocol, "shortcuts:");
  assert.equal(url.hostname, "run-shortcut");
  assert.equal(url.searchParams.get("name"), "Minutenclub Live");
  assert.equal(url.searchParams.get("input"), "text");
  assert.equal(url.searchParams.get("text"), JSON.stringify(payload));
  assert.equal(
    buildStartLiveActivityUrl(payload, "native"),
    "shortcuts://run-shortcut?name=Minutenclub%20Live",
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

test("demoAction verweigert im Standard-Demo-Modus alle 9 Admin-Aktionen und fremde Umbenennungen", () => {
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

  assert.equal(adminCases.length, 9);
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
  assert.throws(
    () =>
      demoAction(inactiveActor, "record_topup", {
        p_request_id: "inactive-topup",
        p_payer_id: "demo-1",
        p_minutes: 100,
        p_price_rappen: 1000,
        p_purchased_at: "2026-11-19T12:00:00.000Z",
        p_note: "Inaktives Mitglied",
        p_contributions: {
          mode: "equal",
          shares: [{ member_id: "demo-1", weight: 1 }],
        },
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

test("demoAction erlaubt normalen Mitgliedern Minutenpakete (record_topup) in allen Modi und spiegelt SQL-Validierung", () => {
  const base = demoSnapshot();
  const oskarBefore = summary(base, "demo-0").balance;
  const augustBefore = summary(base, "demo-1").balance;
  const maxBefore = summary(base, "demo-2").balance;
  const invBefore = summary(base).inventory;
  const purchasedAt = "2026-11-19T14:00:00.000Z";

  // 1. Modus "amount" (CHF-Beiträge) mit eigenem Zahler (demo-0), 0-CHF-Anteil & Idempotenz:
  const amountPlan: TopupPlan = [
    { member_id: "demo-0", amount_rappen: 6000 },
    { member_id: "demo-1", amount_rappen: 0 },
    { member_id: "demo-2", amount_rappen: 3000 },
  ];
  const amountArgs: RpcArgs = {
    p_request_id: "member-topup-amount",
    p_payer_id: "demo-0",
    p_minutes: 600,
    p_price_rappen: 9000,
    p_purchased_at: purchasedAt,
    p_note: "  Frühlingspaket  ",
    p_contributions: amountPlan,
  };
  const afterAmount = demoAction(base, "record_topup", amountArgs);
  const afterAmountRetry = demoAction(afterAmount, "record_topup", amountArgs);
  assert.deepEqual(afterAmountRetry, afterAmount);

  const amountPkg = afterAmount.packages.find(
    (p) => p.id === "member-topup-amount",
  );
  assert.ok(amountPkg);
  assert.equal(amountPkg.payer_id, "demo-0");
  assert.equal(amountPkg.seconds, 600 * 60);
  assert.equal(amountPkg.price_rappen, 9000);
  assert.equal(amountPkg.note, "Frühlingspaket");

  const amountContribs = (afterAmount.contributions ?? [])
    .filter((c) => c.package_id === "member-topup-amount")
    .map((c) => ({
      member_id: c.member_id,
      minutes: c.allocated_seconds / 60,
      amount_rappen: c.amount_rappen,
    }));
  assert.deepEqual(amountContribs, splitPackage(600, 9000, amountPlan));
  const amountCredits = afterAmount.entries.filter(
    (e) => e.package_id === "member-topup-amount",
  );
  // Null-Minuten-Anteil von August erzeugt keinen Journalbetrag:
  assert.equal(amountCredits.length, 2);
  assert.equal(summary(afterAmount, "demo-0").balance, oskarBefore + 400 * 60);
  assert.equal(summary(afterAmount, "demo-1").balance, augustBefore);
  assert.equal(summary(afterAmount, "demo-2").balance, maxBefore + 200 * 60);
  assert.equal(summary(afterAmount).inventory, invBefore + 600 * 60);

  // 2. Modus "equal" (Fair aufteilen) mit anderem aktivem Zahler (demo-1) & p_note: null:
  const equalPlan: TopupPlan = {
    mode: "equal",
    shares: [
      { member_id: "demo-0", weight: 1 },
      { member_id: "demo-2", weight: 1 },
    ],
  };
  const afterEqual = demoAction(afterAmount, "record_topup", {
    p_request_id: "member-topup-equal",
    p_payer_id: "demo-1",
    p_minutes: 101,
    p_price_rappen: 1,
    p_purchased_at: purchasedAt,
    p_note: null,
    p_contributions: equalPlan,
  });
  const equalPkg = afterEqual.packages.find(
    (p) => p.id === "member-topup-equal",
  );
  assert.ok(equalPkg);
  assert.equal(equalPkg.payer_id, "demo-1");
  assert.equal(equalPkg.note, "");
  assert.deepEqual(
    (afterEqual.contributions ?? [])
      .filter((c) => c.package_id === "member-topup-equal")
      .map((c) => ({
        member_id: c.member_id,
        minutes: c.allocated_seconds / 60,
        amount_rappen: c.amount_rappen,
      })),
    splitPackage(101, 1, equalPlan),
  );
  // Zahler August war nicht Teil der Aufteilung -> sein Saldo bleibt unverändert:
  assert.equal(summary(afterEqual, "demo-1").balance, augustBefore);

  // 3. Modus "minutes" (Nach Minutenbedarf) mit anderem aktivem Zahler (demo-1) & ohne p_note (undefined):
  const minutesPlan: TopupPlan = {
    mode: "minutes",
    shares: [
      { member_id: "demo-0", weight: 24 },
      { member_id: "demo-1", weight: 77 },
    ],
  };
  const afterMinutes = demoAction(afterEqual, "record_topup", {
    p_request_id: "member-topup-minutes",
    p_payer_id: "demo-1",
    p_minutes: 101,
    p_price_rappen: 1,
    p_purchased_at: purchasedAt,
    p_contributions: minutesPlan,
  });
  const minutesPkg = afterMinutes.packages.find(
    (p) => p.id === "member-topup-minutes",
  );
  assert.ok(minutesPkg);
  assert.equal(minutesPkg.payer_id, "demo-1");
  assert.equal(minutesPkg.note, "");
  assert.deepEqual(
    (afterMinutes.contributions ?? [])
      .filter((c) => c.package_id === "member-topup-minutes")
      .map((c) => ({
        member_id: c.member_id,
        minutes: c.allocated_seconds / 60,
        amount_rappen: c.amount_rappen,
      })),
    splitPackage(101, 1, minutesPlan),
  );
  assert.equal(summary(afterMinutes, "demo-1").balance, augustBefore + 77 * 60);

  // Genau 500 Zeichen nach Trimmen werden akzeptiert; normalizeDemoSnapshot bewahrt neue Pakete:
  const withMaxNote = demoAction(afterMinutes, "record_topup", {
    p_request_id: "member-topup-500",
    p_payer_id: "demo-0",
    p_minutes: 10,
    p_price_rappen: 100,
    p_purchased_at: purchasedAt,
    p_note: `  ${"a".repeat(500)}  `,
    p_contributions: {
      mode: "equal",
      shares: [{ member_id: "demo-0", weight: 1 }],
    },
  });
  assert.equal(
    withMaxNote.packages.find((p) => p.id === "member-topup-500")?.note.length,
    500,
  );
  const normalized = normalizeDemoSnapshot(withMaxNote);
  assert.ok(normalized.packages.some((p) => p.id === "member-topup-amount"));
  assert.ok(normalized.packages.some((p) => p.id === "member-topup-equal"));
  assert.ok(normalized.packages.some((p) => p.id === "member-topup-minutes"));

  // 4. Negative Validierungen (spiegeln SQL public.record_topup):
  const withInactiveMax = structuredClone(base);
  withInactiveMax.members[2].active = false;

  const validTopup: RpcArgs = {
    p_request_id: "member-topup-bad",
    p_payer_id: "demo-0",
    p_minutes: 100,
    p_price_rappen: 1500,
    p_purchased_at: purchasedAt,
    p_note: "Test",
    p_contributions: {
      mode: "equal",
      shares: [{ member_id: "demo-0", weight: 1 }],
    },
  };

  // Ungültiger, leerer oder inaktiver Zahler:
  for (const badPayer of ["demo-unknown", "", null]) {
    assert.throws(
      () =>
        demoAction(base, "record_topup", {
          ...validTopup,
          p_payer_id: badPayer,
        }),
      { message: "Aktives Mitglied nicht gefunden." },
    );
  }
  assert.throws(
    () =>
      demoAction(withInactiveMax, "record_topup", {
        ...validTopup,
        p_payer_id: "demo-2",
      }),
    { message: "Aktives Mitglied nicht gefunden." },
  );

  // Unbekannter oder inaktiver Beitragender:
  assert.throws(
    () =>
      demoAction(base, "record_topup", {
        ...validTopup,
        p_contributions: {
          mode: "equal",
          shares: [{ member_id: "demo-unknown", weight: 1 }],
        },
      }),
    { message: "Aktives Mitglied nicht gefunden." },
  );
  assert.throws(
    () =>
      demoAction(withInactiveMax, "record_topup", {
        ...validTopup,
        p_contributions: {
          mode: "equal",
          shares: [
            { member_id: "demo-0", weight: 1 },
            { member_id: "demo-2", weight: 1 },
          ],
        },
      }),
    { message: "Aktives Mitglied nicht gefunden." },
  );

  // Zukünftiger (> 5 Min.) oder ungültiger Kaufzeitpunkt:
  const tooFarFuture = new Date(Date.now() + 10 * 60_000).toISOString();
  for (const badDate of [tooFarFuture, "nicht-gueltig", "", null]) {
    assert.throws(
      () =>
        demoAction(base, "record_topup", {
          ...validTopup,
          p_purchased_at: badDate,
        }),
      /Kaufzeitpunkt/,
    );
  }

  // Notiz > 500 Zeichen:
  assert.throws(
    () =>
      demoAction(base, "record_topup", {
        ...validTopup,
        p_note: "x".repeat(501),
      }),
    { message: "Notiz darf höchstens 500 Zeichen lang sein." },
  );

  // Ungültiger Aufteilungsmodus oder fehlende Liste:
  assert.throws(
    () =>
      demoAction(base, "record_topup", {
        ...validTopup,
        p_contributions: {
          mode: "custom" as "equal",
          shares: [{ member_id: "demo-0", weight: 1 }],
        },
      }),
    { message: "Unbekannte Aufteilung." },
  );
  assert.throws(
    () =>
      demoAction(base, "record_topup", {
        ...validTopup,
        p_contributions: null,
      }),
    { message: "Bitte Beiträge angeben." },
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

function makeFeedbackItem(
  overrides: Partial<FeedbackItem> & { id: string },
): FeedbackItem {
  return {
    group_id: "group-1",
    member_id: "m-oskar",
    category: "idea",
    message: "Standard-Rückmeldung",
    page: "Übersicht",
    created_at: "2026-11-20T09:00:00.000Z",
    ...overrides,
  };
}

function makeFeedbackMembersAndAccounts(): {
  members: Member[];
  accounts: UserAccount[];
  me: Member;
} {
  const me: Member = {
    id: "m-august",
    group_id: "group-1",
    user_id: "u-august",
    display_name: "August Admin",
    role: "admin",
    active: true,
  };
  const members: Member[] = [
    me,
    {
      id: "m-oskar",
      group_id: "group-1",
      user_id: "u-oskar",
      display_name: "Oskar",
      role: "member",
      active: true,
    },
    {
      id: "m-max",
      group_id: "group-1",
      user_id: "u-max",
      display_name: "Max",
      role: "member",
      active: true,
    },
    {
      id: "m-lena",
      group_id: "group-1",
      user_id: "u-lena",
      display_name: "Lena Ex",
      role: "member",
      active: false,
    },
    {
      id: "m-no-account",
      group_id: "group-1",
      user_id: "u-no-account",
      display_name: "Noa OhneKonto",
      role: "member",
      active: true,
    },
  ];
  const accounts: UserAccount[] = [
    {
      user_id: "u-august",
      username: "august",
      password_updated_at: "2026-11-18T10:00:00.000Z",
    },
    {
      user_id: "u-oskar",
      username: "oskar",
      password_updated_at: "2026-11-18T10:00:00.000Z",
    },
    {
      user_id: "u-max",
      username: "max_zh",
      password_updated_at: "2026-11-18T10:00:00.000Z",
    },
    {
      user_id: "u-lena",
      username: "lena_old",
      password_updated_at: "2026-11-18T10:00:00.000Z",
    },
  ];
  return { members, accounts, me };
}

test("lib/feedback: sortFeedbackNewest und mergeFeedbackLists sortieren deterministisch, deduplizieren und behandeln ungültige Daten sicher", () => {
  const input: FeedbackItem[] = [
    makeFeedbackItem({
      id: "fb-invalid-b",
      created_at: "kein-datum",
    }),
    makeFeedbackItem({
      id: "fb-older",
      created_at: "2026-11-20T08:00:00.000Z",
    }),
    makeFeedbackItem({
      id: "fb-tie-b",
      created_at: "2026-11-20T10:00:00.000Z",
    }),
    makeFeedbackItem({
      id: "fb-tie-a",
      created_at: "2026-11-20T11:00:00+01:00", // exakt 10:00:00Z
    }),
    makeFeedbackItem({
      id: "fb-newest",
      created_at: "2026-11-20T12:30:00.000Z",
    }),
    makeFeedbackItem({
      id: "fb-invalid-a",
      created_at: "",
    }),
  ];
  const snapshotOrder = input.map((i) => i.id);
  const sorted = sortFeedbackNewest(input);

  // Eingabe-Array bleibt unverändert:
  assert.deepEqual(
    input.map((i) => i.id),
    snapshotOrder,
  );
  // Neueste zuerst, deterministischer id-Tie-Break, ungültige Daten sicher am Ende:
  assert.deepEqual(
    sorted.map((i) => i.id),
    [
      "fb-newest",
      "fb-tie-a",
      "fb-tie-b",
      "fb-older",
      "fb-invalid-a",
      "fb-invalid-b",
    ],
  );

  // mergeFeedbackLists dedupliziert nach id (erster Eintrag gewinnt), ignoriert leere id und sortiert neueste zuerst:
  const listA: FeedbackItem[] = [
    makeFeedbackItem({
      id: "fb-1",
      message: "Remote-Version",
      created_at: "2026-11-20T09:00:00.000Z",
    }),
    makeFeedbackItem({
      id: "",
      message: "Ungültige leere ID",
      created_at: "2026-11-20T15:00:00.000Z",
    }),
  ];
  const listB: FeedbackItem[] = [
    makeFeedbackItem({
      id: "fb-1",
      message: "Lokales Duplikat",
      created_at: "2026-11-20T14:00:00.000Z",
    }),
    makeFeedbackItem({
      id: "fb-2",
      message: "Neuerer Eintrag",
      created_at: "2026-11-20T11:00:00.000Z",
    }),
    makeFeedbackItem({
      id: "fb-2",
      message: "Zweites Duplikat",
      created_at: "2026-11-20T12:00:00.000Z",
    }),
  ];
  const merged = mergeFeedbackLists(listA, listB);
  assert.deepEqual(
    merged.map((i) => [i.id, i.message]),
    [
      ["fb-2", "Neuerer Eintrag"],
      ["fb-1", "Remote-Version"],
    ],
  );
});

test("lib/feedback: resolveFeedbackAuthor löst aktive, deaktivierte und verwaiste Mitglieder ohne Fehlzuordnung zu me auf", () => {
  const { members, accounts, me } = makeFeedbackMembersAndAccounts();

  const activeWithHandle = resolveFeedbackAuthor(
    { member_id: "m-max" },
    members,
    accounts,
  );
  assert.equal(activeWithHandle.displayName, "Max");
  assert.equal(activeWithHandle.username, "max_zh");
  assert.equal(activeWithHandle.active, true);
  assert.equal(activeWithHandle.member?.id, "m-max");

  const activeWithoutHandle = resolveFeedbackAuthor(
    { member_id: "m-no-account" },
    members,
    accounts,
  );
  assert.equal(activeWithoutHandle.displayName, "Noa OhneKonto");
  assert.equal(activeWithoutHandle.username, null);
  assert.equal(activeWithoutHandle.active, true);
  assert.equal(activeWithoutHandle.member?.id, "m-no-account");

  const deactivated = resolveFeedbackAuthor(
    { member_id: "m-lena" },
    members,
    accounts,
  );
  assert.equal(deactivated.displayName, "Lena Ex");
  assert.equal(deactivated.username, "lena_old");
  assert.equal(deactivated.active, false);
  assert.equal(deactivated.member?.id, "m-lena");

  // Verwaiste / unbekannte member_id fällt sauber auf "Mitglied" zurück — NIEMALS auf me:
  const orphaned = resolveFeedbackAuthor(
    { member_id: "m-deleted-orphan" },
    members,
    accounts,
  );
  assert.deepEqual(orphaned, {
    displayName: "Mitglied",
    username: null,
    active: false,
    member: null,
  });
  assert.notEqual(orphaned.displayName, me.display_name);
});

test("lib/feedback: summarizeFeedback und filterFeedback zählen Kategorien und filtern nach Kategorie, Mitglied und Suchbegriff", () => {
  assert.deepEqual(FEEDBACK_CATEGORIES, ["idea", "bug", "praise", "other"]);
  assert.deepEqual(FEEDBACK_CATEGORY_LABELS, {
    idea: "Idee",
    bug: "Problem",
    praise: "Lob",
    other: "Allgemein",
  });

  assert.deepEqual(summarizeFeedback([]), {
    total: 0,
    idea: 0,
    bug: 0,
    praise: 0,
    other: 0,
  });

  const { members, accounts } = makeFeedbackMembersAndAccounts();
  const items: FeedbackItem[] = [
    makeFeedbackItem({
      id: "fb-1",
      member_id: "m-oskar",
      category: "idea",
      message: "Favoriten-Knopf beim Entsperren",
      page: "Übersicht",
      created_at: "2026-11-20T08:00:00.000Z",
    }),
    makeFeedbackItem({
      id: "fb-2",
      member_id: "m-max",
      category: "bug",
      message: "GPS-Button hängt manchmal",
      page: "Fahrten",
      created_at: "2026-11-20T09:00:00.000Z",
    }),
    makeFeedbackItem({
      id: "fb-3",
      member_id: "m-lena",
      category: "praise",
      message: "Super Übersicht fürs Guthaben",
      page: "Guthaben",
      created_at: "2026-11-20T10:00:00.000Z",
    }),
    makeFeedbackItem({
      id: "fb-4",
      member_id: "m-orphan",
      category: "other",
      message: "Kurze Frage zum Export",
      page: "Statistik",
      created_at: "2026-11-20T11:00:00.000Z",
    }),
    makeFeedbackItem({
      id: "fb-5",
      member_id: "m-max",
      category: "idea",
      message: "Nachtmodus automatisch umschalten",
      page: "Mitglieder",
      created_at: "2026-11-20T12:00:00.000Z",
    }),
  ];

  assert.deepEqual(summarizeFeedback(items), {
    total: 5,
    idea: 2,
    bug: 1,
    praise: 1,
    other: 1,
  });

  // Standard ohne Filter -> alle, neueste zuerst:
  assert.deepEqual(
    filterFeedback(items, members, accounts).map((i) => i.id),
    ["fb-5", "fb-4", "fb-3", "fb-2", "fb-1"],
  );

  // Kategorie-Filter:
  assert.deepEqual(
    filterFeedback(items, members, accounts, { category: "idea" }).map(
      (i) => i.id,
    ),
    ["fb-5", "fb-1"],
  );
  assert.deepEqual(
    filterFeedback(items, members, accounts, { category: "bug" }).map(
      (i) => i.id,
    ),
    ["fb-2"],
  );

  // Mitglied-Filter (inkl. verwaister ID):
  assert.deepEqual(
    filterFeedback(items, members, accounts, { memberId: "m-max" }).map(
      (i) => i.id,
    ),
    ["fb-5", "fb-2"],
  );
  assert.deepEqual(
    filterFeedback(items, members, accounts, { memberId: "m-orphan" }).map(
      (i) => i.id,
    ),
    ["fb-4"],
  );

  // Case-insensitive Query über message, page, displayName, username und @username:
  assert.deepEqual(
    filterFeedback(items, members, accounts, { query: "  ENTSPerren  " }).map(
      (i) => i.id,
    ),
    ["fb-1"],
  );
  assert.deepEqual(
    filterFeedback(items, members, accounts, { query: "statistik" }).map(
      (i) => i.id,
    ),
    ["fb-4"],
  );
  assert.deepEqual(
    filterFeedback(items, members, accounts, { query: "LENA EX" }).map(
      (i) => i.id,
    ),
    ["fb-3"],
  );
  assert.deepEqual(
    filterFeedback(items, members, accounts, { query: "MAX_ZH" }).map(
      (i) => i.id,
    ),
    ["fb-5", "fb-2"],
  );
  assert.deepEqual(
    filterFeedback(items, members, accounts, { query: "@oskar" }).map(
      (i) => i.id,
    ),
    ["fb-1"],
  );
  assert.deepEqual(
    filterFeedback(items, members, accounts, { query: "mitglied" }).map(
      (i) => i.id,
    ),
    ["fb-5", "fb-4"],
  );
  assert.deepEqual(
    filterFeedback(items, members, accounts, {
      category: "other",
      query: "mitglied",
    }).map((i) => i.id),
    ["fb-4"],
  );

  // Kombinierte Filter:
  assert.deepEqual(
    filterFeedback(items, members, accounts, {
      category: "bug",
      memberId: "m-max",
      query: "@max_zh",
    }).map((i) => i.id),
    ["fb-2"],
  );
  assert.deepEqual(
    filterFeedback(items, members, accounts, {
      category: "praise",
      memberId: "m-max",
      query: "gps",
    }),
    [],
  );
});

test("lib/feedback: Seen-Cursor (inkl. Clock-Skew), Ungelesen-Logik und SSR-sichere Storage-Helfer", () => {
  assert.equal(
    feedbackSeenStorageKey("grp-42"),
    `${FEEDBACK_SEEN_KEY_PREFIX}grp-42`,
  );

  const ownItem = makeFeedbackItem({
    id: "fb-own",
    member_id: "m-august",
    created_at: "2026-11-20T12:00:00.000Z",
  });
  const oldOther = makeFeedbackItem({
    id: "fb-old-other",
    member_id: "m-oskar",
    created_at: "2026-11-20T09:00:00.000Z",
  });
  const exactSeenOther = makeFeedbackItem({
    id: "fb-exact-other",
    member_id: "m-max",
    created_at: "2026-11-20T10:00:00.000Z",
  });
  const newOther = makeFeedbackItem({
    id: "fb-new-other",
    member_id: "m-max",
    created_at: "2026-11-20T10:30:00.000Z",
  });
  const futureClockSkewOther = makeFeedbackItem({
    id: "fb-skew-other",
    member_id: "m-oskar",
    created_at: "2026-11-20T11:05:00.000Z",
  });
  const invalidDateOther = makeFeedbackItem({
    id: "fb-bad-date",
    member_id: "m-oskar",
    created_at: "invalid",
  });

  // computeFeedbackSeenCursor: ohne Skew gewinnt `now`, bei Server-Clock-Skew gewinnt neuestes `created_at`:
  const nowNormal = new Date("2026-11-20T13:00:00.000Z");
  assert.equal(
    computeFeedbackSeenCursor([oldOther, newOther], nowNormal),
    "2026-11-20T13:00:00.000Z",
  );
  assert.equal(
    computeFeedbackSeenCursor([], nowNormal),
    "2026-11-20T13:00:00.000Z",
  );

  const nowBehindServer = new Date("2026-11-20T10:45:00.000Z");
  const skewCursor = computeFeedbackSeenCursor(
    [oldOther, futureClockSkewOther, invalidDateOther],
    nowBehindServer,
  );
  assert.equal(skewCursor, "2026-11-20T11:05:00.000Z");

  // Eigene Einträge sind NIEMALS ungelesen (auch nicht bei seenAt = null):
  assert.equal(isFeedbackUnread(ownItem, "m-august", null), false);
  assert.equal(
    isFeedbackUnread(ownItem, "m-august", "2026-11-20T08:00:00.000Z"),
    false,
  );

  // Fremde Einträge sind ungelesen bei seenAt = null oder neuer als seenAt:
  assert.equal(isFeedbackUnread(oldOther, "m-august", null), true);
  assert.equal(isFeedbackUnread(oldOther, "m-august", "not-a-date"), true);
  assert.equal(
    isFeedbackUnread(oldOther, "m-august", "2026-11-20T10:00:00.000Z"),
    false,
  );
  assert.equal(
    isFeedbackUnread(exactSeenOther, "m-august", "2026-11-20T10:00:00.000Z"),
    false,
  );
  assert.equal(
    isFeedbackUnread(newOther, "m-august", "2026-11-20T10:00:00.000Z"),
    true,
  );
  assert.equal(
    isFeedbackUnread(invalidDateOther, "m-august", "2026-11-20T10:00:00.000Z"),
    false,
  );

  const allItems = [
    ownItem,
    oldOther,
    exactSeenOther,
    newOther,
    futureClockSkewOther,
  ];
  assert.equal(countUnreadFeedback(allItems, "m-august", null), 4);
  assert.equal(
    countUnreadFeedback(allItems, "m-august", "2026-11-20T10:00:00.000Z"),
    2,
  );
  // Nach Markieren mit Clock-Skew-Cursor ist der Zähler exakt 0:
  const cursorAll = computeFeedbackSeenCursor(allItems, nowBehindServer);
  assert.equal(countUnreadFeedback(allItems, "m-august", cursorAll), 0);

  // SSR-Sicherheit: ohne window werfen loadFeedbackSeenAt / saveFeedbackSeenAt nicht:
  assert.equal(typeof window, "undefined");
  assert.equal(loadFeedbackSeenAt("grp-42"), null);
  assert.doesNotThrow(() =>
    saveFeedbackSeenAt("grp-42", "2026-11-20T12:00:00.000Z"),
  );

  // Mit Browser-localStorage funktioniert Speichern & Laden (ungültige ISO wird ignoriert):
  const store = new Map<string, string>();
  const globalRecord = globalThis as Record<string, unknown>;
  const hadWindow = "window" in globalRecord;
  const prevWindow = globalRecord.window;
  globalRecord.window = {
    localStorage: {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => {
        store.set(k, v);
      },
    },
  };
  try {
    assert.equal(loadFeedbackSeenAt("grp-42"), null);
    saveFeedbackSeenAt("grp-42", "ungueltig");
    assert.equal(loadFeedbackSeenAt("grp-42"), null);
    saveFeedbackSeenAt("grp-42", "2026-11-20T11:05:00.000Z");
    assert.equal(loadFeedbackSeenAt("grp-42"), "2026-11-20T11:05:00.000Z");
    assert.equal(loadFeedbackSeenAt(""), null);
  } finally {
    if (hadWindow) {
      globalRecord.window = prevWindow;
    } else {
      delete globalRecord.window;
    }
  }
});

test("SSR FeedbackInbox & DevDashboard: Admin sieht alle Einträge (>8) auch ohne NEXT_PUBLIC_FEEDBACK_ENABLED; Demo und Mitglieder rendern leer", () => {
  const { members, accounts, me } = makeFeedbackMembersAndAccounts();
  const categories: FeedbackCategory[] = ["idea", "bug", "praise", "other"];
  const pages = ["Übersicht", "Fahrten", "Guthaben", "Statistik", "Mitglieder"];
  const authorCycle = [
    "m-oskar",
    "m-max",
    "m-lena", // deaktiviert
    "m-orphaned-99", // fehlt in members -> "Mitglied"
    "m-august", // eigener Admin-Eintrag -> nie ungelesen
  ];

  // 10 Einträge (> 8) über alle Kategorien und Autoren:
  const tenItems: FeedbackItem[] = Array.from({ length: 10 }, (_, idx) => {
    const num = String(idx + 1).padStart(2, "0");
    return makeFeedbackItem({
      id: `fb-ssr-${num}`,
      member_id: authorCycle[idx % authorCycle.length],
      category: categories[idx % categories.length],
      message: `Crew-Feedback-Eintrag-${num}`,
      page: pages[idx % pages.length],
      // idx 0..9 -> 09:00 .. 18:00Z
      created_at: `2026-11-20T${String(9 + idx).padStart(2, "0")}:00:00.000Z`,
    });
  });

  // seenAt = 14:00Z -> neuer als 14:00Z sind idx 6 (15:00, m-max), idx 7 (16:00, m-lena),
  // idx 8 (17:00, m-orphaned-99) und idx 9 (18:00, m-august = eigener Eintrag -> NICHT ungelesen).
  // Erwartet exakt 3 ungelesene Einträge.
  const seenAt = "2026-11-20T14:00:00.000Z";
  assert.equal(countUnreadFeedback(tenItems, me.id, seenAt), 3);

  const snap: Snapshot = {
    ...demoSnapshot(),
    group: { id: "group-1", name: "Zürich Crew" },
    members,
    accounts,
    feedback: tenItems,
  };

  const prevFlag = process.env.NEXT_PUBLIC_FEEDBACK_ENABLED;
  delete process.env.NEXT_PUBLIC_FEEDBACK_ENABLED;
  try {
    // 1. FeedbackInbox mit admin=true, demo=false (ohne NEXT_PUBLIC_FEEDBACK_ENABLED):
    const inboxHtml = renderToStaticMarkup(
      React.createElement(FeedbackInbox, {
        feedback: tenItems,
        members,
        accounts,
        me,
        admin: true,
        demo: false,
        seenAt,
        onMarkSeen: () => {},
      }),
    );

    assert.match(inboxHtml, /Nutzer-Feedback der Crew/);
    assert.match(inboxHtml, /class="[^"]*feedback-inbox-env-hint[^"]*"/);
    assert.match(inboxHtml, /NEXT_PUBLIC_FEEDBACK_ENABLED=true/);

    // Keine .slice(0, 8)-Abschneidung: alle 10 Einträge und 10 Karten sind gerendert:
    const cards =
      inboxHtml.match(
        /<article class="feedback-inbox-card[\s\S]*?<\/article>/g,
      ) ?? [];
    assert.equal(cards.length, 10);
    for (let i = 1; i <= 10; i++) {
      const token = `Crew-Feedback-Eintrag-${String(i).padStart(2, "0")}`;
      assert.ok(inboxHtml.includes(token), `Fehlender Eintrag: ${token}`);
    }

    // Autoren-Handles, Deaktiviert-Kennzeichnung & kein Fehl-Fallback auf me für verwaiste Einträge:
    assert.ok(inboxHtml.includes("@oskar"));
    assert.ok(inboxHtml.includes("@max_zh"));
    assert.ok(inboxHtml.includes("@lena_old"));
    assert.ok(inboxHtml.includes("Lena Ex (Deaktiviert)"));
    assert.ok(inboxHtml.includes("Mitglied (Deaktiviert)"));
    assert.ok(
      inboxHtml.includes('<span class="pill muted">Deaktiviert</span>'),
    );

    const orphanCard = cards.find((card) =>
      card.includes("Crew-Feedback-Eintrag-09"),
    );
    assert.ok(orphanCard);
    assert.ok(orphanCard.includes("<strong>Mitglied</strong>"));
    assert.ok(
      orphanCard.includes('<span class="pill muted">Deaktiviert</span>'),
    );
    assert.equal(orphanCard.includes(me.display_name), false);

    // Eigener neuer Eintrag (idx 9 = Eintrag-10) ist NICHT als unread markiert:
    const ownCard = cards.find((card) =>
      card.includes("Crew-Feedback-Eintrag-10"),
    );
    assert.ok(ownCard);
    assert.equal(
      ownCard.startsWith('<article class="feedback-inbox-card unread"'),
      false,
    );

    // Semantische Kategorie-Badges, Seiten-Pills, Ungelesen-Pills & Mark-Read-Button:
    assert.ok(inboxHtml.includes("feedback-cat-badge cat-idea"));
    assert.ok(inboxHtml.includes("feedback-cat-badge cat-bug"));
    assert.ok(inboxHtml.includes("feedback-cat-badge cat-praise"));
    assert.ok(inboxHtml.includes("feedback-cat-badge cat-other"));
    assert.ok(inboxHtml.includes("Idee"));
    assert.ok(inboxHtml.includes("Problem"));
    assert.ok(inboxHtml.includes("Lob"));
    assert.ok(inboxHtml.includes("Allgemein"));
    assert.ok(inboxHtml.includes("feedback-page-pill"));
    assert.ok(inboxHtml.includes("Übersicht"));
    assert.ok(inboxHtml.includes("Statistik"));
    assert.ok(inboxHtml.includes("3 neu"));
    assert.equal(
      cards.filter((card) =>
        card.startsWith('<article class="feedback-inbox-card unread"'),
      ).length,
      3,
    );
    assert.ok(
      inboxHtml.includes('<span class="feedback-unread-pill">Neu</span>'),
    );
    assert.ok(inboxHtml.includes("Als gelesen markieren"));

    // 2. DevDashboard mit admin=true, demo=false enthält 4. Kennzahlkarte + alle 10 Feedback-Einträge:
    const devHtml = renderToStaticMarkup(
      React.createElement(DevDashboard, {
        data: snap,
        me,
        admin: true,
        demo: false,
        busy: false,
        feedbackSeenAt: seenAt,
        onMarkFeedbackSeen: () => {},
        mutate: async () => true,
        renderAvatar: () => null,
      }),
    );
    assert.ok(devHtml.includes("Nutzer-Feedback"));
    assert.ok(devHtml.includes("Nutzer-Feedback der Crew"));
    assert.ok(devHtml.includes("3 Ideen · 3 Probleme · 2 Lob · 3 neu"));
    assert.ok(devHtml.includes("feedback-inbox-env-hint"));
    assert.equal(
      devHtml.match(/<article class="feedback-inbox-card/g)?.length,
      10,
    );
    assert.ok(devHtml.includes("Crew-Feedback-Eintrag-01"));
    assert.ok(devHtml.includes("Crew-Feedback-Eintrag-10"));

    // 3. Wenn NEXT_PUBLIC_FEEDBACK_ENABLED="true", verschwindet der Env-Hinweis:
    process.env.NEXT_PUBLIC_FEEDBACK_ENABLED = "true";
    const liveInboxHtml = renderToStaticMarkup(
      React.createElement(FeedbackInbox, {
        feedback: tenItems,
        members,
        accounts,
        me,
        admin: true,
        demo: false,
        seenAt,
      }),
    );
    assert.equal(liveInboxHtml.includes("feedback-inbox-env-hint"), false);
    assert.equal(
      liveInboxHtml.match(/<article class="feedback-inbox-card/g)?.length,
      10,
    );

    // 4. Harte Guards: demo=true (selbst mit admin=true!) oder admin=false rendern exakt "":
    for (const guardProps of [
      { admin: true, demo: true },
      { admin: false, demo: false },
      { admin: false, demo: true },
    ]) {
      assert.equal(
        renderToStaticMarkup(
          React.createElement(FeedbackInbox, {
            feedback: tenItems,
            members,
            accounts,
            me,
            ...guardProps,
          }),
        ),
        "",
      );
      assert.equal(
        renderToStaticMarkup(
          React.createElement(DevDashboard, {
            data: snap,
            me,
            ...guardProps,
            busy: false,
            mutate: async () => true,
            renderAvatar: () => null,
          }),
        ),
        "",
      );
    }
  } finally {
    if (prevFlag === undefined) {
      delete process.env.NEXT_PUBLIC_FEEDBACK_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_FEEDBACK_ENABLED = prevFlag;
    }
  }
});

test("SSR FeedbackDialog: Admin-Shortcut und Crew-Überschrift nur bei admin=true && demo=false; remoteFeedback bleibt auch ohne Env-Flag sichtbar", () => {
  const { members, me } = makeFeedbackMembersAndAccounts();
  const remoteFeedback: FeedbackItem[] = [
    makeFeedbackItem({
      id: "fb-remote-1",
      member_id: "m-max",
      category: "bug",
      message: "Remote-Bugmeldung aus Supabase",
      page: "Fahrten",
      created_at: "2026-11-20T11:00:00.000Z",
    }),
    makeFeedbackItem({
      id: "fb-remote-orphan",
      member_id: "m-deleted-user",
      category: "idea",
      message: "Idee eines gelöschten Mitglieds",
      page: "Übersicht",
      created_at: "2026-11-20T10:00:00.000Z",
    }),
  ];

  const baseProps = {
    motion: false,
    currentPage: "Übersicht",
    me,
    members,
    remoteFeedback,
    busy: false,
    remoteError: "",
    onSave: async () => true,
    onOpenAdminFeedback: () => {},
    onClose: () => {},
  };

  const prevFlag = process.env.NEXT_PUBLIC_FEEDBACK_ENABLED;
  delete process.env.NEXT_PUBLIC_FEEDBACK_ENABLED;
  try {
    // 1. Admin + nicht Demo, sogar ohne NEXT_PUBLIC_FEEDBACK_ENABLED:
    const adminHtml = renderToStaticMarkup(
      React.createElement(FeedbackDialog, {
        ...baseProps,
        admin: true,
        demo: false,
      }),
    );
    assert.ok(adminHtml.includes("Alle im Dev-Dashboard ansehen"));
    assert.ok(adminHtml.includes("feedback-admin-bar"));
    assert.ok(adminHtml.includes("Rückmeldungen der Crew (2)"));
    assert.equal(adminHtml.includes("Deine bisherigen Rückmeldungen"), false);
    assert.ok(adminHtml.includes("Vorbereitet für Launch"));
    // Persistiertes remoteFeedback bleibt trotz fehlendem Live-Flag sichtbar:
    assert.ok(adminHtml.includes("Remote-Bugmeldung aus Supabase"));
    assert.ok(adminHtml.includes("Idee eines gelöschten Mitglieds"));
    // Verwaistes Mitglied wird als "Mitglied" angezeigt und NICHT fälschlich als me.display_name:
    const dialogItems =
      adminHtml.match(/<div class="feedback-item">[\s\S]*?<\/p><\/div>/g) ?? [];
    assert.equal(dialogItems.length, 2);
    const orphanDialogItem = dialogItems.find((block) =>
      block.includes("Idee eines gelöschten Mitglieds"),
    );
    assert.ok(orphanDialogItem);
    assert.ok(orphanDialogItem.includes("Mitglied"));
    assert.equal(orphanDialogItem.includes(me.display_name), false);

    // 2. Demo=true (selbst mit admin=true und onOpenAdminFeedback) ODER admin=false:
    for (const nonAdminProps of [
      { admin: true, demo: true },
      { admin: false, demo: false },
      { admin: false, demo: true },
    ]) {
      const html = renderToStaticMarkup(
        React.createElement(FeedbackDialog, {
          ...baseProps,
          ...nonAdminProps,
        }),
      );
      assert.ok(html.includes("Deine bisherigen Rückmeldungen (2)"));
      assert.equal(html.includes("Alle im Dev-Dashboard ansehen"), false);
      assert.equal(html.includes("Rückmeldungen der Crew"), false);
      assert.equal(html.includes("feedback-admin-bar"), false);
      // Auch für normale Mitglieder bleibt remoteFeedback ohne Live-Flag sichtbar:
      assert.ok(html.includes("Remote-Bugmeldung aus Supabase"));
    }
  } finally {
    if (prevFlag === undefined) {
      delete process.env.NEXT_PUBLIC_FEEDBACK_ENABLED;
    } else {
      process.env.NEXT_PUBLIC_FEEDBACK_ENABLED = prevFlag;
    }
  }
});

test("deleteOwnAccount sendet POST delete-account mit Bearer-Token, apikey und confirm:true, prüft Session und meldet deutsche Fehler", async () => {
  const prevFetch = globalThis.fetch;
  const prevUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const prevPubKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  const prevAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const makeMockClient = (sessionResult: {
    data: { session: { access_token: string } | null };
    error: Error | null;
  }) =>
    ({
      auth: {
        getSession: async () => sessionResult,
      },
    }) as unknown as SupabaseClient;

  const validClient = makeMockClient({
    data: { session: { access_token: "test-jwt-token-123" } },
    error: null,
  });

  try {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://example.supabase.co///";
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_pub_test_key";
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    // 1. Erfolgreicher Aufruf (HTTP 200) sendet exakte URL, Header und { confirm: true }:
    const calls: { url: string; init?: RequestInit }[] = [];
    globalThis.fetch = (async (
      input: string | URL | Request,
      init?: RequestInit,
    ) => {
      calls.push({ url: String(input), init });
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }) as typeof fetch;

    const result = await deleteOwnAccount(validClient);
    assert.equal(result, undefined);
    assert.equal(calls.length, 1);
    assert.equal(
      calls[0].url,
      "https://example.supabase.co/functions/v1/delete-account",
    );
    assert.equal(calls[0].init?.method, "POST");
    const headers = calls[0].init?.headers as Record<string, string>;
    assert.equal(headers.Authorization, "Bearer test-jwt-token-123");
    assert.equal(headers.apikey, "sb_pub_test_key");
    assert.equal(headers["Content-Type"], "application/json");
    assert.deepEqual(JSON.parse(String(calls[0].init?.body)), {
      confirm: true,
    });

    // 2. Deutsche Server-Fehlermeldungen für 400 / 401 / 429 / 500 werden direkt durchgereicht:
    const errorCases: [number, string][] = [
      [400, "Bestätigung zum Löschen fehlt."],
      [401, "Anmeldung abgelaufen. Bitte neu anmelden."],
      [429, "Zu viele Löschversuche. Bitte kurz warten."],
      [500, "Das Konto konnte serverseitig nicht gelöscht werden."],
    ];
    for (const [status, serverMsg] of errorCases) {
      globalThis.fetch = (async () =>
        new Response(JSON.stringify({ error: serverMsg }), {
          status,
          headers: { "Content-Type": "application/json" },
        })) as typeof fetch;
      await assert.rejects(() => deleteOwnAccount(validClient), {
        message: serverMsg,
      });
    }

    // 3. Leerer oder nicht-JSON-Fehlerbody nutzt deutschen Fallback-Text:
    globalThis.fetch = (async () =>
      new Response("Internal Server Error", { status: 500 })) as typeof fetch;
    await assert.rejects(() => deleteOwnAccount(validClient), {
      message:
        "Das Konto konnte nicht gelöscht werden. Bitte erneut versuchen.",
    });

    globalThis.fetch = (async () =>
      new Response(JSON.stringify({ error: "   " }), {
        status: 500,
        headers: { "Content-Type": "application/json" },
      })) as typeof fetch;
    await assert.rejects(() => deleteOwnAccount(validClient), {
      message:
        "Das Konto konnte nicht gelöscht werden. Bitte erneut versuchen.",
    });

    // 4. Ohne gültigen Session-Token wird sofort abgebrochen (ohne fetch-Aufruf):
    let fetchCount = 0;
    globalThis.fetch = (async () => {
      fetchCount++;
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;

    for (const badSession of [
      { data: { session: null }, error: null },
      { data: { session: { access_token: "" } }, error: null },
      { data: { session: null }, error: new Error("Session expired") },
    ]) {
      await assert.rejects(() => deleteOwnAccount(makeMockClient(badSession)), {
        message: "Bitte neu anmelden.",
      });
    }
    assert.equal(fetchCount, 0);

    // 5. Fallback auf NEXT_PUBLIC_SUPABASE_ANON_KEY und Fehler bei fehlender Konfiguration:
    delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = "sb_anon_fallback_key";
    let capturedApikey = "";
    globalThis.fetch = (async (
      _input: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedApikey = (init?.headers as Record<string, string>).apikey ?? "";
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    await deleteOwnAccount(validClient);
    assert.equal(capturedApikey, "sb_anon_fallback_key");

    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    await assert.rejects(() => deleteOwnAccount(validClient), {
      message: "Supabase ist nicht konfiguriert.",
    });
  } finally {
    globalThis.fetch = prevFetch;
    if (prevUrl === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_URL = prevUrl;
    }
    if (prevPubKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = prevPubKey;
    }
    if (prevAnonKey === undefined) {
      delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    } else {
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = prevAnonKey;
    }
  }
});

test("Gelöschtes historisches Mitglied (user_id: null): summary, computeRideInsights, computeRouteRecords, resolveFeedbackAuthor und normalizeDemoSnapshot bleiben konsistent", () => {
  const base = demoSnapshot();
  const baseSummary = summary(base);
  const baseInsights = computeRideInsights(base.rides, base.members);

  const deletedMember: Member = {
    id: "demo-deleted",
    group_id: base.group.id,
    user_id: null,
    display_name: "Gelöschtes Konto",
    role: "member",
    active: false,
    created_at: "2026-10-01T08:00:00.000Z",
  };

  const snap: Snapshot = structuredClone(base);
  snap.members.push(deletedMember);
  snap.packages.push({
    id: "pkg-deleted-member",
    group_id: snap.group.id,
    payer_id: deletedMember.id,
    seconds: 120 * 60,
    price_rappen: 1800,
    purchased_at: "2026-10-02T10:00:00.000Z",
    note: "Historisches Paket",
  });
  snap.contributions = [
    ...(snap.contributions ?? []),
    {
      id: "contrib-deleted-member",
      group_id: snap.group.id,
      package_id: "pkg-deleted-member",
      member_id: deletedMember.id,
      amount_rappen: 1800,
      allocated_seconds: 120 * 60,
    },
  ];
  snap.entries.push(
    {
      id: "credit-deleted-member",
      group_id: snap.group.id,
      member_id: deletedMember.id,
      seconds: 120 * 60,
      kind: "credit",
      ride_id: null,
      package_id: "pkg-deleted-member",
      reason: "Anteil am Minutenpaket",
      created_at: "2026-10-02T10:00:00.000Z",
    },
    {
      id: "entry-ride-deleted",
      group_id: snap.group.id,
      member_id: deletedMember.id,
      seconds: -720,
      kind: "ride",
      ride_id: "ride-deleted-1",
      reason: "Fahrt inkl. Pause",
      created_at: "2026-10-05T07:30:00.000Z",
    },
  );
  snap.rides.push({
    id: "ride-deleted-1",
    group_id: snap.group.id,
    member_id: deletedMember.id,
    occurred_at: "2026-10-05T07:30:00.000Z",
    duration_seconds: 600,
    pause_seconds: 120,
    charged_seconds: 720,
    note: "Historische Fahrt",
    source: "manual",
    estimated_cost_rappen: 180,
    voided_at: null,
    start_label: "Zürich HB",
    start_lat: 47.3779,
    start_lng: 8.5403,
    end_label: "Bellevue",
    end_lat: 47.367,
    end_lng: 8.5451,
    start_gps: true,
    end_gps: true,
    unlocked_via_app: true,
  });

  // 1. summary() behält Salden, Kontingente und Gruppenbestand fehlerfrei bei:
  const deletedStats = summary(snap, deletedMember.id);
  assert.equal(deletedStats.quota, 7200);
  assert.equal(deletedStats.consumed, 720);
  assert.equal(deletedStats.balance, 6480);
  assert.equal(deletedStats.rides.length, 1);

  const groupStats = summary(snap);
  assert.equal(groupStats.balance, baseSummary.balance + 6480);
  assert.equal(groupStats.inventory, baseSummary.inventory + 7200 - 720);
  assert.equal(groupStats.consumed, baseSummary.consumed + 720);

  // 2. computeRideInsights() & computeRouteRecords() werten historische Fahrten sauber aus:
  const insights = computeRideInsights(snap.rides, snap.members);
  assert.equal(insights.totalRides, baseInsights.totalRides + 1);
  const bellevue = insights.destinations.find((d) => d.label === "Bellevue");
  assert.ok(bellevue);
  assert.equal(bellevue.count, 1);
  assert.deepEqual(bellevue.riders, [
    { memberId: "demo-deleted", name: "Gelöschtes Konto", count: 1 },
  ]);
  const deletedProfile = insights.memberProfiles.find(
    (p) => p.member.id === "demo-deleted",
  );
  assert.ok(deletedProfile);
  assert.equal(deletedProfile.totalRides, 1);
  assert.equal(deletedProfile.member.user_id, null);

  const records = computeRouteRecords(snap.rides, snap.members, snap.places);
  const hbToBellevue = records.find(
    (r) => r.startLabel === "Zürich HB" && r.endLabel === "Bellevue",
  );
  assert.ok(hbToBellevue);
  assert.equal(hbToBellevue.fastest.memberNames, "Gelöschtes Konto");
  assert.equal(hbToBellevue.fastest.seconds, 600);

  // 3. resolveFeedbackAuthor() liefert "Gelöschtes Konto" ohne Benutzername und ohne Crash:
  const resolvedAuthor = resolveFeedbackAuthor(
    { member_id: "demo-deleted" },
    snap.members,
    snap.accounts ?? [],
  );
  assert.equal(resolvedAuthor.displayName, "Gelöschtes Konto");
  assert.equal(resolvedAuthor.username, null);
  assert.equal(resolvedAuthor.active, false);
  assert.equal(resolvedAuthor.member?.id, "demo-deleted");
  assert.equal(resolvedAuthor.member?.user_id, null);

  // 4. normalizeDemoSnapshot() erhält gelöschte Mitglieder für die Historie, erzwingt aber role="member", active=false:
  const tampered = structuredClone(snap);
  const tamperedDeleted = tampered.members.find(
    (m) => m.id === "demo-deleted",
  )!;
  tamperedDeleted.role = "admin";
  tamperedDeleted.active = true;
  // Alle anderen Mitglieder auf member setzen, damit geprüft wird, dass demo-deleted NICHT als Admin zählt:
  for (const m of tampered.members) {
    if (m.id !== "demo-deleted") m.role = "member";
  }

  const normalized = normalizeDemoSnapshot(tampered);
  const normDeleted = normalized.members.find((m) => m.id === "demo-deleted");
  assert.ok(normDeleted);
  assert.equal(normDeleted.user_id, null);
  assert.equal(normDeleted.role, "member");
  assert.equal(normDeleted.active, false);
  assert.equal(normDeleted.display_name, "Gelöschtes Konto");
  assert.equal(summary(normalized, "demo-deleted").balance, 6480);
  // Ein echtes, nicht gelöschtes Mitglied (user_id !== null) wird zum aktiven Admin:
  assert.ok(
    normalized.members.some(
      (m) =>
        m.user_id !== null &&
        m.user_id !== DEMO_USER &&
        m.active &&
        m.role === "admin",
    ),
  );

  // 5. Wenn neben DEMO_USER nur ein gelöschtes Mitglied existiert, ergänzt normalizeDemoSnapshot einen echten Admin:
  const onlyDemoAndDeleted = structuredClone(snap);
  onlyDemoAndDeleted.members = [
    { ...onlyDemoAndDeleted.members[0], role: "admin", active: true },
    { ...deletedMember, role: "admin", active: true },
  ];
  const restored = normalizeDemoSnapshot(onlyDemoAndDeleted);
  const restoredDeleted = restored.members.find((m) => m.id === "demo-deleted");
  assert.ok(restoredDeleted);
  assert.equal(restoredDeleted.user_id, null);
  assert.equal(restoredDeleted.role, "member");
  assert.equal(restoredDeleted.active, false);
  assert.equal(
    restored.members.find((m) => m.user_id === DEMO_USER)?.role,
    "member",
  );
  assert.ok(
    restored.members.some(
      (m) =>
        m.user_id !== null &&
        m.user_id !== DEMO_USER &&
        m.active &&
        m.role === "admin",
    ),
  );
});

test("demoAction lehnt rename_member und update_member für gelöschte Konten (user_id: null) ab und zählt sie nicht als verbleibenden Admin", () => {
  const adminSnap = adminDemoSnapshot();
  adminSnap.members.push({
    id: "demo-deleted",
    group_id: adminSnap.group.id,
    user_id: null,
    display_name: "Gelöschtes Konto",
    role: "member",
    active: false,
  });

  // Admin darf ein gelöschtes Konto weder umbenennen noch ändern:
  assert.throws(
    () =>
      demoAction(adminSnap, "rename_member", {
        p_request_id: "rename-deleted-1",
        p_member_id: "demo-deleted",
        p_display_name: "Reaktiviert",
      }),
    { message: "Gelöschte Konten können nicht mehr umbenannt werden." },
  );
  assert.throws(
    () =>
      demoAction(adminSnap, "update_member", {
        p_request_id: "update-deleted-1",
        p_member_id: "demo-deleted",
        p_role: "admin",
        p_active: true,
      }),
    { message: "Gelöschte Konten können nicht mehr geändert werden." },
  );

  // Auch ein normales Mitglied erhält bei rename_member auf ein gelöschtes Konto die klare Ablehnung:
  const memberSnap = demoSnapshot();
  memberSnap.members.push({
    id: "demo-deleted",
    group_id: memberSnap.group.id,
    user_id: null,
    display_name: "Gelöschtes Konto",
    role: "member",
    active: false,
  });
  assert.throws(
    () =>
      demoAction(memberSnap, "rename_member", {
        p_request_id: "rename-deleted-member",
        p_member_id: "demo-deleted",
        p_display_name: "Neu",
      }),
    { message: "Gelöschte Konten können nicht mehr umbenannt werden." },
  );

  // Eine gelöschte Zeile (user_id: null) darf niemals als verbleibender Admin zählen:
  const soleRealAdminSnap = adminDemoSnapshot();
  const august = soleRealAdminSnap.members.find((m) => m.id === "demo-1")!;
  august.role = "member";
  soleRealAdminSnap.members.push({
    id: "demo-ghost-admin",
    group_id: soleRealAdminSnap.group.id,
    user_id: null,
    display_name: "Gelöschtes Konto",
    role: "admin",
    active: true,
  });

  assert.throws(
    () =>
      demoAction(soleRealAdminSnap, "update_member", {
        p_request_id: "demote-last-real-admin",
        p_member_id: "demo-0",
        p_role: "member",
        p_active: true,
      }),
    { message: "Mindestens ein aktiver Admin muss bleiben." },
  );
  assert.throws(
    () =>
      demoAction(soleRealAdminSnap, "update_member", {
        p_request_id: "deactivate-last-real-admin",
        p_member_id: "demo-0",
        p_role: "admin",
        p_active: false,
      }),
    { message: "Mindestens ein aktiver Admin muss bleiben." },
  );
});

test("SSR PasswordDashboard schliesst gelöschte Mitglieder (user_id: null) aus «Mitglieder-Passwörter direkt verwalten» aus", () => {
  const { me, members, accounts } = makeFeedbackMembersAndAccounts();
  const deletedMember: Member = {
    id: "m-deleted-account",
    group_id: "group-1",
    user_id: null,
    display_name: "Gelöschtes Konto",
    role: "member",
    active: false,
  };
  const allMembers = [...members, deletedMember];
  const resetRequests: PasswordResetRequest[] = [
    {
      id: "reset-oskar",
      group_id: "group-1",
      member_id: "m-oskar",
      target_user_id: "u-oskar",
      username: "oskar",
      note: "Vergessen",
      status: "open",
      requested_at: "2026-11-20T09:00:00.000Z",
      resolved_at: null,
    },
    {
      id: "reset-deleted",
      group_id: "group-1",
      member_id: "m-deleted-account",
      target_user_id: "u-deleted-old",
      username: "ehemals",
      note: "Alt",
      status: "open",
      requested_at: "2026-11-20T08:00:00.000Z",
      resolved_at: null,
    },
  ];

  const noopAsyncBool = async () => true;
  const html = renderToStaticMarkup(
    React.createElement(PasswordDashboard, {
      me,
      ownUsername: "august",
      admin: true,
      members: allMembers,
      accounts,
      resetRequests,
      busy: false,
      renderAvatar: () => null,
      onSetMemberPassword: noopAsyncBool,
      onCreateMemberAccount: async () => "neu",
      onDismissReset: noopAsyncBool,
      onUpdateOwnPassword: noopAsyncBool,
    }),
  );

  assert.ok(html.includes("Mitglieder-Passwörter direkt verwalten"));
  const memberListMatch = html.match(
    /<div class="pw-member-list">([\s\S]*?)<\/div><\/div><div class="pw-section">/,
  );
  assert.ok(memberListMatch);
  const memberListHtml = memberListMatch[1];

  // Genau die 5 Mitglieder mit user_id !== null werden gelistet; das gelöschte Mitglied fehlt komplett:
  const memberRows = memberListHtml.match(/<div class="pw-member-row">/g) ?? [];
  assert.equal(memberRows.length, members.length);
  assert.ok(memberListHtml.includes("@august"));
  assert.ok(memberListHtml.includes("@oskar"));
  assert.ok(memberListHtml.includes("@max_zh"));
  assert.equal(memberListHtml.includes("Gelöschtes Konto"), false);
  assert.equal(memberListHtml.includes("Konto · Gelöschtes Konto"), false);

  // Bei offenen Reset-Anfragen erscheint "Neues Passwort setzen" nur für Mitglieder mit user_id !== null:
  const resetActionMatches = html.match(/Neues Passwort setzen/g) ?? [];
  assert.equal(resetActionMatches.length, 1);

  // Wenn ausschliesslich gelöschte Mitglieder übergeben werden, erscheint der Leer-Hinweis:
  const onlyDeletedHtml = renderToStaticMarkup(
    React.createElement(PasswordDashboard, {
      me,
      ownUsername: "august",
      admin: true,
      members: [deletedMember],
      accounts: [],
      resetRequests: [],
      busy: false,
      renderAvatar: () => null,
      onSetMemberPassword: noopAsyncBool,
      onCreateMemberAccount: async () => "neu",
      onDismissReset: noopAsyncBool,
      onUpdateOwnPassword: noopAsyncBool,
    }),
  );
  assert.ok(
    onlyDeletedHtml.includes("Aktuell sind keine Konten mit Login vorhanden."),
  );
  assert.equal(onlyDeletedHtml.includes('class="pw-member-row"'), false);
});

test("SSR DeleteAccountDialog: open=false rendert leer, open=true rendert Überschrift, Buttons, @username und bedingte Hinweise", () => {
  const noop = () => {};
  const noopConfirm = async () => {};

  // 1. Geschlossener Dialog rendert exakt leer:
  assert.equal(
    renderToStaticMarkup(
      React.createElement(DeleteAccountDialog, {
        open: false,
        onClose: noop,
        onConfirm: noopConfirm,
        username: "oskar",
        groupName: "Zürich Crew",
      }),
    ),
    "",
  );

  // 2. Reguläres Mitglied (open=true, demo=false, mit @oskar und Gruppenname):
  const memberHtml = renderToStaticMarkup(
    React.createElement(DeleteAccountDialog, {
      open: true,
      onClose: noop,
      onConfirm: noopConfirm,
      demo: false,
      username: "@oskar",
      groupName: "Zürich Crew",
    }),
  );
  assert.ok(
    memberHtml.includes('<dialog class="entry-dialog delete-account-dialog"'),
  );
  assert.ok(
    memberHtml.includes('<h2 id="delete-account-title">Konto löschen</h2>'),
  );
  assert.ok(memberHtml.includes("Abbrechen"));
  assert.ok(memberHtml.includes("Konto endgültig löschen"));
  assert.ok(memberHtml.includes("@oskar"));
  assert.equal(memberHtml.includes("@@oskar"), false);
  assert.ok(memberHtml.includes("«Zürich Crew»"));
  assert.ok(memberHtml.includes("Gelöschtes Konto"));
  assert.equal(memberHtml.includes("Lokale Demo:"), false);
  assert.equal(memberHtml.includes("Automatische Admin-Übergabe:"), false);
  assert.equal(memberHtml.includes("Letztes aktives Mitglied:"), false);

  // 3. Demo-Modus zeigt Demo-Hinweis und unterdrückt Admin-/Sole-Member-Callouts:
  const demoHtml = renderToStaticMarkup(
    React.createElement(DeleteAccountDialog, {
      open: true,
      onClose: noop,
      onConfirm: noopConfirm,
      demo: true,
      username: "oskar",
      groupName: "Zürich Crew",
      adminSuccessorName: "Max",
      isSoleActiveMember: true,
    }),
  );
  assert.ok(
    demoHtml.includes('<h2 id="delete-account-title">Konto löschen</h2>'),
  );
  assert.ok(demoHtml.includes("Abbrechen"));
  assert.ok(demoHtml.includes("Konto endgültig löschen"));
  assert.ok(demoHtml.includes("@oskar"));
  assert.ok(demoHtml.includes("Lokale Demo:"));
  assert.ok(demoHtml.includes("Demo-Modus"));
  assert.equal(demoHtml.includes("Automatische Admin-Übergabe:"), false);
  assert.equal(demoHtml.includes("Letztes aktives Mitglied:"), false);

  // 4. Einziger Admin mit Nachfolger (adminSuccessorName):
  const successorHtml = renderToStaticMarkup(
    React.createElement(DeleteAccountDialog, {
      open: true,
      onClose: noop,
      onConfirm: noopConfirm,
      demo: false,
      username: "august",
      groupName: "Zürich Crew",
      adminSuccessorName: "Max",
      isSoleActiveMember: false,
    }),
  );
  assert.ok(successorHtml.includes("Automatische Admin-Übergabe:"));
  assert.ok(successorHtml.includes("<strong>Max</strong>"));
  assert.equal(successorHtml.includes("Lokale Demo:"), false);
  assert.equal(successorHtml.includes("Letztes aktives Mitglied:"), false);

  // 5. Letztes aktives Mitglied (isSoleActiveMember=true) zeigt Einladungs-Ablaufhinweis:
  const soleMemberHtml = renderToStaticMarkup(
    React.createElement(DeleteAccountDialog, {
      open: true,
      onClose: noop,
      onConfirm: noopConfirm,
      demo: false,
      username: "august",
      groupName: "Zürich Crew",
      adminSuccessorName: null,
      isSoleActiveMember: true,
    }),
  );
  assert.ok(soleMemberHtml.includes("delete-account-callout warning"));
  assert.ok(soleMemberHtml.includes("Letztes aktives Mitglied:"));
  assert.ok(
    soleMemberHtml.includes(
      "Offene Einladungslinks für «Zürich Crew» werden beim Löschen automatisch ungültig gemacht.",
    ),
  );
  assert.equal(soleMemberHtml.includes("Lokale Demo:"), false);
  assert.equal(soleMemberHtml.includes("Automatische Admin-Übergabe:"), false);
});
