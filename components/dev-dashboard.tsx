"use client";

import { useState, type ReactNode } from "react";
import {
  Activity,
  LocateFixed,
  MapPin,
  Plus,
  Search,
  Terminal,
  Trash2,
  Trophy,
  Users,
  Zap,
} from "lucide-react";
import {
  dateLabel,
  groupSharedRides,
  minutes,
  type Action,
  type GroupPlace,
  type Member,
  type RpcArgs,
  type Snapshot,
} from "@/lib/domain";
import {
  canonicalPlaceLabel,
  computeRideInsights,
  searchSwissAddress,
  validCoords,
} from "@/lib/location";

type Props = {
  data: Snapshot;
  admin: boolean;
  demo?: boolean;
  busy: boolean;
  mutate: (action: Action, args: RpcArgs) => Promise<string | boolean>;
  renderAvatar: (member: Member | undefined, size?: string) => ReactNode;
};

type TelemetryFilter = "all" | "gps" | "manual" | "unlock" | "shared";

export function DevDashboard({
  data,
  admin,
  demo = false,
  busy,
  mutate,
  renderAvatar,
}: Props) {
  const [filter, setFilter] = useState<TelemetryFilter>("all");
  const [label, setLabel] = useState("");
  const [address, setAddress] = useState("");
  const [lat, setLat] = useState("");
  const [lng, setLng] = useState("");
  const [radius, setRadius] = useState("100");
  const [searching, setSearching] = useState(false);
  const [placeMsg, setPlaceMsg] = useState("");
  const [placeErr, setPlaceErr] = useState("");

  if (demo || !admin) return null;

  const places: GroupPlace[] = (data.places ?? []).filter(
    (p) => p.active !== false,
  );
  const memberById = (id: string) => data.members.find((m) => m.id === id);

  const allTrips = groupSharedRides(
    [...data.rides].sort((a, b) => b.occurred_at.localeCompare(a.occurred_at)),
  );
  const activeTrips = allTrips.filter((t) => !t.ride.voided_at);

  const hasStartGps = (t: (typeof allTrips)[number]) =>
    Boolean(t.ride.start_gps);
  const hasEndGps = (t: (typeof allTrips)[number]) => Boolean(t.ride.end_gps);
  const hasStartCoords = (t: (typeof allTrips)[number]) =>
    validCoords(t.ride.start_lat, t.ride.start_lng);
  const hasEndCoords = (t: (typeof allTrips)[number]) =>
    validCoords(t.ride.end_lat, t.ride.end_lng);

  const gpsTripCount = activeTrips.filter(
    (t) => hasStartGps(t) || hasEndGps(t),
  ).length;
  const unlockTripCount = activeTrips.filter(
    (t) => t.ride.unlocked_via_app,
  ).length;
  const sharedTripCount = activeTrips.filter((t) => t.parts.length > 1).length;
  const gpsRate =
    activeTrips.length > 0
      ? Math.round((gpsTripCount / activeTrips.length) * 100)
      : 0;
  const unlockRate =
    activeTrips.length > 0
      ? Math.round((unlockTripCount / activeTrips.length) * 100)
      : 0;

  const visibleTrips = allTrips.filter((t) => {
    if (filter === "gps") return hasStartGps(t) || hasEndGps(t);
    if (filter === "manual") return !hasStartGps(t) && !hasEndGps(t);
    if (filter === "unlock") return Boolean(t.ride.unlocked_via_app);
    if (filter === "shared") return t.parts.length > 1;
    return true;
  });

  const insights = computeRideInsights(data.rides, data.members, places);

  async function lookupAddress() {
    setPlaceErr("");
    setPlaceMsg("");
    if (!address.trim()) {
      setPlaceErr("Bitte zuerst eine Adresse eingeben.");
      return;
    }
    setSearching(true);
    try {
      const hit = await searchSwissAddress(address);
      if (!hit) {
        setPlaceErr(
          "Adresse bei swisstopo nicht gefunden – bitte PLZ/Ort ergänzen oder Koordinaten direkt eingeben.",
        );
        return;
      }
      setAddress(hit.label);
      setLat(String(hit.lat));
      setLng(String(hit.lng));
      setPlaceMsg(`Gefunden: ${hit.label} (${hit.lat}, ${hit.lng})`);
    } finally {
      setSearching(false);
    }
  }

  async function savePlace(e: React.FormEvent) {
    e.preventDefault();
    if (demo || !admin) return;
    setPlaceErr("");
    setPlaceMsg("");
    const parsedLat = Number(lat.replace(",", "."));
    const parsedLng = Number(lng.replace(",", "."));
    const parsedRadius = Number(radius || "100");
    if (!label.trim()) {
      setPlaceErr("Bitte einen Ortsnamen eingeben.");
      return;
    }
    if (!validCoords(parsedLat, parsedLng)) {
      setPlaceErr(
        "Bitte zuerst «Adresse suchen» klicken oder gültige Koordinaten eingeben.",
      );
      return;
    }
    const ok = await mutate("upsert_group_place", {
      p_label: label.trim(),
      p_address: address.trim(),
      p_lat: parsedLat,
      p_lng: parsedLng,
      p_radius_meters: Math.max(20, Math.min(1000, Math.round(parsedRadius))),
    });
    if (ok) {
      setPlaceMsg(
        `Crew-Ort «${label.trim()}» (${parsedRadius} m) gespeichert.`,
      );
      setLabel("");
      setAddress("");
      setLat("");
      setLng("");
      setRadius("100");
    }
  }

  return (
    <>
      <div className="notice dev-banner">
        <Terminal size={19} />
        <span>
          <strong>Admin Dev-Dashboard:</strong> Nur für Gruppen-Admins sichtbar.
          Private Crew-Orte liegen ausschliesslich RLS-geschützt in eurer
          Supabase-Datenbank – niemals öffentlich im Code.
        </span>
      </div>

      <section className="metric-grid">
        <div className="metric-card">
          <div className="card-label">
            <span>Per GPS aufgezeichnet</span>
            <span className="metric-icon">
              <LocateFixed size={20} />
            </span>
          </div>
          <div className="metric-value">
            {gpsRate}
            <span>%</span>
          </div>
          <p>
            {gpsTripCount} von {activeTrips.length} aktiven Fahrten mit
            GPS-Klick
          </p>
        </div>

        <div className="metric-card">
          <div className="card-label">
            <span>Über «Dott entsperren»</span>
            <span className="metric-icon">
              <Zap size={20} />
            </span>
          </div>
          <div className="metric-value">
            {unlockRate}
            <span>%</span>
          </div>
          <p>
            {unlockTripCount} per Timer gestartet ·{" "}
            {activeTrips.length - unlockTripCount} manuell nachgetragen
          </p>
        </div>

        <div className="metric-card">
          <div className="card-label">
            <span>Crew-Orte &amp; Geteilt</span>
            <span className="metric-icon">
              <Activity size={20} />
            </span>
          </div>
          <div className="metric-value">
            {places.length}
            <span>Orte</span>
          </div>
          <p>100-m-Zonen aktiv · {sharedTripCount} geteilte Scooter-Fahrten</p>
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Fahrt-Telemetrie &amp; GPS-Inspektor</h2>
            <p>
              Zeigt pro Fahrt exakt an, ob Start/Ziel aktiv per GPS, manuell
              oder gar nicht erfasst wurden und ob der Entsperr-Timer lief.
            </p>
          </div>
          <div
            className="split-modes"
            role="group"
            aria-label="Telemetrie-Filter"
          >
            {(
              [
                ["all", `Alle (${allTrips.length})`],
                ["gps", `Mit GPS (${gpsTripCount})`],
                ["manual", "Ohne GPS"],
                ["unlock", `Timer (${unlockTripCount})`],
                ["shared", `Geteilt (${sharedTripCount})`],
              ] as const
            ).map(([key, text]) => (
              <button
                key={key}
                type="button"
                aria-pressed={filter === key}
                onClick={() => setFilter(key)}
              >
                {text}
              </button>
            ))}
          </div>
        </div>

        <div className="table-scroll">
          <table>
            <thead>
              <tr>
                <th>Fahrer &amp; Zeit</th>
                <th>Strecke (aufgelöst)</th>
                <th>Start-Quelle</th>
                <th>Ziel-Quelle</th>
                <th>Erfassung</th>
              </tr>
            </thead>
            <tbody>
              {visibleTrips.map((t) => {
                const startName = canonicalPlaceLabel(
                  t.ride.start_label,
                  t.ride.start_lat,
                  t.ride.start_lng,
                  places,
                );
                const endName = canonicalPlaceLabel(
                  t.ride.end_label,
                  t.ride.end_lat,
                  t.ride.end_lng,
                  places,
                );
                const names = t.parts
                  .map(
                    (part) =>
                      memberById(part.member_id)?.display_name ?? "Mitglied",
                  )
                  .join(" & ");
                return (
                  <tr
                    key={t.key}
                    className={t.ride.voided_at ? "voided" : undefined}
                  >
                    <td>
                      <div className="person-cell">
                        {renderAvatar(memberById(t.ride.member_id), "small")}
                        <div>
                          <strong>{names}</strong>
                          <small>
                            {dateLabel(t.ride.occurred_at, true)} ·{" "}
                            {minutes(t.charged_seconds)} Min.
                            {t.parts.length > 1 ? ` (÷${t.parts.length})` : ""}
                          </small>
                        </div>
                      </div>
                    </td>
                    <td>
                      {startName || endName ? (
                        <span>
                          {startName || "–"} → {endName || "–"}
                        </span>
                      ) : (
                        <span className="unit">Keine Ortsangabe</span>
                      )}
                      {t.ride.voided_at && (
                        <small className="cancellation-reason">Storniert</small>
                      )}
                    </td>
                    <td>
                      {hasStartGps(t) ? (
                        <span
                          className="telemetry-badge gps"
                          title={`${t.ride.start_lat}, ${t.ride.start_lng}`}
                        >
                          <LocateFixed size={12} /> GPS
                        </span>
                      ) : hasStartCoords(t) ? (
                        <span
                          className="telemetry-badge coord"
                          title={`${t.ride.start_lat}, ${t.ride.start_lng}`}
                        >
                          <MapPin size={12} /> Auswahl/Koord.
                        </span>
                      ) : startName ? (
                        <span className="telemetry-badge manual">Manuell</span>
                      ) : (
                        <span className="telemetry-badge none">Kein Start</span>
                      )}
                    </td>
                    <td>
                      {hasEndGps(t) ? (
                        <span
                          className="telemetry-badge gps"
                          title={`${t.ride.end_lat}, ${t.ride.end_lng}`}
                        >
                          <LocateFixed size={12} /> GPS
                        </span>
                      ) : hasEndCoords(t) ? (
                        <span
                          className="telemetry-badge coord"
                          title={`${t.ride.end_lat}, ${t.ride.end_lng}`}
                        >
                          <MapPin size={12} /> Auswahl/Koord.
                        </span>
                      ) : endName ? (
                        <span className="telemetry-badge manual">Manuell</span>
                      ) : (
                        <span className="telemetry-badge none">Kein Ziel</span>
                      )}
                    </td>
                    <td>
                      {t.ride.unlocked_via_app ? (
                        <span className="telemetry-badge timer">
                          <Zap size={12} /> Entsperr-Timer
                        </span>
                      ) : (
                        <span className="telemetry-badge manual">Manuell</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {visibleTrips.length === 0 && (
            <div className="empty">
              <h3>Keine Fahrten für diesen Filter</h3>
              <p>Wähle einen anderen Filter oder erfasse eine neue Fahrt.</p>
            </div>
          )}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Crew-Orte &amp; 100-m-Adresszonen</h2>
            <p>
              Liegt ein GPS-Punkt im Radius (Standard 100 m) einer dieser
              Adressen, zeigt die App automatisch den Namen statt der
              Strassenadresse und wertet ihn in den Statistiken aus.
            </p>
          </div>
          <span className="subtle-pill">
            <MapPin size={13} /> {places.length} aktiv
          </span>
        </div>

        <div className="dev-places-grid">
          {places.map((p) => (
            <div className="dev-place-card" key={p.id}>
              <div>
                <strong>{p.label}</strong>
                {p.address && <small>{p.address}</small>}
                <small className="mono-coords">
                  Radius {p.radius_meters} m · {p.lat.toFixed(4)},{" "}
                  {p.lng.toFixed(4)}
                </small>
              </div>
              <button
                type="button"
                className="icon-button"
                aria-label={`${p.label} entfernen`}
                title="Ort entfernen"
                disabled={busy}
                onClick={() => {
                  if (demo || !admin) return;
                  if (
                    window.confirm(
                      `Crew-Ort «${p.label}» wirklich entfernen? Bisher gespeicherte Fahrten behalten ihren Text.`,
                    )
                  ) {
                    void mutate("deactivate_group_place", { p_place_id: p.id });
                  }
                }}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>

        <form className="dev-place-form" onSubmit={savePlace}>
          <h3>Neuen Crew-Ort hinzufügen</h3>
          <div className="form-row">
            <label>
              Name in Statistik
              <input
                type="text"
                required
                maxLength={80}
                placeholder="z. B. Kollege / Schule"
                value={label}
                onChange={(e) => setLabel(e.target.value)}
              />
            </label>
            <label>
              Radius (Meter)
              <input
                type="number"
                min={20}
                max={1000}
                step={10}
                value={radius}
                onChange={(e) => setRadius(e.target.value)}
              />
            </label>
          </div>
          <div className="dev-address-row">
            <label>
              Schweizer Strassenadresse
              <input
                type="text"
                maxLength={160}
                placeholder="z. B. Bahnhofstrasse 42, 8001 Zürich"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </label>
            <button
              type="button"
              className="button secondary"
              disabled={searching}
              onClick={() => void lookupAddress()}
            >
              <Search size={16} />
              {searching ? "Suche …" : "Adresse suchen"}
            </button>
          </div>
          <div className="form-row">
            <label>
              Breitengrad (Lat)
              <input
                type="text"
                inputMode="decimal"
                placeholder="47.3779"
                value={lat}
                onChange={(e) => setLat(e.target.value)}
              />
            </label>
            <label>
              Längengrad (Lng)
              <input
                type="text"
                inputMode="decimal"
                placeholder="8.5403"
                value={lng}
                onChange={(e) => setLng(e.target.value)}
              />
            </label>
          </div>
          {placeErr && (
            <div className="notice error" role="alert">
              {placeErr}
            </div>
          )}
          {placeMsg && (
            <div className="notice" role="status">
              {placeMsg}
            </div>
          )}
          <button
            type="submit"
            className="button primary"
            disabled={busy || searching}
          >
            <Plus size={16} /> Crew-Ort speichern
          </button>
        </form>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Top-Ziele &amp; Strecken-Rekorde (Kompakt)</h2>
            <p>
              Direktüberblick: Wer fährt wo wie oft hin und wer hält die
              Bestzeit auf jeder Strecke?
            </p>
          </div>
          <span className="subtle-pill">
            <Trophy size={13} /> {insights.routeRecords.length} Strecken
          </span>
        </div>

        <div className="dev-analytics-split">
          <div>
            <h3>
              <Users size={15} /> Wer fährt wo wie oft hin?
            </h3>
            {insights.destinations.length === 0 ? (
              <p className="pw-empty-hint">Noch keine Ziele erfasst.</p>
            ) : (
              <div className="dev-compact-list">
                {insights.destinations.slice(0, 8).map((d) => (
                  <div className="dev-compact-row" key={d.label}>
                    <div>
                      <strong>{d.label}</strong>
                      <small>
                        {d.riders
                          .map((r) => `${r.name} ${r.count}×`)
                          .join(" · ")}
                      </small>
                    </div>
                    <span className="pill active">{d.count}×</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div>
            <h3>
              <Trophy size={15} /> Schnellste Strecken
            </h3>
            {insights.routeRecords.length === 0 ? (
              <p className="pw-empty-hint">
                Noch keine Strecken mit Start &amp; Ziel.
              </p>
            ) : (
              <div className="dev-compact-list">
                {insights.routeRecords.slice(0, 8).map((r) => (
                  <div className="dev-compact-row" key={r.key}>
                    <div>
                      <strong>
                        {r.startLabel} → {r.endLabel}
                      </strong>
                      <small>
                        Rekord: {r.fastest.memberNames} · Ø{" "}
                        {minutes(r.avgSeconds)} Min. ({r.tripCount}×)
                      </small>
                    </div>
                    <span className="record-winner-pill">
                      {minutes(r.fastest.seconds)} Min.
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>
    </>
  );
}
