"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  Check,
  Copy,
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
  type LiveRidePayload,
} from "@/lib/live-activity";

type Props = {
  motion: boolean;
  samplePayload: LiveRidePayload;
  autoShortcut: boolean;
  onToggleAutoShortcut: (next: boolean) => void;
  onClose: () => void;
};

export function DynamicIslandDialog({
  motion,
  samplePayload,
  autoShortcut,
  onToggleAutoShortcut,
  onClose,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [tab, setTab] = useState<"rich" | "native">("rich");

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

  const startUrl = buildStartLiveActivityUrl(samplePayload);
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
          Safari darf die Dynamic Island nicht direkt ansprechen – aber über
          einen 1-Minuten-iPhone-Kurzbefehl startet deine Fahrt live auf dem
          Sperrbildschirm und in der Dynamic Island.
        </p>

        <div className="island-preview-card" aria-label="Vorschau der Eckdaten">
          <div className="island-preview-pill">
            <span className="unlock-pulse" aria-hidden="true" />
            <strong>{samplePayload.title}</strong>
            <span className="island-preview-clock">04:12</span>
          </div>
          <small>{samplePayload.subtitle}</small>
        </div>

        <div
          className="split-modes"
          role="group"
          aria-label="Einrichtungsvariante"
        >
          <button
            type="button"
            aria-pressed={tab === "rich"}
            onClick={() => setTab("rich")}
          >
            <Sparkles size={14} /> Mit Eckdaten (Live Shortcut)
          </button>
          <button
            type="button"
            aria-pressed={tab === "native"}
            onClick={() => setTab("native")}
          >
            <Timer size={14} /> Ohne Zusatz-App (iOS 18 Stoppuhr)
          </button>
        </div>

        {tab === "rich" ? (
          <ol className="island-steps">
            <li>
              <strong>Kostenlose App installieren:</strong> Lade{" "}
              <em>«Live Shortcut»</em> (Gratis-Basisversion) aus dem iOS App
              Store – sie schaltet die Aktion «Live Activity starten» für Apple
              Kurzbefehle frei.
            </li>
            <li>
              <strong>Kurzbefehl anlegen:</strong> Öffne die Apple-App{" "}
              <em>Kurzbefehle</em> → <strong>+</strong> und gib dem Kurzbefehl
              genau diesen Namen:
              <div className="copy-chip-row">
                <code>{SHORTCUT_NAME_START}</code>
                <button
                  type="button"
                  className="button secondary compact-btn"
                  onClick={() => void copyText("start", SHORTCUT_NAME_START)}
                >
                  {copied === "start" ? (
                    <>
                      <Check size={14} /> Kopiert
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Namen kopieren
                    </>
                  )}
                </button>
              </div>
            </li>
            <li>
              <strong>Aktion verbinden:</strong> Wähle{" "}
              <em>Live Shortcut → Live Activity starten</em>, aktiviere den{" "}
              <strong>aufwärts zählenden Timer</strong> und setze als Titel bzw.
              Untertitel die <strong>Kurzbefehleingabe</strong> (Typ{" "}
              <em>Wörterbuch</em>):
              <div className="island-keys">
                <span>
                  <code>title</code> → {samplePayload.title}
                </span>
                <span>
                  <code>subtitle</code> → {samplePayload.subtitle}
                </span>
                <span>
                  <code>summary</code> → Alles in einer Zeile
                </span>
              </div>
            </li>
            <li>
              <strong>Optional zum Beenden:</strong> Zweiten Kurzbefehl namens{" "}
              <code>{SHORTCUT_NAME_STOP}</code> mit der Aktion{" "}
              <em>Live Activity beenden</em> anlegen.
              <div className="copy-chip-row">
                <code>{SHORTCUT_NAME_STOP}</code>
                <button
                  type="button"
                  className="button secondary compact-btn"
                  onClick={() => void copyText("stop", SHORTCUT_NAME_STOP)}
                >
                  {copied === "stop" ? (
                    <>
                      <Check size={14} /> Kopiert
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Kopieren
                    </>
                  )}
                </button>
              </div>
            </li>
          </ol>
        ) : (
          <ol className="island-steps">
            <li>
              <strong>Ohne Zusatz-App (ab iOS 18):</strong> Apples eingebaute
              Stoppuhr läuft automatisch als echte Live Activity in der Dynamic
              Island und auf dem Sperrbildschirm.
            </li>
            <li>
              <strong>Start-Kurzbefehl:</strong> Öffne <em>Kurzbefehle</em> →{" "}
              <strong>+</strong>, nenne ihn exakt{" "}
              <code>{SHORTCUT_NAME_START}</code> und füge eine einzige Aktion
              hinzu: <strong>Uhr → «Stoppuhr starten»</strong>.
              <div className="copy-chip-row">
                <code>{SHORTCUT_NAME_START}</code>
                <button
                  type="button"
                  className="button secondary compact-btn"
                  onClick={() =>
                    void copyText("start-native", SHORTCUT_NAME_START)
                  }
                >
                  {copied === "start-native" ? (
                    <>
                      <Check size={14} /> Kopiert
                    </>
                  ) : (
                    <>
                      <Copy size={14} /> Namen kopieren
                    </>
                  )}
                </button>
              </div>
            </li>
            <li>
              <strong>Stopp-Kurzbefehl (optional):</strong> Zweiter Kurzbefehl
              namens <code>{SHORTCUT_NAME_STOP}</code> mit der Aktion{" "}
              <strong>Uhr → «Stoppuhr stoppen»</strong>.
            </li>
          </ol>
        )}

        <label className="legal-consent island-auto-toggle">
          <input
            type="checkbox"
            checked={autoShortcut}
            onChange={(e) => onToggleAutoShortcut(e.target.checked)}
          />
          <span>
            <strong>Automatisch beim Entsperren starten:</strong> Nach «Fahrt
            starten» direkt den iPhone-Kurzbefehl «{SHORTCUT_NAME_START}»
            aufrufen.
          </span>
        </label>

        <div className="island-test-actions">
          <a href={startUrl} className="button primary">
            <ExternalLink size={16} /> Jetzt auf iPhone testen
          </a>
          <a href={stopUrl} className="button secondary">
            Stopp testen
          </a>
        </div>
      </div>
    </dialog>
  );
}
