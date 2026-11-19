"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  Bug,
  Check,
  Heart,
  Lightbulb,
  LoaderCircle,
  MessageSquare,
  Sparkles,
  X,
} from "lucide-react";
import {
  dateLabel,
  type Action,
  type FeedbackCategory,
  type FeedbackItem,
  type Member,
  type RpcArgs,
} from "@/lib/domain";

const LOCAL_FEEDBACK_KEY = "minutenclub-feedback-preview-v1";

export const isFeedbackLive = () =>
  process.env.NEXT_PUBLIC_FEEDBACK_ENABLED === "true";

function loadLocalFeedback(): FeedbackItem[] {
  try {
    const raw = localStorage.getItem(LOCAL_FEEDBACK_KEY);
    if (raw) return JSON.parse(raw) as FeedbackItem[];
  } catch {
    /* Ohne Storage leere Vorschau-Liste. */
  }
  return [];
}

function saveLocalFeedback(items: FeedbackItem[]) {
  try {
    localStorage.setItem(LOCAL_FEEDBACK_KEY, JSON.stringify(items));
  } catch {
    /* Ignorieren ohne Storage. */
  }
}

const CATEGORIES: {
  id: FeedbackCategory;
  label: string;
  icon: typeof Lightbulb;
}[] = [
  { id: "idea", label: "Idee", icon: Lightbulb },
  { id: "bug", label: "Problem", icon: Bug },
  { id: "praise", label: "Lob", icon: Heart },
  { id: "other", label: "Allgemein", icon: MessageSquare },
];

const CATEGORY_LABELS: Record<FeedbackCategory, string> = {
  idea: "Idee",
  bug: "Problem",
  praise: "Lob",
  other: "Allgemein",
};

type Props = {
  motion: boolean;
  demo: boolean;
  currentPage: string;
  me?: Member;
  members: Member[];
  remoteFeedback: FeedbackItem[];
  busy: boolean;
  remoteError: string;
  onSave: (action: Action, args: RpcArgs) => Promise<string | boolean>;
  onClose: () => void;
};

