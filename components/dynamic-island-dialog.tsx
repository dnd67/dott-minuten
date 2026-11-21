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
          Öffne diese Seite in Safari auf dem iPhone und richte die Kurzbefehle
          einmal ein. Die laufende Live-Aktivität erscheint auf dem
          Sperrbildschirm und auf iPhones mit Dynamic Island auch oben am
          Display.
        </p>

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
            <Sparkles size={14} /> Mit Fahrtdaten
          </button>
        </div>

        <ol className="island-steps">
          {mode === "native" ? (
            <>
              <li>
                <strong>Beide Kurzbefehle herunterladen.</strong> Die Dateien
                starten und stoppen die Stoppuhr der iPhone-Uhr.
                <div className="copy-chip-row">
                  <a
                    className="button secondary compact-btn"
                    href={`/shortcuts/${encodeURIComponent(SHORTCUT_NAME_START)}.shortcut`}
                    download
                  >
                    <Download size={14} /> {SHORTCUT_NAME_START} herunterladen
                  </a>
                  <a
                    className="button secondary compact-btn"
                    href={`/shortcuts/${encodeURIComponent(SHORTCUT_NAME_STOP)}.shortcut`}
                    download
                  >
                    <Download size={14} /> {SHORTCUT_NAME_STOP} herunterladen
                  </a>
                </div>
              </li>
              <li>
                <strong>In Kurzbefehle importieren.</strong> Öffne in Safari
                «Downloads» oder in der App «Dateien» den Ordner «Downloads».
                Tippe nacheinander auf beide Dateien und bestätige jeweils
                «Kurzbefehl hinzufügen». Die Namen müssen genau{" "}
                <code>{SHORTCUT_NAME_START}</code> und{" "}
                <code>{SHORTCUT_NAME_STOP}</code> lauten.
              </li>
            </>
          ) : (
            <>
              <li>
                <strong>Start-Kurzbefehl erstellen.</strong> Öffne
                «Kurzbefehle», tippe auf <strong>+</strong> und benenne den
                neuen Kurzbefehl genau so:
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
                <strong>Fahrtdaten übergeben.</strong> Installiere und öffne{" "}
                <a href="https://apps.apple.com/ch/app/live-shortcut/id6476543630">
                  Live Shortcut
                </a>{" "}
                (ab iOS 16.4). Füge im Kurzbefehl zuerst «Wörterbuch aus Eingabe
                abrufen» hinzu und wähle als Quelle «Kurzbefehleingabe». Füge
                danach «Wörterbuchwert abrufen» hinzu und trage als Schlüssel{" "}
                <code>summary</code> ein. Wähle als Wörterbuch das Ergebnis der
                ersten Aktion. Füge dann aus «Live Shortcut» die Aktion zum
                Starten einer Live-Aktivität hinzu und setze deren Text auf den
                abgerufenen Wörterbuchwert. Speichere mit «Fertig». Die
                Fahrtdaten zeigen den Stand beim Start der Anzeige.
              </li>
              <li>
                <strong>Stopp-Kurzbefehl erstellen.</strong> Lege einen zweiten
                Kurzbefehl namens <code>{SHORTCUT_NAME_STOP}</code> an. Wähle
                unter «Live Shortcut» die Aktion zum Beenden der Live-Aktivität
                und speichere mit «Fertig».
              </li>
            </>
          )}
          <li>
            <strong>Auf dem iPhone testen.</strong> Kehre zu Dott-Minuten zurück
            und tippe unten auf «Start testen». Bestätige «Öffnen», falls Safari
            nachfragt, und sperre das iPhone. Wenn Kurzbefehle den Namen nicht
            findet, prüfe die Schreibweise in der App «Kurzbefehle». Wenn die
            Aktivität auf dem Sperrbildschirm fehlt, prüfe «Live-Aktivitäten» in
            den iPhone-Einstellungen. Tippe danach auf «Stopp testen».
          </li>
        </ol>

        <p>
          Bei einer laufenden Fahrt startet «Dynamic Island» die Anzeige. Nach
          der Fahrt findest du «Live-Anzeige stoppen» in den Einstellungen von
          Dott-Minuten.
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
            Stopp testen
          </a>
        </div>
      </div>
    </dialog>
  );
}
