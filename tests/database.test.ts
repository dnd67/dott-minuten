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
      await assert.rejects(() => as(friend, sql, params), /Keine Berechtigung/);
      await as(owner, sql, params);
      await as(owner, sql, params);
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
      const entries = await as<{ seconds: number }>(
        owner,
        "select * from public.minute_entries where package_id=$1",
        [id],
      );
      assert.equal(entries.length, 3);
      assert.equal(
        entries.reduce((n, e) => n + Number(e.seconds), 0),
        36000,
      );
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
        const args = [
          gid,
          splitId,
          ownerMember,
          101,
          1,
          date,
          JSON.stringify(plan),
          mode,
        ];
        await assert.rejects(() => as(friend, sql, args), /Keine Berechtigung/);
        for (const shares of [
          [],
          [plan.shares[0], plan.shares[0]],
          [{ member_id: ownerMember, weight: 2 }],
          [{ member_id: randomUUID(), weight: mode === "equal" ? 1 : 101 }],
        ]) {
          const invalidArgs = [...args];
          invalidArgs[6] = JSON.stringify({ mode, shares });
          await assert.rejects(() => as(owner, sql, invalidArgs));
        }
        await as(owner, sql, args);
        await as(owner, sql, args);
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
        const credits = await as<{ seconds: number }>(
          owner,
          "select seconds::int from public.minute_entries where package_id=$1",
          [splitId],
        );
        assert.equal(
          credits.reduce((n, c) => n + c.seconds, 0),
          6060,
        );
      }
      // Keine Berechtigung für eine fremde Gruppe: weder Beiträge noch Snapshot.
      const unknown = randomUUID();
      await db.exec("reset role");
      await db.query("insert into auth.users values($1)", [unknown]);
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
        fbOwner = randomUUID();
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

      const friendVisible = await as<{ id: string }>(
        friend,
        "select id from public.feedback where group_id=$1",
        [gid],
      );
      assert.equal(friendVisible.length, 1);
      assert.equal(friendVisible[0].id, fbFriend);

      const ownerVisible = await as<{ id: string }>(
        owner,
        "select id from public.feedback where group_id=$1",
        [gid],
      );
      assert.equal(ownerVisible.length, 2);

      const [dashFriend] = await as<{ value: { feedback: unknown[] } }>(
        friend,
        "select public.get_dashboard($1) as value",
        [gid],
      );
      assert.equal(dashFriend.value.feedback.length, 1);

      const [dashOwner] = await as<{ value: { feedback: unknown[] } }>(
        owner,
        "select public.get_dashboard($1) as value",
        [gid],
      );
      assert.equal(dashOwner.value.feedback.length, 2);

      await assert.rejects(
        () => as(friend, "delete from public.feedback where id=$1", [fbFriend]),
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
