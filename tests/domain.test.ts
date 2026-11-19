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
} from "../lib/domain";
import { demoSnapshot, demoAction } from "../lib/demo";
import { computeRideInsights, resolvePlaceLabel } from "../lib/location";
import { extractInviteToken } from "../lib/accounts";

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
  const before = demoSnapshot(),
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
  const data = demoSnapshot();
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
  const before = demoSnapshot();
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
  const base = demoSnapshot();
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
