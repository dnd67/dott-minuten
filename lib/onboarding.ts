import { getSupabase } from "./supabase";

// Keep published IDs stable. A new ID introduces a card to returning accounts.
export const tourFeatures = [
  "minute-pass",
  "package-splits",
  "shared-rides",
  "live-cockpit",
  "route-records",
  "club-account",
  "admin-tools",
  "appearance",
] as const;
export type TourFeature = (typeof tourFeatures)[number];
export const availableFeatures = (admin: boolean) =>
  tourFeatures.filter((id) => admin || id !== "admin-tools");

// The two previous tours stored one browser-wide completion flag each.
const originalTour = ["minute-pass", "appearance"] satisfies TourFeature[];
const animatedTour = [
  ...originalTour,
  "package-splits",
  "shared-rides",
  "live-cockpit",
  "route-records",
] satisfies TourFeature[];
const previousTourKey = "minutenclub-onboarding-done-v2";
const demoKey = "minutenclub-demo-tour-v2";
function demoSeen(): string[] {
  try {
    const stored = localStorage.getItem(demoKey);
    if (stored) {
      const ids: unknown = JSON.parse(stored);
      if (Array.isArray(ids)) return ids.filter((id) => typeof id === "string");
    }
    const returning =
      localStorage.getItem("minutenclub-onboarding-done-v1") === "1" ||
      localStorage.getItem("minutenclub-demo-v1");
    const initial =
      localStorage.getItem(previousTourKey) === "1"
        ? animatedTour
        : returning
          ? originalTour
          : [];
    localStorage.setItem(demoKey, JSON.stringify(initial));
    return initial;
  } catch {
    /* The demo also runs without storage. */
  }
  return [];
}

export async function readTourProgress(
  userId: string,
  demo: boolean,
): Promise<string[]> {
  if (demo) return demoSeen();
  const { data, error } = await getSupabase()!
    .from("onboarding_features")
    .select("feature_id")
    .eq("user_id", userId);
  if (error) throw error;
  const seen = data.map((row) => String(row.feature_id));
  // A device-only flag can be carried forward once, and only to a returning
  // account with the migration baseline. A new account always starts empty.
  if (
    seen.length !== originalTour.length ||
    !originalTour.every((id) => seen.includes(id))
  )
    return seen;
  try {
    const ownerKey = "minutenclub-legacy-tour-owner";
    const owner = localStorage.getItem(ownerKey);
    if (
      localStorage.getItem(previousTourKey) !== "1" ||
      (owner && owner !== userId)
    )
      return seen;
    localStorage.setItem(ownerKey, userId);
  } catch {
    return seen;
  }
  await acknowledgeFeatures(userId, false, animatedTour);
  return animatedTour;
}

export async function acknowledgeFeatures(
  userId: string,
  demo: boolean,
  features: readonly TourFeature[],
) {
  if (demo) {
    try {
      localStorage.setItem(
        demoKey,
        JSON.stringify([...new Set([...demoSeen(), ...features])]),
      );
    } catch {
      /* The demo stays usable for this visit. */
    }
    return;
  }
  const { error } = await getSupabase()!
    .from("onboarding_features")
    .upsert(
      features.map((feature_id) => ({ user_id: userId, feature_id })),
      { ignoreDuplicates: true },
    );
  if (error) throw error;
}
