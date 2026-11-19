"use client";

import type { ReactNode } from "react";
import { Clock3, Compass, MapPin, ShieldCheck, Trophy } from "lucide-react";
import {
  dateLabel,
  minutes,
  type GroupPlace,
  type Member,
  type Ride,
} from "@/lib/domain";
import { computeRideInsights } from "@/lib/location";

type Props = {
  rides: Ride[];
  members: Member[];
  places?: GroupPlace[];
  personFilter: string;
  renderAvatar: (member: Member | undefined, size?: string) => ReactNode;
};

export function LocationStats({
  rides,
  members,
  places = [],
  personFilter,
  renderAvatar,
}: Props) {
  const shownMembers = members.filter(
    (m) => personFilter === "all" || m.id === personFilter,
  );
  const insights = computeRideInsights(rides, shownMembers, places);
  const maxHourCount = Math.max(1, ...insights.hourly.map((h) => h.count));
  const maxDestCount = Math.max(
    1,
    ...insights.destinations.map((d) => d.count),
  );

  return (
    <>
      <div className="notice location-privacy-banner">
        <ShieldCheck size={19} />
        <span>
          <strong>Standort nur bei aktiver Verwendung:</strong> Orte stammen
          ausschliesslich aus Fahrten, bei denen beim Entsperren oder Speichern
          bewusst ein Ort übernommen oder eingetragen wurde – kein
          Hintergrund-Tracking.
        </span>
      </div>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Um welche Uhrzeit seid ihr unterwegs?</h2>
            <p>
              {insights.totalRides > 0 && insights.peakDayPart
                ? `Schwerpunkt am ${insights.peakDayPart.label} (${insights.peakDayPart.range}) mit ${insights.peakDayPart.count} Fahrten${insights.peakHour ? ` · Spitzenstunde ${insights.peakHour}` : ""}.`
                : "Sobald Fahrten im gewählten Zeitraum vorliegen, erscheint hier die Verteilung über den Tag."}
            </p>
          </div>
          <span className="subtle-pill">Zürich-Zeit · 24h</span>
        </div>

        <div
          className="hour-chart"
          role="img"
          aria-label={`Fahrten nach Uhrzeit: ${
            insights.hourly
              .filter((h) => h.count > 0)
              .map((h) => `${h.label} Uhr: ${h.count} Fahrten`)
              .join(", ") || "keine Fahrten"
          }`}
        >
          <div className="hour-bars">
            {insights.hourly.map((h) => (
              <div className="hour-col" key={h.hour}>
                <div className="hour-bar-track">
                  <div
                    className={`hour-bar ${h.count === maxHourCount && h.count > 0 ? "peak" : ""}`}
                    style={{
                      height: `${(h.count / maxHourCount) * 100}%`,
                      minHeight: h.count > 0 ? 4 : 0,
                    }}
                    title={`${h.label}:00–${h.label}:59 Uhr: ${h.count} Fahrten (${minutes(h.seconds)} Min.)`}
                  />
                </div>
                <span className={h.hour % 3 === 0 ? "" : "hidden-label"}>
                  {h.label}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="daypart-grid">
          {insights.dayParts.map((part) => (
            <div
              key={part.id}
              className={`daypart-card ${insights.peakDayPart?.id === part.id && part.count > 0 ? "active" : ""}`}
            >
              <div className="daypart-top">
                <strong>{part.label}</strong>
                <small>{part.range}</small>
              </div>
              <div className="daypart-value">
                <strong>{part.count}</strong>{" "}
                <span>{part.count === 1 ? "Fahrt" : "Fahrten"}</span>
              </div>
              <small>{minutes(part.seconds)} Min. gesamt</small>
            </div>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Wohin, wie oft &amp; wer?</h2>
            <p>
              Beliebteste Ziele inklusive typischer Uhrzeit, Startpunkt und
              Mitglieder-Verteilung ({insights.locatedRideCount} von{" "}
              {insights.totalRides} Fahrten mit Ortsangabe).
            </p>
          </div>
          <span className="subtle-pill">
            <MapPin size={13} /> Ziele
          </span>
        </div>

        {insights.destinations.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <Compass size={23} />
            </span>
            <h3>Noch keine Zielorte im Zeitraum</h3>
            <p>
              Nutze beim Losfahren «Dott entsperren» oder gib beim Speichern
              optional ein Ziel an.
            </p>
          </div>
        ) : (
          <div className="destination-list">
            {insights.destinations.map((dest) => (
              <div className="destination-row" key={dest.label}>
                <div className="destination-main">
                  <div className="destination-title">
                    <strong>{dest.label}</strong>
                    <span className="pill active">
                      {dest.count}× · {minutes(dest.totalSeconds)} Min.
                    </span>
                  </div>
                  <div
                    className="progress-track destination-bar"
                    aria-hidden="true"
                  >
                    <span
                      className="progress-fill"
                      style={{ width: `${(dest.count / maxDestCount) * 100}%` }}
                    />
                  </div>
                  <div className="destination-meta">
                    <span>
                      <Clock3 size={13} /> Meist {dest.peakHourLabel}
                    </span>
                    {dest.topOrigin && (
                      <span>
                        <MapPin size={13} /> Häufig ab {dest.topOrigin}
                      </span>
                    )}
                  </div>
                </div>
                <div className="destination-riders">
                  {dest.riders.map((r) => {
                    const m = members.find((x) => x.id === r.memberId);
                    return (
                      <span className="rider-chip" key={r.memberId}>
                        {renderAvatar(m, "tiny")}
                        <span>
                          {r.name} <strong>{r.count}×</strong>
                        </span>
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Strecken-Bestzeiten · Wer ist am schnellsten?</h2>
            <p>
              Vergleich der schnellsten Fahrzeiten pro Strecke (Start → Ziel).
              Bei geteilten Fahrten zählt die volle Scooter-Fahrzeit.
            </p>
          </div>
          <span className="subtle-pill">
            <Trophy size={13} /> Rekorde
          </span>
        </div>

        {insights.routeRecords.length === 0 ? (
          <div className="empty">
            <span className="empty-icon">
              <Trophy size={23} />
            </span>
            <h3>Noch keine kompletten Strecken</h3>
            <p>
              Sobald Fahrten sowohl einen Start- als auch einen Zielort haben,
              erscheint hier die Bestzeiten-Rangliste.
            </p>
          </div>
        ) : (
          <div className="route-records-list">
            {insights.routeRecords.map((route) => (
              <div className="route-record-card" key={route.key}>
                <div className="route-record-head">
                  <div>
                    <strong className="route-record-title">
                      {route.startLabel} → {route.endLabel}
                    </strong>
                    <small>
                      {route.tripCount}{" "}
                      {route.tripCount === 1 ? "Fahrt" : "Fahrten"} · Ø{" "}
                      {minutes(route.avgSeconds)} Min.
                    </small>
                  </div>
                  <span className="record-winner-pill">
                    <Trophy size={14} /> {route.fastest.memberNames} ·{" "}
                    {minutes(route.fastest.seconds)} Min.
                  </span>
                </div>
                <div className="route-leaderboard">
                  {route.leaderboard.map((entry, idx) => {
                    const m = members.find((x) => x.id === entry.memberId);
                    return (
                      <span
                        className={`rider-chip ${idx === 0 ? "fastest-chip" : ""}`}
                        key={entry.memberId}
                        title={`Bestzeit ${minutes(entry.bestSeconds)} Min. · Durchschnitt ${minutes(entry.avgSeconds)} Min. (${entry.count}×)`}
                      >
                        <strong className="rank-num">#{idx + 1}</strong>
                        {renderAvatar(m, "tiny")}
                        <span>
                          {entry.name}{" "}
                          <strong>{minutes(entry.bestSeconds)} Min.</strong>{" "}
                          <small>({entry.count}×)</small>
                        </span>
                      </span>
                    );
                  })}
                </div>
                <small className="route-record-date">
                  Streckenrekord aufgestellt am{" "}
                  {dateLabel(route.fastest.occurredAt, true)}
                  {route.fastest.shared ? " (geteilte Fahrt)" : ""}
                </small>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="panel">
        <div className="panel-heading">
          <div>
            <h2>Routenprofil pro Mitglied</h2>
            <p>
              Wer fährt wie oft, zu welcher Tageszeit und wohin am liebsten?
            </p>
          </div>
        </div>
        <div className="profile-stats-list">
          {insights.memberProfiles.map((prof) => (
            <div className="profile-stat-row" key={prof.member.id}>
              <div className="person-cell">
                {renderAvatar(prof.member)}
                <div>
                  <strong>{prof.member.display_name}</strong>
                  <small>
                    {prof.locatedRides} von {prof.totalRides} Fahrten mit Ort
                  </small>
                </div>
              </div>
              <div className="profile-stat-detail">
                <small>LIEBLINGSZIELE</small>
                <strong>
                  {prof.topDestinations.length > 0
                    ? prof.topDestinations
                        .map((d) => `${d.label} (${d.count}×)`)
                        .join(" · ")
                    : "Noch kein Ziel geteilt"}
                </strong>
              </div>
              <div className="profile-stat-detail">
                <small>TYPISCHE ZEIT</small>
                <strong>
                  {prof.favoriteDayPart
                    ? `${prof.favoriteDayPart.label} · ${prof.peakHourLabel ?? prof.favoriteDayPart.range}`
                    : "Keine Fahrten"}
                </strong>
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
