import {
  groupSharedRides,
  type GroupPlace,
  type Member,
  type Ride,
} from "./domain";

export type Spot = {
  label: string;
  lat: number | null;
  lng: number | null;
  fromGps?: boolean;
};

export type ActiveUnlock = {
  groupId: string;
  userId: string;
  startedAt: string;
  startLabel: string;
  startLat: number | null;
  startLng: number | null;
  startGps?: boolean;
  coRiderIds?: string[];
};

const UNLOCK_STORAGE_KEY = "minutenclub-active-unlock-v1";

/** Bekannte Orte in Zürich für die rein lokale, datenschutzfreundliche Zuordnung ohne Drittanbieter-API. */
export const ZURICH_HUBS: { label: string; lat: number; lng: number }[] = [
  { label: "Zürich HB", lat: 47.3779, lng: 8.5403 },
  { label: "Bahnhofstrasse", lat: 47.3717, lng: 8.5386 },
  { label: "Paradeplatz", lat: 47.3697, lng: 8.5389 },
  { label: "Bürkliplatz", lat: 47.3662, lng: 8.5411 },
  { label: "Bellevue", lat: 47.367, lng: 8.5451 },
  { label: "Stadelhofen", lat: 47.3665, lng: 8.5485 },
  { label: "Seefeld", lat: 47.3578, lng: 8.5542 },
  { label: "Tiefenbrunnen", lat: 47.3502, lng: 8.5614 },
  { label: "ETH Polyterrasse", lat: 47.3763, lng: 8.5476 },
  { label: "Kunsthaus", lat: 47.3702, lng: 8.5484 },
  { label: "Uni Irchel", lat: 47.3968, lng: 8.5492 },
  { label: "ETH Hönggerberg", lat: 47.4083, lng: 8.5067 },
  { label: "Oerlikon Bhf", lat: 47.4115, lng: 8.5441 },
  { label: "Milchbuck", lat: 47.3982, lng: 8.5414 },
  { label: "Limmatplatz", lat: 47.3847, lng: 8.5312 },
  { label: "Escher-Wyss-Platz", lat: 47.3908, lng: 8.5231 },
  { label: "Hardbrücke", lat: 47.3852, lng: 8.5175 },
  { label: "Prime Tower", lat: 47.3861, lng: 8.5162 },
  { label: "Langstrasse", lat: 47.3788, lng: 8.5271 },
  { label: "Lochergut", lat: 47.3755, lng: 8.5174 },
  { label: "Stauffacher", lat: 47.3733, lng: 8.5291 },
  { label: "Wiedikon Bhf", lat: 47.3713, lng: 8.5235 },
  { label: "Sihlcity", lat: 47.3586, lng: 8.5231 },
  { label: "Enge Bhf", lat: 47.3641, lng: 8.5311 },
  { label: "Wollishofen", lat: 47.3468, lng: 8.5336 },
  { label: "Rote Fabrik", lat: 47.3432, lng: 8.5364 },
  { label: "Letzigrund", lat: 47.3827, lng: 8.5039 },
  { label: "Altstetten Bhf", lat: 47.3914, lng: 8.4889 },
];

export function roundCoord(value: number): number {
  return Math.round(value * 10000) / 10000;
}

export function validCoords(
  lat: number | null | undefined,
  lng: number | null | undefined,
): lat is number {
  return (
    typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180
  );
}

