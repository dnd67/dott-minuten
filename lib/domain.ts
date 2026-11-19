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
  shared_group_id?: string | null;
  shared_rider_count?: number;
  start_gps?: boolean;
  end_gps?: boolean;
  unlocked_via_app?: boolean;
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
export type GroupPlace = {
  id: string;
  group_id: string;
  label: string;
  address: string;
  lat: number;
  lng: number;
  radius_meters: number;
  active?: boolean;
  created_at?: string;
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
  places?: GroupPlace[];
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
  | "revoke_invites"
  | "submit_feedback"
  | "dismiss_password_reset"
  | "upsert_group_place"
  | "deactivate_group_place";
export type RpcArgs = Record<
  string,
  string | number | boolean | null | string[] | TopupPlan
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

export type RideShare = {
  member_id: string;
  duration_seconds: number;
  pause_seconds: number;
  charged_seconds: number;
};

/**
 * Teilt Fahr- und Pausenzeit sekundengenau auf alle Mitfahrenden auf demselben Scooter auf.
 * Identische deterministische Verteilung wie in SQL (`202611190007_shared_rides.sql`).
 */
export function splitRideSeconds(
  driveMinutes: number,
  pauseMinutes: number,
  riderMemberIds: string[],
): RideShare[] {
  const totalDrive = Math.trunc(driveMinutes) * 60;
  const totalPause = Math.trunc(pauseMinutes) * 60;
  if (totalDrive < 0 || totalPause < 0 || totalDrive + totalPause <= 0) {
    throw new Error("Die Gesamtzeit muss grösser als null sein.");
  }
  const riders = [...new Set(riderMemberIds.filter(Boolean))].sort((a, b) =>
    a < b ? -1 : a > b ? 1 : 0,
  );
  if (riders.length < 1 || riders.length > 10) {
    throw new Error(
      "Es können maximal 10 Personen gemeinsam auf einer Fahrt aufgeteilt werden.",
    );
  }
  const n = riders.length;
  const baseDrive = Math.floor(totalDrive / n);
  const remDrive = totalDrive % n;
  const basePause = Math.floor(totalPause / n);
  const remPause = totalPause % n;
  return riders.map((member_id, index) => {
    const duration_seconds = baseDrive + (index < remDrive ? 1 : 0);
    const pause_seconds = basePause + (n - index <= remPause ? 1 : 0);
    return {
      member_id,
      duration_seconds,
      pause_seconds,
      charged_seconds: duration_seconds + pause_seconds,
    };
  });
}

export type GroupedRide = {
  key: string;
  ride: Ride;
  parts: Ride[];
  duration_seconds: number;
  pause_seconds: number;
  charged_seconds: number;
  estimated_cost_rappen: number | null;
};

/** Fasst verknüpfte Zeilen einer geteilten Fahrt (`shared_group_id`) für Gesamtansichten zusammen. */
export function groupSharedRides(rides: Ride[]): GroupedRide[] {
  const byGroup = new Map<string, GroupedRide>();
  const result: GroupedRide[] = [];
  for (const r of rides) {
    const key = r.shared_group_id ?? r.id;
    const existing = byGroup.get(key);
    if (existing) {
      existing.parts.push(r);
      existing.duration_seconds += r.duration_seconds;
      existing.pause_seconds += r.pause_seconds;
      existing.charged_seconds += r.charged_seconds;
      if (
        existing.estimated_cost_rappen !== null &&
        r.estimated_cost_rappen !== null
      ) {
        existing.estimated_cost_rappen += Number(r.estimated_cost_rappen);
      } else {
        existing.estimated_cost_rappen = null;
      }
    } else {
      const grouped: GroupedRide = {
        key,
        ride: r,
        parts: [r],
        duration_seconds: r.duration_seconds,
        pause_seconds: r.pause_seconds,
        charged_seconds: r.charged_seconds,
        estimated_cost_rappen:
          r.estimated_cost_rappen === null
            ? null
            : Number(r.estimated_cost_rappen),
      };
      byGroup.set(key, grouped);
      result.push(grouped);
    }
  }
  return result;
}

export type ContributionInput = { member_id: string; amount_rappen: number };
export type SplitMode = "equal" | "minutes" | "amount";
export type SplitInput = { member_id: string; weight: number };
export type TopupPlan =
  | ContributionInput[]
  | {
      mode: "equal" | "minutes";
      shares: SplitInput[];
    };

// Ganze Einheiten nach grösstem Rest, bei Gleichstand nach Mitglieds-ID.
function apportion(total: number, inputs: SplitInput[], divisor: bigint) {
  const rows = inputs.map(({ member_id, weight }, index) => {
    const numerator = BigInt(total) * BigInt(weight);
    return {
      member_id,
      index,
      whole: Number(numerator / divisor),
      rest: numerator % divisor,
    };
  });
  const amounts = rows.map((row) => row.whole);
  const missing = total - amounts.reduce((sum, n) => sum + n, 0);
  rows.sort((a, b) =>
    a.rest === b.rest
      ? a.member_id < b.member_id
        ? -1
        : 1
      : a.rest > b.rest
        ? -1
        : 1,
  );
  for (const row of rows.slice(0, missing)) amounts[row.index]++;
  return amounts;
}

export function splitPackage(
  totalMinutes: number,
  priceRappen: number,
  plan: TopupPlan,
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
  const mode = Array.isArray(plan) ? "amount" : plan.mode;
  const inputs = Array.isArray(plan)
    ? plan.map((c) => ({ member_id: c.member_id, weight: c.amount_rappen }))
    : plan.shares;
  if (!inputs.length) throw new Error("Wähle mindestens eine Person aus.");
  if (new Set(inputs.map((c) => c.member_id)).size !== inputs.length)
    throw new Error("Jede Person darf nur einmal teilnehmen.");
  if (
    inputs.some(
      (c) =>
        !Number.isSafeInteger(c.weight) ||
        c.weight < 0 ||
        (mode === "equal" && c.weight !== 1),
    )
  )
    throw new Error("Die Anteile müssen gültige ganze Einheiten sein.");
  const divisor = inputs.reduce((n, c) => n + BigInt(c.weight), 0n);
  if (mode === "minutes" && divisor !== BigInt(totalMinutes))
    throw new Error(
      `Minuten verteilt: ${divisor} von ${totalMinutes}. Bitte den Bedarf anpassen.`,
    );
  if (mode === "amount" && divisor !== BigInt(priceRappen))
    throw new Error(
      "Die Summe aller Beiträge muss genau dem Paketpreis entsprechen.",
    );
  const minutes = apportion(totalMinutes, inputs, divisor);
  const amounts = apportion(priceRappen, inputs, divisor);
  return inputs.map(({ member_id }, i) => ({
    member_id,
    minutes: minutes[i],
    amount_rappen: amounts[i],
  }));
}

// Bestehende Aufrufer teilen die Minuten nach bereits bezahlten Beiträgen auf.
export const allocateMinutes = (
  totalMinutes: number,
  priceRappen: number,
  inputs: ContributionInput[],
) => splitPackage(totalMinutes, priceRappen, inputs);
