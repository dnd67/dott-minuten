import { test } from "node:test";
import assert from "node:assert/strict";
import {
  allocateMinutes,
  moneyRappen,
  rideDraft,
  summary,
  wholeMinutes,
} from "../lib/domain";
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
