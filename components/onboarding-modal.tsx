"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  LocateFixed,
  MapPin,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Ticket,
  Timer,
  Trophy,
  Users,
  X,
  Zap,
} from "lucide-react";
import { ThemeSegmented } from "./theme-toggle";

const ONBOARDING_KEY = "minutenclub-onboarding-done-v2";
const TOTAL_STEPS = 5;

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

function formatDemoClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}

function formatSplitMinutes(minutes: number): string {
  return Number.isInteger(minutes)
    ? String(minutes)
    : minutes.toFixed(1).replace(".", ",");
}

const PACKAGE_SPLITS = {
  fair: [
    { name: "Oskar", pct: 33.4, min: 100, chf: "10.–", badge: "1/3" },
    { name: "Max", pct: 33.3, min: 100, chf: "10.–", badge: "1/3" },
    { name: "August", pct: 33.3, min: 100, chf: "10.–", badge: "1/3" },
  ],
  chf: [
    { name: "Oskar", pct: 50, min: 150, chf: "15.–", badge: "50%" },
    { name: "Max", pct: 30, min: 90, chf: "9.–", badge: "30%" },
    { name: "August", pct: 20, min: 60, chf: "6.–", badge: "20%" },
  ],
} as const;

const DEMO_ROUTES = {
  "hb-eth": {
    label: "HB → ETH",
    title: "Zürich HB → ETH Polyterrasse",
    count: "6 Fahrten",
    entries: [
      { rank: 1, name: "Oskar", minutes: 6, width: 100 },
      { rank: 2, name: "Max", minutes: 8, width: 75 },
      { rank: 3, name: "August", minutes: 11, width: 54 },
    ],
  },
  "bellevue-seefeld": {
    label: "Bellevue → Seefeld",
    title: "Bellevue → Seefeld",
    count: "5 Fahrten",
    entries: [
      { rank: 1, name: "Max", minutes: 5, width: 100 },
      { rank: 2, name: "Oskar", minutes: 7, width: 71 },
      { rank: 3, name: "August", minutes: 9, width: 55 },
    ],
  },
} as const;

type Props = {
  motion: boolean;
  groupName: string;
  memberName?: string;
  onClose: () => void;
  onStartUnlock?: () => void;
  onOpenIslandGuide?: () => void;
};

