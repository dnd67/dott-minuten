import {
  splitPackage,
  splitRideSeconds,
  type Snapshot,
  type RpcArgs,
  type Action,
  type FeedbackCategory,
  type TopupPlan,
} from "./domain";
import { roundCoord, validCoords } from "./location";

const gid = "demo-group";
export const DEMO_USER = "demo-oskar";

export function demoSnapshot(): Snapshot {
  const ago = (days: number, hours = 18, mins = 20) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hours, mins, 0, 0);
    if (d > new Date()) d.setDate(d.getDate() - 1);
    return d.toISOString();
  };
  const members = ["Oskar", "August", "Max"].map((name, i) => ({
    id: `demo-${i}`,
    group_id: gid,
    user_id: i === 0 ? DEMO_USER : `user-${i}`,
    display_name: name,
    role: i === 1 ? ("admin" as const) : ("member" as const),
    active: true,
  }));
  const seed: [
    memberIdx: number,
    daysAgo: number,
    drive: number,
    pause: number,
    hour: number,
    startLabel: string,
    startLat: number,
    startLng: number,
    endLabel: string,
    endLat: number,
    endLng: number,
  ][] = [
    [
      0,
      1,
      14,
      1,
      18,
      "Zürich HB",
      47.3779,
      8.5403,
      "Wiedikon Bhf",
      47.3713,
      8.5235,
    ],
    [
      1,
      1,
      8,
      0,
      8,
      "Stadelhofen",
      47.3665,
      8.5485,
      "ETH Polyterrasse",
      47.3763,
      8.5476,
    ],
    [
      2,
      2,
      19,
      2,
      22,
      "Langstrasse",
      47.3788,
      8.5271,
      "Oerlikon Bhf",
      47.4115,
      8.5441,
    ],
    [
      0,
      3,
      9,
      0,
      8,
      "Wiedikon Bhf",
      47.3713,
      8.5235,
      "Zürich HB",
      47.3779,
      8.5403,
    ],
    [
      1,
      4,
      12,
      1,
      18,
      "ETH Polyterrasse",
      47.3763,
      8.5476,
      "Seefeld",
      47.3578,
      8.5542,
    ],
    [
      2,
      5,
      6,
      0,
      12,
      "Hardbrücke",
      47.3852,
      8.5175,
      "Limmatplatz",
      47.3847,
      8.5312,
    ],
    [0, 6, 18, 2, 19, "Zürich HB", 47.3779, 8.5403, "Seefeld", 47.3578, 8.5542],
    [1, 7, 11, 0, 9, "Seefeld", 47.3578, 8.5542, "Zürich HB", 47.3779, 8.5403],
    [
      2,
      8,
      15,
      1,
      18,
      "Oerlikon Bhf",
      47.4115,
      8.5441,
      "Langstrasse",
      47.3788,
      8.5271,
    ],
    [
      0,
      10,
      7,
      0,
      8,
      "Wiedikon Bhf",
      47.3713,
      8.5235,
      "Zürich HB",
      47.3779,
      8.5403,
    ],
    [
      1,
      11,
      21,
      0,
      23,
      "Langstrasse",
      47.3788,
      8.5271,
      "Seefeld",
      47.3578,
      8.5542,
    ],
    [
      2,
      12,
      9,
      1,
      17,
      "Hardbrücke",
      47.3852,
      8.5175,
      "Zürich HB",
      47.3779,
      8.5403,
    ],
  ];
  const rides = seed.map(
    (
      [
        m,
        d,
        drive,
        pause,
        hour,
        startLabel,
        startLat,
        startLng,
        endLabel,
        endLat,
        endLng,
      ],
      i,
    ) => ({
      id: `ride-${i}`,
      group_id: gid,
      member_id: members[m].id,
      occurred_at: ago(d, hour),
      duration_seconds: drive * 60,
      pause_seconds: pause * 60,
      charged_seconds: (drive + pause) * 60,
      note: i === 0 ? "Nach Hause vom Bahnhof" : "",
      source: "manual" as const,
      estimated_cost_rappen: (drive + pause) * 15,
      voided_at: null,
      start_label: startLabel,
      start_lat: startLat,
      start_lng: startLng,
      end_label: endLabel,
      end_lat: endLat,
      end_lng: endLng,
      start_gps: i % 2 === 0,
      end_gps: i % 3 !== 2,
      unlocked_via_app: i % 2 === 0,
    }),
  );
  return {
    group: { id: gid, name: "Zürich Crew" },
    members,
    rides,
    entries: [
      ...members.map((m) => ({
        id: `credit-${m.id}`,
        group_id: gid,
        member_id: m.id,
        seconds: 200 * 60,
        kind: "credit" as const,
        ride_id: null,
        reason: "Anteil am gemeinsamen Paket",
        created_at: ago(15),
      })),
      ...rides.map((r) => ({
        id: `entry-${r.id}`,
        group_id: gid,
        member_id: r.member_id,
        seconds: -r.charged_seconds,
        kind: "ride" as const,
        ride_id: r.id,
        reason: "Fahrt inkl. Pause",
        created_at: r.occurred_at,
      })),
    ],
    contributions: members.map((m) => ({
      id: `contribution-${m.id}`,
      group_id: gid,
      package_id: "package-1",
      member_id: m.id,
      amount_rappen: 3000,
      allocated_seconds: 200 * 60,
    })),
    packages: [
      {
        id: "package-1",
        group_id: gid,
        payer_id: members[0].id,
        seconds: 600 * 60,
        price_rappen: 9000,
        purchased_at: ago(15),
        note: "Gemeinsames Minutenpaket",
      },
    ],
    feedback: [],
    accounts: [
      {
        user_id: DEMO_USER,
        username: "oskar",
        password_updated_at: ago(15),
      },
      {
        user_id: "user-1",
        username: "august",
        password_updated_at: ago(12),
      },
      {
        user_id: "user-2",
        username: "max",
        password_updated_at: ago(14),
      },
    ],
    reset_requests: [],
    places: [
      {
        id: "demo-place-1",
        group_id: gid,
        label: "Zürich HB",
        address: "Bahnhofplatz 1, 8001 Zürich",
        lat: 47.3779,
        lng: 8.5403,
        radius_meters: 100,
        active: true,
        created_at: ago(15),
      },
      {
        id: "demo-place-2",
        group_id: gid,
        label: "ETH Polyterrasse",
        address: "Rämistrasse 101, 8092 Zürich",
        lat: 47.3763,
        lng: 8.5476,
        radius_meters: 100,
        active: true,
        created_at: ago(15),
      },
      {
        id: "demo-place-3",
        group_id: gid,
        label: "Bellevue",
        address: "Bellevueplatz, 8001 Zürich",
        lat: 47.367,
        lng: 8.5451,
        radius_meters: 100,
        active: true,
        created_at: ago(15),
      },
    ],
  };
}

