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
    role: i === 0 ? ("admin" as const) : ("member" as const),
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
    reset_requests: [
      {
        id: "reset-demo-1",
        group_id: gid,
        member_id: "demo-2",
        target_user_id: "user-2",
        username: "max",
        note: "Neues iPhone – Passwort vergessen",
        status: "open",
        requested_at: ago(0, 9),
        resolved_at: null,
        resolved_by_member_id: null,
      },
    ],
  };
}

export function demoAction(
  current: Snapshot,
  action: Action,
  args: RpcArgs,
): Snapshot {
  const data = structuredClone(current);
  const id = String(args.p_request_id);
  const now = new Date().toISOString();
  if (action === "record_ride") {
    if (data.rides.some((r) => r.id === id)) return data;
    const rawCoRiders = Array.isArray(args.p_co_rider_ids)
      ? args.p_co_rider_ids.map(String)
      : [];
    const shares = splitRideSeconds(
      Number(args.p_drive_minutes),
      Number(args.p_pause_minutes),
      ["demo-0", ...rawCoRiders],
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
      const rideId = share.member_id === "demo-0" ? id : crypto.randomUUID();
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
        s.voided_by_member_id = "demo-0";
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
    const name = String(args.p_display_name).trim();
    if (!name || name.length > 60)
      throw new Error("Bitte einen Namen mit 1 bis 60 Zeichen eingeben.");
    const m = data.members.find((m) => m.id === args.p_member_id);
    if (!m) throw new Error("Mitglied nicht gefunden.");
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
      member_id: "demo-0",
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
      req.resolved_by_member_id = "demo-0";
    }
  }
  return data;
}
