"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  Smartphone,
  Sparkles,
  Timer,
  X,
} from "lucide-react";
import {
  SHORTCUT_NAME_START,
  SHORTCUT_NAME_STOP,
  buildStartLiveActivityUrl,
  buildStopLiveActivityUrl,
  type LiveActivityMode,
  type LiveRidePayload,
} from "@/lib/live-activity";

type Props = {
  motion: boolean;
  samplePayload: LiveRidePayload;
  mode: LiveActivityMode;
  onChangeMode: (mode: LiveActivityMode) => void;
  autoShortcut: boolean;
  onToggleAutoShortcut: (next: boolean) => void;
  onClose: () => void;
};

export function DynamicIslandDialog({
  motion,
  samplePayload,
  mode,
  onChangeMode,
  autoShortcut,
  onToggleAutoShortcut,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useLayoutEffect(() => {
    dialog.current?.showModal();
    const node = dialog.current;
    return () => node?.close();
  }, []);

  async function dismiss(animate: boolean) {
    const node = dialog.current;
    if (!node || node.dataset.closing) return;
    node.dataset.closing = "true";
    if (animate && motion) {
      await Promise.allSettled(
        node.getAnimations().map((animation) => animation.finished),
      );
    }
    if (node.isConnected) onClose();
  }

  async function copyText(id: string, text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(id);
      setTimeout(() => setCopied((cur) => (cur === id ? null : cur)), 2000);
    } catch {
      setCopied(null);
    }
  }

  const startUrl = buildStartLiveActivityUrl(samplePayload, mode);
  const stopUrl = buildStopLiveActivityUrl();

  return (
    <dialog
      ref={dialog}
      className="entry-dialog island-dialog"
      data-motion={motion || undefined}
      aria-labelledby="island-dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        void dismiss(false);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) void dismiss(e.detail > 0);
      }}
    >
      <div className="dialog-inner">
        <button
          className="icon-button dialog-close"
          type="button"
          aria-label="Schliessen"
          onClick={(e) => void dismiss(e.detail > 0)}
        >
          <X size={22} />
        </button>

        <span className="dialog-icon">
          <Smartphone size={24} />
        </span>
        <h2 id="island-dialog-title">Dynamic Island &amp; Sperrbildschirm</h2>
        <p>
          Öffne diese Anleitung in Safari auf dem iPhone. Die fertigen
          Stoppuhr-Kurzbefehle zeigen die laufende Zeit ab iOS 18 auf dem
          Sperrbildschirm und auf unterstützten iPhones in der Dynamic Island.
          Für eine Notiz mit den Fahrtdaten wähle unten «Mit Fahrtdaten ·
          Vellure».
        </p>

        <ol className="island-steps">
          <li>
            <strong>Beide Kurzbefehle herunterladen.</strong> Damit wählst du
            «Stoppuhr» für die Live-Anzeige aus.
            <div className="copy-chip-row">
              <a
                className="button primary"
                href={`/shortcuts/${encodeURIComponent(SHORTCUT_NAME_START)}.shortcut`}
                onClick={() => onChangeMode("native")}
                download
              >
                <Download size={16} aria-hidden="true" /> {SHORTCUT_NAME_START}{" "}
                herunterladen
              </a>
              <a
                className="button secondary"
                href={`/shortcuts/${encodeURIComponent(SHORTCUT_NAME_STOP)}.shortcut`}
                onClick={() => onChangeMode("native")}
                download
              >
                <Download size={16} aria-hidden="true" /> {SHORTCUT_NAME_STOP}{" "}
                herunterladen
              </a>
            </div>
          </li>
          <li>
            <strong>In Kurzbefehle importieren.</strong> Öffne beide Dateien
            unter «Downloads» in Safari oder in der App «Dateien». Tippe jeweils
            auf «Kurzbefehl hinzufügen» und behalte die Namen{" "}
            <code>{SHORTCUT_NAME_START}</code> und{" "}
            <code>{SHORTCUT_NAME_STOP}</code> bei.
          </li>
        </ol>

        <div
          className="split-modes"
          role="group"
          aria-label="Einrichtungsvariante"
        >
          <button
            type="button"
            aria-pressed={mode === "native"}
            onClick={() => onChangeMode("native")}
          >
            <Timer size={14} /> Stoppuhr (ab iOS 18)
          </button>
          <button
            type="button"
            aria-pressed={mode === "rich"}
            onClick={() => onChangeMode("rich")}
          >
            <Sparkles size={14} /> Mit Fahrtdaten · Vellure
          </button>
        </div>

        {mode === "rich" && (
          <ol className="island-steps">
            <li>
              <strong>Vellure installieren.</strong> Lade die kostenlose App für
              iOS 17 oder neuer und öffne sie einmal. Erlaube Live-Aktivitäten,
              wenn das iPhone danach fragt.{" "}
              <a href="https://apps.apple.com/ch/app/id6806074181">
                Vellure im Schweizer App Store
              </a>
            </li>
            <li>
              <strong>Start-Kurzbefehl vorbereiten.</strong> Öffne die Apple-App
              «Kurzbefehle». Lege über «+» einen Kurzbefehl mit dem folgenden
              Namen an. Gibt es ihn schon, öffne ihn über «…» und ersetze die
              bisherigen Aktionen durch die nächsten drei Schritte.
              <div className="copy-chip-row">
                <code>{SHORTCUT_NAME_START}</code>
                <button
                  type="button"
                  className="button secondary compact-btn"
                  onClick={() => void copyText("start", SHORTCUT_NAME_START)}
                >
                  {copied === "start" ? (
                    <Check size={14} />
                  ) : (
                    <Copy size={14} />
                  )}
                  {copied === "start" ? "Kopiert" : "Namen kopieren"}
                </button>
              </div>
            </li>
            <li>
              Suche nach <strong>«Wörterbuch aus Eingabe abrufen»</strong>.
              Wähle für das Eingabefeld die Variable «Kurzbefehleingabe». Hier
              übergibt Dott-Minuten die Fahrtdaten als JSON-Text.
            </li>
            <li>
              Füge <strong>«Wörterbuchwert abrufen»</strong> hinzu. Verwende das
              Wörterbuch aus dem vorherigen Schritt und gib als Schlüssel{" "}
              <code>summary</code> ein. Dieser Wert enthält den fertigen Text
              mit dem Stand beim Start der Anzeige.
            </li>
            <li>
              Suche in den Aktionen nach <strong>Vellure</strong> und wähle die
              Aktion zum Erstellen und Anzeigen einer Notiz. Tippe auf das
              Textfeld und wähle den Wörterbuchwert aus dem vorherigen Schritt
              als Variable. Speichere den Kurzbefehl und kehre zu Dott-Minuten
              zurück.
            </li>
          </ol>
        )}

        <p>
          <strong>Auf dem iPhone testen.</strong> Kehre zu Dott-Minuten zurück
          und tippe unten auf «Start testen». Bestätige «Öffnen», falls Safari
          nachfragt, und sperre das iPhone. Wenn Kurzbefehle den Namen nicht
          findet, prüfe die Schreibweise in der App «Kurzbefehle». Wenn die
          Aktivität auf dem Sperrbildschirm fehlt, prüfe «Live-Aktivitäten» in
          den iPhone-Einstellungen.{" "}
          {mode === "rich"
            ? "Zum Ausblenden wische die Vellure-Notiz auf dem Sperrbildschirm nach links und entferne sie."
            : "Tippe danach auf «Stopp testen»."}
        </p>

        <p>
          Bei einer laufenden Fahrt startet «Dynamic Island» die Anzeige.{" "}
          {mode === "native" &&
            "Nach der Fahrt findest du «Live-Anzeige stoppen» in den Einstellungen von Dott-Minuten."}
        </p>

        <label className="legal-consent island-auto-toggle">
          <input
            type="checkbox"
            checked={autoShortcut}
            onChange={(e) => onToggleAutoShortcut(e.target.checked)}
          />
          <span>
            <strong>Beim Fahrtstart automatisch öffnen.</strong> Aktiviere dies
            nach einem erfolgreichen Test. Beim Tippen auf «Fahrt starten»
            öffnet Dott-Minuten den Kurzbefehl.
          </span>
        </label>

        <div className="island-test-actions">
          <a href={startUrl} className="button primary">
            <ExternalLink size={16} /> Start testen
          </a>
          <a href={stopUrl} className="button secondary">
            {mode === "rich"
              ? "Eigenen Stopp-Kurzbefehl testen (optional)"
              : "Stopp testen"}
          </a>
        </div>
      </div>
    </dialog>
  );
}
