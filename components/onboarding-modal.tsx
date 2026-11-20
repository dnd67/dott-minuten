"use client";

import { useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LocateFixed,
  Smartphone,
  X,
} from "lucide-react";
import { type TourFeature } from "@/lib/onboarding";
import { TourPreview } from "./tour-preview";

type Card = { title: string; description: string };
const cards: Record<TourFeature, Card> = {
  "minute-pass": {
    title: "Dein Minutenpass",
    description:
      "Unter «Fahrt eintragen» buchst du Fahrzeit und Pause aus deinen Dott-Fahrtdetails. Beides geht von deinem Pass ab. Die Freischaltung kostet keine Paketminuten. Probier den Abzug aus.",
  },
  "package-splits": {
    title: "Ein Paket, eure Anteile",
    description:
      "Unter «Guthaben» verteilt ein Admin das Paket gleichmässig, nach Minutenbedarf oder nach bezahltem CHF-Beitrag. Wähle im Beispiel eine Aufteilung und vergleiche Minuten und Preis.",
  },
  "shared-rides": {
    title: "Eine Fahrt gemeinsam abrechnen",
    description:
      "Wähle die Beteiligten im Live-Cockpit oder beim Eintragen. Die App teilt Fahrzeit und Pause auf ihre Konten auf. In der Fahrtenliste bleibt die Buchung als gemeinsame Fahrt sichtbar.",
  },
  "live-cockpit": {
    title: "Deine Fahrt bleibt im Blick",
    description:
      "Starte den Timer über «Dott entsperren». Beim Tabwechsel läuft er in der schwebenden Anzeige weiter. Im Cockpit kannst du das Display wach halten und auf dem iPhone einen Kurzbefehl für die Dynamic Island einrichten. Den Scooter entsperrst du in Dott.",
  },
  "route-records": {
    title: "Eure Strecken und Bestzeiten",
    description:
      "Erfasse Start und Ziel per Text oder einmaligem Standortabruf. Crew-Orte fassen nahe Adressen zusammen. Für unbekannte Orte kann swisstopo die Adresse liefern. Unter «Statistik» findest du Ziele, Uhrzeiten und die Bestzeit je Strecke.",
  },
  "club-account": {
    title: "Dein Zugang zur Crew",
    description:
      "Mit einer Einladung trittst du eurer Gruppe bei. Melde dich mit Benutzername und Passwort an. Unter «Mitglieder» änderst du Anzeigenamen und Passwort. Falls du dein Passwort vergisst, kannst du beim Login eine Zurücksetzung anfragen.",
  },
  "admin-tools": {
    title: "Deine Werkzeuge als Admin",
    description:
      "Unter «Mitglieder» lädst du Personen ein, legst Konten an und bearbeitest Passwortanfragen. Falsche Fahrten kannst du unter «Fahrten» stornieren. Im Dev-Dashboard siehst du Fahrt-Telemetrie und kannst Crew-Orte mit einem Radius von 100 Metern anlegen.",
  },
  appearance: {
    title: "Bereit für unterwegs",
    description:
      "Wähle deine Darstellung. Auf dem iPhone legst du den Minutenclub in Safari über «Teilen → Zum Home-Bildschirm» ab. Die Tour und das Feedback findest du jederzeit unter «Mitglieder».",
  },
};

export type Tour = { features: TourFeature[]; updates: boolean };

type Props = {
  tour: Tour;
  groupName: string;
  memberName?: string;
  onClose: () => void;
  onAcknowledge?: (ids: TourFeature[]) => Promise<void>;
  onStartUnlock?: () => void;
  onOpenIslandGuide?: () => void;
};

