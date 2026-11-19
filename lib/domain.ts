export type Member = {
  id: string;
  group_id: string;
  user_id: string;
  display_name: string;
  role: "admin" | "member";
  active: boolean;
};
export type Group = { id: string; name: string };
export type Ride = {
  id: string;
  group_id: string;
  member_id: string;
  occurred_at: string;
  duration_seconds: number;
  pause_seconds: number;
  charged_seconds: number;
  note: string;
  source: "manual" | "ocr";
  estimated_cost_rappen: number | null;
  voided_at: string | null;
  void_reason?: string;
  voided_by_member_id?: string | null;
};
export type Entry = {
  id: string;
  group_id: string;
  member_id: string;
  seconds: number;
  kind: "credit" | "ride" | "reversal";
  ride_id: string | null;
  reason: string;
  created_at: string;
};
export type Package = {
  id: string;
  group_id: string;
  payer_id: string;
  seconds: number;
  price_rappen: number;
  purchased_at: string;
  note: string;
};
export type Snapshot = {
  group: Group;
  members: Member[];
  rides: Ride[];
  entries: Entry[];
  packages: Package[];
};
export type Action =
  | "record_ride"
  | "credit_minutes"
  | "record_package"
  | "void_ride"
  | "rename_member"
  | "update_member"
  | "create_invite";
export type RpcArgs = Record<string, string | number | boolean>;
export const minutes = (seconds: number) =>
  new Intl.NumberFormat("de-CH", { maximumFractionDigits: 1 }).format(
    seconds / 60,
  );
export const chf = (rappen: number) =>
  new Intl.NumberFormat("de-CH", { style: "currency", currency: "CHF" }).format(
    rappen / 100,
  );
export const dateLabel = (value: string, withTime = false) =>
  new Intl.DateTimeFormat("de-CH", {
    day: "2-digit",
    month: "short",
    ...(withTime ? { hour: "2-digit", minute: "2-digit" } : {}),
    timeZone: "Europe/Zurich",
  }).format(new Date(value));
export function wholeMinutes(value: string, allowZero = false): number {
  if (!/^\d+$/.test(value.trim()))
    throw new Error("Bitte ganze Minuten eingeben.");
  const result = Number(value);
  if (
    !Number.isSafeInteger(result) ||
    result < (allowZero ? 0 : 1) ||
    result > 10_000_000
  )
    throw new Error(
      "Bitte einen gültigen Minutenbetrag eingeben (max. 10 Millionen).",
    );
  return result;
}
export function moneyRappen(value: string): number {
  const clean = value.trim().replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(clean))
    throw new Error("Bitte CHF mit höchstens zwei Nachkommastellen eingeben.");
  const [integer, fraction = ""] = clean.split(".");
  const result = Number(integer) * 100 + Number(fraction.padEnd(2, "0"));
  if (!Number.isSafeInteger(result) || result > 1_000_000_000_000)
    throw new Error("Der CHF-Betrag ist zu gross.");
  return result;
}
export function summary(data: Snapshot, memberId?: string) {
  const rides = data.rides.filter(
    (r) => !r.voided_at && (!memberId || r.member_id === memberId),
  );
  const balance = data.entries
    .filter((e) => !memberId || e.member_id === memberId)
    .reduce((n, e) => n + Number(e.seconds), 0);
  const consumed = rides.reduce((n, r) => n + Number(r.charged_seconds), 0);
  const bought = data.packages.reduce((n, p) => n + Number(p.seconds), 0);
  return {
    rides,
    balance,
    consumed,
    drive: rides.reduce((n, r) => n + r.duration_seconds, 0),
    pause: rides.reduce((n, r) => n + r.pause_seconds, 0),
    bought,
    inventory: bought - consumed,
    estimatedCost: rides.reduce(
      (n, r) => n + Number(r.estimated_cost_rappen ?? 0),
      0,
    ),
    unknownCosts: rides.filter((r) => r.estimated_cost_rappen === null).length,
  };
}
export function localDateTime(date = new Date()): string {
  // datetime-local verwendet die lokale Zeitzone des Geräts; Speichern konvertiert zu UTC.
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
export function rideDraft(drive: string, pause: string) {
  const duration_seconds = wholeMinutes(drive, true) * 60;
  const pause_seconds = wholeMinutes(pause, true) * 60;
  if (duration_seconds + pause_seconds === 0)
    throw new Error("Die Gesamtzeit muss grösser als null sein.");
  return {
    duration_seconds,
    pause_seconds,
    charged_seconds: duration_seconds + pause_seconds,
    source: "manual" as const,
  };
}