export function OnboardingModal({
  motion,
  groupName,
  memberName,
  onClose,
  onStartUnlock,
  onOpenIslandGuide,
}: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const touchOrigin = useRef<{ x: number; y: number } | null>(null);

  const [step, setStep] = useState(0);
  const [dir, setDir] = useState<"next" | "prev">("next");

  // Schritt 1: Minutenpass & Paket-Aufteilung
  const [sampleDrive, setSampleDrive] = useState(14);
  const [samplePause, setSamplePause] = useState(1);
  const [splitMode, setSplitMode] = useState<"fair" | "chf">("fair");

  // Schritt 2: Gemeinsamer Scooter
  const leadName = memberName?.trim() || "Oskar";
  const candidatePeers = ["Max", "August", "Oskar"]
    .filter((name) => name.toLowerCase() !== leadName.toLowerCase())
    .slice(0, 2);
  const [coRiders, setCoRiders] = useState<string[]>([]);

  // Schritt 3: Live-Cockpit & Dynamic Island
  const [islandExpanded, setIslandExpanded] = useState(true);
  const [demoSeconds, setDemoSeconds] = useState(252); // 04:12

  // Schritt 4: Strecken-Bestzeiten
  const [sampleRoute, setSampleRoute] = useState<"hb-eth" | "bellevue-seefeld">(
    "hb-eth",
  );

  useLayoutEffect(() => {
    dialog.current?.showModal();
    const node = dialog.current;
    return () => node?.close();
  }, []);

  useEffect(() => {
    if (step !== 2) return;
    const id = window.setInterval(() => {
      setDemoSeconds((s) => (s >= 599 ? 252 : s + 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [step]);

  function goTo(next: number) {
    const clamped = Math.max(0, Math.min(TOTAL_STEPS - 1, next));
    if (clamped === step) return;
    setDir(clamped > step ? "next" : "prev");
    setStep(clamped);
  }

  function togglePeer(name: string) {
    setCoRiders((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  }

  async function finish(
    animate: boolean,
    nextAction?: "unlock" | "island",
  ): Promise<void> {
    markOnboardingDone();
    const node = dialog.current;
    if (!node || node.dataset.closing) return;
    node.dataset.closing = "true";
    if (animate && motion) {
      await Promise.allSettled(node.getAnimations().map((a) => a.finished));
    }
    if (node.isConnected) {
      onClose();
      if (nextAction === "unlock" && onStartUnlock) onStartUnlock();
      if (nextAction === "island" && onOpenIslandGuide) onOpenIslandGuide();
    }
  }

  const activeRiders = [leadName, ...coRiders];
  const sharedMinutesEach = 15 / activeRiders.length;
  const splitRows = PACKAGE_SPLITS[splitMode];
  const routeData = DEMO_ROUTES[sampleRoute];
  const demoRemaining = Math.max(1, 52 - Math.ceil(demoSeconds / 60));

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
      onKeyDown={(e) => {
        const target = e.target as HTMLElement | null;
        if (
          target &&
          (target.tagName === "INPUT" ||
            target.tagName === "TEXTAREA" ||
            target.closest(".segmented-control"))
        ) {
          return;
        }
        if (e.key === "ArrowRight" && step < TOTAL_STEPS - 1) {
          e.preventDefault();
          goTo(step + 1);
        } else if (e.key === "ArrowLeft" && step > 0) {
          e.preventDefault();
          goTo(step - 1);
        }
      }}
    >
      <div className="dialog-inner onboarding-inner">
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
          aria-label={`Schritt ${step + 1} von ${TOTAL_STEPS}`}
        >
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Zu Schritt ${i + 1}`}
              aria-current={i === step ? "step" : undefined}
              className={`onboarding-dot ${i === step ? "active" : i < step ? "done" : ""}`}
              onClick={() => goTo(i)}
            />
          ))}
          <span className="onboarding-step-label">
            {step + 1} / {TOTAL_STEPS}
          </span>
        </div>

        <div
          className="onboarding-viewport"
          onTouchStart={(e) => {
            const touch = e.changedTouches[0];
            if (touch) {
              touchOrigin.current = { x: touch.clientX, y: touch.clientY };
            }
          }}
          onTouchEnd={(e) => {
            const start = touchOrigin.current;
            const touch = e.changedTouches[0];
            touchOrigin.current = null;
            if (!start || !touch) return;
            const dx = touch.clientX - start.x;
            const dy = touch.clientY - start.y;
            if (Math.abs(dx) >= 52 && Math.abs(dx) > Math.abs(dy) * 1.4) {
              if (dx < 0 && step < TOTAL_STEPS - 1) goTo(step + 1);
              if (dx > 0 && step > 0) goTo(step - 1);
            }
          }}
        >
          {step === 0 && (
            <div key="step-0" className="onboarding-step" data-dir={dir}>
              <span className="dialog-icon ob-icon-float">
                <Ticket size={24} />
              </span>
              <span className="eyebrow">
                {groupName.toUpperCase()} · PASS &amp; PAKETE
              </span>
              <h2 id="onboarding-title">
                Willkommen{memberName ? `, ${memberName}` : ""}! Dein
                Minutenpass
              </h2>
              <p>
                Ihr teilt ein gemeinsames Dott-Paket – jede Person behält ihr
                eigenes Guthaben. Probiere Abzug &amp; Paket-Aufteilung direkt
                aus:
              </p>

              <div className="onboarding-simulator">
                <div className="sim-pass-preview ob-ticket-sheen">
                  <div>
                    <small>BEISPIEL-ABZUG VOM PASS</small>
                    <strong
                      key={sampleDrive + samplePause}
                      className="ob-number-pop"
                    >
                      {sampleDrive + samplePause} Min.
                    </strong>
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
                          aria-pressed={sampleDrive === v}
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
                          aria-pressed={samplePause === v}
                          onClick={() => setSamplePause(v)}
                        >
                          {v} Min.
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                <div className="ob-split-demo">
                  <div className="ob-split-head">
                    <span>
                      Paket teilen <strong>(300 Min. · CHF 30.–)</strong>
                    </span>
                    <div
                      className="ob-mini-toggle"
                      role="group"
                      aria-label="Aufteilungsmodus testen"
                    >
                      <button
                        type="button"
                        className={splitMode === "fair" ? "active" : ""}
                        aria-pressed={splitMode === "fair"}
                        onClick={() => setSplitMode("fair")}
                      >
                        Fair (1/3)
                      </button>
                      <button
                        type="button"
                        className={splitMode === "chf" ? "active" : ""}
                        aria-pressed={splitMode === "chf"}
                        onClick={() => setSplitMode("chf")}
                      >
                        Nach CHF
                      </button>
                    </div>
                  </div>
                  <div className="ob-split-track" aria-hidden="true">
                    {splitRows.map((row, idx) => (
                      <span
                        key={row.name}
                        className={`ob-split-seg seg-${idx}`}
                        style={{ width: `${row.pct}%` }}
                      />
                    ))}
                  </div>
                  <div className="ob-split-legend">
                    {splitRows.map((row) => (
                      <div key={row.name} className="ob-split-pill">
                        <span>
                          {row.name} <small>{row.badge}</small>
                        </span>
                        <strong>
                          {row.min} Min. · CHF {row.chf}
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 1 && (
            <div key="step-1" className="onboarding-step" data-dir={dir}>
              <span className="dialog-icon ob-icon-float">
                <Users size={24} />
              </span>
              <span className="eyebrow">NEU · GEMEINSAMER SCOOTER</span>
              <h2 id="onboarding-title">
                Zu zweit unterwegs? Zeit fair teilen
              </h2>
              <p>
                Fahren mehrere auf demselben Scooter, tippst du Mitfahrende
                einfach an – beim Entsperren, live unterwegs oder beim
                Eintragen. Die App teilt die Minuten sekundengenau auf alle auf.
              </p>

              <div className="ob-stage-card">
                <div className="ob-route-stage">
                  <div className="ob-route-endpoints">
                    <span>
                      <MapPin size={13} /> Zürich HB
                    </span>
                    <span className="ob-route-pill">15 Min. Fahrt</span>
                    <span>Bellevue</span>
                  </div>
                  <div className="ob-route-track" aria-hidden="true">
                    <span className="ob-route-runner" />
                  </div>
                  <div className="ob-rider-avatars">
                    <div className="ob-avatar-group">
                      {activeRiders.map((rider, i) => (
                        <span
                          key={rider}
                          className={`ob-avatar-dot ${i === 0 ? "lead" : ""}`}
                          style={{ animationDelay: `${i * 55}ms` }}
                        >
                          {rider.charAt(0).toUpperCase()}
                        </span>
                      ))}
                    </div>
                    <strong key={activeRiders.length} className="ob-number-pop">
                      {activeRiders.length === 1
                        ? "Alleine · 15 Min."
                        : `÷${activeRiders.length} · je ${formatSplitMinutes(sharedMinutesEach)} Min.`}
                    </strong>
                  </div>
                </div>

                <div className="ob-corider-controls">
                  <small>
                    Tippe Mitfahrende an, um den Split live zu sehen:
                  </small>
                  <div
                    className="chip-row"
                    role="group"
                    aria-label="Mitfahrende in Vorschau auswählen"
                  >
                    <span className="chip active ob-chip-fixed">
                      <Check size={13} /> {leadName} (du)
                    </span>
                    {candidatePeers.map((peer) => {
                      const active = coRiders.includes(peer);
                      return (
                        <button
                          key={peer}
                          type="button"
                          className={`chip ${active ? "active" : ""}`}
                          aria-pressed={active}
                          onClick={() => togglePeer(peer)}
                        >
                          {active ? `✓ ${peer}` : `+ ${peer}`}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="ob-rider-bars">
                  {activeRiders.map((rider) => (
                    <div key={rider} className="ob-rider-bar-row">
                      <div className="ob-rider-bar-meta">
                        <span>{rider}</span>
                        <strong
                          key={`${rider}-${activeRiders.length}`}
                          className="ob-number-pop"
                        >
                          −{formatSplitMinutes(sharedMinutesEach)} Min.
                        </strong>
                      </div>
                      <div className="ob-bar-track" aria-hidden="true">
                        <span
                          className="ob-bar-fill"
                          style={{ width: `${100 / activeRiders.length}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div key="step-2" className="onboarding-step" data-dir={dir}>
              <span className="dialog-icon ob-icon-float">
                <Timer size={24} />
              </span>
              <span className="eyebrow">NEU · LIVE-COCKPIT &amp; IPHONE</span>
              <h2 id="onboarding-title">
                Live auf Dynamic Island &amp; Sperrbildschirm
              </h2>
              <p>
                In der App siehst du Fahrzeit, Restguthaben und CHF-Schätzung.
                Mit einem iPhone-Kurzbefehl kannst du zusätzlich eine
                Live-Aktivität für den Sperrbildschirm und die Dynamic Island
                starten.
              </p>

              <div className="ob-island-stage">
                <div className="ob-phone-bezel">
                  <div className="ob-phone-status" aria-hidden="true">
                    <span>09:41</span>
                    <div className="ob-phone-signals">
                      <i />
                      <i />
                      <i />
                    </div>
                  </div>

                  <button
                    type="button"
                    className={`ob-island-capsule ${islandExpanded ? "expanded" : "compact"}`}
                    aria-expanded={islandExpanded}
                    onClick={() => setIslandExpanded((v) => !v)}
                  >
                    <div className="ob-island-top">
                      <span className="ob-live-dot" aria-hidden="true" />
                      <span className="ob-island-label">
                        {islandExpanded
                          ? `Dott · ${leadName} & Max (÷2)`
                          : "Dott · ÷2"}
                      </span>
                      <span className="ob-island-clock">
                        {formatDemoClock(demoSeconds)}
                      </span>
                    </div>

                    {islandExpanded && (
                      <div className="ob-island-detail">
                        <div className="ob-island-metrics">
                          <span>Start: Zürich HB</span>
                          <span>{demoRemaining} Min. übrig · ~CHF 1.15</span>
                        </div>
                        <div className="ob-island-pulsebar" aria-hidden="true">
                          <span />
                        </div>
                      </div>
                    )}
                  </button>

                  <div className="ob-phone-caption">
                    <div
                      className="ob-mini-toggle ob-dark-toggle"
                      role="group"
                      aria-label="Dynamic Island Ansicht"
                    >
                      <button
                        type="button"
                        className={!islandExpanded ? "active" : ""}
                        aria-pressed={!islandExpanded}
                        onClick={() => setIslandExpanded(false)}
                      >
                        Kompakt
                      </button>
                      <button
                        type="button"
                        className={islandExpanded ? "active" : ""}
                        aria-pressed={islandExpanded}
                        onClick={() => setIslandExpanded(true)}
                      >
                        Erweitert
                      </button>
                    </div>
                    <small>Tippe die Island an zum Umschalten</small>
                  </div>
                </div>

                <div className="ob-feature-pills">
                  <span>
                    <Zap size={14} /> In-App Dynamic Pill
                  </span>
                  <span>
                    <Sun size={14} /> Display wach halten
                  </span>
                  <span>
                    <Smartphone size={14} /> iPhone-Kurzbefehl
                  </span>
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div key="step-3" className="onboarding-step" data-dir={dir}>
              <span className="dialog-icon ob-icon-float">
                <Trophy size={24} />
              </span>
              <span className="eyebrow">NEU · ORTE &amp; BESTZEITEN</span>
              <h2 id="onboarding-title">
                Adressen statt Koordinaten &amp; Bestzeiten
              </h2>
              <p>
                Ein Tipp auf Standort speichert direkt die echte Strassenadresse
                oder euren 100-m Crew-Ort. Alle Mitglieder sehen in{" "}
                <strong>Statistik</strong> Ziele, Häufigkeit und wer am
                schnellsten war.
              </p>

              <div className="ob-stage-card ob-geo-stack">
                <div className="ob-geo-resolve">
                  <div className="ob-radar-wrap" aria-hidden="true">
                    <span className="ob-radar-ring r1" />
                    <span className="ob-radar-ring r2" />
                    <span className="ob-radar-core">
                      <LocateFixed size={17} />
                    </span>
                  </div>
                  <div className="ob-geo-text">
                    <span className="ob-coord-old">47.3779, 8.5403</span>
                    <strong className="ob-coord-new">
                      Bahnhofstrasse 42, 8001 Zürich
                    </strong>
                    <small className="ob-privacy-inline">
                      <ShieldCheck size={13} /> Nur bei Einmal-Tipp · Null
                      Hintergrund-GPS
                    </small>
                  </div>
                </div>

                <div className="ob-podium-box">
                  <div className="ob-podium-head">
                    <strong>
                      <Trophy size={14} /> Strecken-Bestzeiten
                    </strong>
                    <div
                      className="ob-mini-toggle"
                      role="group"
                      aria-label="Beispielstrecke wählen"
                    >
                      {(["hb-eth", "bellevue-seefeld"] as const).map((key) => (
                        <button
                          key={key}
                          type="button"
                          className={sampleRoute === key ? "active" : ""}
                          aria-pressed={sampleRoute === key}
                          onClick={() => setSampleRoute(key)}
                        >
                          {DEMO_ROUTES[key].label}
                        </button>
                      ))}
                    </div>
                  </div>
                  <small className="ob-podium-sub">
                    {routeData.title} · {routeData.count}
                  </small>
                  <div className="ob-podium-bars">
                    {routeData.entries.map((entry, idx) => (
                      <div key={entry.name} className="ob-podium-row">
                        <span className="ob-podium-rank">#{entry.rank}</span>
                        <span className="ob-podium-name">{entry.name}</span>
                        <div className="ob-bar-track" aria-hidden="true">
                          <span
                            className={`ob-bar-fill ${idx === 0 ? "winner" : ""}`}
                            style={{ width: `${entry.width}%` }}
                          />
                        </div>
                        <strong className="ob-podium-time">
                          {entry.minutes} Min.
                        </strong>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div key="step-4" className="onboarding-step" data-dir={dir}>
              <span className="dialog-icon ob-icon-float">
                <Sparkles size={24} />
              </span>
              <span className="eyebrow">DEIN SETUP</span>
              <h2 id="onboarding-title">Ansicht wählen &amp; losfahren</h2>
              <p>
                Unterwegs in der Sonne kontrastreich im hellen Modus, abends
                angenehm abgedunkelt – wähle deine bevorzugte Darstellung:
              </p>

              <div className="onboarding-setup-box">
                <div className="setup-row">
                  <strong>Darstellung</strong>
                  <ThemeSegmented />
                </div>

                <ul className="ob-ready-list">
                  <li>
                    <Check size={15} />
                    <span>Minutenpass &amp; faires Paket-Aufteilen bereit</span>
                  </li>
                  <li>
                    <Check size={15} />
                    <span>
                      Mitfahren, Live-Timer &amp; Dynamic Island verfügbar
                    </span>
                  </li>
                  <li>
                    <Check size={15} />
                    <span>
                      Adressen, Ziele &amp; Strecken-Bestzeiten für die ganze
                      Crew
                    </span>
                  </li>
                </ul>

                <div className="setup-tip">
                  <strong>Tipp fürs iPhone:</strong> Öffne die Seite in Safari
                  und wähle <em>Teilen → Zum Home-Bildschirm</em>, damit
                  Minutenclub wie eine eigene App startet.
                </div>
              </div>

              {(onStartUnlock || onOpenIslandGuide) && (
                <div className="ob-final-shortcuts">
                  {onOpenIslandGuide && (
                    <button
                      type="button"
                      className="button secondary wide"
                      onClick={(e) => void finish(e.detail > 0, "island")}
                    >
                      <Smartphone size={17} />
                      Dynamic Island jetzt einrichten
                    </button>
                  )}
                  {onStartUnlock && (
                    <button
                      type="button"
                      className="button secondary wide"
                      onClick={(e) => void finish(e.detail > 0, "unlock")}
                    >
                      <LocateFixed size={17} />
                      Direkt ersten Dott entsperren
                    </button>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="dialog-actions onboarding-actions">
          {step > 0 ? (
            <button
              type="button"
              className="button secondary"
              onClick={() => goTo(step - 1)}
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

          {step < TOTAL_STEPS - 1 ? (
            <button
              type="button"
              className="button primary"
              onClick={() => goTo(step + 1)}
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