export function distanceMeters(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

const isRawCoordLabel = (label: string) => /^Standort\s*\(/i.test(label.trim());

/** Prüft, ob Koordinaten im konfigurierten Radius (Standard 100 m) eines privaten Crew-Orts liegen. */
export function matchGroupPlace(
  lat: number,
  lng: number,
  places: GroupPlace[] = [],
): GroupPlace | null {
  let best: { place: GroupPlace; dist: number } | null = null;
  for (const p of places) {
    if (p.active === false || !validCoords(p.lat, p.lng)) continue;
    const radius =
      typeof p.radius_meters === "number" && p.radius_meters > 0
        ? p.radius_meters
        : 100;
    const dist = distanceMeters(lat, lng, p.lat, p.lng);
    if (dist <= radius && (!best || dist < best.dist)) {
      best = { place: p, dist };
    }
  }
  return best?.place ?? null;
}

/**
 * Liefert für Statistiken den kanonischen Ortsnamen:
 * Liegen Koordinaten im 100-m-Umkreis eines gespeicherten Crew-Orts, wird dessen Name verwendet.
 */
export function canonicalPlaceLabel(
  rawLabel: string | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
  places: GroupPlace[] = [],
): string {
  if (validCoords(lat, lng) && places.length > 0) {
    const matched = matchGroupPlace(lat, lng!, places);
    if (matched) return matched.label;
  }
  return rawLabel?.trim() ?? "";
}

/**
 * Ordnet Koordinaten lokal einem bekannten Ort zu:
 * 1. Gespeicherte Crew-Orte im konfigurierten Radius (Standard 100 m)
 * 2. Bereits benannte Gruppenorte im Umkreis von 100 m
 * 3. Bekannte Quartiere/Hubs in Zürich im Umkreis von 650 m
 * 4. Fallback bei fehlender Internetverbindung
 */
export function resolvePlaceLabel(
  lat: number,
  lng: number,
  rides: Ride[] = [],
  places: GroupPlace[] = [],
): string {
  const crewPlace = matchGroupPlace(lat, lng, places);
  if (crewPlace) return crewPlace.label;

  let bestCrew: { label: string; dist: number } | null = null;
  for (const r of rides) {
    if (r.voided_at) continue;
    const candidates: [
      string | undefined,
      number | null | undefined,
      number | null | undefined,
    ][] = [
      [r.end_label, r.end_lat, r.end_lng],
      [r.start_label, r.start_lat, r.start_lng],
    ];
    for (const [raw, cLat, cLng] of candidates) {
      const label = raw?.trim() ?? "";
      if (!label || isRawCoordLabel(label) || !validCoords(cLat, cLng))
        continue;
      const dist = distanceMeters(lat, lng, cLat, cLng!);
      if (dist <= 100 && (!bestCrew || dist < bestCrew.dist)) {
        bestCrew = { label, dist };
      }
    }
  }
  if (bestCrew) return bestCrew.label;

  let bestHub: { label: string; dist: number } | null = null;
  for (const hub of ZURICH_HUBS) {
    const dist = distanceMeters(lat, lng, hub.lat, hub.lng);
    if (dist <= 650 && (!bestHub || dist < bestHub.dist)) {
      bestHub = { label: hub.label, dist };
    }
  }
  if (bestHub) return bestHub.label;

  return `Standort (${lat.toFixed(2)}, ${lng.toFixed(2)})`;
}

/** Enge lokale Trefferprüfung vor dem Reverse-Geocoding (100 m Crew-Orte, 90 m bekannte Hubs). */
function matchCloseKnownPlace(
  lat: number,
  lng: number,
  rides: Ride[] = [],
  places: GroupPlace[] = [],
): string | null {
  const crewPlace = matchGroupPlace(lat, lng, places);
  if (crewPlace) return crewPlace.label;

  let bestCrew: { label: string; dist: number } | null = null;
  for (const r of rides) {
    if (r.voided_at) continue;
    const candidates: [
      string | undefined,
      number | null | undefined,
      number | null | undefined,
    ][] = [
      [r.end_label, r.end_lat, r.end_lng],
      [r.start_label, r.start_lat, r.start_lng],
    ];
    for (const [raw, cLat, cLng] of candidates) {
      const label = raw?.trim() ?? "";
      if (!label || isRawCoordLabel(label) || !validCoords(cLat, cLng))
        continue;
      const dist = distanceMeters(lat, lng, cLat, cLng!);
      if (dist <= 100 && (!bestCrew || dist < bestCrew.dist)) {
        bestCrew = { label, dist };
      }
    }
  }
  if (bestCrew) return bestCrew.label;

  let bestHub: { label: string; dist: number } | null = null;
  for (const hub of ZURICH_HUBS) {
    const dist = distanceMeters(lat, lng, hub.lat, hub.lng);
    if (dist <= 90 && (!bestHub || dist < bestHub.dist)) {
      bestHub = { label: hub.label, dist };
    }
  }
  return bestHub?.label ?? null;
}

/**
 * Löst Schweizer Koordinaten über das amtliche Gebäuderegister von swisstopo
 * (api3.geo.admin.ch, Schweizer Bund) in eine echte Strassenadresse auf (z. B. «Bahnhofstrasse 42, 8001 Zürich»).
 */
export async function reverseGeocodeSwissAddress(
  lat: number,
  lng: number,
): Promise<string | null> {
  if (typeof fetch !== "function") return null;
  try {
    for (const [delta, tolerance] of [
      [0.001, 45],
      [0.003, 120],
    ] as const) {
      const extent = `${lng - delta},${lat - delta},${lng + delta},${lat + delta}`;
      const url = `https://api3.geo.admin.ch/rest/services/api/MapServer/identify?geometryType=esriGeometryPoint&geometry=${lng},${lat}&sr=4326&layers=all:ch.swisstopo.amtliches-gebaeudeadressverzeichnis&tolerance=${tolerance}&mapExtent=${extent}&imageDisplay=500,500,96&returnGeometry=true&limit=25`;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 3500);
      try {
        const res = await fetch(url, { signal: controller.signal });
        if (!res.ok) continue;
        const data = (await res.json()) as {
          results?: {
            attributes?: {
              stn_label?: string;
              adr_number?: string;
              zip_label?: string;
            };
            geometry?: { x?: number; y?: number };
          }[];
        };
        const candidates = (data.results ?? [])
          .map((item) => {
            const a = item.attributes;
            const g = item.geometry;
            const street = [a?.stn_label?.trim(), a?.adr_number?.trim()]
              .filter(Boolean)
              .join(" ");
            if (!street) return null;
            const zip = a?.zip_label?.trim();
            const label = zip ? `${street}, ${zip}` : street;
            const dist =
              typeof g?.y === "number" && typeof g?.x === "number"
                ? distanceMeters(lat, lng, g.y, g.x)
                : 9999;
            return { label, dist };
          })
          .filter((x): x is { label: string; dist: number } => Boolean(x))
          .sort((a, b) => a.dist - b.dist);
        if (candidates.length > 0) return candidates[0].label;
      } finally {
        clearTimeout(timer);
      }
    }
  } catch {
    /* Offline oder Timeout -> sauberer lokaler Fallback */
  }
  return null;
}

/** Sucht eine Schweizer Strassenadresse über swisstopo und liefert exakte Koordinaten für neue Crew-Orte. */
export async function searchSwissAddress(
  query: string,
): Promise<{ label: string; lat: number; lng: number } | null> {
  const clean = query.trim();
  if (!clean || typeof fetch !== "function") return null;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 5000);
  try {
    const url = `https://api3.geo.admin.ch/rest/services/api/SearchServer?searchText=${encodeURIComponent(clean)}&type=locations&origins=address&sr=4326&limit=1`;
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) return null;
    const data = (await res.json()) as {
      results?: {
        attrs?: { label?: string; lat?: number; lon?: number };
      }[];
    };
    const hit = data.results?.[0]?.attrs;
    if (!hit || !validCoords(hit.lat, hit.lon)) return null;
    return {
      label: String(hit.label ?? clean)
        .replace(/<[^>]+>/g, "")
        .trim(),
      lat: Math.round(hit.lat * 100000) / 100000,
      lng: Math.round(hit.lon! * 100000) / 100000,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Fragt den Gerätestandort EINMALIG bei aktiver Benutzeraktion ab (getCurrentPosition).
 * Es wird niemals watchPosition oder Hintergrund-Ortung verwendet.
 */
export function requestCurrentSpot(
  rides: Ride[] = [],
  places: GroupPlace[] = [],
): Promise<Spot> {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || !("geolocation" in navigator)) {
      reject(
        new Error(
          "Dein Browser unterstützt keine Standortfreigabe. Du kannst den Ort direkt eintippen.",
        ),
      );
      return;
    }
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const rawLat = pos.coords.latitude;
        const rawLng = pos.coords.longitude;
        const lat = roundCoord(rawLat);
        const lng = roundCoord(rawLng);
        const closeMatch = matchCloseKnownPlace(rawLat, rawLng, rides, places);
        if (closeMatch) {
          resolve({ label: closeMatch, lat, lng, fromGps: true });
          return;
        }
        const address = await reverseGeocodeSwissAddress(rawLat, rawLng);
        resolve({
          label: address ?? resolvePlaceLabel(rawLat, rawLng, rides, places),
          lat,
          lng,
          fromGps: true,
        });
      },
      (err) => {
        if (err.code === 1) {
          reject(
            new Error(
              "Standortzugriff nicht freigegeben. Du kannst den Ort einfach als Text eingeben.",
            ),
          );
        } else if (err.code === 3) {
          reject(
            new Error(
              "Standortabfrage hat zu lange gedauert. Bitte erneut tippen oder Ort manuell eingeben.",
            ),
          );
        } else {
          reject(
            new Error(
              "Standort momentan nicht verfügbar. Bitte Ort manuell eingeben.",
            ),
          );
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 0,
      },
    );
  });
}

