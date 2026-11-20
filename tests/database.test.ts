import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { allocateMinutes, splitPackage, type SplitMode } from "../lib/domain";
import { PGlite } from "@electric-sql/pglite";

test("Datenbank: echte Migration, Transaktionen und Rollenrechte", async (t) => {
  const db = new PGlite();
  const owner = randomUUID(),
    friend = randomUUID(),
    outsider = randomUUID();
  await db.exec(`create role anon; create role authenticated; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;`);
  for (const id of [owner, friend, outsider])
    await db.query("insert into auth.users values($1)", [id]);
  const migrationDir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrationDir))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(new URL(file, migrationDir), "utf8"));
  }
  async function as<T = Record<string, unknown>>(
    user: string,
    sql: string,
    params: unknown[] = [],
  ) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
    return (await db.query<T>(sql, params)).rows;
  }
  const groupRequest = randomUUID();
  const [{ id: gid }] = await as<{ id: string }>(
    owner,
    "select public.create_group('Zürich Crew','Oskar',$1) as id",
    [groupRequest],
  );
  const [{ token }] = await as<{ token: string }>(
    owner,
    "select public.create_invite($1,$2) as token",
    [gid, randomUUID()],
  );
  await as(friend, "select public.join_group($1,'August')", [token]);
  const members = await as<{ id: string; user_id: string }>(
    owner,
    "select id,user_id from public.memberships where group_id=$1",
    [gid],
  );
  const ownerMember = members.find((m) => m.user_id === owner)!.id,
    friendMember = members.find((m) => m.user_id === friend)!.id;
  const when = "2026-01-02T12:00:00Z",
    request = randomUUID();
  await t.test(
    "Gruppenerstellung und Beitritt sind bei Wiederholung eindeutig",
    async () => {
      const again = await as<{ id: string }>(
        owner,
        "select public.create_group('Zürich Crew','Oskar',$1) as id",
        [groupRequest],
      );
      assert.equal(again[0].id, gid);
      await as(friend, "select public.join_group($1,'August')", [token]);
      assert.equal(
        (await as(owner, "select id from public.memberships")).length,
        2,
      );
    },
  );
  await t.test("Anonyme und gruppenfremde Zugriffe sind gesperrt", async () => {
    assert.equal((await as(outsider, "select * from public.rides")).length, 0);
    const snap = await as<{ value: unknown }>(
      outsider,
      "select public.get_dashboard($1) as value",
      [gid],
    );
    assert.equal(snap[0].value, null);
    await assert.rejects(
      () =>
        as(outsider, "select public.create_invite($1,$2)", [gid, randomUUID()]),
      /Keine Berechtigung/,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      () => db.query("select public.get_dashboard($1)", [gid]),
      /permission denied/,
    );
  });
  await t.test(
    "Mitglieder können weder Guthaben buchen noch Tabellen direkt ändern",
    async () => {
      await assert.rejects(
        () =>
          as(friend, "select public.credit_minutes($1,$2,$3,200,$4)", [
            gid,
            randomUUID(),
            friendMember,
            "Anteil",
          ]),
        /Keine Berechtigung/,
      );
      await assert.rejects(
        () =>
          as(friend, "select public.record_package($1,$2,$3,600,9000,$4,$5)", [
            gid,
            randomUUID(),
            friendMember,
            "2026-01-01T12:00:00Z",
            "Legacy",
          ]),
        /Keine Berechtigung/,
      );
      await assert.rejects(
        () =>
          as(friend, "update public.memberships set role='admin' where id=$1", [
            friendMember,
          ]),
        /permission denied/,
      );
      await assert.rejects(
        () => as(friend, "delete from public.minute_entries"),
        /permission denied/,
      );
      await assert.rejects(
        () => as(friend, "select app_private.authorize($1,true)", [gid]),
        /permission denied/,
      );
    },
  );
  await t.test("Paketkauf und interne Gutschrift sind getrennt", async () => {
    await as(owner, "select public.record_package($1,$2,$3,600,9000,$4,$5)", [
      gid,
      randomUUID(),
      ownerMember,
      "2026-01-01T12:00:00Z",
      "Minutenpaket",
    ]);
    const before = await as<{ count: string }>(
      owner,
      "select count(*) from public.minute_entries",
    );
    assert.equal(Number(before[0].count), 0);
    await as(owner, "select public.credit_minutes($1,$2,$3,200,$4)", [
      gid,
      randomUUID(),
      friendMember,
      "Anteil",
    ]);
  });
  await t.test(
    "14 Minuten Fahrt + 1 Pause belasten genau 15; Wiederholung bucht einmal",
    async () => {
      const params = [gid, request, when, 14, 1, "Bahnhof"];
      await as(friend, "select public.record_ride($1,$2,$3,$4,$5,$6)", params);
      await as(friend, "select public.record_ride($1,$2,$3,$4,$5,$6)", params);
      const [r] = await as<{
        charged_seconds: number;
        estimated_cost_rappen: string;
        member_id: string;
      }>(owner, "select * from public.rides where id=$1", [request]);
      assert.equal(Number(r.charged_seconds), 900);
      assert.equal(Number(r.estimated_cost_rappen), 225);
      assert.equal(r.member_id, friendMember);
      assert.equal(
        (
          await as(
            owner,
            "select * from public.minute_entries where ride_id=$1 and kind='ride'",
            [request],
          )
        ).length,
        1,
      );
      const [balance] = await as<{ balance: string }>(
        friend,
        "select sum(seconds) as balance from public.minute_entries where member_id=$1",
        [friendMember],
      );
      assert.equal(Number(balance.balance), 185 * 60);
      await assert.rejects(
        () =>
          as(friend, "select public.record_ride($1,$2,$3,13,1,$4)", [
            gid,
            request,
            when,
            "Bahnhof",
          ]),
        /anderen Werten/,
      );
    },
  );
  await t.test(
    "Ungültige Fahrten und leere Gründe hinterlassen keine Teilbuchung",
    async () => {
      const bad = randomUUID();
      await assert.rejects(
        () =>
          as(friend, "select public.record_ride($1,$2,$3,-1,0,$4)", [
            gid,
            bad,
            when,
            "",
          ]),
        /gültige/,
      );
      assert.equal(
        (await as(owner, "select * from public.rides where id=$1", [bad]))
          .length,
        0,
      );
      const credit = randomUUID();
      await assert.rejects(
        () =>
          as(owner, "select public.credit_minutes($1,$2,$3,3,$4)", [
            gid,
            credit,
            friendMember,
            "",
          ]),
        /check constraint/,
      );
      // Dieselbe Anfrage ist nach dem Fehler nicht halb als erledigt markiert.
      await as(owner, "select public.credit_minutes($1,$2,$3,3,$4)", [
        gid,
        credit,
        friendMember,
        "Korrigierter Grund",
      ]);
    },
  );
  await t.test(
    "Storno nur durch Admin, mit genau einer Gegenbuchung",
    async () => {
      await assert.rejects(
        () =>
          as(friend, "select public.void_ride($1,$2,$3,$4)", [
            gid,
            randomUUID(),
            request,
            "Doppelt",
          ]),
        /Keine Berechtigung/,
      );
      await as(owner, "select public.void_ride($1,$2,$3,$4)", [
        gid,
        randomUUID(),
        request,
        "Doppelt",
      ]);
      await as(owner, "select public.void_ride($1,$2,$3,$4)", [
        gid,
        randomUUID(),
        request,
        "Doppelt",
      ]);
      const [sum] = await as<{ s: string }>(
        owner,
        "select sum(seconds) as s from public.minute_entries where ride_id=$1",
        [request],
      );
      assert.equal(Number(sum.s), 0);
      assert.equal(
        (
          await as(
            owner,
            "select * from public.minute_entries where ride_id=$1 and kind='reversal'",
            [request],
          )
        ).length,
        1,
      );
    },
  );
  await t.test(
    "Guthaben darf negativ werden; Fremdzuweisung ist nicht möglich",
    async () => {
      const ride = randomUUID();
      await as(owner, "select public.record_ride($1,$2,$3,14,1,$4)", [
        gid,
        ride,
        when,
        "",
      ]);
      const [r] = await as<{ member_id: string }>(
        owner,
        "select member_id from public.rides where id=$1",
        [ride],
      );
      assert.equal(r.member_id, ownerMember);
      const [b] = await as<{ s: string }>(
        owner,
        "select sum(seconds) as s from public.minute_entries where member_id=$1",
        [ownerMember],
      );
      assert.equal(Number(b.s), -900);
    },
  );
  await t.test(
    "Namen ändern: eigener Name, Adminrechte und stabile Buchungszuordnung",
    async () => {
      const rename = randomUUID();
      await as(friend, "select public.rename_member($1,$2,$3,$4)", [
        gid,
        rename,
        friendMember,
        "  August Neu  ",
      ]);
      await as(friend, "select public.rename_member($1,$2,$3,$4)", [
        gid,
        rename,
        friendMember,
        "August Neu",
      ]);
      assert.equal(
        (
          await as<{ display_name: string }>(
            friend,
            "select display_name from public.memberships where id=$1",
            [friendMember],
          )
        )[0].display_name,
        "August Neu",
      );
      await assert.rejects(
        () =>
          as(friend, "select public.rename_member($1,$2,$3,$4)", [
            gid,
            randomUUID(),
            ownerMember,
            "Fremder Name",
          ]),
        /nur deinen eigenen/,
      );
      await assert.rejects(
        () =>
          as(outsider, "select public.rename_member($1,$2,$3,$4)", [
            gid,
            randomUUID(),
            ownerMember,
            "Fremder Name",
          ]),
        /Keine Berechtigung/,
      );
      for (const name of ["  ", "x".repeat(61)])
        await assert.rejects(
          () =>
            as(friend, "select public.rename_member($1,$2,$3,$4)", [
              gid,
              randomUUID(),
              friendMember,
              name,
            ]),
          /1 bis 60/,
        );
      await as(owner, "select public.rename_member($1,$2,$3,$4)", [
        gid,
        randomUUID(),
        friendMember,
        "August",
      ]);
      assert.equal(
        (
          await as<{ member_id: string }>(
            owner,
            "select member_id from public.rides where id=$1",
            [request],
          )
        )[0].member_id,
        friendMember,
      );
    },
  );
  await t.test(
    "Storno-Verlauf enthält Zeitpunkt, Akteur und genau eine Gegenbuchung",
    async () => {
      const [r] = await as<{
        voided_at: string;
        void_reason: string;
        voided_by_member_id: string;
      }>(owner, "select * from public.rides where id=$1", [request]);
      assert.ok(r.voided_at);
      assert.equal(r.void_reason, "Doppelt");
      assert.equal(r.voided_by_member_id, ownerMember);
    },
  );
  await t.test(
    "Letzter Admin bleibt; deaktiviertes Mitglied verliert alle Gruppenrechte",
    async () => {
      await assert.rejects(
        () =>
          as(owner, "select public.update_member($1,$2,$3,'member',true)", [
            gid,
            randomUUID(),
            ownerMember,
          ]),
        /aktiver Admin/,
      );
      await as(owner, "select public.update_member($1,$2,$3,'member',false)", [
        gid,
        randomUUID(),
        friendMember,
      ]);
      assert.equal(
        (await as(friend, "select * from public.memberships")).length,
        0,
      );
      await assert.rejects(
        () =>
          as(friend, "select public.record_ride($1,$2,$3,1,0,$4)", [
            gid,
            randomUUID(),
            when,
            "",
          ]),
        /Keine Berechtigung/,
      );
      await assert.rejects(
        () => as(friend, "select public.join_group($1,'August')", [token]),
        /deaktiviert/,
      );
    },
  );
  await t.test(
    "Dashboard enthält Journal und Fahrten aus einem Aufruf",
    async () => {
      const [{ value }] = await as<{
        value: { members: unknown[]; rides: unknown[]; entries: unknown[] };
      }>(owner, "select public.get_dashboard($1) as value", [gid]);
      assert.equal(value.members.length, 2);
      assert.equal(value.rides.length, 2);
      assert.ok(value.entries.length >= 5);
    },
  );
  await t.test(
    "Gemeinsame Aufladungen verteilen Beiträge und Minuten atomar",
    async () => {
      await as(owner, "select public.update_member($1,$2,$3,'member',true)", [
        gid,
        randomUUID(),
        friendMember,
      ]);
      await as(outsider, "select public.join_group($1,'Max')", [token]);
      const maxMember = (
        await as<{ id: string }>(
          owner,
          "select id from public.memberships where user_id=$1",
          [outsider],
        )
      )[0].id;
      const inputs = [
        { member_id: ownerMember, amount_rappen: 3000 },
        { member_id: friendMember, amount_rappen: 4500 },
        { member_id: maxMember, amount_rappen: 1500 },
      ];
      const id = randomUUID(),
        date = "2026-01-03T12:00:00Z";
      const sql = "select public.record_topup($1,$2,$3,$4,$5,$6,$7,$8)";
      const params = [
        gid,
        id,
        ownerMember,
        600,
        9000,
        date,
        JSON.stringify(inputs),
        "Gemeinsame Aufladung",
      ];
      // Normales aktives Mitglied darf gemeinsame Aufladungen buchen (auch mit anderem Mitglied als Käufer).
      await as(friend, sql, params);
      await as(friend, sql, params);
      const cs = await as<{
        member_id: string;
        amount_rappen: number;
        allocated_seconds: number;
      }>(
        owner,
        "select * from public.package_contributions where package_id=$1",
        [id],
      );
      assert.equal(cs.length, 3);
      for (const c of cs)
        assert.equal(
          Number(c.allocated_seconds),
          allocateMinutes(600, 9000, inputs).find(
            (x) => x.member_id === c.member_id,
          )!.minutes * 60,
        );
      const entries = await as<{ seconds: number; created_by: string }>(
        owner,
        "select * from public.minute_entries where package_id=$1",
        [id],
      );
      assert.equal(entries.length, 3);
      assert.equal(
        entries.reduce((n, e) => n + Number(e.seconds), 0),
        36000,
      );
      assert.ok(entries.every((e) => e.created_by === friend));
      await assert.rejects(
        () =>
          as(
            friend,
            "insert into public.package_contributions(group_id) values($1)",
            [gid],
          ),
        /permission denied/,
      );
      // Ein Cent pro Person, zehn Minuten: Summe bleibt zehn, nicht neun oder zwölf.
      const tiny = inputs.map((c) => ({ ...c, amount_rappen: 1 })),
        roundId = randomUUID();
      await as(owner, sql, [
        gid,
        roundId,
        ownerMember,
        10,
        3,
        date,
        JSON.stringify(tiny),
        "Rundung",
      ]);
      const rounded = await as<{
        member_id: string;
        allocated_seconds: number;
      }>(
        owner,
        "select * from public.package_contributions where package_id=$1",
        [roundId],
      );
      for (const c of rounded)
        assert.equal(
          Number(c.allocated_seconds),
          allocateMinutes(10, 3, tiny).find((x) => x.member_id === c.member_id)!
            .minutes * 60,
        );
      assert.equal(
        rounded.reduce((n, c) => n + Number(c.allocated_seconds), 0),
        600,
      );
      const invalid = randomUUID();
      for (const bad of [
        inputs.slice(0, 1),
        [inputs[0], inputs[0]],
        [{ member_id: ownerMember, amount_rappen: -9000 }],
        [{ member_id: randomUUID(), amount_rappen: 9000 }],
      ]) {
        await assert.rejects(() =>
          as(owner, sql, [
            gid,
            invalid,
            ownerMember,
            600,
            9000,
            date,
            JSON.stringify(bad),
            "Ungültig",
          ]),
        );
        assert.equal(
          (
            await as(owner, "select * from public.packages where id=$1", [
              invalid,
            ])
          ).length,
          0,
        );
        assert.equal(
          (
            await as(
              owner,
              "select * from public.minute_entries where package_id=$1",
              [invalid],
            )
          ).length,
          0,
        );
      }
      await as(owner, sql, [
        gid,
        invalid,
        ownerMember,
        600,
        9000,
        date,
        JSON.stringify(inputs),
        "Jetzt gültig",
      ]);
      const [snap] = await as<{ value: { contributions: unknown[] } }>(
        owner,
        "select public.get_dashboard($1) as value",
        [gid],
      );
      assert.equal(snap.value.contributions.length, 9);
      const unknown = randomUUID();
      await db.exec("reset role");
      await db.query("insert into auth.users values($1)", [unknown]);
      for (const mode of [
        "equal",
        "minutes",
      ] as const satisfies readonly SplitMode[]) {
        const splitId = randomUUID();
        const plan = {
          mode,
          shares: [
            { member_id: friendMember, weight: mode === "equal" ? 1 : 24 },
            { member_id: ownerMember, weight: mode === "equal" ? 1 : 77 },
          ],
        };
        const payerId = mode === "equal" ? friendMember : ownerMember;
        const args = [
          gid,
          splitId,
          payerId,
          101,
          1,
          date,
          JSON.stringify(plan),
          mode,
        ];
        await assert.rejects(
          () => as(unknown, sql, args),
          /Keine Berechtigung/,
        );
        for (const shares of [
          [],
          [plan.shares[0], plan.shares[0]],
          [{ member_id: ownerMember, weight: 2 }],
          [{ member_id: randomUUID(), weight: mode === "equal" ? 1 : 101 }],
        ]) {
          const invalidArgs = [...args];
          invalidArgs[6] = JSON.stringify({ mode, shares });
          await assert.rejects(() => as(friend, sql, invalidArgs));
        }
        await as(friend, sql, args);
        await as(friend, sql, args);
        const [pkgRow] = await as<{ payer_id: string }>(
          owner,
          "select payer_id from public.packages where id=$1",
          [splitId],
        );
        assert.equal(pkgRow.payer_id, payerId);
        const stored = await as<{
          member_id: string;
          minutes: number;
          amount_rappen: number;
        }>(
          owner,
          "select member_id,(allocated_seconds/60)::int as minutes, amount_rappen::int from public.package_contributions where package_id=$1 order by member_id",
          [splitId],
        );
        assert.deepEqual(
          stored,
          splitPackage(101, 1, plan).sort((a, b) =>
            a.member_id.localeCompare(b.member_id),
          ),
        );
        const credits = await as<{ seconds: number; created_by: string }>(
          owner,
          "select seconds::int, created_by from public.minute_entries where package_id=$1",
          [splitId],
        );
        assert.equal(
          credits.reduce((n, c) => n + c.seconds, 0),
          6060,
        );
        assert.ok(credits.every((c) => c.created_by === friend));
      }
      // Keine Berechtigung für eine fremde Gruppe: weder Beiträge noch Snapshot.
      assert.equal(
        (await as(unknown, "select * from public.package_contributions"))
          .length,
        0,
      );
    },
  );
  await t.test(
    "Fahrtorte werden gerundet, validiert und Feedback nach Rollenrechten geschützt",
    async () => {
      const locRide = randomUUID();
      await as(
        friend,
        "select public.record_ride($1,$2,$3,12,1,'Arbeitsweg',$4,$5,$6,$7,$8,$9)",
        [
          gid,
          locRide,
          "2026-01-03T07:30:00Z",
          "  Zürich HB  ",
          47.377949,
          8.540349,
          "  ETH Polyterrasse ",
          47.376311,
          8.547611,
        ],
      );
      const [saved] = await as<{
        start_label: string;
        start_lat: number;
        end_label: string;
        end_lng: number;
      }>(
        owner,
        "select start_label,start_lat,end_label,end_lng from public.rides where id=$1",
        [locRide],
      );
      assert.equal(saved.start_label, "Zürich HB");
      assert.equal(saved.start_lat, 47.3779);
      assert.equal(saved.end_label, "ETH Polyterrasse");
      assert.equal(saved.end_lng, 8.5476);

      // Unvollständige oder unmögliche Koordinaten werden abgewiesen:
      await assert.rejects(
        () =>
          as(
            friend,
            "select public.record_ride($1,$2,$3,5,0,'','HB',47.37,null,'',null,null)",
            [gid, randomUUID(), "2026-01-03T08:00:00Z"],
          ),
        /Unvollständige/,
      );
      await assert.rejects(
        () =>
          as(
            friend,
            "select public.record_ride($1,$2,$3,5,0,'','HB',95.0,8.54,'',null,null)",
            [gid, randomUUID(), "2026-01-03T08:00:00Z"],
          ),
        /Ungültiger Startort/,
      );

      // Feedback: Mitglied speichert eigenes Feedback; Admin sieht alle, Mitglied nur eigene.
      const fbFriend = randomUUID(),
        fbOwner = randomUUID(),
        fbMax = randomUUID();
      const [{ id: maxMember }] = await as<{ id: string }>(
        owner,
        "select id from public.memberships where group_id=$1 and user_id=$2",
        [gid, outsider],
      );
      await as(
        friend,
        "select public.submit_feedback($1,$2,'idea',$3,'Statistik')",
        [gid, fbFriend, "  Uhrzeitfilter ist super  "],
      );
      await as(
        friend,
        "select public.submit_feedback($1,$2,'idea',$3,'Statistik')",
        [gid, fbFriend, "Uhrzeitfilter ist super"],
      );
      await as(
        owner,
        "select public.submit_feedback($1,$2,'bug',$3,'Fahrten')",
        [gid, fbOwner, "Admin-Notiz zum Launch"],
      );

      const friendVisible = await as<{ id: string; message: string }>(
        friend,
        "select id, message from public.feedback where group_id=$1",
        [gid],
      );
      assert.equal(friendVisible.length, 1);
      assert.equal(friendVisible[0].id, fbFriend);
      assert.equal(friendVisible[0].message, "Uhrzeitfilter ist super");

      const ownerVisible = await as<{ id: string }>(
        owner,
        "select id from public.feedback where group_id=$1",
        [gid],
      );
      assert.equal(ownerVisible.length, 2);

      const [dashFriend] = await as<{ value: { feedback: { id: string }[] } }>(
        friend,
        "select public.get_dashboard($1) as value",
        [gid],
      );
      assert.equal(dashFriend.value.feedback.length, 1);
      assert.equal(dashFriend.value.feedback[0].id, fbFriend);

      const [dashOwner] = await as<{ value: { feedback: { id: string }[] } }>(
        owner,
        "select public.get_dashboard($1) as value",
        [gid],
      );
      assert.equal(dashOwner.value.feedback.length, 2);

      // Weiteres aktives Mitglied (Max) sendet Feedback; Sortierung neueste zuerst (created_at desc).
      await as(
        outsider,
        "select public.submit_feedback($1,$2,'praise',$3,'Übersicht')",
        [gid, fbMax, "Gute App für die Crew"],
      );
      await db.exec("reset role");
      await db.query("update public.feedback set created_at=$2 where id=$1", [
        fbFriend,
        "2026-01-03T10:00:00Z",
      ]);
      await db.query("update public.feedback set created_at=$2 where id=$1", [
        fbOwner,
        "2026-01-03T11:00:00Z",
      ]);
      await db.query("update public.feedback set created_at=$2 where id=$1", [
        fbMax,
        "2026-01-03T12:00:00Z",
      ]);

      const [dashFriendMulti] = await as<{
        value: { feedback: { id: string }[] };
      }>(friend, "select public.get_dashboard($1) as value", [gid]);
      assert.deepEqual(
        dashFriendMulti.value.feedback.map((f) => f.id),
        [fbFriend],
      );

      const [dashMax] = await as<{ value: { feedback: { id: string }[] } }>(
        outsider,
        "select public.get_dashboard($1) as value",
        [gid],
      );
      assert.deepEqual(
        dashMax.value.feedback.map((f) => f.id),
        [fbMax],
      );

      const [dashOwnerOrdered] = await as<{
        value: { feedback: { id: string; member_id: string }[] };
      }>(owner, "select public.get_dashboard($1) as value", [gid]);
      assert.deepEqual(
        dashOwnerOrdered.value.feedback.map((f) => f.id),
        [fbMax, fbOwner, fbFriend],
      );

      // Feedback eines später deaktivierten Mitglieds bleibt für Admins sichtbar;
      // das deaktivierte Mitglied selbst verliert den Zugriff.
      await as(owner, "select public.update_member($1,$2,$3,'member',false)", [
        gid,
        randomUUID(),
        maxMember,
      ]);
      assert.equal(
        (
          await as(
            outsider,
            "select id from public.feedback where group_id=$1",
            [gid],
          )
        ).length,
        0,
      );
      const [dashOwnerAfterDeact] = await as<{
        value: { feedback: { id: string; member_id: string }[] };
      }>(owner, "select public.get_dashboard($1) as value", [gid]);
      assert.deepEqual(
        dashOwnerAfterDeact.value.feedback.map((f) => f.id),
        [fbMax, fbOwner, fbFriend],
      );
      assert.equal(dashOwnerAfterDeact.value.feedback[0].member_id, maxMember);

      // Gruppenfremde Person (Nicht-Mitglied) sieht 0 Feedback-Einträge.
      const unknownUser = randomUUID();
      await db.exec("reset role");
      await db.query("insert into auth.users values($1)", [unknownUser]);
      assert.equal(
        (
          await as(
            unknownUser,
            "select id from public.feedback where group_id=$1",
            [gid],
          )
        ).length,
        0,
      );
      assert.equal(
        (await as(unknownUser, "select id from public.feedback")).length,
        0,
      );

      // Direktes DELETE und UPDATE auf public.feedback sind sowohl für Mitglieder als auch für Admins gesperrt.
      await assert.rejects(
        () => as(friend, "delete from public.feedback where id=$1", [fbFriend]),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          as(
            friend,
            "update public.feedback set message='Geändert' where id=$1",
            [fbFriend],
          ),
        /permission denied/,
      );
      await assert.rejects(
        () => as(owner, "delete from public.feedback where id=$1", [fbFriend]),
        /permission denied/,
      );
      await assert.rejects(
        () =>
          as(
            owner,
            "update public.feedback set message='Geändert' where id=$1",
            [fbFriend],
          ),
        /permission denied/,
      );
    },
  );
  await t.test(
    "Benutzerkonten und Passwort-Zurücksetzungen sind per RLS nach Rolle geschützt",
    async () => {
      await db.exec("reset role");
      await db.query(
        "insert into public.user_accounts(user_id,username) values($1,'oskar'),($2,'august')",
        [owner, friend],
      );
      const resetId = randomUUID();
      await db.query(
        "insert into public.password_reset_requests(id,group_id,member_id,target_user_id,username,note) values($1,$2,$3,$4,'august','Passwort vergessen')",
        [resetId, gid, friendMember, friend],
      );

      const [friendDash] = await as<{
        value: { accounts: unknown[]; reset_requests: unknown[] };
      }>(friend, "select public.get_dashboard($1) as value", [gid]);
      assert.equal(friendDash.value.accounts.length, 2);
      assert.equal(friendDash.value.reset_requests.length, 0);

      const [ownerDash] = await as<{
        value: { reset_requests: { id: string; status: string }[] };
      }>(owner, "select public.get_dashboard($1) as value", [gid]);
      assert.equal(ownerDash.value.reset_requests.length, 1);
      assert.equal(ownerDash.value.reset_requests[0].status, "open");

      await assert.rejects(
        () =>
          as(friend, "select public.dismiss_password_reset($1,$2,$3)", [
            gid,
            randomUUID(),
            resetId,
          ]),
        /Keine Berechtigung/,
      );

      await as(owner, "select public.dismiss_password_reset($1,$2,$3)", [
        gid,
        randomUUID(),
        resetId,
      ]);
      const [afterDismiss] = await as<{
        value: { reset_requests: { status: string }[] };
      }>(owner, "select public.get_dashboard($1) as value", [gid]);
      assert.equal(afterDismiss.value.reset_requests[0].status, "dismissed");
    },
  );
  await t.test(
    "Rate-Limit, Invite-Only-Status und Einladungs-Sperre schützen vor Missbrauch",
    async () => {
      // Sobald ein Club existiert, verlangt die Registrierung zwingend eine Einladung:
      const [reqInv] = await as<{ required: boolean }>(
        friend,
        "select public.registration_requires_invite() as required",
      );
      assert.equal(reqInv.required, true);

      // Normale Clients (authenticated / anon) dürfen check_public_rate_limit NICHT direkt aufrufen:
      await assert.rejects(
        () =>
          as(
            friend,
            "select public.check_public_rate_limit('ip:test', 5, 600)",
          ),
        /permission denied/,
      );
      await db.exec("reset role; set role anon;");
      await assert.rejects(
        () =>
          db.query("select public.check_public_rate_limit('ip:test', 5, 600)"),
        /permission denied/,
      );

      // Backend (service_role / postgres) begrenzt zuverlässig nach p_limit Treffern:
      await db.exec("reset role");
      for (let i = 1; i <= 5; i++) {
        const { rows } = await db.query<{ ok: boolean }>(
          "select public.check_public_rate_limit('ip:register:abc', 5, 600) as ok",
        );
        assert.equal(rows[0].ok, true);
      }
      const { rows: blocked } = await db.query<{ ok: boolean }>(
        "select public.check_public_rate_limit('ip:register:abc', 5, 600) as ok",
      );
      assert.equal(blocked[0].ok, false);

      // Admin kann offene Einladungslinks sofort sperren; Nicht-Admins werden abgewiesen:
      const [{ freshToken }] = await as<{ freshToken: string }>(
        owner,
        'select public.create_invite($1,$2) as "freshToken"',
        [gid, randomUUID()],
      );
      await assert.rejects(
        () =>
          as(friend, "select public.revoke_invites($1,$2)", [
            gid,
            randomUUID(),
          ]),
        /Keine Berechtigung/,
      );
      const [{ count }] = await as<{ count: number }>(
        owner,
        "select public.revoke_invites($1,$2) as count",
        [gid, randomUUID()],
      );
      assert.ok(Number(count) >= 1);

      const lateUser = randomUUID();
      await db.exec("reset role");
      await db.query("insert into auth.users values($1)", [lateUser]);
      await assert.rejects(
        () => as(lateUser, "select public.join_group($1,'Spät')", [freshToken]),
        /ungültig oder abgelaufen/,
      );
    },
  );
  await t.test(
    "Geteilte Fahrt auf dem gleichen Scooter bucht beide Anteile atomar und erstattet beide bei Storno",
    async () => {
      const balBefore = async (memberId: string) => {
        const [{ sum }] = await as<{ sum: string }>(
          owner,
          "select coalesce(sum(seconds), 0)::text as sum from public.minute_entries where group_id=$1 and member_id=$2",
          [gid, memberId],
        );
        return Number(sum);
      };
      const ownerBefore = await balBefore(ownerMember);
      const friendBefore = await balBefore(friendMember);

      const sharedId = randomUUID();
      const args = [
        gid,
        sharedId,
        "2026-01-04T18:00:00Z",
        14,
        1,
        "Zu zweit nach Hause",
        "Bellevue",
        47.367,
        8.5451,
        "Seefeld",
        47.3578,
        8.5542,
        [friendMember],
      ];
      // Ungültiges Mitfahrenden-Mitglied wird abgewiesen ohne Teilbuchung:
      await assert.rejects(
        () =>
          as(
            owner,
            "select public.record_ride($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::uuid[])",
            [...args.slice(0, 12), [randomUUID()]],
          ),
        /Aktives Mitglied nicht gefunden/,
      );

      // Buchung + idempotente Wiederholung:
      await as(
        owner,
        "select public.record_ride($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::uuid[])",
        args,
      );
      await as(
        owner,
        "select public.record_ride($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::uuid[])",
        args,
      );

      const rows = await as<{
        member_id: string;
        duration_seconds: string;
        pause_seconds: string;
        charged_seconds: string;
        shared_rider_count: number;
      }>(
        owner,
        "select member_id, duration_seconds, pause_seconds, charged_seconds, shared_rider_count from public.rides where shared_group_id=$1 order by member_id",
        [sharedId],
      );
      assert.equal(rows.length, 2);
      for (const r of rows) {
        assert.equal(Number(r.duration_seconds), 420);
        assert.equal(Number(r.pause_seconds), 30);
        assert.equal(Number(r.charged_seconds), 450);
        assert.equal(r.shared_rider_count, 2);
      }
      assert.equal(await balBefore(ownerMember), ownerBefore - 450);
      assert.equal(await balBefore(friendMember), friendBefore - 450);

      // Storno erstattet beide Mitfahrenden atomar in einer Transaktion:
      await as(owner, "select public.void_ride($1,$2,$3,$4)", [
        gid,
        randomUUID(),
        sharedId,
        "Falsch geteilt",
      ]);
      assert.equal(await balBefore(ownerMember), ownerBefore);
      assert.equal(await balBefore(friendMember), friendBefore);
    },
  );
  await t.test(
    "Dev-Telemetrie (GPS/Entsperr-Timer) und RLS-geschützte Crew-Orte (100 m) funktionieren nach Rolle",
    async () => {
      const placeId = randomUUID();
      await assert.rejects(
        () =>
          as(
            friend,
            "select public.upsert_group_place($1,$2,'Test-Ort','Bahnhofplatz 1',47.3779,8.5403,100)",
            [gid, placeId],
          ),
        /Keine Berechtigung/,
      );

      await as(
        owner,
        "select public.upsert_group_place($1,$2,'Test-Ort','Bahnhofplatz 1',47.3779,8.5403,100)",
        [gid, placeId],
      );
      const [dashWithPlace] = await as<{
        value: {
          places: { id: string; label: string; radius_meters: number }[];
        };
      }>(friend, "select public.get_dashboard($1) as value", [gid]);
      assert.equal(dashWithPlace.value.places.length, 1);
      assert.equal(dashWithPlace.value.places[0].label, "Test-Ort");
      assert.equal(dashWithPlace.value.places[0].radius_meters, 100);

      // 16-Param record_ride speichert GPS- & App-Entsperr-Telemetrie:
      const teleRideId = randomUUID();
      await as(
        friend,
        "select public.record_ride($1,$2,$3,8,0,'GPS-Test','Test-Ort',47.3779,8.5403,'Bellevue',47.367,8.5451,$4::uuid[],true,true,true)",
        [gid, teleRideId, "2026-01-05T10:00:00Z", []],
      );
      const [tele] = await as<{
        start_gps: boolean;
        end_gps: boolean;
        unlocked_via_app: boolean;
      }>(
        owner,
        "select start_gps, end_gps, unlocked_via_app from public.rides where id=$1",
        [teleRideId],
      );
      assert.equal(tele.start_gps, true);
      assert.equal(tele.end_gps, true);
      assert.equal(tele.unlocked_via_app, true);

      // Admin kann Ort wieder deaktivieren:
      await as(owner, "select public.deactivate_group_place($1,$2,$3)", [
        gid,
        randomUUID(),
        placeId,
      ]);
      const [dashAfterDeact] = await as<{ value: { places: unknown[] } }>(
        owner,
        "select public.get_dashboard($1) as value",
        [gid],
      );
      assert.equal(dashAfterDeact.value.places.length, 0);
    },
  );
  await t.test(
    "Normale Mitglieder dürfen Minutenpakete erfassen; Sicherheitsgrenzen bleiben dicht",
    async () => {
      const topupSql = "select public.record_topup($1,$2,$3,$4,$5,$6,$7,$8)";
      const topupDate = "2026-01-05T12:00:00Z";
      const equalPlan = JSON.stringify({
        mode: "equal",
        shares: [
          { member_id: friendMember, weight: 1 },
          { member_id: ownerMember, weight: 1 },
        ],
      });

      // 1. p_note => null wird sauber als '' gespeichert; created_by protokolliert das buchende Mitglied.
      const nullNoteId = randomUUID();
      await as(friend, topupSql, [
        gid,
        nullNoteId,
        friendMember,
        120,
        1800,
        topupDate,
        equalPlan,
        null,
      ]);
      // Idempotente Wiederholung mit p_note => null erzeugt keine Doppelbuchung.
      await as(friend, topupSql, [
        gid,
        nullNoteId,
        friendMember,
        120,
        1800,
        topupDate,
        equalPlan,
        null,
      ]);
      const [nullNotePkg] = await as<{ note: string; payer_id: string }>(
        owner,
        "select note, payer_id from public.packages where id=$1",
        [nullNoteId],
      );
      assert.equal(nullNotePkg.note, "");
      assert.equal(nullNotePkg.payer_id, friendMember);
      const nullNoteEntries = await as<{ seconds: number; created_by: string }>(
        owner,
        "select seconds::int, created_by from public.minute_entries where package_id=$1",
        [nullNoteId],
      );
      assert.equal(nullNoteEntries.length, 2);
      assert.ok(nullNoteEntries.every((e) => e.created_by === friend));

      // 2. Überlange Notiz (>500 Zeichen) wird VOR app_private.claim abgelehnt; danach klappt derselbe Schlüssel.
      const longNoteId = randomUUID();
      await assert.rejects(
        () =>
          as(friend, topupSql, [
            gid,
            longNoteId,
            friendMember,
            60,
            900,
            topupDate,
            equalPlan,
            "x".repeat(501),
          ]),
        /500 Zeichen/,
      );
      assert.equal(
        (
          await as(owner, "select id from public.packages where id=$1", [
            longNoteId,
          ])
        ).length,
        0,
      );
      assert.equal(
        (
          await as(
            owner,
            "select id from public.package_contributions where package_id=$1",
            [longNoteId],
          )
        ).length,
        0,
      );
      assert.equal(
        (
          await as(
            owner,
            "select id from public.minute_entries where package_id=$1",
            [longNoteId],
          )
        ).length,
        0,
      );
      // Derselbe Request-Key ist nach der Ablehnung noch frei:
      await as(friend, topupSql, [
        gid,
        longNoteId,
        friendMember,
        60,
        900,
        topupDate,
        equalPlan,
        "  Kurze Notiz  ",
      ]);
      const [trimmedPkg] = await as<{ note: string }>(
        owner,
        "select note from public.packages where id=$1",
        [longNoteId],
      );
      assert.equal(trimmedPkg.note, "Kurze Notiz");

      // 3. Ungültige p_contributions (null / Skalar) und null p_request_id werden sauber abgewiesen.
      for (const badJson of [null, "123", '"text"']) {
        await assert.rejects(
          () =>
            as(friend, topupSql, [
              gid,
              randomUUID(),
              friendMember,
              60,
              900,
              topupDate,
              badJson,
              "",
            ]),
          /Unbekannte Aufteilung/,
        );
      }
      await assert.rejects(
        () =>
          as(friend, topupSql, [
            gid,
            null,
            friendMember,
            60,
            900,
            topupDate,
            equalPlan,
            "",
          ]),
        /Ungültige Anfrage/,
      );

      // 4. Deaktiviertes Mitglied (Max / outsider) darf weder buchen noch als Zahler/Teilnehmer vorkommen.
      const [{ id: inactiveMaxMember }] = await as<{ id: string }>(
        owner,
        "select id from public.memberships where group_id=$1 and user_id=$2",
        [gid, outsider],
      );
      await assert.rejects(
        () =>
          as(outsider, topupSql, [
            gid,
            randomUUID(),
            ownerMember,
            60,
            900,
            topupDate,
            equalPlan,
            "",
          ]),
        /Keine Berechtigung/,
      );
      await assert.rejects(
        () =>
          as(friend, topupSql, [
            gid,
            randomUUID(),
            inactiveMaxMember,
            60,
            900,
            topupDate,
            equalPlan,
            "",
          ]),
        /Aktives Mitglied nicht gefunden/,
      );
      await assert.rejects(
        () =>
          as(friend, topupSql, [
            gid,
            randomUUID(),
            friendMember,
            60,
            900,
            topupDate,
            JSON.stringify({
              mode: "equal",
              shares: [{ member_id: inactiveMaxMember, weight: 1 }],
            }),
            "",
          ]),
        /Aktives Mitglied nicht gefunden/,
      );

      // 5. Gruppenfremde Personen und Cross-Group-IDs werden vollständig blockiert.
      const otherGroupUser = randomUUID();
      await db.exec("reset role");
      await db.query("insert into auth.users values($1)", [otherGroupUser]);
      const [{ id: otherGid }] = await as<{ id: string }>(
        otherGroupUser,
        "select public.create_group('Andere Crew','Lena',$1) as id",
        [randomUUID()],
      );
      const [{ id: otherGroupMember }] = await as<{ id: string }>(
        otherGroupUser,
        "select id from public.memberships where group_id=$1 and user_id=$2",
        [otherGid, otherGroupUser],
      );
      await assert.rejects(
        () =>
          as(otherGroupUser, topupSql, [
            gid,
            randomUUID(),
            ownerMember,
            60,
            900,
            topupDate,
            equalPlan,
            "",
          ]),
        /Keine Berechtigung/,
      );
      await assert.rejects(
        () =>
          as(friend, topupSql, [
            gid,
            randomUUID(),
            otherGroupMember,
            60,
            900,
            topupDate,
            equalPlan,
            "",
          ]),
        /Aktives Mitglied nicht gefunden/,
      );
      await assert.rejects(
        () =>
          as(friend, topupSql, [
            gid,
            randomUUID(),
            friendMember,
            60,
            900,
            topupDate,
            JSON.stringify({
              mode: "equal",
              shares: [{ member_id: otherGroupMember, weight: 1 }],
            }),
            "",
          ]),
        /Aktives Mitglied nicht gefunden/,
      );

      // 6. Anonyme Rolle (anon) darf record_topup nicht aufrufen.
      await db.exec("reset role; set role anon");
      await assert.rejects(
        () =>
          db.query(topupSql, [
            gid,
            randomUUID(),
            friendMember,
            60,
            900,
            topupDate,
            equalPlan,
            "",
          ]),
        /permission denied/,
      );

      // 7. Direkte Schreibzugriffe (INSERT/UPDATE/DELETE) auf packages, package_contributions und minute_entries bleiben gesperrt.
      for (const stmt of [
        "insert into public.packages(id,group_id,payer_id,seconds,price_rappen,purchased_at) values(gen_random_uuid(),$1,$2,60,100,now())",
        "update public.packages set note='Hack' where group_id=$1 and payer_id=$2",
        "delete from public.packages where group_id=$1 and payer_id=$2",
        "insert into public.package_contributions(group_id,package_id,member_id,amount_rappen,allocated_seconds) values($1,$3,$2,100,60)",
        "update public.package_contributions set amount_rappen=1 where group_id=$1 and member_id=$2",
        "delete from public.package_contributions where group_id=$1 and member_id=$2",
        "insert into public.minute_entries(group_id,member_id,seconds,kind,reason,created_by) values($1,$2,60,'credit','Hack',auth.uid())",
        "update public.minute_entries set seconds=9999 where group_id=$1 and member_id=$2",
        "delete from public.minute_entries where group_id=$1 and member_id=$2",
      ]) {
        const params = stmt.includes("$3")
          ? [gid, friendMember, nullNoteId]
          : [gid, friendMember];
        await assert.rejects(
          () => as(friend, stmt, params),
          /permission denied/,
        );
      }

      // 8. credit_minutes und legacy record_package bleiben für normale Mitglieder streng gesperrt.
      await assert.rejects(
        () =>
          as(friend, "select public.credit_minutes($1,$2,$3,50,'Bonus')", [
            gid,
            randomUUID(),
            friendMember,
          ]),
        /Keine Berechtigung/,
      );
      await assert.rejects(
        () =>
          as(
            friend,
            "select public.record_package($1,$2,$3,60,900,$4,'Legacy')",
            [gid, randomUUID(), friendMember, topupDate],
          ),
        /Keine Berechtigung/,
      );
    },
  );
  await db.close();
});

