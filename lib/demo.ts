import {
  allocateMinutes,
  type Snapshot,
  type RpcArgs,
  type Action,
} from "./domain";
const gid = "demo-group";
export const DEMO_USER = "demo-oskar";
export function demoSnapshot(): Snapshot {
  const ago = (days: number, hours = 18) => {
    const d = new Date();
    d.setDate(d.getDate() - days);
    d.setHours(hours, 20, 0, 0);
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
  const rides = [
    [0, 1, 14, 1],
    [1, 1, 8, 0],
    [2, 2, 19, 2],
    [0, 3, 9, 0],
    [1, 4, 12, 1],
    [2, 5, 6, 0],
    [0, 6, 18, 2],
    [1, 7, 11, 0],
    [2, 8, 15, 1],
    [0, 10, 7, 0],
    [1, 11, 21, 0],
    [2, 12, 9, 1],
  ].map(([m, d, drive, pause], i) => ({
    id: `ride-${i}`,
    group_id: gid,
    member_id: members[m].id,
    occurred_at: ago(d),
    duration_seconds: drive * 60,
    pause_seconds: pause * 60,
    charged_seconds: (drive + pause) * 60,
    note: i === 0 ? "Nach Hause vom Bahnhof" : "",
    source: "manual" as const,
    estimated_cost_rappen: (drive + pause) * 15,
    voided_at: null,
  }));
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
    const drive = Number(args.p_drive_minutes) * 60,
      pause = Number(args.p_pause_minutes) * 60;
    const eligible = data.packages.filter(
      (p) => p.purchased_at <= String(args.p_occurred_at),
    );
    const bought = eligible.reduce((n, p) => n + p.seconds, 0),
      price = eligible.reduce((n, p) => n + p.price_rappen, 0);
    data.rides.push({
      id,
      group_id: gid,
      member_id: "demo-0",
      occurred_at: String(args.p_occurred_at),
      duration_seconds: drive,
      pause_seconds: pause,
      charged_seconds: drive + pause,
      note: String(args.p_note),
      source: "manual",
      estimated_cost_rappen: bought ? ((drive + pause) * price) / bought : null,
      voided_at: null,
    });
    data.entries.push({
      id: crypto.randomUUID(),
      group_id: gid,
      member_id: "demo-0",
      seconds: -(drive + pause),
      kind: "ride",
      ride_id: id,
      reason: "Fahrt inkl. Pause",
      created_at: now,
    });
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
    if (!Array.isArray(args.p_contributions))
      throw new Error("Bitte Beiträge angeben.");
    const shares = allocateMinutes(
      Number(args.p_minutes),
      Number(args.p_price_rappen),
      args.p_contributions,
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
      r.voided_at = now;
      r.void_reason = String(args.p_reason);
      r.voided_by_member_id = "demo-0";
      data.entries.push({
        id,
        group_id: gid,
        member_id: r.member_id,
        seconds: r.charged_seconds,
        kind: "reversal",
        ride_id: r.id,
        reason: String(args.p_reason),
        created_at: now,
      });
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
  }
  return data;
}