export function knownPlaceSuggestions(
  rides: Ride[],
  limit = 6,
  places: GroupPlace[] = [],
): Spot[] {
  const counts = new Map<string, { spot: Spot; count: number }>();
  for (const r of rides) {
    if (r.voided_at) continue;
    const pairs: [
      string | undefined,
      number | null | undefined,
      number | null | undefined,
    ][] = [
      [r.end_label, r.end_lat, r.end_lng],
      [r.start_label, r.start_lat, r.start_lng],
    ];
    for (const [raw, lat, lng] of pairs) {
      const label = canonicalPlaceLabel(raw, lat, lng, places);
      if (!label) continue;
      const key = label.toLocaleLowerCase("de-CH");
      const existing = counts.get(key);
      if (existing) {
        existing.count++;
        if (existing.spot.lat === null && validCoords(lat, lng)) {
          existing.spot = {
            label,
            lat: roundCoord(lat),
            lng: roundCoord(lng!),
          };
        }
      } else {
        counts.set(key, {
          spot: {
            label,
            lat: validCoords(lat, lng) ? roundCoord(lat) : null,
            lng: validCoords(lat, lng) ? roundCoord(lng!) : null,
          },
          count: 1,
        });
      }
    }
  }
  const sorted = [...counts.values()]
    .sort((a, b) => b.count - a.count)
    .map((x) => x.spot);
  const seen = new Set(sorted.map((s) => s.label.toLocaleLowerCase("de-CH")));
  for (const p of places) {
    if (p.active === false) continue;
    const key = p.label.toLocaleLowerCase("de-CH");
    if (!seen.has(key)) {
      seen.add(key);
      sorted.push({
        label: p.label,
        lat: roundCoord(p.lat),
        lng: roundCoord(p.lng),
      });
    }
  }
  if (sorted.length >= limit) return sorted.slice(0, limit);
  for (const hub of ZURICH_HUBS) {
    if (sorted.length >= limit) break;
    const key = hub.label.toLocaleLowerCase("de-CH");
    if (!seen.has(key)) {
      seen.add(key);
      sorted.push({ label: hub.label, lat: hub.lat, lng: hub.lng });
    }
  }
  return sorted;
}