test("Upgrade ergänzt den Akteur alter Stornos ohne Guthabenänderung", async () => {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;`);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202611180001_initial.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const user = randomUUID(),
    req = randomUUID(),
    ride = randomUUID();
  await db.query("insert into auth.users values($1)", [user]);
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [user]);
  const [{ gid }] = (
    await db.query<{ gid: string }>(
      "select public.create_group('Crew','Oskar',$1) as gid",
      [req],
    )
  ).rows;
  await db.query(
    "select public.record_ride($1,$2,'2026-01-01T12:00Z',14,1,'')",
    [gid, ride],
  );
  await db.query("select public.void_ride($1,$2,$3,'Versehentlich doppelt')", [
    gid,
    randomUUID(),
    ride,
  ]);
  await db.exec(
    await readFile(
      new URL(
        "../supabase/migrations/202611190001_names_and_cancellations.sql",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  const [{ actor, balance }] = (
    await db.query<{ actor: string; balance: string }>(
      `select m.user_id as actor,(select sum(seconds) from public.minute_entries) as balance
    from public.rides r join public.memberships m on m.id=r.voided_by_member_id where r.id=$1`,
      [ride],
    )
  ).rows;
  assert.equal(actor, user);
  assert.equal(Number(balance), 0);
  assert.equal((await db.query("select * from public.rides")).rows.length, 1);
  await db.close();
});

async function createAccountDeletionDb() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
    grant usage on schema auth to authenticated, anon, service_role;
    grant execute on function auth.uid() to authenticated, anon, service_role;`);
  const migrationDir = new URL("../supabase/migrations/", import.meta.url);
  for (const file of (await readdir(migrationDir))
    .filter((f) => f.endsWith(".sql"))
    .sort()) {
    await db.exec(await readFile(new URL(file, migrationDir), "utf8"));
  }
  async function as<T = Record<string, unknown>>(
    user: string,
    sql: string,
    params: unknown[] = [],
  ) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      user,
    ]);
    await db.exec("set role authenticated");
    return (await db.query<T>(sql, params)).rows;
  }
  async function asService<T = Record<string, unknown>>(
    sql: string,
    params: unknown[] = [],
  ) {
    await db.exec("reset role; set role service_role");
    return (await db.query<T>(sql, params)).rows;
  }
  async function deleteUserAccount(userId: string) {
    const [{ summary }] = await asService<{
      summary: {
        ok: boolean;
        groups_updated: number;
        promoted_admins: number;
        expired_invites: number;
      };
    }>("select public.prepare_account_deletion($1) as summary", [userId]);
    await db.exec("reset role");
    await db.query("delete from auth.users where id = $1", [userId]);
    return summary;
  }
  return { db, as, asService, deleteUserAccount };
}

