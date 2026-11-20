"use client";

import { useState, type ReactNode } from "react";
import {
  Bug,
  CheckCheck,
  Heart,
  Lightbulb,
  MessageSquare,
  Search,
  Sparkles,
} from "lucide-react";
import type {
  FeedbackCategory,
  FeedbackItem,
  Member,
  UserAccount,
} from "@/lib/domain";
import {
  countUnreadFeedback,
  FEEDBACK_CATEGORIES,
  FEEDBACK_CATEGORY_LABELS,
  feedbackCategoryMeta,
  filterFeedback,
  formatFeedbackDate,
  isFeedbackLive,
  isFeedbackUnread,
  resolveFeedbackAuthor,
  sortFeedbackNewest,
  summarizeFeedback,
} from "@/lib/feedback";

const CATEGORY_ICONS: Record<FeedbackCategory, typeof Lightbulb> = {
  idea: Lightbulb,
  bug: Bug,
  praise: Heart,
  other: MessageSquare,
};

type Props = {
  feedback: FeedbackItem[];
  members: Member[];
  accounts?: UserAccount[];
  me?: Member;
  admin: boolean;
  demo?: boolean;
  seenAt?: string | null;
  onMarkSeen?: () => void;
  renderAvatar?: (member: Member | undefined, size?: string) => ReactNode;
};

function defaultAvatar(member: Member | undefined) {
  const initials = (member?.display_name ?? "?")
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return <span className="avatar av-0 small">{initials || "?"}</span>;
}