export function loadActiveUnlock(
  groupId: string,
  userId: string,
): ActiveUnlock | null {
  try {
    const raw = localStorage.getItem(UNLOCK_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveUnlock;
    if (
      parsed &&
      parsed.groupId === groupId &&
      parsed.userId === userId &&
      typeof parsed.startedAt === "string"
    ) {
      return parsed;
    }
  } catch {
    /* Ohne Browser-Speicher bleibt die App normal bedienbar. */
  }
  return null;
}

export function saveActiveUnlock(unlock: ActiveUnlock): void {
  try {
    localStorage.setItem(UNLOCK_STORAGE_KEY, JSON.stringify(unlock));
  } catch {
    /* Ignorieren im Privatmodus ohne Storage. */
  }
}

export function clearActiveUnlock(): void {
  try {
    localStorage.removeItem(UNLOCK_STORAGE_KEY);
  } catch {
    /* Ignorieren im Privatmodus ohne Storage. */
  }
}

export function zurichHour(iso: string): number {
  const formatted = new Intl.DateTimeFormat("de-CH", {
    hour: "2-digit",
    hour12: false,
    timeZone: "Europe/Zurich",
  }).format(new Date(iso));
  const parsed = Number.parseInt(formatted, 10);
  if (!Number.isFinite(parsed)) return 0;
  return parsed === 24 ? 0 : Math.max(0, Math.min(23, parsed));
}

export type DayPartId =
  | "morning"
  | "midday"
  | "afternoon"
  | "evening"
  | "night";
export type DayPartBucket = {
  id: DayPartId;
  label: string;
  range: string;
  count: number;
  seconds: number;
};

export function dayPartForHour(hour: number): DayPartId {
  if (hour >= 6 && hour < 11) return "morning";
  if (hour >= 11 && hour < 14) return "midday";
  if (hour >= 14 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

const DAY_PART_META: { id: DayPartId; label: string; range: string }[] = [
  { id: "morning", label: "Morgen", range: "06–11 Uhr" },
  { id: "midday", label: "Mittag", range: "11–14 Uhr" },
  { id: "afternoon", label: "Nachmittag", range: "14–18 Uhr" },
  { id: "evening", label: "Abend", range: "18–22 Uhr" },
  { id: "night", label: "Nacht", range: "22–06 Uhr" },
];

export const hourWindowLabel = (hour: number) =>
  `${String(hour).padStart(2, "0")}–${String((hour + 1) % 24).padStart(2, "0")} Uhr`;

export type DestinationStat = {
  label: string;
  count: number;
  totalSeconds: number;
  peakHourLabel: string;
  topOrigin: string | null;
  riders: { memberId: string; name: string; count: number }[];
};

export type MemberLocationProfile = {
  member: Member;
  totalRides: number;
  locatedRides: number;
  topDestinations: { label: string; count: number }[];
  favoriteDayPart: { label: string; range: string; count: number } | null;
  peakHourLabel: string | null;
};

export type RouteRecordRider = {
  memberId: string;
  name: string;
  bestSeconds: number;
  avgSeconds: number;
  count: number;
};

export type RouteRecordStat = {
  key: string;
  startLabel: string;
  endLabel: string;
  tripCount: number;
  avgSeconds: number;
  fastest: {
    seconds: number;
    memberIds: string[];
    memberNames: string;
    occurredAt: string;
    shared: boolean;
  };
  leaderboard: RouteRecordRider[];
};

/**
 * Berechnet Bestzeiten pro Strecke (Start → Ziel) über alle aktiven Fahrten.
 * Geteilte Fahrten werden zuerst zusammengeführt, damit die echte Scooter-Fahrzeit gezählt wird.
 */
export function computeRouteRecords(
  rides: Ride[],
  members: Member[],
  places: GroupPlace[] = [],
): RouteRecordStat[] {
  const activeRides = rides.filter((r) => !r.voided_at);
  const memberMap = new Map(members.map((m) => [m.id, m]));
  const trips = groupSharedRides(activeRides);

  const routeMap = new Map<
    string,
    {
      startLabel: string;
      endLabel: string;
      tripCount: number;
      totalSeconds: number;
      fastest: RouteRecordStat["fastest"];
      riders: Map<
        string,
        { bestSeconds: number; totalSeconds: number; count: number }
      >;
    }
  >();

  for (const trip of trips) {
    const startLabel = canonicalPlaceLabel(
      trip.ride.start_label,
      trip.ride.start_lat,
      trip.ride.start_lng,
      places,
    );
    const endLabel = canonicalPlaceLabel(
      trip.ride.end_label,
      trip.ride.end_lat,
      trip.ride.end_lng,
      places,
    );
    if (!startLabel || !endLabel) continue;

    // Reine Fahrzeit, falls > 0; sonst belastete Gesamtzeit (bei reiner Pausenfahrt).
    const tripSec =
      trip.duration_seconds > 0 ? trip.duration_seconds : trip.charged_seconds;
    if (tripSec <= 0) continue;

    const key = `${startLabel.toLocaleLowerCase("de-CH")}→${endLabel.toLocaleLowerCase("de-CH")}`;
    const memberIds = trip.parts.map((p) => p.member_id);
    const memberNames = memberIds
      .map((id) => memberMap.get(id)?.display_name ?? "Mitglied")
      .join(" & ");

    let entry = routeMap.get(key);
    if (!entry) {
      entry = {
        startLabel,
        endLabel,
        tripCount: 0,
        totalSeconds: 0,
        fastest: {
          seconds: tripSec,
          memberIds,
          memberNames,
          occurredAt: trip.ride.occurred_at,
          shared: trip.parts.length > 1,
        },
        riders: new Map(),
      };
      routeMap.set(key, entry);
    }

    entry.tripCount++;
    entry.totalSeconds += tripSec;
    if (
      tripSec < entry.fastest.seconds ||
      (tripSec === entry.fastest.seconds &&
        trip.ride.occurred_at > entry.fastest.occurredAt)
    ) {
      entry.fastest = {
        seconds: tripSec,
        memberIds,
        memberNames,
        occurredAt: trip.ride.occurred_at,
        shared: trip.parts.length > 1,
      };
    }

    for (const mid of memberIds) {
      const prev = entry.riders.get(mid);
      if (prev) {
        prev.bestSeconds = Math.min(prev.bestSeconds, tripSec);
        prev.totalSeconds += tripSec;
        prev.count++;
      } else {
        entry.riders.set(mid, {
          bestSeconds: tripSec,
          totalSeconds: tripSec,
          count: 1,
        });
      }
    }
  }

  return [...routeMap.entries()]
    .map(([key, r]) => ({
      key,
      startLabel: r.startLabel,
      endLabel: r.endLabel,
      tripCount: r.tripCount,
      avgSeconds: Math.round(r.totalSeconds / r.tripCount),
      fastest: r.fastest,
      leaderboard: [...r.riders.entries()]
        .map(([memberId, stat]) => ({
          memberId,
          name: memberMap.get(memberId)?.display_name ?? "Mitglied",
          bestSeconds: stat.bestSeconds,
          avgSeconds: Math.round(stat.totalSeconds / stat.count),
          count: stat.count,
        }))
        .sort(
          (a, b) =>
            a.bestSeconds - b.bestSeconds ||
            b.count - a.count ||
            a.name.localeCompare(b.name, "de-CH"),
        ),
    }))
    .sort(
      (a, b) =>
        b.tripCount - a.tripCount ||
        a.fastest.seconds - b.fastest.seconds ||
        a.startLabel.localeCompare(b.startLabel, "de-CH"),
    );
}

export function computeRideInsights(
  rides: Ride[],
  members: Member[],
  places: GroupPlace[] = [],
) {
  const activeRides = rides.filter((r) => !r.voided_at);
  const memberMap = new Map(members.map((m) => [m.id, m]));

  const hourly = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    label: String(hour).padStart(2, "0"),
    count: 0,
    seconds: 0,
  }));

  const dayPartMap = new Map<DayPartId, DayPartBucket>(
    DAY_PART_META.map((m) => [m.id, { ...m, count: 0, seconds: 0 }]),
  );

  const destMap = new Map<
    string,
    {
      label: string;
      count: number;
      totalSeconds: number;
      hours: number[];
      origins: Map<string, { label: string; count: number }>;
      riders: Map<string, number>;
    }
  >();

  const seenTrips = new Set<string>();
  const seenLocatedTrips = new Set<string>();
  const seenDestTrips = new Set<string>();

  for (const r of activeRides) {
    const tripKey = r.shared_group_id ?? r.id;
    const isNewTrip = !seenTrips.has(tripKey);
    if (isNewTrip) seenTrips.add(tripKey);

    const h = zurichHour(r.occurred_at);
    if (isNewTrip) hourly[h].count++;
    hourly[h].seconds += r.charged_seconds;
    const part = dayPartMap.get(dayPartForHour(h))!;
    if (isNewTrip) part.count++;
    part.seconds += r.charged_seconds;

    const endLabel = canonicalPlaceLabel(
      r.end_label,
      r.end_lat,
      r.end_lng,
      places,
    );
    const startLabel = canonicalPlaceLabel(
      r.start_label,
      r.start_lat,
      r.start_lng,
      places,
    );
    if (endLabel || startLabel) seenLocatedTrips.add(tripKey);

    if (endLabel) {
      const key = endLabel.toLocaleLowerCase("de-CH");
      let entry = destMap.get(key);
      if (!entry) {
        entry = {
          label: endLabel,
          count: 0,
          totalSeconds: 0,
          hours: Array(24).fill(0),
          origins: new Map(),
          riders: new Map(),
        };
        destMap.set(key, entry);
      }
      const destTripKey = `${key}::${tripKey}`;
      const isNewDestTrip = !seenDestTrips.has(destTripKey);
      if (isNewDestTrip) {
        seenDestTrips.add(destTripKey);
        entry.count++;
        entry.hours[h]++;
        if (startLabel) {
          const oKey = startLabel.toLocaleLowerCase("de-CH");
          const prev = entry.origins.get(oKey);
          if (prev) prev.count++;
          else entry.origins.set(oKey, { label: startLabel, count: 1 });
        }
      }
      entry.totalSeconds += r.charged_seconds;
      entry.riders.set(r.member_id, (entry.riders.get(r.member_id) ?? 0) + 1);
    }
  }

  const pickPeakHour = (hours: number[]) => {
    let bestHour = 0;
    let bestCount = -1;
    for (let i = 0; i < 24; i++) {
      if (hours[i] > bestCount) {
        bestCount = hours[i];
        bestHour = i;
      }
    }
    return bestCount > 0 ? hourWindowLabel(bestHour) : null;
  };

  const destinations: DestinationStat[] = [...destMap.values()]
    .sort((a, b) => b.count - a.count || b.totalSeconds - a.totalSeconds)
    .map((d) => {
      const topOrigin =
        [...d.origins.values()].sort((a, b) => b.count - a.count)[0]?.label ??
        null;
      const riders = [...d.riders.entries()]
        .map(([memberId, count]) => ({
          memberId,
          name: memberMap.get(memberId)?.display_name ?? "Mitglied",
          count,
        }))
        .sort((a, b) => b.count - a.count);
      return {
        label: d.label,
        count: d.count,
        totalSeconds: d.totalSeconds,
        peakHourLabel: pickPeakHour(d.hours) ?? "–",
        topOrigin,
        riders,
      };
    });

  const dayParts = DAY_PART_META.map((m) => dayPartMap.get(m.id)!);
  const peakDayPart =
    activeRides.length > 0
      ? [...dayParts].sort(
          (a, b) => b.count - a.count || b.seconds - a.seconds,
        )[0]
      : null;
  const peakHour =
    activeRides.length > 0
      ? [...hourly].sort(
          (a, b) => b.count - a.count || b.seconds - a.seconds,
        )[0]
      : null;

  const memberProfiles: MemberLocationProfile[] = members.map((member) => {
    const mRides = activeRides.filter((r) => r.member_id === member.id);
    const hours = Array(24).fill(0) as number[];
    const parts = new Map<DayPartId, number>();
    const mDests = new Map<string, { label: string; count: number }>();
    let locatedRides = 0;

    for (const r of mRides) {
      const h = zurichHour(r.occurred_at);
      hours[h]++;
      const pId = dayPartForHour(h);
      parts.set(pId, (parts.get(pId) ?? 0) + 1);
      const end = canonicalPlaceLabel(
        r.end_label,
        r.end_lat,
        r.end_lng,
        places,
      );
      const start = canonicalPlaceLabel(
        r.start_label,
        r.start_lat,
        r.start_lng,
        places,
      );
      if (end || start) locatedRides++;
      if (end) {
        const key = end.toLocaleLowerCase("de-CH");
        const prev = mDests.get(key);
        if (prev) prev.count++;
        else mDests.set(key, { label: end, count: 1 });
      }
    }

    let favPart: { label: string; range: string; count: number } | null = null;
    for (const meta of DAY_PART_META) {
      const c = parts.get(meta.id) ?? 0;
      if (c > 0 && (!favPart || c > favPart.count)) {
        favPart = { label: meta.label, range: meta.range, count: c };
      }
    }

    return {
      member,
      totalRides: mRides.length,
      locatedRides,
      topDestinations: [...mDests.values()]
        .sort((a, b) => b.count - a.count)
        .slice(0, 3),
      favoriteDayPart: favPart,
      peakHourLabel: pickPeakHour(hours),
    };
  });

  return {
    totalRides: seenTrips.size,
    locatedRideCount: seenLocatedTrips.size,
    hourly,
    dayParts,
    peakDayPart,
    peakHour: peakHour ? hourWindowLabel(peakHour.hour) : null,
    destinations,
    memberProfiles,
    routeRecords: computeRouteRecords(activeRides, members, places),
  };
}
