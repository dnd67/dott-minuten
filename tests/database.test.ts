import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
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
