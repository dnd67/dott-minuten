import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Flag,
  KeyRound,
  LockKeyhole,
  MapPin,
  Play,
  Route,
  Sun,
  Ticket,
  Timer,
  Users,
  Zap,
} from "lucide-react";
import { formatElapsedClock } from "@/lib/live-activity";
import type { TourFeature } from "@/lib/onboarding";
import { ThemeSegmented } from "./theme-toggle";

const cardLabels: Record<TourFeature, string> = {
  "minute-pass": "Dein Minutenpass",
  "package-splits": "Paketaufteilung",
  "shared-rides": "Fahrtabrechnung",
  "live-cockpit": "Live-Cockpit",
  "route-records": "Streckenrekord",
  "club-account": "Clubzugang",
  "admin-tools": "Crew-Ort",
  appearance: "Darstellung",
};

function PassPreview() {
  const [drive, setDrive] = useState(14);
  const [pause, setPause] = useState(1);
  return (
    <>
      <div className="tour-value sim-pass-preview" aria-live="polite">
        <strong key={drive + pause}>
          −{drive + pause} <small>Min.</small>
        </strong>
        <Ticket />
      </div>
      {[
        {
          label: "Fahrzeit",
          value: drive,
          choices: [6, 14, 22],
          pick: setDrive,
        },
        { label: "Pause", value: pause, choices: [0, 1, 3], pick: setPause },
      ].map(({ label, value, choices, pick }) => (
        <div
          className="tour-control"
          role="group"
          aria-label={label}
          key={label}
        >
          <span>{label}</span>
          <div className="tour-options">
            {choices.map((n) => (
              <button
                key={n}
                type="button"
                aria-pressed={value === n}
                onClick={() => pick(n)}
              >
                {n} Min.
              </button>
            ))}
          </div>
        </div>
      ))}
    </>
  );
}

function PackagePreview() {
  const [mode, setMode] = useState(0);
  const portions = [50, 70, 30];
  const first = portions[mode];
  return (
    <>
      <div className="tour-value">
        <strong>
          100 <small>Min.</small>
        </strong>
        <span>CHF 10.00</span>
      </div>
      <div className="tour-split" aria-hidden="true">
        <i style={{ width: first + "%" }} />
      </div>
      <div className="tour-shares" aria-live="polite">
        <span>
          Du · {first} Min.<small>CHF {(first / 10).toFixed(2)}</small>
        </span>
        <span>
          Crew · {100 - first} Min.
          <small>CHF {((100 - first) / 10).toFixed(2)}</small>
        </span>
      </div>
      <div
        className="tour-options"
        role="group"
        aria-label="Beispielaufteilung"
      >
        {["Gleich", "Minutenbedarf", "CHF-Beitrag"].map((label, i) => (
          <button
            key={label}
            type="button"
            aria-pressed={i === mode}
            onClick={() => setMode(i)}
          >
            {label}
          </button>
        ))}
      </div>
    </>
  );
}

function SharedPreview() {
  const [shared, setShared] = useState(true);
  return (
    <>
      <div className="tour-value">
        <strong key={String(shared)}>
          {shared ? "7,5" : "15"} <small>Min.</small>
        </strong>
        <Users />
      </div>
      <div className="tour-readout">
        15 Minuten inkl. Pause <ArrowRight size={14} />{" "}
        {shared ? "je Person" : "auf deinem Konto"}
      </div>
      <div className="tour-options" role="group" aria-label="Beispielfahrt">
        <button aria-pressed={!shared} onClick={() => setShared(false)}>
          Alleine
        </button>
        <button aria-pressed={shared} onClick={() => setShared(true)}>
          Zu zweit
        </button>
      </div>
    </>
  );
}

function LivePreview() {
  const [compact, setCompact] = useState(false);
  const [seconds, setSeconds] = useState(252);
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches)
      return;
    // A short demonstration, independent of the real ride timer.
    const frames = [1, 2, 3, 4].map((n) =>
      window.setTimeout(() => setSeconds(252 + n), n * 1000),
    );
    return () => frames.forEach(window.clearTimeout);
  }, []);
  return (
    <>
      <div className="tour-live" data-compact={compact || undefined}>
        <span className="tour-signal" />
        <span>{compact ? "Fahrt" : "Fahrt läuft"}</span>
        <strong>{formatElapsedClock(seconds)}</strong>
      </div>
      <div
        className="tour-options"
        role="group"
        aria-label="Live-Anzeige ausprobieren"
      >
        <button
          type="button"
          aria-pressed={!compact}
          onClick={() => setCompact(false)}
        >
          Übersicht
        </button>
        <button
          type="button"
          aria-pressed={compact}
          onClick={() => setCompact(true)}
        >
          Anderer Tab
        </button>
      </div>
    </>
  );
}

export function TourPreview({ feature }: { feature: TourFeature }) {
  let preview;
  switch (feature) {
    case "minute-pass":
      preview = <PassPreview />;
      break;
    case "package-splits":
      preview = <PackagePreview />;
      break;
    case "shared-rides":
      preview = <SharedPreview />;
      break;
    case "live-cockpit":
      preview = <LivePreview />;
      break;
    case "route-records":
      preview = (
        <>
          <div className="tour-route">
            <MapPin size={19} />
            <i />
            <Flag size={19} />
          </div>
          <div className="tour-stations">
            <strong>Zürich HB</strong>
            <strong>Bellevue</strong>
          </div>
          <div className="tour-readout">
            <Timer size={15} /> Beste Fahrzeit <b>08:24</b>
          </div>
        </>
      );
      break;
    case "club-account":
      preview = (
        <>
          <div className="tour-identity">
            <span className="tour-avatar">
              <KeyRound />
            </span>
            <div>
              <strong>@deinname</strong>
              <small>Persönliches Clubkonto</small>
            </div>
          </div>
          <div className="tour-readout">
            <LockKeyhole size={15} /> Benutzername + Passwort
          </div>
        </>
      );
      break;
    case "admin-tools":
      preview = (
        <>
          <div className="tour-identity">
            <span className="tour-zone">
              <MapPin size={24} />
            </span>
            <div>
              <strong>Treffpunkt HB</strong>
              <small>Crew-Ort · Radius 100 m</small>
            </div>
          </div>
          <div className="tour-readout">
            <Route size={15} /> Dev-Dashboard <ArrowRight size={14} /> Crew-Orte
          </div>
        </>
      );
      break;
    case "appearance":
      preview = (
        <>
          <div className="tour-identity">
            <span className="tour-avatar">
              <Sun />
            </span>
            <div>
              <strong>Deine Ansicht</strong>
              <small>Direkt ausprobieren</small>
            </div>
          </div>
          <ThemeSegmented />
        </>
      );
      break;
  }
  return (
    <div className="tour-ticket">
      <div className="tour-ticket-head">
        <span>
          <Zap size={13} fill="currentColor" /> minutenclub.
        </span>
        <span>
          {feature === "appearance" ? <Check size={11} /> : <Play size={10} />}{" "}
          {feature === "appearance" ? "Einstellung" : "Beispiel"}
        </span>
      </div>
      <div className="tour-ticket-body">
        <div className="tour-ticket-label">{cardLabels[feature]}</div>
        {preview}
      </div>
    </div>
  );
}