export function OnboardingModal({
  tour,
  groupName,
  memberName,
  onClose,
  onAcknowledge,
  onStartUnlock,
  onOpenIslandGuide,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);
  const locked = useRef(false);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const feature = tour.features[step];
  const last = step === tour.features.length - 1;

  useLayoutEffect(() => {
    const node = dialog.current!;
    const opener = document.activeElement;
    node.showModal();
    return () => {
      node.close();
      if (
        opener instanceof HTMLElement &&
        opener.isConnected &&
        opener !== document.body
      )
        opener.focus({ preventScroll: true });
    };
  }, []);

  useLayoutEffect(() => {
    heading.current?.focus({ preventScroll: true });
    dialog.current?.scrollTo(0, 0);
  }, [step]);

  async function close(animate: boolean, action?: () => void) {
    const node = dialog.current;
    if (!node || node.dataset.closing) return;
    node.dataset.closing = "true";
    if (animate)
      await Promise.allSettled(node.getAnimations().map((a) => a.finished));
    if (!node.isConnected) return;
    onClose();
    action?.();
  }

  async function navigate(
    next: number,
    animate = false,
    skip = false,
    action?: () => void,
  ) {
    if (locked.current || next === step || next < 0) return;
    if (next < step) {
      setError("");
      setStep(next);
      return;
    }
    locked.current = true;
    setSaving(true);
    setError("");
    try {
      await onAcknowledge?.(skip ? tour.features : [feature]);
      if (!dialog.current || dialog.current.dataset.closing) return;
      if (next >= tour.features.length) await close(animate, action);
      else setStep(next);
    } catch {
      setError(
        "Dein Fortschritt konnte nicht gespeichert werden. Versuch es nochmals oder schliesse die Tour für diesen Besuch.",
      );
    } finally {
      locked.current = false;
      setSaving(false);
    }
  }

  return (
    <dialog
      ref={dialog}
      className="entry-dialog onboarding-dialog"
      data-motion
      aria-labelledby="onboarding-title"
      onKeyDown={(e) => {
        if (
          e.target instanceof HTMLElement &&
          e.target.closest(".segmented-control")
        )
          return;
        if (e.key === "ArrowRight" && !last) {
          e.preventDefault();
          void navigate(step + 1);
        }
        if (e.key === "ArrowLeft" && step > 0) {
          e.preventDefault();
          void navigate(step - 1);
        }
      }}
      onCancel={(e) => {
        e.preventDefault();
        void close(false);
      }}
      onClick={(e) => {
        if (e.target === e.currentTarget) void close(e.detail > 0);
      }}
    >
      <div className="dialog-inner">
        <div className="tour-header">
          <span className="tour-kicker">
            {tour.updates ? "Neu für dich" : "Deine Einführung"}
          </span>
          <span
            className="tour-counter"
            aria-label={`Schritt ${step + 1} von ${tour.features.length}`}
          >
            {String(step + 1).padStart(2, "0")} /{" "}
            {String(tour.features.length).padStart(2, "0")}
          </span>
          <button
            className="icon-button"
            type="button"
            aria-label="Einführung schliessen"
            onClick={(e) => void close(e.detail > 0)}
          >
            <X size={18} />
          </button>
        </div>
        <div className="tour-progress" role="group" aria-label="Tour-Schritte">
          {tour.features.map((id, i) => (
            <button
              key={id}
              type="button"
              aria-label={`Zu Schritt ${i + 1}: ${cards[id].title}`}
              aria-current={i === step ? "step" : undefined}
              disabled={saving}
              data-current={i <= step || undefined}
              onClick={() => void navigate(i)}
            />
          ))}
        </div>
        <div
          className="tour-slide"
          key={feature}
          onTouchStart={(e) => {
            const t = e.changedTouches[0];
            if (t) touchOrigin.current = { x: t.clientX, y: t.clientY };
          }}
          onTouchEnd={(e) => {
            const start = touchOrigin.current,
              t = e.changedTouches[0];
            touchOrigin.current = null;
            if (!t || !start) return;
            const dx = t.clientX - start.x,
              dy = t.clientY - start.y;
            if (Math.abs(dx) >= 52 && Math.abs(dx) > Math.abs(dy) * 1.4) {
              if (dx < 0 && !last) void navigate(step + 1);
              if (dx > 0 && step > 0) void navigate(step - 1);
            }
          }}
        >
          <TourPreview feature={feature} memberName={memberName} />
          <div className="tour-copy">
            <span className="eyebrow">
              {feature === "minute-pass" && memberName
                ? `Hoi ${memberName}`
                : groupName}
            </span>
            <h2 id="onboarding-title" ref={heading} tabIndex={-1}>
              {cards[feature].title}
            </h2>
            <p>{cards[feature].description}</p>
          </div>
        </div>
        {error && <p role="alert">{error}</p>}
        {last &&
          (feature === "appearance" || feature === "live-cockpit") &&
          onOpenIslandGuide && (
            <button
              type="button"
              className="button secondary wide"
              disabled={saving}
              onClick={(e) =>
                void navigate(
                  tour.features.length,
                  e.detail > 0,
                  false,
                  onOpenIslandGuide,
                )
              }
            >
              <Smartphone size={17} /> Dynamic Island jetzt einrichten
            </button>
          )}
        {last && feature === "appearance" && onStartUnlock && (
          <button
            type="button"
            className="button secondary wide"
            disabled={saving}
            onClick={(e) =>
              void navigate(
                tour.features.length,
                e.detail > 0,
                false,
                onStartUnlock,
              )
            }
          >
            <LocateFixed size={17} /> Direkt ersten Dott entsperren
          </button>
        )}
        <div className="dialog-actions onboarding-actions">
          {step > 0 ? (
            <button
              type="button"
              className="button secondary"
              disabled={saving}
              onClick={() => void navigate(step - 1)}
            >
              <ArrowLeft size={16} /> Zurück
            </button>
          ) : (
            <button
              type="button"
              className="text-link"
              disabled={saving}
              onClick={(e) =>
                void navigate(tour.features.length, e.detail > 0, true)
              }
            >
              Überspringen
            </button>
          )}
          <button
            type="button"
            className="button primary"
            disabled={saving}
            onClick={(e) => void navigate(step + 1, e.detail > 0)}
          >
            {last ? (
              <>
                {tour.updates ? "Alles klar" : "Loslegen"} <Check size={17} />
              </>
            ) : (
              <>
                Weiter <ArrowRight size={17} />
              </>
            )}
          </button>
        </div>
      </div>
    </dialog>
  );
}
