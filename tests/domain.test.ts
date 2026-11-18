import { test } from "node:test";
import assert from "node:assert/strict";
import { moneyRappen, rideDraft, summary, wholeMinutes } from "../lib/domain";
import { demoSnapshot, demoAction } from "../lib/demo";

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
