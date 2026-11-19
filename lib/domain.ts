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
  start_label?: string;
  start_lat?: number | null;
  start_lng?: number | null;
  end_label?: string;
  end_lat?: number | null;
  end_lng?: number | null;
};
export type Entry = {
  id: string;
  group_id: string;
  member_id: string;
  seconds: number;
  kind: "credit" | "ride" | "reversal";
  ride_id: string | null;
  package_id?: string | null;
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
export type Contribution = {
  id: string;
  group_id: string;
  package_id: string;
  member_id: string;
  amount_rappen: number;
  allocated_seconds: number;
};
export type FeedbackCategory = "idea" | "bug" | "praise" | "other";
export type FeedbackItem = {
  id: string;
  group_id: string;
  member_id: string;
  category: FeedbackCategory;
  message: string;
  page: string;
  created_at: string;
};
export type UserAccount = {
  user_id: string;
  username: string;
  password_updated_at: string;
};
export type PasswordResetRequest = {
  id: string;
  group_id: string;
  member_id: string;
  target_user_id: string;
  username: string;
  note: string;
  status: "open" | "completed" | "dismissed";
  requested_at: string;
  resolved_at: string | null;
  resolved_by_member_id?: string | null;
};
export type Snapshot = {
  group: Group;
  members: Member[];
  rides: Ride[];
  entries: Entry[];
  packages: Package[];
  contributions?: Contribution[];
  feedback?: FeedbackItem[];
  accounts?: UserAccount[];
  reset_requests?: PasswordResetRequest[];
};
export type Action =
  | "record_ride"
  | "credit_minutes"
  | "record_package"
  | "record_topup"
  | "void_ride"
  | "rename_member"
  | "update_member"
  | "create_invite"
  | "submit_feedback"
  | "dismiss_password_reset";
export type RpcArgs = Record<
  string,
  string | number | boolean | null | ContributionInput[]
>;
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
    quota: data.entries
      .filter(
        (e) => (!memberId || e.member_id === memberId) && e.kind === "credit",
      )
      .reduce((n, e) => n + Number(e.seconds), 0),
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

export type ContributionInput = { member_id: string; amount_rappen: number };
/** Ganze Minuten nach grösstem Rest. BigInt verhindert Rundungsfehler bei hohen Beträgen. */
export function allocateMinutes(
  totalMinutes: number,
  priceRappen: number,
  inputs: ContributionInput[],
) {
  if (
    !Number.isSafeInteger(totalMinutes) ||
    totalMinutes < 1 ||
    totalMinutes > 10_000_000 ||
    !Number.isSafeInteger(priceRappen) ||
    priceRappen < 1 ||
    priceRappen > 1_000_000_000_000
  )
    throw new Error(
      "Bitte gültige Paketminuten und einen positiven Preis eingeben.",
    );
  if (
    !inputs.length ||
    new Set(inputs.map((c) => c.member_id)).size !== inputs.length
  )
    throw new Error("Jede Person darf nur einmal beitragen.");
  if (
    inputs.some(
      (c) =>
        !Number.isSafeInteger(c.amount_rappen) ||
        c.amount_rappen < 0 ||
        c.amount_rappen > priceRappen,
    )
  )
    throw new Error("Bitte gültige Beiträge eingeben.");
  if (
    inputs.reduce((n, c) => n + BigInt(c.amount_rappen), 0n) !==
    BigInt(priceRappen)
  )
    throw new Error(
      "Die Summe aller Beiträge muss genau dem Paketpreis entsprechen.",
    );
  const price = BigInt(priceRappen),
    total = BigInt(totalMinutes);
  const shares = inputs.map((c) => ({
    ...c,
    minutes: Number((total * BigInt(c.amount_rappen)) / price),
    remainder: (total * BigInt(c.amount_rappen)) % price,
  }));
  const missing = totalMinutes - shares.reduce((n, c) => n + c.minutes, 0);
  const ranked = [...shares].sort((a, b) =>
    a.remainder === b.remainder
      ? a.member_id < b.member_id
        ? -1
        : a.member_id > b.member_id
          ? 1
          : 0
      : a.remainder > b.remainder
        ? -1
        : 1,
  );
  for (let i = 0; i < missing; i++) ranked[i].minutes++;
  return shares.map(({ member_id, amount_rappen, minutes }) => ({
    member_id,
    amount_rappen,
    minutes,
  }));
}
