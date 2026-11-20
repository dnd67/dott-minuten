"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Info,
  LoaderCircle,
  ShieldAlert,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";

export type DeleteAccountDialogProps = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  motion?: boolean;
  demo?: boolean;
  username?: string | null;
  groupName?: string | null;
  adminSuccessorName?: string | null;
  isSoleActiveMember?: boolean;
};

export function DeleteAccountDialog(props: DeleteAccountDialogProps) {
  if (!props.open) return null;
  return <DeleteAccountDialogContent {...props} />;
}

function DeleteAccountDialogContent({
  onClose,
  onConfirm,
  motion = false,
  demo = false,
  username,
  groupName,
  adminSuccessorName,
  isSoleActiveMember = false,
}: DeleteAccountDialogProps) {
  const dialog = useRef<HTMLDialogElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");

  const cleanUsername = username?.trim().replace(/^@+/, "") || "";
  const cleanGroup = groupName?.trim() || "";
  const cleanSuccessor = adminSuccessorName?.trim() || "";

  useLayoutEffect(() => {
    const node = dialog.current;
    if (!node) return;
    const opener =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    if (!node.open) {
      node.showModal();
    }
    cancelRef.current?.focus();
    return () => {
      if (node.open) {
        node.close();
      }
      if (opener && opener.isConnected && document.activeElement !== opener) {
        opener.focus();
      }
    };
  }, []);

  async function dismiss(animate: boolean) {
    const node = dialog.current;
    if (!node || deleting || node.dataset.closing) return;
    node.dataset.closing = "true";
    if (animate && motion) {
      await Promise.allSettled(
        node.getAnimations().map((animation) => animation.finished),
      );
    }
    if (node.isConnected) onClose();
  }

  async function handleConfirm() {
    if (deleting || dialog.current?.dataset.closing) return;
    setError("");
    setDeleting(true);
    try {
      await onConfirm();
      if (dialog.current?.isConnected) {
        onClose();
      }
    } catch (err) {
      if (dialog.current?.isConnected) {
        const msg =
          err instanceof Error
            ? err.message
            : err && typeof err === "object" && "message" in err
              ? String(err.message)
              : "";
        setError(
          msg.trim() ||
            "Das Konto konnte nicht gelöscht werden. Bitte erneut versuchen.",
        );
        setDeleting(false);
      }
    }
  }

  return (
    <dialog
      ref={dialog}
      className="entry-dialog delete-account-dialog"
      data-motion={motion || undefined}
      aria-labelledby="delete-account-title"
      aria-describedby="delete-account-desc"
      onCancel={(e) => {
        e.preventDefault();
        if (!deleting) void dismiss(false);
      }}
      onClick={(e) => {
        if (!deleting && e.target === e.currentTarget) {
          void dismiss(e.detail > 0);
        }
      }}
    >
      <div className="dialog-inner">
        <button
          className="icon-button dialog-close"
          type="button"
          aria-label="Dialog schliessen"
          disabled={deleting}
          onClick={(e) => void dismiss(e.detail > 0)}
        >
          <X size={22} />
        </button>

        <span className="dialog-icon danger-icon" aria-hidden="true">
          <AlertTriangle size={24} />
        </span>

        <h2 id="delete-account-title">Konto löschen</h2>
        <p id="delete-account-desc">
          {demo
            ? "Du befindest dich im Demo-Modus. Beim Löschen werden deine lokalen Beispieldaten, laufende Timer und Demo-Einträge auf diesem Gerät vollständig entfernt."
            : cleanUsername
              ? `Möchtest du dein Konto (@${cleanUsername}) wirklich endgültig löschen? Dieser Schritt kann nicht rückgängig gemacht werden.`
              : "Möchtest du dein Konto wirklich endgültig löschen? Dieser Schritt kann nicht rückgängig gemacht werden."}
        </p>

        <ul className="delete-account-summary">
          <li>
            <strong>Sofort &amp; dauerhaft gelöscht</strong>
            <span>
              Login, Benutzername{cleanUsername ? ` (@${cleanUsername})` : ""},
              Passwort-Anfragen, eigenes Feedback sowie lokale Sitzung und
              aktive Timer auf diesem Gerät.
            </span>
          </li>
          <li>
            <strong>Anonymisiert für die Crew erhalten</strong>
            <span>
              Gemeinsame Fahrten, Minutenpakete und Buchungen
              {cleanGroup ? ` in «${cleanGroup}»` : ""} bleiben als{" "}
              <strong>Gelöschtes Konto</strong> erhalten, damit alle Salden
              stimmen.
            </span>
          </li>
        </ul>

        {demo && (
          <div className="delete-account-callout" role="note">
            <Sparkles size={18} aria-hidden="true" />
            <span>
              <strong>Lokale Demo:</strong> Es wird kein echtes Cloud-Konto
              berührt. Du kehrst zur Startseite zurück und kannst die Demo
              jederzeit frisch neu starten.
            </span>
          </div>
        )}

        {!demo && cleanSuccessor && (
          <div className="delete-account-callout" role="note">
            <Info size={18} aria-hidden="true" />
            <span>
              <strong>Automatische Admin-Übergabe:</strong>{" "}
              <strong>{cleanSuccessor}</strong> übernimmt automatisch die
              Admin-Rolle, damit die Gruppe verwaltbar bleibt. Du kannst Rollen
              vorher auch manuell ändern.
            </span>
          </div>
        )}

        {!demo && isSoleActiveMember && (
          <div className="delete-account-callout warning" role="note">
            <ShieldAlert size={18} aria-hidden="true" />
            <span>
              <strong>Letztes aktives Mitglied:</strong> Offene Einladungslinks
              für {cleanGroup ? `«${cleanGroup}»` : "diese Gruppe"} werden beim
              Löschen automatisch ungültig gemacht.
            </span>
          </div>
        )}

        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        <div className="dialog-actions">
          <button
            ref={cancelRef}
            type="button"
            className="button secondary"
            disabled={deleting}
            onClick={(e) => void dismiss(e.detail > 0)}
          >
            Abbrechen
          </button>
          <button
            type="button"
            className="button destructive"
            disabled={deleting}
            onClick={() => void handleConfirm()}
          >
            {deleting ? (
              <LoaderCircle size={17} className="spin" aria-hidden="true" />
            ) : (
              <Trash2 size={17} aria-hidden="true" />
            )}
            {deleting ? "Konto wird gelöscht …" : "Konto endgültig löschen"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