export function FeedbackDialog({
  motion,
  demo,
  currentPage,
  me,
  members,
  remoteFeedback,
  busy,
  remoteError,
  onSave,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [category, setCategory] = useState<FeedbackCategory>("idea");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [localItems, setLocalItems] = useState<FeedbackItem[]>(() =>
    typeof window === "undefined" ? [] : loadLocalFeedback(),
  );

  const live = !demo && isFeedbackLive();

  useLayoutEffect(() => {
    dialog.current?.showModal();
    textareaRef.current?.focus();
    const node = dialog.current;
    return () => node?.close();
  }, []);

  async function dismiss(animate: boolean) {
    const node = dialog.current;
    if (!node || node.dataset.closing) return;
    node.dataset.closing = "true";
    if (animate && motion) {
      await Promise.allSettled(node.getAnimations().map((a) => a.finished));
    }
    if (node.isConnected) onClose();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || dialog.current?.dataset.closing) return;
    setError("");
    const clean = message.trim();
    if (!clean || clean.length > 2000) {
      setError("Bitte gib eine Rückmeldung zwischen 1 und 2000 Zeichen ein.");
      return;
    }

    if (live || demo) {
      const ok = await onSave("submit_feedback", {
        p_category: category,
        p_message: clean,
        p_page: currentPage,
      });
      if (ok) {
        setSubmitted(true);
        setMessage("");
      }
      return;
    }

    // Vorbereiteter Vorschau-Modus vor dem scharfen Launch auf Vercel & Supabase.
    const nextItem: FeedbackItem = {
      id: crypto.randomUUID(),
      group_id: me?.group_id ?? "preview",
      member_id: me?.id ?? "preview-member",
      category,
      message: clean,
      page: currentPage,
      created_at: new Date().toISOString(),
    };
    const updated = [nextItem, ...localItems];
    setLocalItems(updated);
    saveLocalFeedback(updated);
    setSubmitted(true);
    setMessage("");
  }

  const combinedList = live || demo ? remoteFeedback : localItems;
  const memberName = (id: string) =>
    members.find((m) => m.id === id)?.display_name ??
    me?.display_name ??
    "Mitglied";

  return (
    <dialog
      ref={dialog}
      className="entry-dialog"
      data-motion={motion || undefined}
      aria-labelledby="feedback-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) void dismiss(false);
      }}
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) void dismiss(e.detail > 0);
      }}
    >
      <div className="dialog-inner">
        <button
          className="icon-button dialog-close"
          type="button"
          aria-label="Feedback-Fenster schliessen"
          onClick={(e) => void dismiss(e.detail > 0)}
          disabled={busy}
        >
          <X size={22} />
        </button>

        <span className="dialog-icon">
          <MessageSquare size={24} />
        </span>
        <div className="feedback-header-row">
          <h2 id="feedback-title">Feedback an den Club</h2>
          <span className={`pill ${live ? "active" : ""}`}>
            {live ? "Live aktiv" : "Vorbereitet für Launch"}
          </span>
        </div>
        <p>
          Fehlt eine Funktion, hakt etwas auf dem iPhone oder hast du eine Idee
          für eure Crew? Schreib es kurz hier hinein.
        </p>

        {!live && (
          <div className="notice feedback-launch-note" role="status">
            <Sparkles size={18} />
            <span>
              {demo
                ? "Demo-Modus: Dein Feedback wird lokal in der Demo gespeichert. Beim Launch mit Vercel & Supabase landet es automatisch in der Tabelle public.feedback."
                : "Vorschau-Modus aktiv: Setze beim Launch in Vercel NEXT_PUBLIC_FEEDBACK_ENABLED=true, um Rückmeldungen direkt in Supabase zu speichern."}
            </span>
          </div>
        )}

        {submitted ? (
          <div className="feedback-thanks" role="status">
            <span className="dialog-icon">
              <Check size={22} />
            </span>
            <h3>Danke für deine Rückmeldung!</h3>
            <p>
              {live
                ? "Dein Feedback wurde für eure Gruppe gespeichert."
                : "Deine Eingabe wurde lokal als Vorschau gesichert."}
            </p>
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                onClick={() => setSubmitted(false)}
              >
                Weiteres Feedback
              </button>
              <button
                type="button"
                className="button primary"
                onClick={(e) => void dismiss(e.detail > 0)}
              >
                Fertig
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={submit}>
            <fieldset className="feedback-categories">
              <legend>Kategorie</legend>
              <div className="chip-row">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={category === c.id}
                    className={`chip ${category === c.id ? "active" : ""}`}
                    onClick={() => setCategory(c.id)}
                  >
                    <c.icon size={15} />
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <label htmlFor="feedback-message">
              <span>
                Deine Nachricht{" "}
                <span className="optional">· Bereich: {currentPage}</span>
              </span>
              <textarea
                ref={textareaRef}
                id="feedback-message"
                name="message"
                required
                rows={4}
                maxLength={2000}
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="z. B. Beim Entsperren am HB wäre ein Favoriten-Button praktisch …"
              />
              <small>{message.length} / 2000 Zeichen</small>
            </label>

            {(error || remoteError) && (
              <div className="notice error" role="alert">
                {error || remoteError}
              </div>
            )}

            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={(e) => void dismiss(e.detail > 0)}
              >
                Abbrechen
              </button>
              <button type="submit" className="button primary" disabled={busy}>
                {busy ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <Check size={18} />
                )}
                {busy ? "Wird gesendet …" : "Feedback senden"}
              </button>
            </div>
          </form>
        )}

        {combinedList.length > 0 && (
          <details className="feedback-history">
            <summary>Bisherige Rückmeldungen ({combinedList.length})</summary>
            <div className="feedback-list">
              {combinedList.slice(0, 8).map((item) => (
                <div className="feedback-item" key={item.id}>
                  <div>
                    <span className="pill active">
                      {CATEGORY_LABELS[item.category] ?? item.category}
                    </span>
                    {item.page && <small> · {item.page}</small>}
                    <small>
                      {" "}
                      · {memberName(item.member_id)} ·{" "}
                      {dateLabel(item.created_at, true)}
                    </small>
                  </div>
                  <p>{item.message}</p>
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </dialog>
  );
}
