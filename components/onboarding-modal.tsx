"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LocateFixed,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Ticket,
  X,
} from "lucide-react";
import { ThemeSegmented } from "./theme-toggle";

const ONBOARDING_KEY = "minutenclub-onboarding-done-v1";

export function isOnboardingDone(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(ONBOARDING_KEY) === "1";
  } catch {
    return false;
  }
}

export function markOnboardingDone(): void {
  try {
    localStorage.setItem(ONBOARDING_KEY, "1");
  } catch {
    /* Ohne Storage kein Fehler. */
  }
}

type Props = {
  motion: boolean;
  groupName: string;
  memberName?: string;
  onClose: () => void;
  onStartUnlock?: () => void;
};

export function OnboardingModal({
  motion,
  groupName,
  memberName,
  onClose,
  onStartUnlock,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [step, setStep] = useState(0);
  const [sampleDrive, setSampleDrive] = useState(14);
  const [samplePause, setSamplePause] = useState(1);

  useLayoutEffect(() => {
    dialog.current?.showModal();
    const node = dialog.current;
    return () => node?.close();
  }, []);

  async function finish(animate: boolean, triggerUnlock = false) {
    markOnboardingDone();
    const node = dialog.current;
    if (!node || node.dataset.closing) return;
    node.dataset.closing = "true";
    if (animate && motion) {
      await Promise.allSettled(node.getAnimations().map((a) => a.finished));
    }
    if (node.isConnected) {
      onClose();
      if (triggerUnlock && onStartUnlock) onStartUnlock();
    }
  }

  const totalSteps = 3;

  return (
    <dialog
      ref={dialog}
      className="entry-dialog onboarding-dialog"
      data-motion={motion || undefined}
      aria-labelledby="onboarding-title"
      onCancel={(e) => {
        e.preventDefault();
        void finish(false);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) void finish(e.detail > 0);
      }}
    >
      <div className="dialog-inner">
        <button
          className="icon-button dialog-close"
          type="button"
          aria-label="Einführung schliessen"
          onClick={(e) => void finish(e.detail > 0)}
        >
          <X size={22} />
        </button>

        <div
          className="onboarding-progress"
          aria-label={`Schritt ${step + 1} von ${totalSteps}`}
        >
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              type="button"
              aria-label={`Zu Schritt ${i + 1}`}
              className={`onboarding-dot ${i === step ? "active" : i < step ? "done" : ""}`}
              onClick={() => setStep(i)}
            />
          ))}
          <span className="onboarding-step-label">
            Schritt {step + 1} / {totalSteps}
          </span>
        </div>

        {step === 0 && (
          <div className="onboarding-step">
            <span className="dialog-icon">
              <Ticket size={24} />
            </span>
            <span className="eyebrow">{groupName.toUpperCase()}</span>
            <h2 id="onboarding-title">
              Willkommen{memberName ? `, ${memberName}` : ""}! Dein Minutenpass
            </h2>
            <p>
              Ihr teilt ein gemeinsames Dott-Paket – jede Person behält aber ihr
              eigenes Minutenkonto. Probiere kurz aus, wie eine Fahrt gebucht
              wird:
            </p>

            <div className="onboarding-simulator">
              <div className="sim-pass-preview">
                <div>
                  <small>BEISPIEL-ABZUG VOM PASS</small>
                  <strong>{sampleDrive + samplePause} Min.</strong>
                </div>
                <span className="pill active">Freischaltung = 0 Min.</span>
              </div>
              <div className="sim-controls">
                <div>
                  <span>
                    Fahrzeit: <strong>{sampleDrive} Min.</strong>
                  </span>
                  <div className="chip-row">
                    {[6, 14, 22].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`chip ${sampleDrive === v ? "active" : ""}`}
                        onClick={() => setSampleDrive(v)}
                      >
                        {v} Min.
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <span>
                    Pause unterwegs: <strong>{samplePause} Min.</strong>
                  </span>
                  <div className="chip-row">
                    {[0, 1, 3].map((v) => (
                      <button
                        key={v}
                        type="button"
                        className={`chip ${samplePause === v ? "active" : ""}`}
                        onClick={() => setSamplePause(v)}
                      >
                        {v} Min.
                      </button>
                    ))}
                  </div>
                </div>
              </div>
              <small>
                Beim gemeinsamen Aufladen verteilt die App die Minuten exakt
                nach bezahltem CHF-Anteil.
              </small>
            </div>
          </div>
        )}

        {step === 1 && (
          <div className="onboarding-step">
            <span className="dialog-icon">
              <LocateFixed size={24} />
            </span>
            <span className="eyebrow">DATENSCHUTZ & ROUTENSTATISTIK</span>
            <h2 id="onboarding-title">Dott entsperren & Ort auf Wunsch</h2>
            <p>
              Wenn du einen Scooter entsperrst, kannst du die laufende Zeit
              starten und optional Start- sowie Zielort festhalten. Daraus
              entsteht eure Statistik:{" "}
              <strong>wer wie oft um welche Uhrzeit wohin</strong> fährt.
            </p>

            <div className="onboarding-privacy-card">
              <div className="privacy-point">
                <ShieldCheck size={20} />
                <div>
                  <strong>Nur bei aktiver Verwendung</strong>
                  <small>
                    Der Standort wird ausschliesslich in dem Moment einmalig
                    abgefragt, in dem du aktiv auf den Standort-Button tippst –
                    niemals im Hintergrund und niemals dauerhaft.
                  </small>
                </div>
              </div>
              <div className="privacy-point">
                <Sparkles size={20} />
                <div>
                  <strong>Lokale Ortszuordnung auf deinem Gerät</strong>
                  <small>
                    Quartiere und bekannte Treffpunkte in Zürich werden direkt
                    im Browser erkannt, ohne deine Koordinaten an fremde
                    Kartendienste zu senden.
                  </small>
                </div>
              </div>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="onboarding-step">
            <span className="dialog-icon">
              <Smartphone size={24} />
            </span>
            <span className="eyebrow">DEIN SETUP</span>
            <h2 id="onboarding-title">Ansicht wählen & losfahren</h2>
            <p>
              Unterwegs in der Sonne lesbar im hellen Modus, abends angenehm
              abgedunkelt – wähle deine bevorzugte Darstellung:
            </p>

            <div className="onboarding-setup-box">
              <div className="setup-row">
                <strong>Darstellung</strong>
                <ThemeSegmented />
              </div>
              <div className="setup-tip">
                <strong>Tipp fürs iPhone:</strong> Öffne die Seite in Safari und
                wähle <em>Teilen → Zum Home-Bildschirm</em>, damit Minutenclub
                wie eine eigene App startet.
              </div>
            </div>

            {onStartUnlock && (
              <button
                type="button"
                className="button secondary wide"
                onClick={(e) => void finish(e.detail > 0, true)}
              >
                <LocateFixed size={18} />
                Direkt ersten Dott entsperren
              </button>
            )}
          </div>
        )}

        <div className="dialog-actions onboarding-actions">
          {step > 0 ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => setStep((s) => s - 1)}
            >
              <ArrowLeft size={17} />
              Zurück
            </button>
          ) : (
            <button
              type="button"
              className="text-link"
              onClick={(e) => void finish(e.detail > 0)}
            >
              Überspringen
            </button>
          )}

          {step < totalSteps - 1 ? (
            <button
              type="button"
              className="button primary"
              onClick={() => setStep((s) => s + 1)}
            >
              Weiter <ArrowRight size={17} />
            </button>
          ) : (
            <button
              type="button"
              className="button primary"
              onClick={(e) => void finish(e.detail > 0)}
            >
              <Check size={18} />
              Loslegen
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
