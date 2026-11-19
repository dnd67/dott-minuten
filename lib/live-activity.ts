export const SHORTCUT_NAME_START = "Minutenclub Live";
export const SHORTCUT_NAME_STOP = "Minutenclub Stopp";
const AUTO_SHORTCUT_KEY = "minutenclub-auto-shortcut-v1";

export type LiveRidePayload = {
  title: string;
  subtitle: string;
  riders: string;
  rider_count: number;
  start_place: string;
  remaining_minutes: number;
  group_name: string;
  started_at: string;
  summary: string;
};

export function formatElapsedClock(elapsedSeconds: number): string {
  const safe = Math.max(0, Math.floor(elapsedSeconds));
  const hours = Math.floor(safe / 3600);
  const mins = Math.floor((safe % 3600) / 60);
  const secs = safe % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  if (hours > 0) return `${hours}:${pad(mins)}:${pad(secs)}`;
  return `${pad(mins)}:${pad(secs)}`;
}

export function computeLiveRideMetrics(args: {
  startedAt: string;
  nowMs: number;
  ownBalanceSeconds: number;
  riderCount: number;
  costPerSecondRappen: number | null;
}) {
  const startMs = new Date(args.startedAt).getTime();
  const elapsedSeconds = Number.isFinite(startMs)
    ? Math.max(0, Math.floor((args.nowMs - startMs) / 1000))
    : 0;
  const count = Math.max(1, Math.trunc(args.riderCount));
  const ownShareSeconds = elapsedSeconds / count;
  const projectedBalanceSeconds = args.ownBalanceSeconds - ownShareSeconds;
  const estimatedCostRappen =
    args.costPerSecondRappen !== null
      ? Math.round(ownShareSeconds * args.costPerSecondRappen)
      : null;

  return {
    elapsedSeconds,
    elapsedMinutesRounded: Math.max(1, Math.round(elapsedSeconds / 60)),
    elapsedClock: formatElapsedClock(elapsedSeconds),
    ownShareSeconds,
    projectedBalanceSeconds,
    estimatedCostRappen,
  };
}

export function buildLiveRidePayload(args: {
  riderNames: string[];
  startLabel?: string;
  remainingSeconds: number;
  groupName: string;
  startedAt: string;
}): LiveRidePayload {
  const names = args.riderNames.map((n) => n.trim()).filter(Boolean);
  const riders = names.length > 0 ? names.join(" & ") : "Minutenclub";
  const riderCount = Math.max(1, names.length);
  const startPlace = args.startLabel?.trim() || "Unterwegs";
  const remainingMinutes = Math.round((args.remainingSeconds / 60) * 10) / 10;
  const title =
    riderCount > 1 ? `Dott · ${riders} (÷${riderCount})` : `Dott · ${riders}`;
  const parts = [
    args.startLabel?.trim() ? `Start: ${args.startLabel.trim()}` : null,
    `${remainingMinutes} Min. übrig`,
    riderCount > 1 ? `Geteilt auf ${riderCount}` : null,
  ].filter(Boolean);
  const subtitle = parts.join(" · ");

  return {
    title,
    subtitle,
    riders,
    rider_count: riderCount,
    start_place: startPlace,
    remaining_minutes: remainingMinutes,
    group_name: args.groupName,
    started_at: args.startedAt,
    summary: `${title} – ${subtitle}`,
  };
}

export function buildShortcutRunUrl(
  shortcutName: string,
  inputText?: string,
): string {
  const base = `shortcuts://run-shortcut?name=${encodeURIComponent(shortcutName)}`;
  if (!inputText) return base;
  return `${base}&input=text&text=${encodeURIComponent(inputText)}`;
}

export function buildStartLiveActivityUrl(payload: LiveRidePayload): string {
  return buildShortcutRunUrl(SHORTCUT_NAME_START, JSON.stringify(payload));
}

export function buildStopLiveActivityUrl(): string {
  return buildShortcutRunUrl(SHORTCUT_NAME_STOP);
}

export function loadAutoShortcutEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(AUTO_SHORTCUT_KEY) === "1";
  } catch {
    return false;
  }
}

export function saveAutoShortcutEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(AUTO_SHORTCUT_KEY, enabled ? "1" : "0");
  } catch {
    /* Ohne Browser-Speicher bleibt die Einstellung für diese Sitzung wirksam. */
  }
}
