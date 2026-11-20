import {
  dateLabel,
  type FeedbackCategory,
  type FeedbackItem,
  type Member,
  type UserAccount,
} from "./domain";

export const FEEDBACK_CATEGORIES: readonly FeedbackCategory[] = [
  "idea",
  "bug",
  "praise",
  "other",
] as const;

export const FEEDBACK_CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  idea: "Idee",
  bug: "Problem",
  praise: "Lob",
  other: "Allgemein",
};

export const FEEDBACK_SEEN_KEY_PREFIX = "minutenclub-feedback-seen-v1:";

export type FeedbackAuthor = {
  displayName: string;
  username: string | null;
  active: boolean;
  member: Member | null;
};

export type FeedbackSummary = {
  total: number;
  idea: number;
  bug: number;
  praise: number;
  other: number;
};

export type FeedbackFilters = {
  category?: FeedbackCategory | "all";
  memberId?: string | "all";
  query?: string;
};

export const isFeedbackLive = () =>
  process.env.NEXT_PUBLIC_FEEDBACK_ENABLED === "true";

function parseTimeMs(iso: string | null | undefined): number | null {
  if (typeof iso !== "string" || iso.trim() === "") return null;
  const ms = Date.parse(iso);
  return Number.isFinite(ms) ? ms : null;
}

export function formatFeedbackDate(iso: string | null | undefined): string {
  if (parseTimeMs(iso) === null || typeof iso !== "string") return "–";
  try {
    return dateLabel(iso, true);
  } catch {
    return "–";
  }
}

export function isFeedbackCategory(value: unknown): value is FeedbackCategory {
  return (
    typeof value === "string" && Object.hasOwn(FEEDBACK_CATEGORY_LABELS, value)
  );
}

export function feedbackCategoryMeta(category: unknown): {
  styleKey: FeedbackCategory;
  label: string;
} {
  if (isFeedbackCategory(category)) {
    return {
      styleKey: category,
      label: FEEDBACK_CATEGORY_LABELS[category],
    };
  }
  const raw = typeof category === "string" ? category.trim() : "";
  return {
    styleKey: "other",
    label: raw || FEEDBACK_CATEGORY_LABELS.other,
  };
}

export function sortFeedbackNewest(
  items: readonly FeedbackItem[],
): FeedbackItem[] {
  return [...items].sort((a, b) => {
    const aMs = parseTimeMs(a.created_at) ?? Number.NEGATIVE_INFINITY;
    const bMs = parseTimeMs(b.created_at) ?? Number.NEGATIVE_INFINITY;
    if (bMs !== aMs) return bMs - aMs;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

export function mergeFeedbackLists(
  ...lists: readonly (readonly FeedbackItem[])[]
): FeedbackItem[] {
  const seen = new Set<string>();
  const merged: FeedbackItem[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (!item?.id || seen.has(item.id)) continue;
      seen.add(item.id);
      merged.push(item);
    }
  }
  return sortFeedbackNewest(merged);
}

export function resolveFeedbackAuthor(
  item: Pick<FeedbackItem, "member_id">,
  members: readonly Member[],
  accounts: readonly UserAccount[] = [],
): FeedbackAuthor {
  const member = members.find((m) => m.id === item.member_id) ?? null;
  if (!member) {
    return {
      displayName: "Mitglied",
      username: null,
      active: false,
      member: null,
    };
  }
  const account = member.user_id
    ? accounts.find((a) => a.user_id === member.user_id)
    : undefined;
  return {
    displayName: member.display_name,
    username: account?.username ?? null,
    active: Boolean(member.active),
    member,
  };
}

export function summarizeFeedback(
  items: readonly FeedbackItem[],
): FeedbackSummary {
  const summary: FeedbackSummary = {
    total: items.length,
    idea: 0,
    bug: 0,
    praise: 0,
    other: 0,
  };
  for (const item of items) {
    if (item.category === "idea") summary.idea++;
    else if (item.category === "bug") summary.bug++;
    else if (item.category === "praise") summary.praise++;
    else if (item.category === "other") summary.other++;
  }
  return summary;
}

export function filterFeedback(
  items: readonly FeedbackItem[],
  members: readonly Member[],
  accounts: readonly UserAccount[] = [],
  filters: FeedbackFilters = {},
): FeedbackItem[] {
  const sorted = sortFeedbackNewest(items);
  const category = filters.category ?? "all";
  const memberId = filters.memberId ?? "all";
  const needle = (filters.query ?? "").trim().toLowerCase();

  return sorted.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (memberId !== "all" && item.member_id !== memberId) return false;
    if (!needle) return true;

    const author = resolveFeedbackAuthor(item, members, accounts);
    const haystacks = [
      String(item.message ?? ""),
      String(item.page ?? ""),
      author.displayName,
      author.username ?? "",
      author.username ? `@${author.username}` : "",
    ];
    return haystacks.some((field) => field.toLowerCase().includes(needle));
  });
}

export function feedbackSeenStorageKey(groupId: string): string {
  return `${FEEDBACK_SEEN_KEY_PREFIX}${groupId}`;
}

export function loadFeedbackSeenAt(groupId: string): string | null {
  if (!groupId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(feedbackSeenStorageKey(groupId));
    return parseTimeMs(raw) !== null ? raw : null;
  } catch {
    return null;
  }
}

export function computeFeedbackSeenCursor(
  items: readonly FeedbackItem[],
  now: Date = new Date(),
): string {
  let maxMs = Number.isFinite(now.getTime()) ? now.getTime() : Date.now();
  for (const item of items) {
    const ms = parseTimeMs(item.created_at);
    if (ms !== null && ms > maxMs) maxMs = ms;
  }
  return new Date(maxMs).toISOString();
}

export function saveFeedbackSeenAt(groupId: string, iso: string): void {
  if (!groupId || typeof window === "undefined" || parseTimeMs(iso) === null) {
    return;
  }
  try {
    window.localStorage.setItem(feedbackSeenStorageKey(groupId), iso);
  } catch {
    /* Ignorieren ohne Browser-Speicher. */
  }
}

export function isFeedbackUnread(
  item: Pick<FeedbackItem, "member_id" | "created_at">,
  ownMemberId: string | null | undefined,
  seenAt: string | null,
): boolean {
  if (ownMemberId && item.member_id === ownMemberId) return false;
  const seenMs = parseTimeMs(seenAt);
  if (seenMs === null) return true;
  const itemMs = parseTimeMs(item.created_at);
  if (itemMs === null) return false;
  return itemMs > seenMs;
}

export function countUnreadFeedback(
  items: readonly FeedbackItem[],
  ownMemberId: string | null | undefined,
  seenAt: string | null,
): number {
  let count = 0;
  for (const item of items) {
    if (isFeedbackUnread(item, ownMemberId, seenAt)) count++;
  }
  return count;
}