const ADMIN_ACTIONS: ReadonlySet<Action> = new Set([
  "credit_minutes",
  "record_topup",
  "record_package",
  "void_ride",
  "update_member",
  "create_invite",
  "revoke_invites",
  "dismiss_password_reset",
  "upsert_group_place",
  "deactivate_group_place",
]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === "string" && value.trim().length > 0;

/**
 * Stellt sicher, dass ein geladener Demo-Snapshot (z. B. aus älterem oder
 * verändertem localStorage) den Rechten eines normalen angemeldeten Mitglieds
 * entspricht: Oskar bleibt aktives Mitglied ohne Admin-/Dev-Rechte, mindestens
 * ein anderes aktives Mitglied bleibt Admin, und Admin-only Reset-Anfragen
 * werden entfernt.
 */
export function normalizeDemoSnapshot(raw: Snapshot): Snapshot {
  const fallback = demoSnapshot();
  if (!isRecord(raw)) return fallback;

  const data = structuredClone(raw) as Snapshot;

  if (
    !isRecord(data.group) ||
    !isNonEmptyString(data.group.id) ||
    !isNonEmptyString(data.group.name)
  ) {
    data.group = fallback.group;
  }

  const rawMembers = Array.isArray(data.members)
    ? data.members
        .filter(
          (m): m is Snapshot["members"][number] =>
            isRecord(m) &&
            isNonEmptyString(m.id) &&
            isNonEmptyString(m.user_id) &&
            isNonEmptyString(m.display_name),
        )
        .map((m) => ({
          id: m.id.trim(),
          group_id: data.group.id,
          user_id: m.user_id.trim(),
          display_name: m.display_name.trim(),
          role: m.role === "admin" ? ("admin" as const) : ("member" as const),
          active: Boolean(m.active),
        }))
    : [];

  if (rawMembers.length === 0) {
    data.members = fallback.members;
  } else {
    const demoEntries = rawMembers.filter((m) => m.user_id === DEMO_USER);
    const chosenDemo =
      demoEntries.find((m) => m.id === "demo-0") ??
      demoEntries[0] ??
      fallback.members[0];
    const demoMember = {
      ...chosenDemo,
      group_id: data.group.id,
      role: "member" as const,
      active: true,
    };

    const seenIds = new Set<string>([demoMember.id]);
    const dedupOthers: Snapshot["members"] = [];
    for (const m of rawMembers) {
      if (m.user_id === DEMO_USER || seenIds.has(m.id)) continue;
      seenIds.add(m.id);
      dedupOthers.push(m);
    }

    data.members = [demoMember, ...dedupOthers];
  }

  const demoMember = data.members.find((m) => m.user_id === DEMO_USER)!;

  data.rides = Array.isArray(data.rides)
    ? data.rides.filter(
        (r): r is Snapshot["rides"][number] =>
          isRecord(r) &&
          isNonEmptyString(r.id) &&
          isNonEmptyString(r.member_id) &&
          isNonEmptyString(r.occurred_at) &&
          Number.isFinite(Date.parse(r.occurred_at)) &&
          typeof r.duration_seconds === "number" &&
          typeof r.pause_seconds === "number" &&
          typeof r.charged_seconds === "number",
      )
    : fallback.rides;

  data.entries = Array.isArray(data.entries)
    ? data.entries.filter(
        (e): e is Snapshot["entries"][number] =>
          isRecord(e) &&
          isNonEmptyString(e.id) &&
          isNonEmptyString(e.member_id) &&
          typeof e.seconds === "number" &&
          isNonEmptyString(e.created_at) &&
          Number.isFinite(Date.parse(e.created_at)),
      )
    : fallback.entries;

  data.packages = Array.isArray(data.packages)
    ? data.packages.filter(
        (p): p is Snapshot["packages"][number] =>
          isRecord(p) &&
          isNonEmptyString(p.id) &&
          typeof p.seconds === "number" &&
          typeof p.price_rappen === "number" &&
          isNonEmptyString(p.purchased_at) &&
          Number.isFinite(Date.parse(p.purchased_at)),
      )
    : fallback.packages;

  data.contributions = Array.isArray(data.contributions)
    ? data.contributions.filter(
        (c): c is NonNullable<Snapshot["contributions"]>[number] =>
          isRecord(c) &&
          isNonEmptyString(c.id) &&
          isNonEmptyString(c.package_id) &&
          isNonEmptyString(c.member_id),
      )
    : (fallback.contributions ?? []);

  data.places = Array.isArray(data.places)
    ? data.places.filter(
        (p): p is NonNullable<Snapshot["places"]>[number] =>
          isRecord(p) &&
          isNonEmptyString(p.id) &&
          isNonEmptyString(p.label) &&
          validCoords(p.lat, p.lng),
      )
    : (fallback.places ?? []);

  const nowIso = new Date().toISOString();
  data.accounts = Array.isArray(data.accounts)
    ? data.accounts
        .filter(
          (a): a is NonNullable<Snapshot["accounts"]>[number] =>
            isRecord(a) &&
            isNonEmptyString(a.user_id) &&
            isNonEmptyString(a.username),
        )
        .map((a) => ({
          user_id: a.user_id.trim(),
          username: a.username.trim(),
          password_updated_at:
            isNonEmptyString(a.password_updated_at) &&
            Number.isFinite(Date.parse(a.password_updated_at))
              ? a.password_updated_at
              : nowIso,
        }))
    : (fallback.accounts ?? []);

  if (!data.accounts.some((a) => a.user_id === DEMO_USER)) {
    const defaultOskar = fallback.accounts?.find(
      (a) => a.user_id === DEMO_USER,
    );
    if (defaultOskar) data.accounts.unshift(defaultOskar);
  }

  const others = data.members.filter((m) => m.user_id !== DEMO_USER);
  if (others.length === 0) {
    const fallbackAdmin =
      fallback.members.find(
        (m) => m.user_id !== DEMO_USER && m.id !== demoMember.id,
      ) ?? fallback.members[1];
    data.members.push({
      ...fallbackAdmin,
      group_id: data.group.id,
      role: "admin",
      active: true,
    });
  } else if (!others.some((m) => m.active && m.role === "admin")) {
    const preferred =
      others.find((m) => m.id === "demo-1" && m.active) ??
      others.find((m) => m.active) ??
      others.find((m) => m.id === "demo-1") ??
      others[0];
    preferred.role = "admin";
    preferred.active = true;
  }

  data.feedback = Array.isArray(data.feedback)
    ? data.feedback.filter(
        (f): f is NonNullable<Snapshot["feedback"]>[number] =>
          isRecord(f) &&
          isNonEmptyString(f.id) &&
          f.member_id === demoMember.id &&
          isNonEmptyString(f.message) &&
          isNonEmptyString(f.created_at) &&
          Number.isFinite(Date.parse(f.created_at)),
      )
    : [];
  data.reset_requests = [];

  return data;
}

export function demoAction(
  current: Snapshot,
  action: Action,
  args: RpcArgs,
): Snapshot {
  const data = structuredClone(current);
  const actor = data.members.find((m) => m.user_id === DEMO_USER && m.active);
  if (!actor) throw new Error("Keine Berechtigung für diese Gruppe.");
  const isAdmin = actor.role === "admin";
  if (ADMIN_ACTIONS.has(action) && !isAdmin) {
    throw new Error("Keine Berechtigung für diese Gruppe.");
  }
  const id = String(args.p_request_id);
  const now = new Date().toISOString();
  if (action === "record_ride") {
    if (data.rides.some((r) => r.id === id)) return data;
    const rawCoRiders = Array.isArray(args.p_co_rider_ids)
      ? args.p_co_rider_ids
          .filter((x) => x !== null && x !== undefined)
          .map(String)
          .filter(Boolean)
      : [];
    const shares = splitRideSeconds(
      Number(args.p_drive_minutes),
      Number(args.p_pause_minutes),
      [actor.id, ...rawCoRiders],
    );
    if (
      shares.some(
        (s) => !data.members.some((m) => m.id === s.member_id && m.active),
      )
    )
      throw new Error("Aktives Mitglied nicht gefunden.");
    const eligible = data.packages.filter(
      (p) => p.purchased_at <= String(args.p_occurred_at),
    );
    const bought = eligible.reduce((n, p) => n + p.seconds, 0),
      price = eligible.reduce((n, p) => n + p.price_rappen, 0);
    const sLat = typeof args.p_start_lat === "number" ? args.p_start_lat : null;
    const sLng = typeof args.p_start_lng === "number" ? args.p_start_lng : null;
    const eLat = typeof args.p_end_lat === "number" ? args.p_end_lat : null;
    const eLng = typeof args.p_end_lng === "number" ? args.p_end_lng : null;
    const isShared = shares.length > 1;
    const sharedGroupId = isShared ? id : null;
    for (const share of shares) {
      const rideId = share.member_id === actor.id ? id : crypto.randomUUID();
      data.rides.push({
        id: rideId,
        group_id: gid,
        member_id: share.member_id,
        occurred_at: String(args.p_occurred_at),
        duration_seconds: share.duration_seconds,
        pause_seconds: share.pause_seconds,
        charged_seconds: share.charged_seconds,
        note: String(args.p_note ?? ""),
        source: "manual",
        estimated_cost_rappen: bought
          ? (share.charged_seconds * price) / bought
          : null,
        voided_at: null,
        start_label: String(args.p_start_label ?? "").trim(),
        start_lat: validCoords(sLat, sLng) ? roundCoord(sLat) : null,
        start_lng: validCoords(sLat, sLng) ? roundCoord(sLng!) : null,
        end_label: String(args.p_end_label ?? "").trim(),
        end_lat: validCoords(eLat, eLng) ? roundCoord(eLat) : null,
        end_lng: validCoords(eLat, eLng) ? roundCoord(eLng!) : null,
        shared_group_id: sharedGroupId,
        shared_rider_count: shares.length,
        start_gps: Boolean(args.p_start_gps) && validCoords(sLat, sLng),
        end_gps: Boolean(args.p_end_gps) && validCoords(eLat, eLng),
        unlocked_via_app: Boolean(args.p_unlocked_via_app),
      });
      data.entries.push({
        id: crypto.randomUUID(),
        group_id: gid,
        member_id: share.member_id,
        seconds: -share.charged_seconds,
        kind: "ride",
        ride_id: rideId,
        reason: isShared
          ? `Geteilte Fahrt (${shares.length} Personen)`
          : "Fahrt inkl. Pause",
        created_at: now,
      });
    }
  } else if (action === "credit_minutes")
    data.entries.push({
      id,
      group_id: gid,
      member_id: String(args.p_member_id),
      seconds: Number(args.p_minutes) * 60,
      kind: "credit",
      ride_id: null,
      reason: String(args.p_reason),
      created_at: now,
    });
  else if (action === "record_topup") {
    if (data.packages.some((p) => p.id === id)) return data;
    if (!args.p_contributions || typeof args.p_contributions !== "object")
      throw new Error("Bitte Beiträge angeben.");
    const shares = splitPackage(
      Number(args.p_minutes),
      Number(args.p_price_rappen),
      args.p_contributions as TopupPlan,
    );
    if (
      shares.some(
        (c) => !data.members.some((m) => m.id === c.member_id && m.active),
      )
    )
      throw new Error("Aktives Mitglied nicht gefunden.");
    data.packages.push({
      id,
      group_id: gid,
      payer_id: String(args.p_payer_id),
      seconds: Number(args.p_minutes) * 60,
      price_rappen: Number(args.p_price_rappen),
      purchased_at: String(args.p_purchased_at),
      note: String(args.p_note),
    });
    data.contributions ??= [];
    for (const c of shares) {
      data.contributions.push({
        id: crypto.randomUUID(),
        group_id: gid,
        package_id: id,
        member_id: c.member_id,
        amount_rappen: c.amount_rappen,
        allocated_seconds: c.minutes * 60,
      });
      if (c.minutes > 0)
        data.entries.push({
          id: crypto.randomUUID(),
          group_id: gid,
          member_id: c.member_id,
          seconds: c.minutes * 60,
          kind: "credit",
          ride_id: null,
          package_id: id,
          reason: "Anteil am Minutenpaket",
          created_at: now,
        });
    }
  } else if (action === "record_package")
    data.packages.push({
      id,
      group_id: gid,
      payer_id: String(args.p_payer_id),
      seconds: Number(args.p_minutes) * 60,
      price_rappen: Number(args.p_price_rappen),
      purchased_at: String(args.p_purchased_at),
      note: String(args.p_note),
    });
  else if (action === "void_ride") {
    const r = data.rides.find((r) => r.id === args.p_ride_id);
    if (r && !r.voided_at) {
      const targets = r.shared_group_id
        ? data.rides.filter(
            (s) => s.shared_group_id === r.shared_group_id && !s.voided_at,
          )
        : [r];
      for (const s of targets) {
        s.voided_at = now;
        s.void_reason = String(args.p_reason);
        s.voided_by_member_id = actor.id;
        data.entries.push({
          id: s.id === r.id ? id : crypto.randomUUID(),
          group_id: gid,
          member_id: s.member_id,
          seconds: s.charged_seconds,
          kind: "reversal",
          ride_id: s.id,
          reason: String(args.p_reason),
          created_at: now,
        });
      }
    }
  } else if (action === "rename_member") {
    const m = data.members.find((m) => m.id === args.p_member_id);
    if (!m) throw new Error("Mitglied nicht gefunden.");
    if (m.id !== actor.id && !isAdmin) {
      throw new Error("Du darfst nur deinen eigenen Namen ändern.");
    }
    const name = String(args.p_display_name).trim();
    if (!name || name.length > 60)
      throw new Error("Bitte einen Namen mit 1 bis 60 Zeichen eingeben.");
    m.display_name = name;
  } else if (action === "update_member") {
    const m = data.members.find((m) => m.id === args.p_member_id);
    if (m) {
      if (
        m.role === "admin" &&
        m.active &&
        (!args.p_active || args.p_role !== "admin") &&
        data.members.filter((m) => m.active && m.role === "admin").length <= 1
      )
        throw new Error("Mindestens ein aktiver Admin muss bleiben.");
      m.role = args.p_role as "member" | "admin";
      m.active = Boolean(args.p_active);
    }
  } else if (action === "submit_feedback") {
    data.feedback ??= [];
    if (data.feedback.some((f) => f.id === id)) return data;
    const message = String(args.p_message ?? "").trim();
    if (!message || message.length > 2000)
      throw new Error("Bitte eine Nachricht mit 1 bis 2000 Zeichen eingeben.");
    const category = String(args.p_category ?? "idea") as FeedbackCategory;
    if (!["idea", "bug", "praise", "other"].includes(category))
      throw new Error("Bitte eine gültige Feedback-Kategorie wählen.");
    data.feedback.unshift({
      id,
      group_id: gid,
      member_id: actor.id,
      category,
      message,
      page: String(args.p_page ?? ""),
      created_at: now,
    });
  } else if (action === "dismiss_password_reset") {
    const req = (data.reset_requests ?? []).find(
      (r) => r.id === args.p_reset_id && r.status === "open",
    );
    if (req) {
      req.status = "dismissed";
      req.resolved_at = now;
      req.resolved_by_member_id = actor.id;
    }
  } else if (action === "upsert_group_place") {
    data.places ??= [];
    if (data.places.some((p) => p.id === id)) return data;
    const label = String(args.p_label ?? "").trim();
    const address = String(args.p_address ?? "").trim();
    const lat = Number(args.p_lat);
    const lng = Number(args.p_lng);
    const radius = Number(args.p_radius_meters ?? 100);
    if (!label || label.length > 80)
      throw new Error("Bitte einen Ortsnamen mit 1 bis 80 Zeichen eingeben.");
    if (!validCoords(lat, lng))
      throw new Error("Bitte gültige Koordinaten angeben.");
    if (!Number.isFinite(radius) || radius < 20 || radius > 1000)
      throw new Error("Der Radius muss zwischen 20 und 1000 Metern liegen.");
    data.places.push({
      id,
      group_id: gid,
      label,
      address,
      lat: Math.round(lat * 100000) / 100000,
      lng: Math.round(lng * 100000) / 100000,
      radius_meters: Math.round(radius),
      active: true,
      created_at: now,
    });
  } else if (action === "deactivate_group_place") {
    data.places = (data.places ?? []).filter((p) => p.id !== args.p_place_id);
  }
  return data;
}
