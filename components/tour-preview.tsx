import { useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  LocateFixed,
  ShieldCheck,
  Smartphone,
  Trophy,
  KeyRound,
  LockKeyhole,
  MapPin,
  Play,
  Route,
  Sun,
  Ticket,
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
  minutes: [
    { name: "Oskar", pct: 70, min: 210, chf: "21.–", badge: "70%" },
    { name: "Max", pct: 20, min: 60, chf: "6.–", badge: "20%" },
    { name: "August", pct: 10, min: 30, chf: "3.–", badge: "10%" },
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

function PackagePreview() {
  const [splitMode, setSplitMode] =
    useState<keyof typeof PACKAGE_SPLITS>("fair");
  const splitRows = PACKAGE_SPLITS[splitMode];
  return (
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
            className={splitMode === "minutes" ? "active" : ""}
            aria-pressed={splitMode === "minutes"}
            onClick={() => setSplitMode("minutes")}
          >
            Minutenbedarf
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
  );
}
function SharedPreview({ leadName }: { leadName: string }) {
  const candidatePeers = ["Max", "August", "Oskar"]
    .filter((name) => name.toLowerCase() !== leadName.toLowerCase())
    .slice(0, 2);
  const [coRiders, setCoRiders] = useState<string[]>([]);
  const activeRiders = [leadName, ...coRiders];
  const sharedMinutesEach = 15 / activeRiders.length;
  function togglePeer(name: string) {
    setCoRiders((prev) =>
      prev.includes(name) ? prev.filter((p) => p !== name) : [...prev, name],
    );
  }

  return (
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
        <small>Tippe Mitfahrende an, um den Split live zu sehen:</small>
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
  );
}
function LivePreview({ leadName }: { leadName: string }) {
  const [islandExpanded, setIslandExpanded] = useState(true);
  const [seconds, setSeconds] = useState(252);
  useEffect(() => {
    if (!window.matchMedia("(prefers-reduced-motion: no-preference)").matches)
      return;
    // A short demonstration, independent of the real ride timer.
    const frames = [1, 2, 3, 4].map((n) =>
      window.setTimeout(() => setSeconds(252 + n), n * 1000),
    );
    return () => frames.forEach((id) => window.clearTimeout(id));
  }, []);
  const demoRemaining = 52 - Math.ceil(seconds / 60);
  return (
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
                ? `Dott · ${leadName} & ${leadName.toLowerCase() === "max" ? "August" : "Max"} (÷2)`
                : "Dott · ÷2"}
            </span>
            <span className="ob-island-clock">
              {formatElapsedClock(seconds)}
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
  );
}
function RoutePreview() {
  const [sampleRoute, setSampleRoute] =
    useState<keyof typeof DEMO_ROUTES>("hb-eth");
  const routeData = DEMO_ROUTES[sampleRoute];
  return (
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
            <ShieldCheck size={13} /> Nur bei Einmal-Tipp · Null Hintergrund-GPS
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
              <strong className="ob-podium-time">{entry.minutes} Min.</strong>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TourPreview({
  feature,
  memberName,
}: {
  feature: TourFeature;
  memberName?: string;
}) {
  const leadName = memberName?.trim() || "Oskar";
  let preview;
  switch (feature) {
    case "minute-pass":
      preview = <PassPreview />;
      break;
    case "package-splits":
      preview = <PackagePreview />;
      break;
    case "shared-rides":
      preview = <SharedPreview leadName={leadName} />;
      break;
    case "live-cockpit":
      preview = <LivePreview leadName={leadName} />;
      break;
    case "route-records":
      preview = <RoutePreview />;
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