test("Kontolöschung: Selbstlöschung, Anonymisierung, Admin-Übergabe und Rechte", async (t) => {
  const { db, as, asService, deleteUserAccount } =
    await createAccountDeletionDb();
  const alice = randomUUID(),
    bob = randomUUID(),
    charlie = randomUUID(),
    dora = randomUUID();
  for (const id of [alice, bob, charlie, dora]) {
    await db.query("insert into auth.users values($1)", [id]);
  }
  await db.query(
    "insert into public.user_accounts(user_id,username) values($1,'alice'),($2,'bob'),($3,'charlie'),($4,'dora')",
    [alice, bob, charlie, dora],
  );

  const [{ id: gid }] = await as<{ id: string }>(
    alice,
    "select public.create_group('Limmat Crew','Alice',$1) as id",
    [randomUUID()],
  );
  const [{ token }] = await as<{ token: string }>(
    alice,
    "select public.create_invite($1,$2) as token",
    [gid, randomUUID()],
  );
  await as(bob, "select public.join_group($1,'Bob')", [token]);
  await as(charlie, "select public.join_group($1,'Charlie')", [token]);
  await as(dora, "select public.join_group($1,'Dora')", [token]);

  const initialMembers = await as<{ id: string; user_id: string }>(
    alice,
    "select id, user_id from public.memberships where group_id=$1",
    [gid],
  );
  const aliceMember = initialMembers.find((m) => m.user_id === alice)!.id;
  const bobMember = initialMembers.find((m) => m.user_id === bob)!.id;
  const charlieMember = initialMembers.find((m) => m.user_id === charlie)!.id;
  const doraMember = initialMembers.find((m) => m.user_id === dora)!.id;

  await t.test(
    "1. Rechtegrenzen, ON DELETE Regeln und neue FK-Indizes sind aktiv",
    async () => {
      await assert.rejects(
        () => as(bob, "select public.prepare_account_deletion($1)", [bob]),
        /permission denied/,
      );
      await db.exec("reset role; set role anon");
      await assert.rejects(
        () => db.query("select public.prepare_account_deletion($1)", [bob]),
        /permission denied/,
      );

      await db.exec("reset role");
      const { rows: privs } = await db.query<{
        pub: boolean;
        anon: boolean;
        auth: boolean;
        srv: boolean;
      }>(`select
        has_function_privilege('public', 'public.prepare_account_deletion(uuid)', 'execute') as pub,
        has_function_privilege('anon', 'public.prepare_account_deletion(uuid)', 'execute') as anon,
        has_function_privilege('authenticated', 'public.prepare_account_deletion(uuid)', 'execute') as auth,
        has_function_privilege('service_role', 'public.prepare_account_deletion(uuid)', 'execute') as srv`);
      assert.deepEqual(privs[0], {
        pub: false,
        anon: false,
        auth: false,
        srv: true,
      });

      const { rows: fks } = await db.query<{
        tbl: string;
        col: string;
        del: string;
      }>(`select rel.relname as tbl, att.attname as col, c.confdeltype::text as del
        from pg_constraint c
        join pg_class rel on rel.oid = c.conrelid
        join pg_namespace nsp on nsp.oid = rel.relnamespace
        join pg_attribute att on att.attrelid = c.conrelid and att.attnum = any(c.conkey)
        join pg_class frel on frel.oid = c.confrelid
        join pg_namespace fnsp on fnsp.oid = frel.relnamespace
        where c.contype = 'f' and nsp.nspname = 'public'
          and fnsp.nspname = 'auth' and frel.relname = 'users'
        order by rel.relname, att.attname`);
      assert.deepEqual(fks, [
        { tbl: "feedback", col: "created_by", del: "n" },
        { tbl: "group_places", col: "created_by", del: "n" },
        { tbl: "groups", col: "created_by", del: "n" },
        { tbl: "memberships", col: "user_id", del: "n" },
        { tbl: "minute_entries", col: "created_by", del: "n" },
        { tbl: "password_reset_requests", col: "target_user_id", del: "c" },
        { tbl: "user_accounts", col: "user_id", del: "c" },
      ]);

      const { rows: idxRows } = await db.query<{ indexname: string }>(
        `select indexname from pg_indexes where schemaname = 'public'
         and indexname in (
           'minute_entries_created_by_idx',
           'feedback_created_by_idx',
           'group_places_created_by_idx',
           'reset_requests_target_user_idx'
         ) order by indexname`,
      );
      assert.deepEqual(
        idxRows.map((r) => r.indexname),
        [
          "feedback_created_by_idx",
          "group_places_created_by_idx",
          "minute_entries_created_by_idx",
          "reset_requests_target_user_idx",
        ],
      );
    },
  );

  let bobSoloRideId = "";
  let charlieResetId = "";

  await t.test(
    "2. Reguläre Selbstlöschung anonymisiert Mitgliedschaft, bereinigt PII/Kaskaden und erhält Buchhaltung exakt",
    async () => {
      const topupId = randomUUID();
      await as(bob, "select public.record_topup($1,$2,$3,$4,$5,$6,$7,$8)", [
        gid,
        topupId,
        bobMember,
        300,
        4500,
        "2026-01-02T10:00:00Z",
        JSON.stringify({
          mode: "equal",
          shares: [
            { member_id: aliceMember, weight: 1 },
            { member_id: bobMember, weight: 1 },
            { member_id: charlieMember, weight: 1 },
          ],
        }),
        "Gemeinsames Paket",
      ]);
      bobSoloRideId = randomUUID();
      await as(bob, "select public.record_ride($1,$2,$3,12,2,$4)", [
        gid,
        bobSoloRideId,
        "2026-01-03T09:00:00Z",
        "Zum See",
      ]);
      const sharedRideId = randomUUID();
      await as(
        bob,
        "select public.record_ride($1,$2,$3,10,0,'Zu zweit','',null,null,'',null,null,$4::uuid[])",
        [gid, sharedRideId, "2026-01-03T12:00:00Z", [charlieMember]],
      );
      await as(
        alice,
        "select public.credit_minutes($1,$2,$3,30,'Startbonus')",
        [gid, randomUUID(), aliceMember],
      );

      const bobRenameReq = randomUUID();
      const aliceRenameReq = randomUUID();
      await as(bob, "select public.rename_member($1,$2,$3,'Bobby')", [
        gid,
        bobRenameReq,
        bobMember,
      ]);
      await as(alice, "select public.rename_member($1,$2,$3,'Alice A.')", [
        gid,
        aliceRenameReq,
        aliceMember,
      ]);

      const bobFbId = randomUUID();
      const aliceFbId = randomUUID();
      await as(
        bob,
        "select public.submit_feedback($1,$2,'idea','Mein persönliches Feedback','Übersicht')",
        [gid, bobFbId],
      );
      await as(
        alice,
        "select public.submit_feedback($1,$2,'praise','Admin-Feedback bleibt','Übersicht')",
        [gid, aliceFbId],
      );

      await db.exec("reset role");
      charlieResetId = randomUUID();
      await db.query(
        "insert into public.password_reset_requests(id,group_id,member_id,target_user_id,username,note) values($1,$2,$3,$4,'bob','Hilfe'),($5,$2,$6,$7,'charlie','Bitte zurücksetzen')",
        [
          randomUUID(),
          gid,
          bobMember,
          bob,
          charlieResetId,
          charlieMember,
          charlie,
        ],
      );
      await asService("select public.check_public_rate_limit($1, 25, 600)", [
        `admin:${bob}`,
      ]);
      await asService("select public.check_public_rate_limit($1, 5, 600)", [
        `delete:${bob}`,
      ]);

      await db.exec("reset role");
      const balancesBefore = (
        await db.query<{ member_id: string; sum: string }>(
          "select member_id, coalesce(sum(seconds), 0)::text as sum from public.minute_entries where group_id=$1 group by member_id order by member_id",
          [gid],
        )
      ).rows;
      const countsBefore = (
        await db.query<{
          rides: string;
          packages: string;
          contribs: string;
          entries: string;
        }>(
          `select
            (select count(*) from public.rides where group_id=$1)::text as rides,
            (select count(*) from public.packages where group_id=$1)::text as packages,
            (select count(*) from public.package_contributions where group_id=$1)::text as contribs,
            (select count(*) from public.minute_entries where group_id=$1)::text as entries`,
          [gid],
        )
      ).rows[0];
      const bobCreatedEntriesBefore = (
        await db.query<{ id: string }>(
          "select id from public.minute_entries where created_by=$1",
          [bob],
        )
      ).rows.map((r) => r.id);
      assert.ok(bobCreatedEntriesBefore.length >= 5);

      const summary = await deleteUserAccount(bob);
      assert.deepEqual(summary, {
        ok: true,
        groups_updated: 1,
        promoted_admins: 0,
        expired_invites: 0,
      });

      await db.exec("reset role");
      assert.equal(
        (await db.query("select 1 from auth.users where id=$1", [bob])).rows
          .length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select 1 from public.user_accounts where user_id=$1",
            [bob],
          )
        ).rows.length,
        0,
      );
      // Benutzername 'bob' ist sofort wieder frei:
      const recycledUser = randomUUID();
      await db.query("insert into auth.users values($1)", [recycledUser]);
      await db.query(
        "insert into public.user_accounts(user_id,username) values($1,'bob')",
        [recycledUser],
      );
      await db.query("delete from auth.users where id=$1", [recycledUser]);

      // Passwort-Reset-Anfragen von Bob wurden kaskadiert, Charlies Anfrage bleibt:
      assert.equal(
        (
          await db.query(
            "select 1 from public.password_reset_requests where member_id=$1",
            [bobMember],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select 1 from public.password_reset_requests where id=$1",
            [charlieResetId],
          )
        ).rows.length,
        1,
      );

      // Eigenes Feedback gelöscht, fremdes erhalten:
      assert.equal(
        (
          await db.query("select id from public.feedback where group_id=$1", [
            gid,
          ])
        ).rows.length,
        1,
      );
      assert.equal(
        (
          await db.query<{ id: string }>(
            "select id from public.feedback where group_id=$1",
            [gid],
          )
        ).rows[0].id,
        aliceFbId,
      );

      // app_private.commands: rename/feedback von Bob bereinigt; Buchungs- & Fremdkommandos erhalten:
      const remainingCmds = (
        await db.query<{ request_id: string; operation: string }>(
          "select request_id, operation from app_private.commands where group_id=$1",
          [gid],
        )
      ).rows;
      assert.equal(
        remainingCmds.some((c) => c.request_id === bobRenameReq),
        false,
      );
      assert.equal(
        remainingCmds.some((c) => c.request_id === bobFbId),
        false,
      );
      assert.equal(
        remainingCmds.some((c) => c.request_id === aliceRenameReq),
        true,
      );
      assert.equal(
        remainingCmds.some((c) => c.request_id === aliceFbId),
        true,
      );
      assert.equal(
        remainingCmds.some((c) => c.request_id === topupId),
        true,
      );
      assert.equal(
        remainingCmds.some((c) => c.request_id === bobSoloRideId),
        true,
      );

      // Rate-Limit admin:<uid> entfernt, delete:<uid> für Retry-Schutz erhalten:
      assert.equal(
        (
          await db.query(
            "select 1 from app_private.rate_limits where bucket=$1",
            [`admin:${bob}`],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select 1 from app_private.rate_limits where bucket=$1",
            [`delete:${bob}`],
          )
        ).rows.length,
        1,
      );

      // Mitgliedschaft anonymisiert & user_id = NULL:
      const [bobRow] = (
        await db.query<{
          display_name: string;
          active: boolean;
          role: string;
          user_id: string | null;
        }>(
          "select display_name, active, role, user_id from public.memberships where id=$1",
          [bobMember],
        )
      ).rows;
      assert.deepEqual(bobRow, {
        display_name: "Gelöschtes Konto",
        active: false,
        role: "member",
        user_id: null,
      });

      // Buchhaltungszeilen und exakte Salden unverändert:
      const countsAfter = (
        await db.query<{
          rides: string;
          packages: string;
          contribs: string;
          entries: string;
        }>(
          `select
            (select count(*) from public.rides where group_id=$1)::text as rides,
            (select count(*) from public.packages where group_id=$1)::text as packages,
            (select count(*) from public.package_contributions where group_id=$1)::text as contribs,
            (select count(*) from public.minute_entries where group_id=$1)::text as entries`,
          [gid],
        )
      ).rows[0];
      assert.deepEqual(countsAfter, countsBefore);

      const balancesAfter = (
        await db.query<{ member_id: string; sum: string }>(
          "select member_id, coalesce(sum(seconds), 0)::text as sum from public.minute_entries where group_id=$1 group by member_id order by member_id",
          [gid],
        )
      ).rows;
      assert.deepEqual(balancesAfter, balancesBefore);

      // Audit-Spalte minute_entries.created_by auf NULL gesetzt für Bob, für Alice unverändert:
      const nulledEntries = (
        await db.query<{ created_by: string | null }>(
          "select created_by from public.minute_entries where id = any($1::uuid[])",
          [bobCreatedEntriesBefore],
        )
      ).rows;
      assert.ok(nulledEntries.every((e) => e.created_by === null));
      assert.ok(
        (
          await db.query(
            "select 1 from public.minute_entries where group_id=$1 and created_by=$2",
            [gid, alice],
          )
        ).rows.length >= 1,
      );
    },
  );

  await t.test(
    "3. Mehrere gelöschte Konten in derselben Gruppe kollidieren nicht mit UNIQUE(group_id, user_id)",
    async () => {
      const summary = await deleteUserAccount(dora);
      assert.deepEqual(summary, {
        ok: true,
        groups_updated: 1,
        promoted_admins: 0,
        expired_invites: 0,
      });
      await db.exec("reset role");
      const deletedRows = (
        await db.query<{ id: string; display_name: string }>(
          "select id, display_name from public.memberships where group_id=$1 and user_id is null order by id",
          [gid],
        )
      ).rows;
      assert.equal(deletedRows.length, 2);
      assert.ok(
        deletedRows.every((r) => r.display_name === "Gelöschtes Konto"),
      );
      assert.deepEqual(
        deletedRows.map((r) => r.id),
        [bobMember, doraMember].sort(),
      );
    },
  );

  await t.test(
    "4. get_dashboard funktioniert für verbleibende Mitglieder sauber nach Kontolöschungen",
    async () => {
      const [{ value: charlieDash }] = await as<{
        value: {
          members: {
            id: string;
            user_id: string | null;
            display_name: string;
          }[];
          accounts: { user_id: string; username: string }[];
          rides: unknown[];
          entries: unknown[];
          packages: unknown[];
          contributions: unknown[];
        };
      }>(charlie, "select public.get_dashboard($1) as value", [gid]);
      assert.equal(charlieDash.members.length, 4);
      const deletedInDash = charlieDash.members.filter(
        (m) => m.user_id === null,
      );
      assert.equal(deletedInDash.length, 2);
      assert.ok(
        deletedInDash.every((m) => m.display_name === "Gelöschtes Konto"),
      );
      assert.deepEqual(
        charlieDash.accounts.map((a) => a.username),
        ["alice", "charlie"],
      );
      assert.equal(charlieDash.rides.length, 3);
      assert.equal(charlieDash.packages.length, 1);
      assert.equal(charlieDash.contributions.length, 3);
      assert.ok(charlieDash.entries.length >= 6);
    },
  );

  await t.test(
    "5. update_member und rename_member sperren gelöschte Konten; Last-Admin ignoriert user_id IS NULL",
    async () => {
      await assert.rejects(
        () =>
          as(alice, "select public.update_member($1,$2,$3,'member',true)", [
            gid,
            randomUUID(),
            bobMember,
          ]),
        /Gelöschte Konten können nicht mehr geändert werden/,
      );
      await assert.rejects(
        () =>
          as(alice, "select public.update_member($1,$2,$3,'admin',true)", [
            gid,
            randomUUID(),
            bobMember,
          ]),
        /Gelöschte Konten können nicht mehr geändert werden/,
      );
      await assert.rejects(
        () =>
          as(alice, "select public.rename_member($1,$2,$3,'Geist')", [
            gid,
            randomUUID(),
            bobMember,
          ]),
        /Gelöschte Konten können nicht mehr umbenannt werden/,
      );
      await assert.rejects(
        () =>
          as(charlie, "select public.rename_member($1,$2,$3,'Geist')", [
            gid,
            randomUUID(),
            bobMember,
          ]),
        /nur deinen eigenen/,
      );

      // Verteidigung in der Tiefe: selbst eine verwaiste Admin-Zeile (user_id IS NULL) darf den letzten echten Admin nicht ersetzen.
      await db.exec("reset role");
      await db.query(
        "update public.memberships set active=true, role='admin' where id=$1",
        [bobMember],
      );
      try {
        await assert.rejects(
          () =>
            as(alice, "select public.update_member($1,$2,$3,'member',true)", [
              gid,
              randomUUID(),
              aliceMember,
            ]),
          /Mindestens ein aktiver Admin muss bleiben/,
        );
      } finally {
        await db.exec("reset role");
        await db.query(
          "update public.memberships set active=false, role='member' where id=$1",
          [bobMember],
        );
      }
    },
  );

  await t.test(
    "6. Löschung des letzten aktiven Admins befördert ältestes aktives Mitglied (created_at ASC, id ASC) und nullt created_by",
    async () => {
      const inactiveUser = randomUUID(),
        tieA = randomUUID(),
        tieB = randomUUID();
      await db.exec("reset role");
      for (const id of [inactiveUser, tieA, tieB]) {
        await db.query("insert into auth.users values($1)", [id]);
      }
      await as(inactiveUser, "select public.join_group($1,'Inaktiv')", [token]);
      await as(tieA, "select public.join_group($1,'TieA')", [token]);
      await as(tieB, "select public.join_group($1,'TieB')", [token]);

      const mRows = await as<{ id: string; user_id: string }>(
        alice,
        "select id, user_id from public.memberships where group_id=$1 and user_id = any($2::uuid[])",
        [gid, [inactiveUser, tieA, tieB]],
      );
      const inactiveMember = mRows.find((m) => m.user_id === inactiveUser)!.id;
      const tieAMember = mRows.find((m) => m.user_id === tieA)!.id;
      const tieBMember = mRows.find((m) => m.user_id === tieB)!.id;

      // Deaktiviertes Mitglied hat ältesten Zeitstempel; tieA und tieB teilen sich exakt denselben Zeitstempel vor Charlie:
      await as(alice, "select public.update_member($1,$2,$3,'member',false)", [
        gid,
        randomUUID(),
        inactiveMember,
      ]);
      await db.exec("reset role");
      await db.query(
        "update public.memberships set created_at='2025-12-01T00:00:00Z' where id=$1",
        [inactiveMember],
      );
      await db.query(
        "update public.memberships set created_at='2026-01-01T10:00:00Z' where id in ($1,$2)",
        [tieAMember, tieBMember],
      );
      await db.query(
        "update public.memberships set created_at='2026-01-02T10:00:00Z' where id=$1",
        [charlieMember],
      );

      // Alice hinterlässt group_places.created_by, rides.voided_by_member_id und password_reset_requests.resolved_by_member_id:
      const placeId = randomUUID();
      await as(
        alice,
        "select public.upsert_group_place($1,$2,'Depot','Seestrasse 1',47.36,8.54,100)",
        [gid, placeId],
      );
      await as(alice, "select public.void_ride($1,$2,$3,'Test-Storno')", [
        gid,
        randomUUID(),
        bobSoloRideId,
      ]);
      await as(alice, "select public.dismiss_password_reset($1,$2,$3)", [
        gid,
        randomUUID(),
        charlieResetId,
      ]);

      const expectedSuccessor =
        tieAMember < tieBMember ? tieAMember : tieBMember;
      const expectedSuccessorUser = tieAMember < tieBMember ? tieA : tieB;

      const summary = await deleteUserAccount(alice);
      assert.deepEqual(summary, {
        ok: true,
        groups_updated: 1,
        promoted_admins: 1,
        expired_invites: 0,
      });

      await db.exec("reset role");
      const activeAdmins = (
        await db.query<{ id: string }>(
          "select id from public.memberships where group_id=$1 and active and role='admin'",
          [gid],
        )
      ).rows;
      assert.deepEqual(
        activeAdmins.map((r) => r.id),
        [expectedSuccessor],
      );

      const [grp] = (
        await db.query<{ created_by: string | null }>(
          "select created_by from public.groups where id=$1",
          [gid],
        )
      ).rows;
      assert.equal(grp.created_by, null);

      const [place] = (
        await db.query<{ created_by: string | null }>(
          "select created_by from public.group_places where id=$1",
          [placeId],
        )
      ).rows;
      assert.equal(place.created_by, null);

      const [voidedRide] = (
        await db.query<{ voided_by_member_id: string }>(
          "select voided_by_member_id from public.rides where id=$1",
          [bobSoloRideId],
        )
      ).rows;
      assert.equal(voidedRide.voided_by_member_id, aliceMember);

      const [resolvedReset] = (
        await db.query<{ resolved_by_member_id: string }>(
          "select resolved_by_member_id from public.password_reset_requests where id=$1",
          [charlieResetId],
        )
      ).rows;
      assert.equal(resolvedReset.resolved_by_member_id, aliceMember);

      // Der automatisch beförderte Admin hat sofort volle Admin-Rechte:
      const [{ newToken }] = await as<{ newToken: string }>(
        expectedSuccessorUser,
        'select public.create_invite($1,$2) as "newToken"',
        [gid, randomUUID()],
      );
      assert.ok(newToken.length > 0);

      // Auch ein bereits deaktiviertes Mitglied kann sein Konto löschen, ohne Einladungen oder Admins zu beeinflussen:
      const inactiveSummary = await deleteUserAccount(inactiveUser);
      assert.deepEqual(inactiveSummary, {
        ok: true,
        groups_updated: 1,
        promoted_admins: 0,
        expired_invites: 0,
      });
      await db.exec("reset role");
      const [inactiveRow] = (
        await db.query<{
          display_name: string;
          active: boolean;
          role: string;
          user_id: string | null;
        }>(
          "select display_name, active, role, user_id from public.memberships where id=$1",
          [inactiveMember],
        )
      ).rows;
      assert.deepEqual(inactiveRow, {
        display_name: "Gelöschtes Konto",
        active: false,
        role: "member",
        user_id: null,
      });
      const openNewInv = (
        await db.query(
          "select 1 from public.invitations where token=$1 and expires_at > now()",
          [newToken],
        )
      ).rows;
      assert.equal(openNewInv.length, 1);
    },
  );

  await t.test(
    "7. Idempotenter Retry: doppelter prepare_account_deletion-Aufruf vor auth.users-Löschung befördert keinen zweiten Admin",
    async () => {
      const adm = randomUUID(),
        m1 = randomUUID(),
        m2 = randomUUID();
      await db.exec("reset role");
      for (const id of [adm, m1, m2]) {
        await db.query("insert into auth.users values($1)", [id]);
      }
      const [{ id: g2 }] = await as<{ id: string }>(
        adm,
        "select public.create_group('Retry Crew','Admin',$1) as id",
        [randomUUID()],
      );
      const [{ tok }] = await as<{ tok: string }>(
        adm,
        "select public.create_invite($1,$2) as tok",
        [g2, randomUUID()],
      );
      await as(m1, "select public.join_group($1,'Erster')", [tok]);
      await as(m2, "select public.join_group($1,'Zweiter')", [tok]);

      await db.exec("reset role");
      await db.query(
        "update public.memberships set created_at='2026-01-01T08:00:00Z' where group_id=$1 and user_id=$2",
        [g2, m1],
      );
      await db.query(
        "update public.memberships set created_at='2026-01-01T09:00:00Z' where group_id=$1 and user_id=$2",
        [g2, m2],
      );

      const [{ s1 }] = await asService<{
        s1: {
          ok: boolean;
          groups_updated: number;
          promoted_admins: number;
          expired_invites: number;
        };
      }>("select public.prepare_account_deletion($1) as s1", [adm]);
      assert.deepEqual(s1, {
        ok: true,
        groups_updated: 1,
        promoted_admins: 1,
        expired_invites: 0,
      });

      // user_id bleibt bis deleteUser erhalten, Mitgliedschaft ist aber bereits deaktiviert & anonymisiert:
      await db.exec("reset role");
      const [midState] = (
        await db.query<{
          active: boolean;
          role: string;
          display_name: string;
          user_id: string | null;
        }>(
          "select active, role, display_name, user_id from public.memberships where group_id=$1 and user_id=$2",
          [g2, adm],
        )
      ).rows;
      assert.deepEqual(midState, {
        active: false,
        role: "member",
        display_name: "Gelöschtes Konto",
        user_id: adm,
      });

      // Zweiter Aufruf vor deleteUser ist 100 % idempotent:
      const [{ s2 }] = await asService<{
        s2: {
          ok: boolean;
          groups_updated: number;
          promoted_admins: number;
          expired_invites: number;
        };
      }>("select public.prepare_account_deletion($1) as s2", [adm]);
      assert.deepEqual(s2, {
        ok: true,
        groups_updated: 0,
        promoted_admins: 0,
        expired_invites: 0,
      });

      await db.exec("reset role");
      const adminsAfterRetry = (
        await db.query<{ user_id: string }>(
          "select user_id from public.memberships where group_id=$1 and active and role='admin'",
          [g2],
        )
      ).rows;
      assert.deepEqual(
        adminsAfterRetry.map((r) => r.user_id),
        [m1],
      );

      await db.query("delete from auth.users where id=$1", [adm]);
      assert.equal(
        (
          await db.query(
            "select 1 from public.memberships where group_id=$1 and user_id is null",
            [g2],
          )
        ).rows.length,
        1,
      );
    },
  );

  await t.test(
    "8. Nutzer ohne Gruppenmitgliedschaft löscht sein Konto sauber",
    async () => {
      const noGroupUser = randomUUID();
      await db.exec("reset role");
      await db.query("insert into auth.users values($1)", [noGroupUser]);
      await db.query(
        "insert into public.user_accounts(user_id,username) values($1,'solo-ohne-gruppe')",
        [noGroupUser],
      );
      await asService("select public.check_public_rate_limit($1, 25, 600)", [
        `admin:${noGroupUser}`,
      ]);

      const summary = await deleteUserAccount(noGroupUser);
      assert.deepEqual(summary, {
        ok: true,
        groups_updated: 0,
        promoted_admins: 0,
        expired_invites: 0,
      });

      await db.exec("reset role");
      assert.equal(
        (await db.query("select 1 from auth.users where id=$1", [noGroupUser]))
          .rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select 1 from public.user_accounts where user_id=$1",
            [noGroupUser],
          )
        ).rows.length,
        0,
      );
      assert.equal(
        (
          await db.query(
            "select 1 from app_private.rate_limits where bucket=$1",
            [`admin:${noGroupUser}`],
          )
        ).rows.length,
        0,
      );
    },
  );

  await t.test(
    "9. Einziges aktives Mitglied: offene Einladungen verfallen und registration_requires_invite() öffnet erst bei 0 aktiven Konten",
    async () => {
      const iso = await createAccountDeletionDb();
      try {
        await iso.db.exec("reset role; set role anon");
        assert.equal(
          (
            await iso.db.query<{ req: boolean }>(
              "select public.registration_requires_invite() as req",
            )
          ).rows[0].req,
          false,
        );

        const f1 = randomUUID(),
          f2 = randomUUID(),
          stranger = randomUUID();
        await iso.db.exec("reset role");
        for (const id of [f1, f2, stranger]) {
          await iso.db.query("insert into auth.users values($1)", [id]);
        }
        await iso.db.query(
          "insert into public.user_accounts(user_id,username) values($1,'founder1'),($2,'founder2')",
          [f1, f2],
        );
        const [{ id: soloG1 }] = await iso.as<{ id: string }>(
          f1,
          "select public.create_group('Solo 1','Gründer 1',$1) as id",
          [randomUUID()],
        );
        const [{ inv1 }] = await iso.as<{ inv1: string }>(
          f1,
          "select public.create_invite($1,$2) as inv1",
          [soloG1, randomUUID()],
        );
        await iso.as(f1, "select public.create_invite($1,$2)", [
          soloG1,
          randomUUID(),
        ]);
        await iso.as(
          f2,
          "select public.create_group('Solo 2','Gründer 2',$1)",
          [randomUUID()],
        );

        const [{ reqBefore }] = await iso.asService<{ reqBefore: boolean }>(
          'select public.registration_requires_invite() as "reqBefore"',
        );
        assert.equal(reqBefore, true);

        const s1 = await iso.deleteUserAccount(f1);
        assert.deepEqual(s1, {
          ok: true,
          groups_updated: 1,
          promoted_admins: 0,
          expired_invites: 2,
        });

        await assert.rejects(
          () =>
            iso.as(stranger, "select public.join_group($1,'Fremd')", [inv1]),
          /ungültig oder abgelaufen/,
        );

        // Solange eine zweite Gruppe / ein zweites Konto existiert, bleibt Invite-Only aktiv:
        const [{ reqMid }] = await iso.asService<{ reqMid: boolean }>(
          'select public.registration_requires_invite() as "reqMid"',
        );
        assert.equal(reqMid, true);

        const s2 = await iso.deleteUserAccount(f2);
        assert.deepEqual(s2, {
          ok: true,
          groups_updated: 1,
          promoted_admins: 0,
          expired_invites: 0,
        });

        await iso.db.exec("reset role");
        assert.equal(
          (await iso.db.query("select 1 from public.groups")).rows.length,
          2,
        );
        assert.equal(
          (await iso.db.query("select 1 from public.user_accounts")).rows
            .length,
          0,
        );
        const [{ reqAfter }] = await iso.asService<{ reqAfter: boolean }>(
          'select public.registration_requires_invite() as "reqAfter"',
        );
        assert.equal(reqAfter, false);
      } finally {
        await iso.db.close();
      }
    },
  );

  await t.test(
    "10. Multi-Gruppen-Löschung verarbeitet Admin-Übergabe, Einladungsablauf und regulären Austritt in einer Transaktion",
    async () => {
      const multi = randomUUID(),
        peerX = randomUUID(),
        peerZ = randomUUID();
      await db.exec("reset role");
      for (const id of [multi, peerX, peerZ]) {
        await db.query("insert into auth.users values($1)", [id]);
      }

      // Gruppe X: multi ist letzter Admin, peerX ist aktives Mitglied
      const [{ id: gx }] = await as<{ id: string }>(
        multi,
        "select public.create_group('Gruppe X','Multi',$1) as id",
        [randomUUID()],
      );
      const [{ tokX }] = await as<{ tokX: string }>(
        multi,
        'select public.create_invite($1,$2) as "tokX"',
        [gx, randomUUID()],
      );
      await as(peerX, "select public.join_group($1,'Peer X')", [tokX]);

      // Gruppe Y: multi ist einziges aktives Mitglied mit offener Einladung
      const [{ id: gy }] = await as<{ id: string }>(
        multi,
        "select public.create_group('Gruppe Y','Multi',$1) as id",
        [randomUUID()],
      );
      await as(multi, "select public.create_invite($1,$2)", [gy, randomUUID()]);

      // Gruppe Z: peerZ ist Admin, multi ist normales Mitglied
      const [{ id: gz }] = await as<{ id: string }>(
        peerZ,
        "select public.create_group('Gruppe Z','Peer Z',$1) as id",
        [randomUUID()],
      );
      const [{ tokZ }] = await as<{ tokZ: string }>(
        peerZ,
        'select public.create_invite($1,$2) as "tokZ"',
        [gz, randomUUID()],
      );
      await as(multi, "select public.join_group($1,'Multi')", [tokZ]);

      const summary = await deleteUserAccount(multi);
      assert.deepEqual(summary, {
        ok: true,
        groups_updated: 3,
        promoted_admins: 1,
        expired_invites: 1,
      });

      await db.exec("reset role");
      const [pxRole] = (
        await db.query<{ role: string }>(
          "select role from public.memberships where group_id=$1 and user_id=$2",
          [gx, peerX],
        )
      ).rows;
      assert.equal(pxRole.role, "admin");

      const openInvitesY = (
        await db.query(
          "select 1 from public.invitations where group_id=$1 and expires_at > now()",
          [gy],
        )
      ).rows;
      assert.equal(openInvitesY.length, 0);

      const [pzRole] = (
        await db.query<{ role: string }>(
          "select role from public.memberships where group_id=$1 and user_id=$2",
          [gz, peerZ],
        )
      ).rows;
      assert.equal(pzRole.role, "admin");

      const multiDeletedRows = (
        await db.query<{ id: string }>(
          "select id from public.memberships where group_id in ($1,$2,$3) and user_id is null and display_name='Gelöschtes Konto' and active=false and role='member'",
          [gx, gy, gz],
        )
      ).rows;
      assert.equal(multiDeletedRows.length, 3);
    },
  );

  await db.close();
});