export function FeedbackInbox({
  feedback,
  members,
  accounts = [],
  me,
  admin,
  demo = false,
  seenAt = null,
  onMarkSeen,
  renderAvatar,
}: Props) {
  const [category, setCategory] = useState<FeedbackCategory | "all">("all");
  const [memberId, setMemberId] = useState<string>("all");
  const [query, setQuery] = useState("");

  if (demo || !admin) return null;

  const sorted = sortFeedbackNewest(feedback);
  const summary = summarizeFeedback(sorted);
  const unreadCount = countUnreadFeedback(sorted, me?.id, seenAt);
  const visible = filterFeedback(sorted, members, accounts, {
    category,
    memberId,
    query,
  });
  const hasActiveFilters =
    category !== "all" || memberId !== "all" || query.trim() !== "";

  const memberIdsInList = new Set(members.map((m) => m.id));
  const orphanAuthorIds = [
    ...new Set(
      sorted
        .map((item) => item.member_id)
        .filter((id) => id && !memberIdsInList.has(id)),
    ),
  ];

  const live = isFeedbackLive();

  return (
    <section
      id="dev-feedback"
      className="panel feedback-inbox-panel"
      aria-labelledby="dev-feedback-heading"
    >
      <div className="panel-heading">
        <div>
          <h2 id="dev-feedback-heading">Nutzer-Feedback der Crew</h2>
          <p>
            Alle Rückmeldungen aus eurer Gruppe direkt aus der Datenbank –
            filterbar nach Kategorie, Mitglied oder Suchbegriff.
          </p>
        </div>
        <div className="feedback-inbox-actions">
          <span className="subtle-pill">
            <MessageSquare size={13} /> {summary.total}{" "}
            {summary.total === 1 ? "Eintrag" : "Einträge"}
          </span>
          {unreadCount > 0 && (
            <span className="feedback-unread-pill" role="status">
              {unreadCount} neu
            </span>
          )}
          {unreadCount > 0 && onMarkSeen && (
            <button
              type="button"
              className="button secondary compact-btn"
              onClick={onMarkSeen}
            >
              <CheckCheck size={15} /> Als gelesen markieren
            </button>
          )}
        </div>
      </div>

      {!live && (
        <div className="notice feedback-inbox-env-hint" role="status">
          <Sparkles size={17} />
          <span>
            Hinweis: <code>NEXT_PUBLIC_FEEDBACK_ENABLED=true</code> ist aktuell
            nicht aktiv. Bereits gespeicherte Rückmeldungen aus Supabase werden
            hier trotzdem vollständig angezeigt – setze die Variable in Vercel,
            damit neue Einträge eurer Crew live gespeichert werden.
          </span>
        </div>
      )}

      <div className="feedback-inbox-controls">
        <div
          className="split-modes feedback-inbox-categories"
          role="group"
          aria-label="Feedback-Kategorie filtern"
        >
          <button
            type="button"
            aria-pressed={category === "all"}
            onClick={() => setCategory("all")}
          >
            Alle ({summary.total})
          </button>
          {FEEDBACK_CATEGORIES.map((cat) => {
            const Icon = CATEGORY_ICONS[cat];
            return (
              <button
                key={cat}
                type="button"
                aria-pressed={category === cat}
                onClick={() => setCategory(cat)}
              >
                <Icon size={14} /> {FEEDBACK_CATEGORY_LABELS[cat]} (
                {summary[cat]})
              </button>
            );
          })}
        </div>

        <div className="feedback-inbox-filters">
          <label className="sr-only" htmlFor="feedback-member-filter">
            Mitglied filtern
          </label>
          <select
            id="feedback-member-filter"
            aria-label="Mitglied filtern"
            value={memberId}
            onChange={(e) => setMemberId(e.target.value)}
          >
            <option value="all">Alle Mitglieder</option>
            {members.map((m) => (
              <option key={m.id} value={m.id}>
                {m.display_name}
                {m.active ? "" : " (Deaktiviert)"}
              </option>
            ))}
            {orphanAuthorIds.map((id) => (
              <option key={id} value={id}>
                Mitglied (Deaktiviert)
              </option>
            ))}
          </select>

          <div className="input-icon feedback-search-wrap">
            <Search size={16} aria-hidden="true" />
            <label className="sr-only" htmlFor="feedback-search-input">
              Feedback durchsuchen
            </label>
            <input
              id="feedback-search-input"
              type="search"
              aria-label="Feedback durchsuchen"
              placeholder="Nachricht, Name, @Benutzername oder Bereich suchen …"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>
      </div>

      {summary.total === 0 ? (
        <div className="empty">
          <h3>Noch kein Feedback eingegangen</h3>
          <p>
            Sobald jemand aus eurer Crew über «Feedback» eine Rückmeldung
            sendet, erscheint sie automatisch hier.
          </p>
        </div>
      ) : visible.length === 0 ? (
        <div className="empty">
          <h3>Kein Feedback für diesen Filter</h3>
          <p>
            Passe Kategorie, Mitglied oder Suchbegriff an, um wieder alle
            Rückmeldungen zu sehen.
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              className="button secondary compact-btn"
              onClick={() => {
                setCategory("all");
                setMemberId("all");
                setQuery("");
              }}
            >
              Filter zurücksetzen
            </button>
          )}
        </div>
      ) : (
        <div className="feedback-inbox-list">
          {visible.map((item) => {
            const author = resolveFeedbackAuthor(item, members, accounts);
            const unread = isFeedbackUnread(item, me?.id, seenAt);
            const catMeta = feedbackCategoryMeta(item.category);
            const CatIcon = CATEGORY_ICONS[catMeta.styleKey];
            return (
              <article
                key={item.id}
                className={`feedback-inbox-card${unread ? " unread" : ""}`}
              >
                <div className="feedback-card-head">
                  <div className="person-cell">
                    {renderAvatar
                      ? renderAvatar(author.member ?? undefined, "small")
                      : defaultAvatar(author.member ?? undefined)}
                    <div>
                      <div className="feedback-author-row">
                        <strong>{author.displayName}</strong>
                        {author.username && (
                          <span className="feedback-author-handle">
                            @{author.username}
                          </span>
                        )}
                        {!author.active && (
                          <span className="pill muted">Deaktiviert</span>
                        )}
                      </div>
                      <small>{formatFeedbackDate(item.created_at)}</small>
                    </div>
                  </div>
                  <div className="feedback-card-badges">
                    {unread && (
                      <span className="feedback-unread-pill">Neu</span>
                    )}
                    <span
                      className={`feedback-cat-badge cat-${catMeta.styleKey}`}
                    >
                      <CatIcon size={13} aria-hidden="true" />
                      {catMeta.label}
                    </span>
                    {item.page && (
                      <span className="subtle-pill feedback-page-pill">
                        {item.page}
                      </span>
                    )}
                  </div>
                </div>
                <p className="feedback-card-message">{item.message}</p>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
