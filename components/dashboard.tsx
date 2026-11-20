"use client";
import Link from "next/link";
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Check,
  ChevronDown,
  Clock3,
  Copy,
  CreditCard,
  History,
  KeyRound,
  LayoutDashboard,
  LoaderCircle,
  LocateFixed,
  LogOut,
  MapPin,
  MessageSquare,
  Plus,
  RefreshCw,
  Share2,
  ShieldCheck,
  Smartphone,
  Sparkles,
  Sun,
  Terminal,
  Ticket,
  TrendingUp,
  Users,
  Wallet,
  WifiOff,
  X,
  Zap,
} from "lucide-react";
import {
  chf,
  groupSharedRides,
  splitPackage,
  splitRideSeconds,
  type SplitMode,
  type TopupPlan,
  dateLabel,
  localDateTime,
  minutes,
  moneyRappen,
  rideDraft,
  summary,
  wholeMinutes,
  type Action,
  type Group,
  type Member,
  type Ride,
  type RpcArgs,
  type Snapshot,
} from "@/lib/domain";
import {
  canonicalPlaceLabel,
  clearActiveUnlock,
  knownPlaceSuggestions,
  loadActiveUnlock,
  requestCurrentSpot,
  saveActiveUnlock,
  type ActiveUnlock,
  type Spot,
} from "@/lib/location";
import { DevDashboard } from "./dev-dashboard";
import { DynamicIslandDialog } from "./dynamic-island-dialog";
import { FeedbackDialog } from "./feedback-dialog";
import { LocationStats } from "./location-stats";
import {
  buildLiveRidePayload,
  buildStartLiveActivityUrl,
  buildStopLiveActivityUrl,
  computeLiveRideMetrics,
  loadAutoShortcutEnabled,
  saveAutoShortcutEnabled,
} from "@/lib/live-activity";
import {
  acknowledgeFeatures,
  availableFeatures,
  readTourProgress,
} from "@/lib/onboarding";
import { OnboardingModal, type Tour } from "./onboarding-modal";
import { PasswordDashboard } from "./password-dashboard";
import { ThemeCycleButton, ThemeSegmented } from "./theme-toggle";

type Tab = "overview" | "rides" | "balance" | "stats" | "members" | "dev";
type Modal =
  | "ride"
  | "unlock"
  | "credit"
  | "package"
  | "void"
  | "rename"
  | null;

type RideSeed = {
  drive?: string;
  when?: string;
  startSpot?: Spot;
  coRiderIds?: string[];
  fromUnlock?: boolean;
};

type Props = {
  data: Snapshot;
  groups: Group[];
  userId: string;
  ownUsername: string;
  demo: boolean;
  online: boolean;
  connected: boolean;
  syncedAt: Date | null;
  error: string;
  busy: boolean;
  mutate: (action: Action, args: RpcArgs) => Promise<string | boolean>;
  onSetMemberPassword: (
    memberId: string,
    newPassword: string,
  ) => Promise<boolean>;
  onCreateMemberAccount: (args: {
    displayName: string;
    username: string;
    password: string;
    role: "member" | "admin";
  }) => Promise<string | false>;
  onUpdateOwnPassword: (newPassword: string) => Promise<boolean>;
  onGroup: (id: string) => void;
  onLogout: () => void;
  onBeginAction: () => void;
  onRefresh: () => void;
  onResetDemo: () => void;
};

const tabs: { id: Tab; label: string; icon: typeof Zap }[] = [
  { id: "overview", label: "Übersicht", icon: LayoutDashboard },
  { id: "rides", label: "Fahrten", icon: History },
  { id: "balance", label: "Guthaben", icon: Wallet },
  { id: "stats", label: "Statistik", icon: TrendingUp },
  { id: "members", label: "Mitglieder", icon: Users },
];

const initials = (name: string) =>
  name
    .trim()
    .split(/\s+/)
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

const zurichKey = (date: Date) =>
  new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Zurich",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

const routeText = (r: Ride, places: Snapshot["places"] = []) => {
  const s = canonicalPlaceLabel(
    r.start_label,
    r.start_lat,
    r.start_lng,
    places,
  );
  const e = canonicalPlaceLabel(r.end_label, r.end_lat, r.end_lng, places);
  if (s && e) return `${s} → ${e}`;
  if (e) return `Ziel: ${e}`;
  if (s) return `Start: ${s}`;
  return "";
};

export function Dashboard(p: Props) {
  const { data } = p;
  const [tab, setTab] = useState<Tab>("overview");
  const [modal, setModal] = useState<{
      kind: Exclude<Modal, null>;
      motion: boolean;
    } | null>(null),
    [voidRide, setVoidRide] = useState<Ride | null>(null);
  const [rideSeed, setRideSeed] = useState<RideSeed | null>(null);
  const [renameMember, setRenameMember] = useState<Member | null>(null);
  const [rideStatus, setRideStatus] = useState("all");
  const [person, setPerson] = useState("all"),
    [period, setPeriod] = useState("all");
  const [code, setCode] = useState(""),
    [copied, setCopied] = useState<"code" | "link" | null>(null);
  const [tour, setTour] = useState<Tour | null>(null);
  const [tourLoadFailed, setTourLoadFailed] = useState(false);
  const [tourAttempt, setTourAttempt] = useState(0);
  const tourRequested = useRef(false);
  const [feedbackOpen, setFeedbackOpen] = useState<{ motion: boolean } | null>(
    null,
  );
  const [islandGuideOpen, setIslandGuideOpen] = useState<{
    motion: boolean;
  } | null>(null);
  const [autoShortcut, setAutoShortcut] = useState(false);
  const [wakeLockOn, setWakeLockOn] = useState(false);
  const [wakeLockSupported, setWakeLockSupported] = useState(false);
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);
  const [activeUnlock, setActiveUnlock] = useState<ActiveUnlock | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    setAutoShortcut(loadAutoShortcutEnabled());
    setWakeLockSupported(
      typeof navigator !== "undefined" && "wakeLock" in navigator,
    );
  }, []);

  useEffect(() => {
    setActiveUnlock(loadActiveUnlock(data.group.id, p.userId));
  }, [data.group.id, p.userId]);

  useEffect(() => {
    if (!activeUnlock) return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(id);
  }, [activeUnlock]);

  useEffect(() => {
    if (!activeUnlock || !wakeLockOn) {
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      return;
    }
    let alive = true;
    const acquire = async () => {
      if (
        !alive ||
        typeof navigator === "undefined" ||
        !("wakeLock" in navigator)
      )
        return;
      try {
        wakeLockRef.current = await navigator.wakeLock.request("screen");
      } catch {
        if (alive) setWakeLockOn(false);
      }
    };
    void acquire();
    const onVisible = () => {
      if (document.visibilityState === "visible") void acquire();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      alive = false;
      document.removeEventListener("visibilitychange", onVisible);
      void wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
    };
  }, [activeUnlock, wakeLockOn]);

  const me = data.members.find((m) => m.user_id === p.userId && m.active);
  const admin = me?.role === "admin";
  useEffect(() => {
    let active = true;
    readTourProgress(p.userId, p.demo)
      .then((seen) => {
        if (!active) return;
        setTourLoadFailed(false);
        if (tourRequested.current) return;
        const features = availableFeatures(admin).filter(
          (id) => !seen.includes(id),
        );
        if (features.length) {
          setTour({
            features,
            updates:
              seen.includes("minute-pass") && seen.includes("appearance"),
          });
        }
      })
      .catch(() => {
        if (active) setTourLoadFailed(true);
      });
    return () => {
      active = false;
    };
  }, [admin, p.userId, p.demo, tourAttempt]);

  function replayTour() {
    tourRequested.current = true;
    setTour({ features: availableFeatures(admin), updates: false });
  }

  const openResetsCount = admin
    ? (data.reset_requests ?? []).filter((r) => r.status === "open").length
    : 0;

  const memberSummaries = useMemo(() => {
    const map = new Map<string, ReturnType<typeof summary>>();
    for (const m of data.members) map.set(m.id, summary(data, m.id));
    return map;
  }, [data]);

  const own = (me && memberSummaries.get(me.id)) ?? summary(data, me?.id);
  const all = useMemo(() => summary(data), [data]);

  const member = (id: string) => data.members.find((m) => m.id === id);
  const memberIndex = (id: string) =>
    Math.max(
      0,
      data.members.findIndex((m) => m.id === id),
    ) % 5;
  const avatar = (m: Member | undefined, size = "") => (
    <span className={`avatar av-${memberIndex(m?.id ?? "")} ${size}`}>
      {initials(m?.display_name ?? "?")}
    </span>
  );

  const filtered = all.rides.filter(
    (r) =>
      (person === "all" || r.member_id === person) &&
      (period === "all" ||
        new Date(r.occurred_at).getTime() >=
          Date.now() - Number(period) * 86400000),
  );
  const sorted = [...data.rides].sort((a, b) =>
    b.occurred_at.localeCompare(a.occurred_at),
  );
  const shownRides = [...sorted]
    .sort((a, b) =>
      rideStatus === "voided"
        ? (b.voided_at ?? "").localeCompare(a.voided_at ?? "")
        : 0,
    )
    .filter(
      (r) =>
        (rideStatus === "all" ||
          (rideStatus === "voided" ? Boolean(r.voided_at) : !r.voided_at)) &&
        (person === "all" || r.member_id === person) &&
        (period === "all" ||
          new Date(
            rideStatus === "voided" ? r.voided_at! : r.occurred_at,
          ).getTime() >=
            Date.now() - Number(period) * 86400000),
    );
  const rank = data.members
    .map((m) => ({
      ...m,
      ...(memberSummaries.get(m.id) ?? summary(data, m.id)),
    }))
    .sort((a, b) => b.consumed - a.consumed);

  function navigate(next: Tab) {
    setTab(next);
    window.scrollTo({ top: 0, behavior: "instant" });
  }
  function open(
    kind: Exclude<Modal, null>,
    clickCount: number,
    seed: RideSeed | null = null,
  ) {
    p.onBeginAction();
    setRideSeed(seed);
    setModal({ kind, motion: clickCount > 0 });
  }

  const costPerSecondRappen = useMemo(() => {
    const totalSec = data.packages.reduce((n, pkg) => n + pkg.seconds, 0);
    const totalPrice = data.packages.reduce(
      (n, pkg) => n + pkg.price_rappen,
      0,
    );
    return totalSec > 0 ? totalPrice / totalSec : null;
  }, [data.packages]);

  const activeRiderNames = useMemo(() => {
    const meName = me?.display_name ?? "Du";
    const coNames = (activeUnlock?.coRiderIds ?? []).map(
      (id) => data.members.find((m) => m.id === id)?.display_name ?? "Mitglied",
    );
    return [meName, ...coNames];
  }, [activeUnlock?.coRiderIds, data.members, me?.display_name]);

  const liveMetrics = activeUnlock
    ? computeLiveRideMetrics({
        startedAt: activeUnlock.startedAt,
        nowMs: nowTick,
        ownBalanceSeconds: own.balance,
        riderCount: activeRiderNames.length,
        costPerSecondRappen,
      })
    : null;

  const livePayload = buildLiveRidePayload({
    riderNames: activeRiderNames,
    startLabel: activeUnlock?.startLabel || undefined,
    remainingSeconds: liveMetrics
      ? liveMetrics.projectedBalanceSeconds
      : own.balance,
    groupName: data.group.name,
    startedAt: activeUnlock?.startedAt ?? new Date(nowTick).toISOString(),
  });

  const unlockElapsedMinutes = liveMetrics?.elapsedMinutesRounded ?? 0;

  function finishActiveUnlock(clickCount: number) {
    if (!activeUnlock) return;
    open("ride", clickCount, {
      drive: String(unlockElapsedMinutes),
      when: localDateTime(new Date(activeUnlock.startedAt)),
      startSpot: {
        label: activeUnlock.startLabel,
        lat: activeUnlock.startLat,
        lng: activeUnlock.startLng,
        fromGps: Boolean(activeUnlock.startGps),
      },
      coRiderIds: activeUnlock.coRiderIds ?? [],
      fromUnlock: true,
    });
  }

  const otherActiveMembers = data.members.filter(
    (m) => m.active && m.id !== me?.id,
  );

  function toggleUnlockCoRider(memberId: string) {
    if (!activeUnlock) return;
    const current = activeUnlock.coRiderIds ?? [];
    const nextIds = current.includes(memberId)
      ? current.filter((id) => id !== memberId)
      : [...current, memberId];
    const next: ActiveUnlock = { ...activeUnlock, coRiderIds: nextIds };
    saveActiveUnlock(next);
    setActiveUnlock(next);
  }

  const currentTabLabel =
    tab === "dev"
      ? "Dev-Dashboard"
      : (tabs.find((t) => t.id === tab)?.label ?? "Übersicht");

  const filters = (
    <div className="filters">
      {tab === "rides" && (
        <>
          <label className="sr-only" htmlFor="ride-status">
            Status
          </label>
          <select
            id="ride-status"
            value={rideStatus}
            onChange={(e) => setRideStatus(e.target.value)}
          >
            <option value="all">Alle Fahrten</option>
            <option value="active">Aktive Fahrten</option>
            <option value="voided">Storno-Verlauf</option>
          </select>
        </>
      )}
      <label className="sr-only" htmlFor="person">
        Person
      </label>
      <select
        id="person"
        value={person}
        onChange={(e) => setPerson(e.target.value)}
      >
        <option value="all">Alle Mitglieder</option>
        {data.members.map((m) => (
          <option key={m.id} value={m.id}>
            {m.display_name}
          </option>
        ))}
      </select>
      <label className="sr-only" htmlFor="period">
        Zeitraum
      </label>
      <select
        id="period"
        value={period}
        onChange={(e) => setPeriod(e.target.value)}
      >
        <option value="all">Gesamter Zeitraum</option>
        <option value="7">Letzte 7 Tage</option>
        <option value="30">Letzte 30 Tage</option>
        <option value="90">Letzte 90 Tage</option>
      </select>
    </div>
  );

  const table = (
    rides: Ride[],
    compact = false,
    collapseShared = true,
    limit?: number,
  ) => {
    const allRows = collapseShared
      ? groupSharedRides(rides)
      : rides.map((r) => ({
          key: r.id,
          ride: r,
          parts: [r],
          duration_seconds: r.duration_seconds,
          pause_seconds: r.pause_seconds,
          charged_seconds: r.charged_seconds,
          estimated_cost_rappen:
            r.estimated_cost_rappen === null
              ? null
              : Number(r.estimated_cost_rappen),
        }));
    const rows = limit ? allRows.slice(0, limit) : allRows;

    return (
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Mitglied</th>
              <th>Fahrt</th>
              <th>Fahrzeit</th>
              <th className="optional-column">Pause</th>
              <th>Verbrauch</th>
              {!compact && (
                <>
                  <th>Kosten¹</th>
                  {admin && (
                    <th>
                      <span className="sr-only">Aktion</span>
                    </th>
                  )}
                </>
              )}
            </tr>
          </thead>
          <tbody>
            {rows.map((item) => {
              const r = item.ride;
              const route = routeText(r, data.places);
              const isGroupedShared = item.parts.length > 1;
              const peerNames =
                !isGroupedShared && r.shared_group_id
                  ? data.rides
                      .filter(
                        (other) =>
                          other.shared_group_id === r.shared_group_id &&
                          other.id !== r.id,
                      )
                      .map(
                        (other) =>
                          member(other.member_id)?.display_name ?? "Mitglied",
                      )
                  : [];
              const participantMembers = item.parts.map((part) =>
                member(part.member_id),
              );
              return (
                <tr key={item.key} className={r.voided_at ? "voided" : ""}>
                  <td>
                    <span className="person-cell">
                      <span className="avatar-stack">
                        {participantMembers.slice(0, 3).map((pm, idx) => (
                          <span key={item.parts[idx].id}>
                            {avatar(pm, "small")}
                          </span>
                        ))}
                      </span>
                      <span className="person-names">
                        <span>
                          {participantMembers
                            .map((pm) => pm?.display_name ?? "Mitglied")
                            .join(" & ")}
                        </span>
                        {isGroupedShared && (
                          <small className="shared-badge">
                            Geteilt ({item.parts.length})
                          </small>
                        )}
                      </span>
                    </span>
                  </td>
                  <td>
                    <div>{dateLabel(r.occurred_at, true)}</div>
                    {route && (
                      <small className="ride-route">
                        <MapPin size={12} /> {route}
                      </small>
                    )}
                    {peerNames.length > 0 && (
                      <small className="ride-shared-peer">
                        <Users size={12} /> Geteilt mit {peerNames.join(" & ")}
                      </small>
                    )}
                    {r.voided_at ? (
                      <>
                        <small className="cancellation-reason">
                          Storniert · {r.void_reason}
                        </small>
                        {r.note && (
                          <small className="cancellation-reason">
                            Notiz: {r.note}
                          </small>
                        )}
                        {!compact && (
                          <small className="cancellation-details">
                            Storniert am {dateLabel(r.voided_at, true)} von{" "}
                            {member(r.voided_by_member_id ?? "")
                              ?.display_name ?? "Person nicht hinterlegt"}
                            <br />+{minutes(item.charged_seconds)} Min.
                            zurückgebucht
                            {isGroupedShared
                              ? ` (${item.parts.length} Personen)`
                              : ""}
                          </small>
                        )}
                      </>
                    ) : (
                      r.note && <small>{r.note}</small>
                    )}
                  </td>
                  <td>
                    {minutes(item.duration_seconds)}{" "}
                    <span className="unit">Min.</span>
                  </td>
                  <td className="optional-column">
                    {minutes(item.pause_seconds)}{" "}
                    <span className="unit">Min.</span>
                  </td>
                  <td>
                    <span
                      className={`pill ${r.voided_at ? "muted" : "active"}`}
                    >
                      {minutes(item.charged_seconds)} Min.
                      {r.voided_at ? " · storniert" : ""}
                    </span>
                    {isGroupedShared && !r.voided_at && (
                      <small className="shared-split-sub">
                        je {minutes(item.parts[0].charged_seconds)} Min.
                      </small>
                    )}
                  </td>
                  {!compact && (
                    <>
                      <td>
                        {r.voided_at ? (
                          <span className="unit">Entfällt</span>
                        ) : item.estimated_cost_rappen === null ? (
                          <span className="unit">Offen</span>
                        ) : (
                          <span>≈ {chf(item.estimated_cost_rappen)}</span>
                        )}
                      </td>
                      {admin && (
                        <td>
                          {!r.voided_at && (
                            <button
                              className="text-link danger"
                              onClick={(e) => {
                                setVoidRide(r);
                                open("void", e.detail);
                              }}
                            >
                              Stornieren
                            </button>
                          )}
                        </td>
                      )}
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
        {rows.length === 0 && (
          <Empty
            title="Noch keine Fahrten"
            text="Sobald ihr eine Fahrt eintragt, erscheint sie hier."
          />
        )}
      </div>
    );
  };

  const rideButton = (
    <button
      className="button primary"
      onClick={(e) => open("ride", e.detail)}
      disabled={!me}
    >
      <Plus size={18} />
      Fahrt eintragen
    </button>
  );

  const unlockButton = (
    <button
      className="button pass-secondary"
      onClick={(e) =>
        activeUnlock ? finishActiveUnlock(e.detail) : open("unlock", e.detail)
      }
      disabled={!me}
    >
      <LocateFixed size={17} />
      {activeUnlock ? "Fahrt beenden" : "Dott entsperren"}
    </button>
  );

  const inviteUrl =
    code && typeof window !== "undefined"
      ? `${window.location.origin}/?invite=${encodeURIComponent(code)}`
      : "";

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("overview");
          }}
        >
          <span className="brand-icon">
            <Zap size={22} fill="currentColor" />
          </span>
          minutenclub<span className="brand-dot">.</span>
        </Link>
        <div className="group-switch">
          <span className="group-symbol">
            <Users size={18} />
          </span>
          <div>
            <small>EUER MINUTENCLUB</small>
            <label className="sr-only" htmlFor="group">
              Gruppe wechseln
            </label>
            <select
              id="group"
              value={data.group.id}
              onChange={(e) => p.onGroup(e.target.value)}
            >
              {p.groups.map((g) => (
                <option value={g.id} key={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <ChevronDown size={14} />
        </div>
        <nav aria-label="Hauptnavigation">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={`nav-item ${tab === t.id ? "active" : ""}`}
              aria-current={tab === t.id ? "page" : undefined}
              onClick={() => navigate(t.id)}
            >
              <t.icon size={19} />
              <span>{t.label}</span>
              {t.id === "members" && openResetsCount > 0 && (
                <i className="nav-badge" aria-hidden="true">
                  {openResetsCount}
                </i>
              )}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          {admin && (
            <button
              type="button"
              className={`nav-item sidebar-util ${tab === "dev" ? "active" : ""}`}
              aria-current={tab === "dev" ? "page" : undefined}
              onClick={() => navigate("dev")}
            >
              <Terminal size={18} />
              <span>Dev-Dashboard</span>
            </button>
          )}
          <button
            type="button"
            className="nav-item sidebar-util"
            onClick={() => {
              setTab("members");
              setTimeout(() => {
                document
                  .getElementById("passwort-dashboard")
                  ?.scrollIntoView({ behavior: "smooth" });
              }, 40);
            }}
          >
            <KeyRound size={18} />
            <span>Passwörter</span>
            {openResetsCount > 0 && (
              <i className="nav-badge" aria-hidden="true">
                {openResetsCount}
              </i>
            )}
          </button>
          <button
            type="button"
            className="nav-item sidebar-util"
            onClick={(e) => setFeedbackOpen({ motion: e.detail > 0 })}
          >
            <MessageSquare size={18} />
            <span>Feedback</span>
          </button>
          <Link href="/datenschutz" className="nav-item sidebar-util">
            <ShieldCheck size={18} />
            <span>Datenschutz &amp; Recht</span>
          </Link>
          <button className="profile" onClick={p.onLogout} disabled={p.busy}>
            {avatar(me)}
            <span>
              <strong>{me?.display_name ?? "Mitglied"}</strong>
              <small>
                {p.demo ? "Demo-Modus" : admin ? "Administrator" : "Mitglied"}
              </small>
            </span>
            <LogOut size={17} />
          </button>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <span className="breadcrumb">
            {data.group.name} <span>/</span> <strong>{currentTabLabel}</strong>
          </span>
          <div className="topbar-right">
            <span
              className={`sync ${p.online && (p.connected || p.demo) ? "live" : "waiting"}`}
            >
              <i />
              {p.demo
                ? "Lokale Demo"
                : !p.online
                  ? "Offline"
                  : p.connected
                    ? "Live verbunden"
                    : "Regelmässiger Abgleich"}
            </span>
            {admin && (
              <button
                type="button"
                className={`dev-topbar-btn ${tab === "dev" ? "active-icon-btn" : ""}`}
                aria-label="Dev-Dashboard öffnen"
                title="Admin Dev-Dashboard"
                onClick={() => navigate(tab === "dev" ? "overview" : "dev")}
              >
                <Terminal size={15} />
                <span>Dev</span>
              </button>
            )}
            <button
              type="button"
              className="icon-button"
              aria-label="Feedback geben"
              title="Feedback geben"
              onClick={(e) => setFeedbackOpen({ motion: e.detail > 0 })}
            >
              <MessageSquare size={16} />
            </button>
            <ThemeCycleButton />
            <button
              className="icon-button"
              aria-label="Daten neu laden"
              title={
                p.syncedAt
                  ? `Zuletzt geladen: ${p.syncedAt.toLocaleTimeString("de-CH")}`
                  : "Neu laden"
              }
              onClick={p.onRefresh}
            >
              <RefreshCw size={16} />
            </button>
            {avatar(me, "small")}
          </div>
        </header>
        <main className="main-content">
          {!p.online && (
            <div className="notice" role="status">
              <WifiOff size={18} />
              Du bist offline. Angezeigt wird der letzte geladene Stand.
              Speichern braucht eine Verbindung.
            </div>
          )}
          {p.error && (
            <div className="notice error" role="alert">
              {p.error}
              <button className="text-link" onClick={p.onRefresh}>
                Neu laden
              </button>
            </div>
          )}
          {activeUnlock && liveMetrics && tab !== "overview" && (
            <div
              className="dynamic-pill-bar"
              role="status"
              aria-label="Aktive Scooter-Fahrt"
            >
              <button
                type="button"
                className="dynamic-pill-main"
                onClick={() => navigate("overview")}
              >
                <span className="unlock-pulse" aria-hidden="true" />
                <strong className="dynamic-pill-clock">
                  {liveMetrics.elapsedClock}
                </strong>
                <span className="dynamic-pill-meta">
                  {activeRiderNames.join(" & ")}
                  {activeUnlock.startLabel
                    ? ` · ${activeUnlock.startLabel}`
                    : ""}
                  {` · ${minutes(liveMetrics.projectedBalanceSeconds)} Min. übrig`}
                </span>
              </button>
              <button
                type="button"
                className="button primary compact-btn"
                onClick={(e) => finishActiveUnlock(e.detail)}
              >
                <Check size={15} /> Abschliessen
              </button>
            </div>
          )}
          {tab !== "overview" && (
            <div className="page-heading">
              <div>
                <span className="eyebrow">{data.group.name.toUpperCase()}</span>
                <h1>{currentTabLabel}</h1>
              </div>
              {rideButton}
            </div>
          )}
          {tab === "overview" && (
            <>
              <h1 className="overview-heading">
                Hoi {me?.display_name ?? "zusammen"}
              </h1>

              {openResetsCount > 0 && (
                <div className="notice reset-alert-banner" role="status">
                  <KeyRound size={18} />
                  <span>
                    {openResetsCount === 1
                      ? "1 offene Passwort-Zurücksetzung wartet auf dich."
                      : `${openResetsCount} offene Passwort-Zurücksetzungen warten auf dich.`}
                  </span>
                  <button
                    type="button"
                    className="button secondary compact-btn"
                    onClick={() => {
                      setTab("members");
                      setTimeout(() => {
                        document
                          .getElementById("passwort-dashboard")
                          ?.scrollIntoView({ behavior: "smooth" });
                      }, 40);
                    }}
                  >
                    Passwort-Dashboard öffnen
                  </button>
                </div>
              )}

              {tourLoadFailed && (
                <div className="notice" role="status">
                  Die Einführung konnte nicht geladen werden.{" "}
                  <button
                    type="button"
                    className="text-link"
                    onClick={() => setTourAttempt((n) => n + 1)}
                  >
                    Erneut versuchen
                  </button>
                </div>
              )}

              {activeUnlock && liveMetrics && (
                <section
                  className="unlock-live-card"
                  role="status"
                  aria-live="polite"
                >
                  <div className="unlock-live-head">
                    <div className="unlock-live-info">
                      <span className="unlock-pulse" aria-hidden="true" />
                      <div>
                        <strong>
                          Scooter entsperrt ·{" "}
                          <span className="live-clock">
                            {liveMetrics.elapsedClock}
                          </span>{" "}
                          aktiv
                        </strong>
                        <small>
                          Gestartet {dateLabel(activeUnlock.startedAt, true)}
                          {activeUnlock.startLabel
                            ? ` · Start: ${activeUnlock.startLabel}`
                            : " · Ohne Startort"}
                          {" · Kein Hintergrund-GPS aktiv"}
                        </small>
                      </div>
                    </div>
                    <span className="live-pill-badge">LIVE</span>
                  </div>

                  <div className="unlock-metrics">
                    <div>
                      <small>
                        {activeRiderNames.length > 1
                          ? `Dein Anteil (÷${activeRiderNames.length})`
                          : "Aktuelle Dauer"}
                      </small>
                      <strong>
                        {minutes(liveMetrics.ownShareSeconds)} Min.
                      </strong>
                    </div>
                    <div>
                      <small>Danach übrig</small>
                      <strong>
                        {minutes(liveMetrics.projectedBalanceSeconds)} Min.
                      </strong>
                    </div>
                    <div>
                      <small>
                        {liveMetrics.estimatedCostRappen !== null
                          ? "Geschätzter Anteil"
                          : "Mitfahrende"}
                      </small>
                      <strong>
                        {liveMetrics.estimatedCostRappen !== null
                          ? `≈ ${chf(liveMetrics.estimatedCostRappen)}`
                          : `${activeRiderNames.length} Pers.`}
                      </strong>
                    </div>
                  </div>

                  {(activeUnlock.coRiderIds?.length ?? 0) > 0 && (
                    <small className="unlock-shared-summary">
                      <Users size={13} /> Gemeinsam auf dem Scooter:{" "}
                      {activeRiderNames.join(" & ")} (Zeit wird geteilt)
                    </small>
                  )}

                  {otherActiveMembers.length > 0 && (
                    <div className="unlock-coriders">
                      <span>Mit auf dem Scooter:</span>
                      <div className="chip-row">
                        {otherActiveMembers.map((m) => {
                          const active = (
                            activeUnlock.coRiderIds ?? []
                          ).includes(m.id);
                          return (
                            <button
                              key={m.id}
                              type="button"
                              className={`chip ${active ? "active" : ""}`}
                              aria-pressed={active}
                              onClick={() => toggleUnlockCoRider(m.id)}
                            >
                              {active ? "✓ " : "+ "}
                              {m.display_name}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="unlock-live-actions">
                    <button
                      type="button"
                      className="button primary compact-btn"
                      onClick={(e) => finishActiveUnlock(e.detail)}
                    >
                      <Check size={16} /> Fahrt abschliessen
                    </button>
                    <a
                      href={buildStartLiveActivityUrl(livePayload)}
                      className="button secondary compact-btn"
                      title="Startet deinen iPhone-Kurzbefehl «Minutenclub Live» für Dynamic Island & Sperrbildschirm"
                    >
                      <Smartphone size={15} /> Dynamic Island
                    </a>
                    <button
                      type="button"
                      className="button ghost compact-btn"
                      onClick={(e) =>
                        setIslandGuideOpen({ motion: e.detail > 0 })
                      }
                    >
                      Einrichten
                    </button>
                    {wakeLockSupported && (
                      <button
                        type="button"
                        className={`button ghost compact-btn ${wakeLockOn ? "wake-active" : ""}`}
                        aria-pressed={wakeLockOn}
                        onClick={() => setWakeLockOn((v) => !v)}
                      >
                        <Sun size={15} />{" "}
                        {wakeLockOn ? "Display bleibt wach" : "Display wach"}
                      </button>
                    )}
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
                        setWakeLockOn(false);
                        clearActiveUnlock();
                        setActiveUnlock(null);
                      }}
                    >
                      Verwerfen
                    </button>
                  </div>
                </section>
              )}

              <div className="overview-summary">
                <section
                  className="balance-card"
                  aria-labelledby="personal-balance"
                >
                  <div>
                    <h2 id="personal-balance">
                      <Ticket aria-hidden="true" size={21} /> Dein Restguthaben
                    </h2>
                    <p className="balance-number">
                      <strong>{minutes(own.balance)}</strong>{" "}
                      <span>
                        {own.balance < 0
                          ? "Minuten · im Minus"
                          : "Minuten übrig"}
                      </span>
                    </p>
                  </div>
                  <div className="pass-stub">
                    <div className="pass-quota">
                      <span>Dein Kontingent</span>
                      <strong>{minutes(own.quota)} Min.</strong>
                      <div className="pass-track" aria-hidden="true">
                        <i
                          style={{
                            transform: `scaleX(${own.quota > 0 ? Math.min(1, Math.max(0, own.balance / own.quota)) : 0})`,
                          }}
                        />
                      </div>
                    </div>
                    <div className="pass-actions">
                      {unlockButton}
                      {rideButton}
                    </div>
                  </div>
                </section>
                <section className="metric-grid overview-metrics">
                  <Metric
                    icon={<Clock3 size={20} />}
                    label="Von dir verbraucht"
                    value={minutes(own.consumed)}
                    unit="Minuten"
                    note="Inklusive Pausen"
                  />
                  <Metric
                    icon={<Users size={20} />}
                    label="Gemeinsamer Bestand"
                    value={minutes(all.inventory)}
                    unit="Minuten"
                    note={
                      all.inventory < 0
                        ? "Paketkäufe prüfen"
                        : "Für die ganze Gruppe übrig"
                    }
                  />
                </section>
              </div>
              <div className="middle-grid">
                <section className="panel quota-panel">
                  <PanelHeading title="Kontingent & Verbrauch" />
                  <QuotaChart data={data} />
                </section>
                <div className="panel crew-panel">
                  <PanelHeading
                    title="Eure Crew"
                    description="Verbleibende Minuten pro Person"
                    aside={
                      <button
                        className="icon-button"
                        onClick={() => navigate("members")}
                        aria-label="Mitglieder öffnen"
                      >
                        <ArrowUpRight size={19} />
                      </button>
                    }
                  />
                  <div className="crew-list">
                    {rank.map((m) => (
                      <div className="crew-row" key={m.id}>
                        {avatar(m)}
                        <div className="crew-info">
                          <strong>
                            {m.display_name}
                            {m.id === me?.id && <small> du</small>}
                          </strong>
                          <div className="progress-track" aria-hidden="true">
                            <span
                              className="progress-fill"
                              style={{
                                width: `${m.quota ? Math.min(100, Math.max(0, (m.balance / m.quota) * 100)) : 0}%`,
                              }}
                            />
                          </div>
                        </div>
                        <span className="crew-value">
                          {minutes(m.balance)}
                          <small> Min. übrig</small>
                        </span>
                      </div>
                    ))}
                  </div>
                  <div className="crew-total">
                    <span>Persönliches Guthaben zusammen</span>
                    <strong>{minutes(all.balance)} Min.</strong>
                  </div>
                </div>
              </div>
              <div className="panel activity-panel">
                <PanelHeading
                  title="Gemeinsam unterwegs"
                  description="Minutenverbrauch eurer Crew"
                  aside={<span className="subtle-pill">Letzte 14 Tage</span>}
                />
                <ActivityChart rides={all.rides} />
              </div>

              <section className="panel">
                <PanelHeading
                  title="Letzte Fahrten"
                  description="Die neuesten Wege aus eurem Club"
                  aside={
                    <button
                      className="text-link"
                      onClick={() => navigate("rides")}
                    >
                      Alle ansehen <ArrowRight size={15} />
                    </button>
                  }
                />
                {table(sorted, true, true, 5)}
              </section>
            </>
          )}
          {tab === "rides" && (
            <section className="panel">
              <PanelHeading
                title={(() => {
                  const shownCount =
                    person === "all"
                      ? groupSharedRides(shownRides).length
                      : shownRides.length;
                  return rideStatus === "voided"
                    ? `${shownCount} stornierte Fahrten`
                    : `${shownCount} Fahrten`;
                })()}
                description={
                  rideStatus === "voided"
                    ? "Nach Stornozeitpunkt sortiert und gefiltert. Jede Fahrt bleibt mit Grund und Gegenbuchung erhalten."
                    : "Stornierte Fahrten bleiben zur Nachvollziehbarkeit erhalten."
                }
                aside={filters}
              />
              {table(shownRides, false, person === "all")}
              <p className="panel-footnote">
                ¹ Schätzung zum Erfassungszeitpunkt aus dem gewichteten
                Paketpreis. Freischaltung und Screenshot-Preise werden
                ignoriert.
              </p>
            </section>
          )}
          {tab === "balance" && (
            <>
              <section className="metric-grid">
                <Metric
                  icon={<Wallet size={20} />}
                  label="Dein Guthaben"
                  value={minutes(own.balance)}
                  unit="Minuten"
                  note="Gutschriften abzüglich Verbrauch"
                />
                <Metric
                  icon={<Zap size={20} />}
                  label="Noch nicht zugewiesen"
                  value={minutes(all.inventory - all.balance)}
                  unit="Minuten"
                  note={
                    all.inventory - all.balance < 0
                      ? "Unterdeckung: Guthaben übersteigt Bestand"
                      : "Gemeinsamer Bestand minus alle Guthaben"
                  }
                />
                <Metric
                  icon={<CreditCard size={20} />}
                  label="Paketkäufe insgesamt"
                  value={chf(
                    data.packages.reduce((n, x) => n + x.price_rappen, 0),
                  )}
                  note={`${minutes(all.bought)} Minuten gekauft`}
                />
              </section>
              <section className="panel">
                <PanelHeading
                  title="Minutenkonten"
                  description="Interne Gutschriften kaufen keine Minuten bei Dott."
                  aside={
                    admin ? (
                      <button
                        className="button secondary"
                        onClick={(e) => open("credit", e.detail)}
                      >
                        <Plus size={16} />
                        Minuten manuell geben
                      </button>
                    ) : undefined
                  }
                />
                <div className="account-grid">
                  {data.members.map((m) => {
                    const s = memberSummaries.get(m.id) ?? summary(data, m.id);
                    return (
                      <div key={m.id} className="account-item">
                        {avatar(m)}
                        <div>
                          <strong>{m.display_name}</strong>
                          <small>
                            {m.active ? "Minutenkonto" : "Deaktiviert"}
                          </small>
                        </div>
                        <strong className={s.balance < 0 ? "negative" : ""}>
                          {minutes(s.balance)} <small>Min.</small>
                        </strong>
                      </div>
                    );
                  })}
                </div>
              </section>
              <section className="panel">
                <PanelHeading
                  title="Minutenpakete"
                  description="Gemeinsame Käufe mit Kosten und Minutenanteilen pro Person."
                  aside={
                    admin ? (
                      <button
                        className="button secondary"
                        onClick={(e) => open("package", e.detail)}
                      >
                        <Plus size={16} />
                        Guthaben aufladen
                      </button>
                    ) : undefined
                  }
                />
                <div className="table-scroll">
                  <table>
                    <thead>
                      <tr>
                        <th>Kaufdatum</th>
                        <th>Bezahlt von</th>
                        <th>Minuten</th>
                        <th>Preis</th>
                        <th>Beiträge &amp; Minutenanteile</th>
                        <th className="optional-column">Notiz</th>
                      </tr>
                    </thead>
                    <tbody>
                      {[...data.packages]
                        .sort((a, b) =>
                          b.purchased_at.localeCompare(a.purchased_at),
                        )
                        .map((pkg) => (
                          <tr key={pkg.id}>
                            <td>{dateLabel(pkg.purchased_at)}</td>
                            <td>{member(pkg.payer_id)?.display_name}</td>
                            <td>{minutes(pkg.seconds)} Min.</td>
                            <td>{chf(pkg.price_rappen)}</td>
                            <td>
                              <div className="package-shares">
                                {(data.contributions ?? [])
                                  .filter((c) => c.package_id === pkg.id)
                                  .map((c) => (
                                    <div key={c.id}>
                                      <strong>
                                        {member(c.member_id)?.display_name}
                                      </strong>
                                      : {chf(c.amount_rappen)} →{" "}
                                      {minutes(c.allocated_seconds)} Min.
                                    </div>
                                  ))}
                                {!(data.contributions ?? []).some(
                                  (c) => c.package_id === pkg.id,
                                ) && (
                                  <span className="unit">
                                    Keine Beiträge hinterlegt (älterer Kauf)
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="optional-column">
                              {pkg.note || "–"}
                            </td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {!data.packages.length && (
                    <Empty
                      title="Noch kein Paket erfasst"
                      text="Ein Admin kann euren ersten gemeinsamen Kauf eintragen."
                    />
                  )}
                </div>
                <p className="panel-footnote">
                  Die Beträge zeigen eure Kostenanteile. Zahlungen erledigt ihr
                  selbst. Paketkorrekturen, Verfall und Ausgleichszahlungen sind
                  für später vorgesehen.
                </p>
              </section>
              <section className="panel">
                <PanelHeading
                  title="Buchungshistorie"
                  description="Gutschriften, Fahrten und Gegenbuchungen – für alle nachvollziehbar."
                />
                <div className="journal">
                  {[...data.entries]
                    .sort((a, b) => b.created_at.localeCompare(a.created_at))
                    .map((e) => (
                      <div className="journal-row" key={e.id}>
                        <span
                          className={`journal-icon ${e.seconds > 0 ? "positive" : ""}`}
                        >
                          {e.seconds > 0 ? (
                            <ArrowDownLeft size={18} />
                          ) : (
                            <ArrowUpRight size={18} />
                          )}
                        </span>
                        <div>
                          <strong>{e.reason}</strong>
                          <small>
                            {member(e.member_id)?.display_name} ·{" "}
                            {dateLabel(e.created_at, true)}
                          </small>
                        </div>
                        <strong
                          className={e.seconds > 0 ? "positive-text" : ""}
                        >
                          {e.seconds > 0 ? "+" : ""}
                          {minutes(e.seconds)} <small>Min.</small>
                        </strong>
                      </div>
                    ))}
                </div>
                {!data.entries.length && (
                  <Empty
                    title="Noch keine Buchungen"
                    text="Gutschriften und Fahrten erscheinen automatisch hier."
                  />
                )}
              </section>
            </>
          )}
          {tab === "stats" && (
            <>
              <div className="section-filter">{filters}</div>
              <section className="metric-grid">
                {(() => {
                  const tripCount = new Set(
                    filtered.map((r) => r.shared_group_id ?? r.id),
                  ).size;
                  const totalSec = filtered.reduce(
                    (n, r) => n + r.charged_seconds,
                    0,
                  );
                  return (
                    <>
                      <Metric
                        icon={<History size={20} />}
                        label="Fahrten"
                        value={String(tripCount)}
                        note="Im ausgewählten Zeitraum"
                      />
                      <Metric
                        icon={<Clock3 size={20} />}
                        label="Verbrauch"
                        value={minutes(totalSec)}
                        unit="Minuten"
                        note="Fahrzeit + Pausierzeit"
                      />
                      <Metric
                        icon={<TrendingUp size={20} />}
                        label="Ø pro Fahrt"
                        value={minutes(tripCount ? totalSec / tripCount : 0)}
                        unit="Minuten"
                        note="Inklusive Pausen"
                      />
                    </>
                  );
                })()}
              </section>

              <LocationStats
                rides={filtered}
                members={data.members}
                places={data.places ?? []}
                personFilter={person}
                renderAvatar={avatar}
              />

              <section className="panel">
                <PanelHeading
                  title="Wer fährt wie viel?"
                  description="Der Personenfilter und Zeitraum gelten auch für diesen Vergleich."
                />
                <div className="stats-list">
                  {data.members
                    .filter((m) => person === "all" || m.id === person)
                    .map((m) => {
                      const rs = filtered.filter((r) => r.member_id === m.id),
                        drive = rs.reduce((n, r) => n + r.duration_seconds, 0),
                        pause = rs.reduce((n, r) => n + r.pause_seconds, 0);
                      return (
                        <div className="stats-person" key={m.id}>
                          <div className="person-cell">
                            {avatar(m)}
                            <strong>{m.display_name}</strong>
                          </div>
                          <span>
                            <strong>{rs.length}</strong>
                            <small>Fahrten</small>
                          </span>
                          <span>
                            <strong>{minutes(drive)} Min.</strong>
                            <small>Fahrzeit</small>
                          </span>
                          <span>
                            <strong>{minutes(pause)} Min.</strong>
                            <small>Pause</small>
                          </span>
                          <span>
                            <strong>{minutes(drive + pause)} Min.</strong>
                            <small>Verbrauch</small>
                          </span>
                        </div>
                      );
                    })}
                </div>
              </section>
              <section className="panel">
                <PanelHeading
                  title="Geschätzter Verbrauchswert"
                  description="Anteiliger Paketpreis zum Zeitpunkt der Erfassung. Keine verbindliche Abrechnung."
                />
                <div className="cost-summary">
                  <strong>
                    ≈{" "}
                    {chf(
                      filtered.reduce(
                        (n, r) => n + Number(r.estimated_cost_rappen ?? 0),
                        0,
                      ),
                    )}
                  </strong>
                  <p>
                    {
                      filtered.filter((r) => r.estimated_cost_rappen === null)
                        .length
                    }{" "}
                    Fahrten ohne Kostenbewertung. Freischaltgebühren werden
                    ignoriert.
                  </p>
                </div>
              </section>
            </>
          )}
          {tab === "members" && (
            <>
              <section className="panel">
                <PanelHeading
                  title="Alle im Club"
                  description="Neue Mitglieder erhalten einen eigenen Login. Eure bisherigen Buchungen bleiben erhalten."
                  aside={
                    admin ? (
                      <div className="panel-actions">
                        <button
                          className="button secondary"
                          disabled={p.busy}
                          onClick={async () => {
                            const result = await p.mutate("create_invite", {});
                            if (typeof result === "string") {
                              setCode(result);
                              setCopied(null);
                            }
                          }}
                        >
                          <Plus size={16} />
                          Einladung erstellen
                        </button>
                        <button
                          type="button"
                          className="button ghost compact-btn"
                          disabled={p.busy}
                          title="Alle offenen Einladungslinks sofort ungültig machen"
                          onClick={async () => {
                            const ok = await p.mutate("revoke_invites", {});
                            if (ok) {
                              setCode("");
                              setCopied(null);
                            }
                          }}
                        >
                          <X size={15} />
                          Links sperren
                        </button>
                      </div>
                    ) : undefined
                  }
                />
                {code && (
                  <div className="invite-box">
                    <strong>
                      {p.demo
                        ? "Beispiel-Einladung"
                        : "Einladungscode · 7 Tage gültig"}
                    </strong>
                    <p>
                      Teile direkt den Einladungslink – nach dem Anmelden per
                      Benutzername &amp; Passwort wird der Code automatisch
                      übernommen.
                    </p>
                    <div className="invite-code-row">
                      <code>{code}</code>
                      <button
                        className="icon-button"
                        aria-label="Einladungscode kopieren"
                        onClick={async () => {
                          try {
                            await navigator.clipboard.writeText(code);
                            setCopied("code");
                          } catch {
                            setCopied(null);
                          }
                        }}
                      >
                        {copied === "code" ? (
                          <Check size={18} />
                        ) : (
                          <Copy size={18} />
                        )}
                      </button>
                      {inviteUrl && (
                        <button
                          type="button"
                          className="button secondary compact-btn"
                          onClick={async () => {
                            if (typeof navigator.share === "function") {
                              try {
                                await navigator.share({
                                  title: `${data.group.name} · Minutenclub`,
                                  text: `Komm in unseren Minutenclub «${data.group.name}»:`,
                                  url: inviteUrl,
                                });
                                return;
                              } catch {
                                /* Fallback auf Zwischenablage */
                              }
                            }
                            try {
                              await navigator.clipboard.writeText(inviteUrl);
                              setCopied("link");
                            } catch {
                              setCopied(null);
                            }
                          }}
                        >
                          {copied === "link" ? (
                            <Check size={15} />
                          ) : (
                            <Share2 size={15} />
                          )}
                          {copied === "link"
                            ? "Link kopiert"
                            : "Einladungslink teilen"}
                        </button>
                      )}
                    </div>
                    <small>
                      Wer den Link oder Code hat, kann beitreten. Nur mit eurer
                      Crew teilen.
                    </small>
                  </div>
                )}
                <div className="members-list">
                  {data.members.map((m) => (
                    <div className="member-row" key={m.id}>
                      {avatar(m)}
                      <div className="member-name">
                        <strong>
                          {m.display_name}
                          {m.id === me?.id ? " (du)" : ""}
                        </strong>
                        <small>
                          {m.active
                            ? m.role === "admin"
                              ? "Administrator"
                              : "Mitglied"
                            : "Deaktiviert"}
                        </small>
                      </div>
                      <span className={`pill ${m.active ? "active" : "muted"}`}>
                        {m.active ? "Aktiv" : "Inaktiv"}
                      </span>
                      {(admin || m.id === me?.id) && (
                        <div className="member-actions">
                          <button
                            className="text-link"
                            disabled={p.busy}
                            onClick={(e) => {
                              setRenameMember(m);
                              open("rename", e.detail);
                            }}
                          >
                            Name ändern
                            <span className="sr-only">
                              {" "}
                              von {m.display_name}
                            </span>
                          </button>
                          {admin && (
                            <>
                              <label
                                className="sr-only"
                                htmlFor={`role-${m.id}`}
                              >
                                Rolle von {m.display_name}
                              </label>
                              <select
                                id={`role-${m.id}`}
                                value={m.role}
                                disabled={p.busy}
                                onChange={(e) =>
                                  void p.mutate("update_member", {
                                    p_member_id: m.id,
                                    p_role: e.target.value,
                                    p_active: m.active,
                                  })
                                }
                              >
                                <option value="member">Mitglied</option>
                                <option value="admin">Admin</option>
                              </select>
                              <button
                                className="text-link"
                                disabled={p.busy || m.id === me?.id}
                                onClick={() => {
                                  if (
                                    m.active &&
                                    !window.confirm(
                                      `${m.display_name} wirklich deaktivieren? Der Zugriff auf die Gruppe wird gesperrt, bisherige Buchungen bleiben erhalten.`,
                                    )
                                  )
                                    return;
                                  void p.mutate("update_member", {
                                    p_member_id: m.id,
                                    p_role: m.role,
                                    p_active: !m.active,
                                  });
                                }}
                              >
                                {m.active ? "Deaktivieren" : "Aktivieren"}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </section>
              <div className="notice">
                <ShieldCheck size={19} />
                <span>
                  Nur Admins können Guthaben gutschreiben, Paketkäufe erfassen
                  und Fahrten stornieren. Neue Mitglieder starten mit 0 Minuten.
                </span>
              </div>
              <PasswordDashboard
                me={me}
                ownUsername={p.ownUsername}
                admin={admin}
                members={data.members}
                accounts={data.accounts ?? []}
                resetRequests={data.reset_requests ?? []}
                busy={p.busy}
                renderAvatar={avatar}
                onSetMemberPassword={p.onSetMemberPassword}
                onCreateMemberAccount={p.onCreateMemberAccount}
                onDismissReset={async (resetId) =>
                  Boolean(
                    await p.mutate("dismiss_password_reset", {
                      p_reset_id: resetId,
                    }),
                  )
                }
                onUpdateOwnPassword={p.onUpdateOwnPassword}
              />

              <section className="panel">
                <PanelHeading
                  title={`Dein Zugang · ${me?.display_name ?? "Mitglied"}`}
                  description="Darstellung, Einführung, Feedback und Sitzung auf diesem Gerät."
                  aside={
                    <button
                      className="button secondary"
                      onClick={p.onLogout}
                      disabled={p.busy}
                    >
                      <LogOut size={16} />
                      Abmelden
                    </button>
                  }
                />
                <div className="account-preferences">
                  <div className="preference-row">
                    <div>
                      <strong>Darstellung</strong>
                      <small>Automatisch nach Gerät, Hell oder Dunkel</small>
                    </div>
                    <ThemeSegmented />
                  </div>
                  <div className="preference-row">
                    <div>
                      <strong>Einführung &amp; Rückmeldung</strong>
                      <small>
                        Interaktive Tour nochmals öffnen oder Feedback senden
                      </small>
                    </div>
                    <div className="preference-buttons">
                      <button
                        type="button"
                        className="button secondary compact-btn"
                        onClick={replayTour}
                      >
                        <Sparkles size={15} /> Einführung
                      </button>
                      <button
                        type="button"
                        className="button secondary compact-btn"
                        onClick={(e) =>
                          setFeedbackOpen({ motion: e.detail > 0 })
                        }
                      >
                        <MessageSquare size={15} /> Feedback
                      </button>
                    </div>
                  </div>
                  <div className="preference-row">
                    <div>
                      <strong>Dynamic Island &amp; Sperrbildschirm</strong>
                      <small>
                        iPhone-Kurzbefehl für Live-Timer und Fahrt-Eckdaten
                        einrichten
                      </small>
                    </div>
                    <div className="preference-buttons">
                      <button
                        type="button"
                        className="button secondary compact-btn"
                        onClick={(e) =>
                          setIslandGuideOpen({ motion: e.detail > 0 })
                        }
                      >
                        <Smartphone size={15} /> Einrichten
                      </button>
                      {activeUnlock && (
                        <a
                          href={buildStopLiveActivityUrl()}
                          className="button ghost compact-btn"
                        >
                          Island stoppen
                        </a>
                      )}
                    </div>
                  </div>
                  {admin && (
                    <div className="preference-row">
                      <div>
                        <strong>Admin Dev-Dashboard</strong>
                        <small>
                          GPS-Telemetrie pro Fahrt &amp; private 100-m-Crew-Orte
                          verwalten
                        </small>
                      </div>
                      <button
                        type="button"
                        className="button secondary compact-btn"
                        onClick={() => navigate("dev")}
                      >
                        <Terminal size={15} /> Dev-Dashboard öffnen
                      </button>
                    </div>
                  )}
                  <div className="preference-row">
                    <div>
                      <strong>Rechtliches &amp; Datenschutz</strong>
                      <small>
                        Datenschutzerklärung (CH DSG), Haftungsausschluss &amp;
                        Impressum
                      </small>
                    </div>
                    <div className="preference-buttons">
                      <Link
                        href="/datenschutz"
                        className="button secondary compact-btn"
                      >
                        <ShieldCheck size={15} /> Datenschutz
                      </Link>
                      <Link
                        href="/datenschutz#nutzungsbedingungen"
                        className="button secondary compact-btn"
                      >
                        Nutzungsbedingungen
                      </Link>
                    </div>
                  </div>
                </div>
                {p.groups.length > 1 && (
                  <div className="panel-footnote">
                    <label>
                      Gruppe wechseln
                      <select
                        value={data.group.id}
                        onChange={(e) => p.onGroup(e.target.value)}
                      >
                        {p.groups.map((g) => (
                          <option key={g.id} value={g.id}>
                            {g.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                )}
              </section>
            </>
          )}
          {tab === "dev" && admin && (
            <DevDashboard
              data={data}
              busy={p.busy}
              mutate={p.mutate}
              renderAvatar={avatar}
            />
          )}
          {p.demo && (
            <div className="demo-notice">
              <span>
                <strong>Demo-Modus</strong> · Beispieldaten, nur auf diesem
                Gerät gespeichert.
              </span>
              <button onClick={p.onResetDemo}>Zurücksetzen</button>
            </div>
          )}
          <footer className="app-footer">
            <span>
              {p.demo
                ? "Beispieldaten"
                : p.syncedAt
                  ? `Stand ${p.syncedAt.toLocaleTimeString("de-CH", { hour: "2-digit", minute: "2-digit" })}`
                  : "Wird geladen"}{" "}
              · Zürich · Unabhängiges Privatprojekt (keine Verbindung zu Dott)
            </span>
            <nav className="footer-legal-links" aria-label="Rechtliche Links">
              <Link href="/datenschutz">Datenschutz</Link>
              <Link href="/datenschutz#nutzungsbedingungen">
                Nutzungsbedingungen &amp; Haftung
              </Link>
              <Link href="/datenschutz#impressum">Impressum</Link>
            </nav>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile Navigation">
        {tabs.some((t) => t.id === tab) && (
          <span
            aria-hidden="true"
            className="tab-indicator"
            style={{
              transform: `translateX(${tabs.findIndex((t) => t.id === tab) * 100}%)`,
            }}
          />
        )}
        {tabs.map((t) => (
          <button
            key={t.id}
            aria-current={tab === t.id ? "page" : undefined}
            onClick={() => navigate(t.id)}
            className={tab === t.id ? "active" : ""}
          >
            <t.icon size={20} />
            <span>{t.label}</span>
          </button>
        ))}
      </nav>
      {modal && (
        <EntryDialog
          kind={modal.kind}
          motion={modal.motion}
          data={data}
          me={me}
          seed={rideSeed}
          voidRide={voidRide}
          renameMember={renameMember}
          busy={p.busy}
          remoteError={p.error}
          close={() => {
            setModal(null);
            setRideSeed(null);
          }}
          onStartUnlock={(spot, coRiderIds) => {
            const startedAt = new Date().toISOString();
            const next: ActiveUnlock = {
              groupId: data.group.id,
              userId: p.userId,
              startedAt,
              startLabel: spot.label.trim(),
              startLat: spot.lat,
              startLng: spot.lng,
              startGps: Boolean(spot.fromGps),
              coRiderIds,
            };
            saveActiveUnlock(next);
            setActiveUnlock(next);
            if (autoShortcut) {
              const names = [
                me?.display_name ?? "Du",
                ...coRiderIds.map(
                  (id) =>
                    data.members.find((m) => m.id === id)?.display_name ??
                    "Mitglied",
                ),
              ];
              const payload = buildLiveRidePayload({
                riderNames: names,
                startLabel: spot.label.trim() || undefined,
                remainingSeconds: own.balance,
                groupName: data.group.name,
                startedAt,
              });
              window.location.href = buildStartLiveActivityUrl(payload);
            }
          }}
          onFinishUnlock={() => {
            setWakeLockOn(false);
            clearActiveUnlock();
            setActiveUnlock(null);
          }}
          onSave={p.mutate}
        />
      )}
      {tour && (
        <OnboardingModal
          tour={tour}
          groupName={data.group.name}
          memberName={me?.display_name}
          onClose={() => setTour(null)}
          onOpenIslandGuide={() => setIslandGuideOpen({ motion: true })}
          onAcknowledge={(ids) => acknowledgeFeatures(p.userId, p.demo, ids)}
          onStartUnlock={
            me && !activeUnlock
              ? () => {
                  open("unlock", 1);
                }
              : undefined
          }
        />
      )}
      {feedbackOpen && (
        <FeedbackDialog
          motion={feedbackOpen.motion}
          demo={p.demo}
          currentPage={currentTabLabel}
          me={me}
          members={data.members}
          remoteFeedback={data.feedback ?? []}
          busy={p.busy}
          remoteError={p.error}
          onSave={p.mutate}
          onClose={() => setFeedbackOpen(null)}
        />
      )}
      {islandGuideOpen && (
        <DynamicIslandDialog
          motion={islandGuideOpen.motion}
          samplePayload={livePayload}
          autoShortcut={autoShortcut}
          onToggleAutoShortcut={(next) => {
            setAutoShortcut(next);
            saveAutoShortcutEnabled(next);
          }}
          onClose={() => setIslandGuideOpen(null)}
        />
      )}
    </div>
  );
}

function Metric({
  icon,
  label,
  value,
  unit,
  note,
}: {
  icon: ReactNode;
  label: string;
  value: string;
  unit?: string;
  note?: string;
}) {
  return (
    <div className="metric-card">
      <div className="card-label">
        <span>{label}</span>
        <span className="metric-icon">{icon}</span>
      </div>
      <div className="metric-value">
        {value}
        {unit && <span>{unit}</span>}
      </div>
      <p>{note}</p>
    </div>
  );
}

function PanelHeading({
  title,
  description,
  aside,
}: {
  title: string;
  description?: string;
  aside?: ReactNode;
}) {
  return (
    <div className="panel-heading">
      <div>
        <h2>{title}</h2>
        {description && <p>{description}</p>}
      </div>
      {aside}
    </div>
  );
}

function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <span className="empty-icon">
        <History size={23} />
      </span>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function ActivityChart({ rides }: { rides: Ride[] }) {
  const days = Array.from({ length: 14 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (13 - i));
    const key = zurichKey(d);
    return {
      key,
      label: new Intl.DateTimeFormat("de-CH", {
        day: "2-digit",
        month: "2-digit",
        timeZone: "Europe/Zurich",
      }).format(d),
      value: rides
        .filter((r) => zurichKey(new Date(r.occurred_at)) === key)
        .reduce((n, r) => n + r.charged_seconds / 60, 0),
    };
  });
  const max = Math.max(20, ...days.map((d) => d.value));
  return (
    <div
      className="chart"
      role="img"
      aria-label={`Minutenverbrauch der letzten 14 Tage: ${days.map((d) => `${d.label}: ${d.value} Minuten`).join(", ")}`}
    >
      <div className="chart-y">
        {[max, Math.round(max / 2), 0].map((n, i) => (
          <span key={i}>{n}</span>
        ))}
      </div>
      <div className="chart-plot">
        <div className="chart-grid">
          <i />
          <i />
          <i />
        </div>
        <div className="chart-bars">
          {days.map((d, i) => (
            <div key={d.key} className="chart-column">
              <div
                className={`chart-bar ${i === days.length - 1 ? "current" : ""}`}
                style={{
                  height: `${(d.value / max) * 100}%`,
                  minHeight: d.value ? 4 : 0,
                }}
                title={`${d.label}: ${d.value} Min.`}
              />
              <span className={i % 3 === 0 || i === 13 ? "" : "hidden-label"}>
                {d.label}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function EntryDialog({
  kind,
  motion,
  data,
  me,
  seed,
  voidRide,
  renameMember,
  busy,
  remoteError,
  close,
  onStartUnlock,
  onFinishUnlock,
  onSave,
}: {
  kind: Exclude<Modal, null>;
  motion: boolean;
  data: Snapshot;
  me?: Member;
  seed: RideSeed | null;
  voidRide: Ride | null;
  renameMember: Member | null;
  busy: boolean;
  remoteError: string;
  close: () => void;
  onStartUnlock: (spot: Spot, coRiderIds: string[]) => void;
  onFinishUnlock: () => void;
  onSave: Props["mutate"];
}) {
  const dialog = useRef<HTMLDialogElement>(null),
    first = useRef<HTMLInputElement>(null);
  const pointerSubmit = useRef(false);
  const [drive, setDrive] = useState(() => seed?.drive ?? ""),
    [pause, setPause] = useState("0"),
    [error, setError] = useState("");
  const [when] = useState(() => seed?.when ?? localDateTime());
  const [startSpot, setStartSpot] = useState<Spot>(
    () => seed?.startSpot ?? { label: "", lat: null, lng: null },
  );
  const [endSpot, setEndSpot] = useState<Spot>({
    label: "",
    lat: null,
    lng: null,
  });
  const [locating, setLocating] = useState<"start" | "end" | null>(null);
  const [packageMinutes, setPackageMinutes] = useState("");
  const [packagePrice, setPackagePrice] = useState("");
  const [contributions, setContributions] = useState<Record<string, string>>(
    {},
  );
  const [activeMembers] = useState(() => data.members.filter((m) => m.active));
  const otherActiveMembers = activeMembers.filter((m) => m.id !== me?.id);
  const [coRiderIds, setCoRiderIds] = useState<string[]>(() =>
    (seed?.coRiderIds ?? []).filter(
      (id) => id !== me?.id && activeMembers.some((m) => m.id === id),
    ),
  );
  const toggleCoRider = (id: string) =>
    setCoRiderIds((old) =>
      old.includes(id) ? old.filter((x) => x !== id) : [...old, id],
    );
  const placeSuggestions = useMemo(
    () => knownPlaceSuggestions(data.rides, 5, data.places ?? []),
    [data.rides, data.places],
  );

  const [splitMode, setSplitMode] = useState<SplitMode>("equal");
  const [excluded, setExcluded] = useState<string[]>([]);
  const [needs, setNeeds] = useState<Record<string, string>>({});
  const participatingCount = activeMembers.filter(
    (m) => !excluded.includes(m.id),
  ).length;
  let plan: TopupPlan = [];
  let allocation: ReturnType<typeof splitPackage> = [],
    priceOnlyPreview: ReturnType<typeof splitPackage> = [],
    allocationMessage = "",
    contributedRappen = 0,
    expectedRappen: number | null = null;
  if (kind === "package") {
    try {
      expectedRappen = packagePrice.trim() ? moneyRappen(packagePrice) : null;
    } catch {
      expectedRappen = null;
    }
    try {
      if (splitMode === "amount") {
        plan = activeMembers.map((m) => ({
          member_id: m.id,
          amount_rappen: moneyRappen(contributions[m.id] || "0"),
        }));
        contributedRappen = plan.reduce((sum, c) => sum + c.amount_rappen, 0);
      } else {
        plan = {
          mode: splitMode,
          shares: activeMembers
            .filter((m) => !excluded.includes(m.id))
            .map((m) => ({
              member_id: m.id,
              weight:
                splitMode === "equal"
                  ? 1
                  : wholeMinutes(needs[m.id] || "0", true),
            })),
        };
      }
      allocation = splitPackage(
        wholeMinutes(packageMinutes),
        moneyRappen(packagePrice),
        plan,
      );
    } catch (e) {
      if (
        splitMode === "equal" &&
        expectedRappen !== null &&
        expectedRappen >= 1
      ) {
        try {
          priceOnlyPreview = splitPackage(1, expectedRappen, plan);
        } catch {
          /* Mindestens eine Person muss ausgewählt sein */
        }
      }
      allocationMessage =
        e instanceof Error ? e.message : "Bitte Eingaben prüfen.";
    }
  }

  useLayoutEffect(() => {
    dialog.current?.showModal();
    first.current?.focus();
    const node = dialog.current;
    return () => node?.close();
  }, []);

  async function fetchSpot(target: "start" | "end") {
    setError("");
    setLocating(target);
    try {
      const spot = await requestCurrentSpot(data.rides, data.places ?? []);
      if (target === "start") setStartSpot(spot);
      else setEndSpot(spot);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Standort konnte nicht gelesen werden.",
      );
    } finally {
      setLocating(null);
    }
  }

  const title =
    kind === "unlock"
      ? "Dott entsperren"
      : kind === "ride"
        ? "Fahrt eintragen"
        : kind === "credit"
          ? "Minuten gutschreiben"
          : kind === "package"
            ? "Guthaben aufladen"
            : kind === "rename"
              ? "Name ändern"
              : "Fahrt stornieren";

  const description =
    kind === "unlock"
      ? "Merkt deine Startzeit und auf Wunsch deinen aktuellen Startort. Während der Fahrt findet keinerlei Ortung statt."
      : kind === "ride"
        ? "Trage die Zeiten aus deinen Fahrtdetails ein. Die Pause zählt mit, Orte sind freiwillig."
        : kind === "credit"
          ? "Kostenlose interne Gutschrift ohne Paketkauf. Für bezahlte Minuten nutze Guthaben aufladen."
          : kind === "package"
            ? "Trage Paketminuten und Preis ein. Wähle anschliessend, wie ihr beides aufteilt."
            : kind === "rename"
              ? "Der neue Name gilt in der ganzen Gruppe. Fahrten und Guthaben bleiben derselben Person zugeordnet."
              : voidRide?.shared_group_id
                ? "Geteilte Fahrt: Die Minuten werden allen Mitfahrenden mit je einer Gegenbuchung zurückgegeben. Die ursprüngliche Fahrt bleibt sichtbar."
                : "Die Minuten werden mit einer Gegenbuchung zurückgegeben. Die ursprüngliche Fahrt bleibt sichtbar.";

  async function dismiss(animate: boolean) {
    const node = dialog.current;
    if (!node || node.dataset.closing) return;
    node.dataset.closing = "true";
    if (animate && motion) {
      await Promise.allSettled(
        node.getAnimations().map((animation) => animation.finished),
      );
    }
    if (node.isConnected) close();
  }

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (busy || locating || dialog.current?.dataset.closing) return;
    setError("");
    const f = new FormData(e.currentTarget);
    const animate = pointerSubmit.current;
    pointerSubmit.current = false;
    try {
      if (kind === "unlock") {
        const cleanLabel = startSpot.label.trim();
        if (cleanLabel.length > 120)
          throw new Error("Ortsname darf höchstens 120 Zeichen lang sein.");
        onStartUnlock(
          {
            label: cleanLabel,
            lat: cleanLabel ? startSpot.lat : null,
            lng: cleanLabel ? startSpot.lng : null,
            fromGps: Boolean(cleanLabel && startSpot.fromGps),
          },
          coRiderIds,
        );
        await dismiss(animate);
        return;
      }

      let saved: boolean | string = false;
      const str = (k: string) => String(f.get(k) ?? "");
      if (kind === "ride") {
        const draft = rideDraft(drive, pause);
        const sLabel = startSpot.label.trim();
        const eLabel = endSpot.label.trim();
        if (sLabel.length > 120 || eLabel.length > 120)
          throw new Error("Ortsnamen dürfen höchstens 120 Zeichen lang sein.");
        saved = await onSave("record_ride", {
          p_drive_minutes: draft.duration_seconds / 60,
          p_pause_minutes: draft.pause_seconds / 60,
          p_occurred_at: new Date(str("when")).toISOString(),
          p_note: str("note"),
          p_start_label: sLabel,
          p_start_lat: sLabel ? startSpot.lat : null,
          p_start_lng: sLabel ? startSpot.lng : null,
          p_end_label: eLabel,
          p_end_lat: eLabel ? endSpot.lat : null,
          p_end_lng: eLabel ? endSpot.lng : null,
          p_co_rider_ids: coRiderIds,
          p_start_gps: Boolean(
            sLabel && startSpot.fromGps && startSpot.lat !== null,
          ),
          p_end_gps: Boolean(eLabel && endSpot.fromGps && endSpot.lat !== null),
          p_unlocked_via_app: Boolean(seed?.fromUnlock),
        });
        if (saved && seed?.fromUnlock) onFinishUnlock();
      } else if (kind === "credit")
        saved = await onSave("credit_minutes", {
          p_member_id: str("member"),
          p_minutes: wholeMinutes(str("minutes")),
          p_reason: str("reason"),
        });
      else if (kind === "package") {
        if (allocationMessage) throw new Error(allocationMessage);
        saved = await onSave("record_topup", {
          p_payer_id: str("member"),
          p_minutes: wholeMinutes(str("minutes")),
          p_price_rappen: moneyRappen(packagePrice),
          p_contributions: plan,
          p_purchased_at: new Date(str("when")).toISOString(),
          p_note: str("note"),
        });
      } else if (kind === "rename" && renameMember) {
        const name = str("display_name").trim();
        if (!name || name.length > 60)
          throw new Error("Bitte einen Namen mit 1 bis 60 Zeichen eingeben.");
        saved = await onSave("rename_member", {
          p_member_id: renameMember.id,
          p_display_name: name,
        });
      } else if (voidRide)
        saved = await onSave("void_ride", {
          p_ride_id: voidRide.id,
          p_reason: str("reason"),
        });
      if (saved) await dismiss(animate);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Bitte Eingaben prüfen.");
    }
  }

  return (
    <dialog
      ref={dialog}
      className="entry-dialog"
      data-motion={motion || undefined}
      aria-labelledby="dialog-title"
      onCancel={(e) => {
        e.preventDefault();
        if (!busy) void dismiss(false);
      }}
      onClick={(e) => {
        if (!busy && e.target === e.currentTarget) void dismiss(e.detail > 0);
      }}
    >
      <div className="dialog-inner">
        <button
          className="icon-button dialog-close"
          type="button"
          aria-label="Schliessen"
          onClick={(e) => void dismiss(e.detail > 0)}
          disabled={busy}
        >
          <X size={22} />
        </button>
        <span className="dialog-icon">
          {kind === "unlock" ? (
            <LocateFixed size={24} />
          ) : kind === "ride" ? (
            <Zap size={24} />
          ) : kind === "void" ? (
            <History size={24} />
          ) : kind === "rename" ? (
            <Users size={24} />
          ) : (
            <Wallet size={24} />
          )}
        </span>
        <h2 id="dialog-title">{title}</h2>
        <p>{description}</p>
        <form onSubmit={submit}>
          {kind === "unlock" && (
            <>
              <div className="notice privacy-inline-note">
                <ShieldCheck size={18} />
                <span>
                  Standort nur bei Verwendung: GPS wird ausschliesslich einmalig
                  beim Tippen auf den Standort-Button gelesen.
                </span>
              </div>

              <button
                type="button"
                className="button secondary wide location-trigger-btn"
                disabled={locating !== null}
                onClick={() => void fetchSpot("start")}
              >
                {locating === "start" ? (
                  <LoaderCircle size={18} className="spin" />
                ) : (
                  <LocateFixed size={18} />
                )}
                {locating === "start"
                  ? "Standort wird einmalig gelesen …"
                  : "Aktuellen Startort übernehmen"}
              </button>

              <label>
                <span>
                  Startort <span className="optional">optional</span>
                </span>
                <input
                  ref={first}
                  name="unlock_start"
                  maxLength={120}
                  value={startSpot.label}
                  onChange={(e) =>
                    setStartSpot((old) => ({
                      label: e.target.value,
                      lat: e.target.value.trim() ? old.lat : null,
                      lng: e.target.value.trim() ? old.lng : null,
                    }))
                  }
                  placeholder="z. B. Zürich HB oder leer lassen"
                />
              </label>

              <div className="quick-spots">
                <small>Schnellauswahl:</small>
                <div className="chip-row">
                  {placeSuggestions.map((spot) => (
                    <button
                      key={spot.label}
                      type="button"
                      className={`chip ${startSpot.label === spot.label ? "active" : ""}`}
                      onClick={() => setStartSpot(spot)}
                    >
                      {spot.label}
                    </button>
                  ))}
                </div>
              </div>

              {otherActiveMembers.length > 0 && (
                <div className="corider-picker">
                  <small>
                    Auf dem gleichen Scooter mitfahren?{" "}
                    <span className="optional">optional</span>
                  </small>
                  <div className="chip-row">
                    {otherActiveMembers.map((m) => {
                      const selected = coRiderIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`chip ${selected ? "active" : ""}`}
                          aria-pressed={selected}
                          onClick={() => toggleCoRider(m.id)}
                        >
                          {selected ? "✓ " : "+ "}
                          {m.display_name}
                        </button>
                      );
                    })}
                  </div>
                  {coRiderIds.length > 0 && (
                    <small className="corider-hint">
                      Zeit wird beim Abschliessen fair auf{" "}
                      {1 + coRiderIds.length} Personen aufgeteilt (du kannst das
                      auch während der Fahrt noch ändern).
                    </small>
                  )}
                </div>
              )}
            </>
          )}

          {kind === "rename" && (
            <label>
              Anzeigename
              <input
                ref={first}
                name="display_name"
                required
                maxLength={60}
                defaultValue={renameMember?.display_name}
                autoComplete="off"
              />
            </label>
          )}

          {kind === "ride" && (
            <>
              <div className="selected-person">
                <span className="avatar av-0">
                  {initials(me?.display_name ?? "?")}
                </span>
                <div>
                  <small>
                    {coRiderIds.length > 0
                      ? `GEMEINSAM UNTERWEGS (${1 + coRiderIds.length} PERSONEN)`
                      : "FAHRENDE PERSON"}
                  </small>
                  <strong>
                    {[
                      me?.display_name ?? "Mitglied",
                      ...coRiderIds.map(
                        (id) =>
                          activeMembers.find((m) => m.id === id)
                            ?.display_name ?? "Mitglied",
                      ),
                    ].join(" & ")}
                  </strong>
                </div>
                {coRiderIds.length > 0 ? (
                  <Users size={19} />
                ) : (
                  <ShieldCheck size={19} />
                )}
              </div>
              {otherActiveMembers.length > 0 && (
                <div className="corider-picker">
                  <small>
                    Mit auf dem gleichen Scooter{" "}
                    <span className="optional">optional · Zeit teilen</span>
                  </small>
                  <div className="chip-row">
                    {otherActiveMembers.map((m) => {
                      const selected = coRiderIds.includes(m.id);
                      return (
                        <button
                          key={m.id}
                          type="button"
                          className={`chip ${selected ? "active" : ""}`}
                          aria-pressed={selected}
                          onClick={() => toggleCoRider(m.id)}
                        >
                          {selected ? "✓ " : "+ "}
                          {m.display_name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="form-row">
                <label>
                  Fahrzeit (Minuten)
                  <input
                    ref={first}
                    name="drive"
                    required
                    inputMode="numeric"
                    type="number"
                    min="0"
                    max="10000000"
                    step="1"
                    value={drive}
                    onChange={(e) => setDrive(e.target.value)}
                    placeholder="z. B. 14"
                  />
                </label>
                <label>
                  Pause (Minuten)
                  <input
                    name="pause"
                    required
                    inputMode="numeric"
                    type="number"
                    min="0"
                    max="10000000"
                    step="1"
                    value={pause}
                    onChange={(e) => setPause(e.target.value)}
                  />
                </label>
              </div>
              {(() => {
                const driveMin = Math.max(0, Math.trunc(Number(drive || 0)));
                const pauseMin = Math.max(0, Math.trunc(Number(pause || 0)));
                const totalMin = driveMin + pauseMin;
                const totalRiders = 1 + coRiderIds.length;
                const previewShares =
                  coRiderIds.length > 0 && totalMin > 0 && me
                    ? splitRideSeconds(driveMin, pauseMin, [
                        me.id,
                        ...coRiderIds,
                      ])
                    : [];
                return (
                  <>
                    <div className="sum-line">
                      <span>
                        {coRiderIds.length > 0
                          ? `Wird auf ${totalRiders} Personen aufgeteilt (${totalMin} Min. gesamt)`
                          : "Wird vom Guthaben abgezogen"}
                      </span>
                      <strong>
                        {coRiderIds.length > 0
                          ? previewShares.length
                            ? `je ${minutes(previewShares[0].charged_seconds)} Min.`
                            : "0 Min."
                          : `${totalMin} Min.`}
                      </strong>
                    </div>
                    {previewShares.length > 1 && (
                      <div className="shared-split-preview" role="status">
                        {previewShares.map((s) => (
                          <span key={s.member_id} className="subtle-pill">
                            {activeMembers.find((m) => m.id === s.member_id)
                              ?.display_name ?? "Mitglied"}
                            : −{minutes(s.charged_seconds)} Min.
                          </span>
                        ))}
                      </div>
                    )}
                  </>
                );
              })()}

              <fieldset className="location-fieldset">
                <legend>Strecke &amp; Standort (optional)</legend>
                <p>
                  Einmalige Ortung nur beim Antippen – für eure Ziel- und
                  Uhrzeit-Statistik.
                </p>
                <div className="form-row">
                  <div className="field-group">
                    <label htmlFor="ride-start-label">Startort</label>
                    <div className="location-input-wrap">
                      <input
                        id="ride-start-label"
                        name="start_label"
                        maxLength={120}
                        value={startSpot.label}
                        onChange={(e) =>
                          setStartSpot((old) => ({
                            label: e.target.value,
                            lat: e.target.value.trim() ? old.lat : null,
                            lng: e.target.value.trim() ? old.lng : null,
                          }))
                        }
                        placeholder="z. B. Zürich HB"
                      />
                      <button
                        type="button"
                        className="icon-button locate-inline-btn"
                        aria-label="Aktuellen Startort einmalig erfassen"
                        title="Aktuellen Startort einmalig erfassen"
                        disabled={locating !== null}
                        onClick={() => void fetchSpot("start")}
                      >
                        {locating === "start" ? (
                          <LoaderCircle size={16} className="spin" />
                        ) : (
                          <LocateFixed size={16} />
                        )}
                      </button>
                    </div>
                  </div>

                  <div className="field-group">
                    <label htmlFor="ride-end-label">Zielort</label>
                    <div className="location-input-wrap">
                      <input
                        id="ride-end-label"
                        name="end_label"
                        maxLength={120}
                        value={endSpot.label}
                        onChange={(e) =>
                          setEndSpot((old) => ({
                            label: e.target.value,
                            lat: e.target.value.trim() ? old.lat : null,
                            lng: e.target.value.trim() ? old.lng : null,
                          }))
                        }
                        placeholder="z. B. Seefeld"
                      />
                      <button
                        type="button"
                        className="icon-button locate-inline-btn"
                        aria-label="Aktuellen Zielort einmalig erfassen"
                        title="Aktuellen Zielort einmalig erfassen"
                        disabled={locating !== null}
                        onClick={() => void fetchSpot("end")}
                      >
                        {locating === "end" ? (
                          <LoaderCircle size={16} className="spin" />
                        ) : (
                          <LocateFixed size={16} />
                        )}
                      </button>
                    </div>
                  </div>
                </div>

                <div className="chip-row">
                  {placeSuggestions.map((spot) => (
                    <button
                      key={spot.label}
                      type="button"
                      className={`chip ${endSpot.label === spot.label ? "active" : ""}`}
                      onClick={() => setEndSpot(spot)}
                    >
                      → {spot.label}
                    </button>
                  ))}
                </div>
              </fieldset>
            </>
          )}

          {(kind === "credit" || kind === "package") && (
            <>
              <label>
                {kind === "credit" ? "Guthaben für" : "Paket gekauft von"}
                <select name="member" defaultValue={me?.id}>
                  {data.members
                    .filter((m) => m.active)
                    .map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name}
                      </option>
                    ))}
                </select>
              </label>
              <label>
                Minuten
                <input
                  ref={first}
                  name="minutes"
                  required
                  inputMode="numeric"
                  type="number"
                  min="1"
                  max="10000000"
                  step="1"
                  placeholder="z. B. 200"
                  {...(kind === "package"
                    ? {
                        value: packageMinutes,
                        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
                          setPackageMinutes(e.target.value),
                      }
                    : {})}
                />
              </label>
              {kind === "package" && (
                <label>
                  Paketpreis (CHF)
                  <input
                    name="price"
                    required
                    inputMode="decimal"
                    placeholder="z. B. 90.00"
                    value={packagePrice}
                    onChange={(e) => setPackagePrice(e.target.value)}
                  />
                </label>
              )}
            </>
          )}

          {kind === "package" && (
            <fieldset className="contribution-fields">
              <legend>Paket aufteilen</legend>
              <div className="split-modes">
                {(
                  [
                    ["equal", "Fair aufteilen"],
                    ["amount", "Nach CHF-Beitrag"],
                    ["minutes", "Nach Minutenbedarf"],
                  ] as const
                ).map(([mode, label]) => (
                  <button
                    key={mode}
                    type="button"
                    aria-pressed={splitMode === mode}
                    onClick={() => {
                      setSplitMode(mode);
                      setError("");
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p>
                {splitMode === "equal"
                  ? participatingCount > 0
                    ? `Wähle, wer mitmacht (${participatingCount} von ${activeMembers.length} · je 1/${participatingCount} vom Preis & den Minuten).`
                    : "Wähle mindestens eine Person aus, die beim Paket mitmacht."
                  : splitMode === "minutes"
                    ? "Wähle die Personen und trage ihren Bedarf in ganzen Minuten ein. Der Preis folgt den Minutenanteilen."
                    : "Trage ein, wie viel jede Person in CHF gezahlt hat – die Minuten werden nach bezahltem Preis aufgeteilt."}
              </p>
              {activeMembers.map((m) => {
                const share = allocation.find((c) => c.member_id === m.id);
                const priceShare = priceOnlyPreview.find(
                  (c) => c.member_id === m.id,
                );
                const selected = !excluded.includes(m.id);
                const isAmount = splitMode === "amount";
                const inputId = `share-${m.id}`;
                return (
                  <div className="split-person" key={m.id}>
                    {isAmount ? (
                      <label htmlFor={inputId}>{m.display_name}</label>
                    ) : (
                      <label className="split-person-select">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={(e) => {
                            const checked = e.target.checked;
                            setExcluded((old) =>
                              checked
                                ? old.filter((id) => id !== m.id)
                                : [...old, m.id],
                            );
                          }}
                        />
                        {m.display_name}
                      </label>
                    )}
                    {splitMode === "equal" && (
                      <span className="split-fraction">
                        {selected && participatingCount > 0
                          ? `1/${participatingCount}`
                          : "–"}
                      </span>
                    )}
                    {(isAmount || (splitMode === "minutes" && selected)) && (
                      <input
                        id={inputId}
                        aria-label={
                          isAmount
                            ? m.display_name
                            : `Minutenbedarf von ${m.display_name}`
                        }
                        inputMode={isAmount ? "decimal" : "numeric"}
                        placeholder={isAmount ? "0.00" : "0"}
                        value={(isAmount ? contributions : needs)[m.id] ?? ""}
                        onChange={(e) => {
                          const value = e.target.value;
                          (isAmount ? setContributions : setNeeds)((old) => ({
                            ...old,
                            [m.id]: value,
                          }));
                        }}
                      />
                    )}
                    {share ? (
                      <small>
                        {share.minutes} Min. · {chf(share.amount_rappen)}
                      </small>
                    ) : priceShare ? (
                      <small>{chf(priceShare.amount_rappen)}</small>
                    ) : null}
                  </div>
                );
              })}
              {splitMode === "amount" && (
                <div className="sum-line">
                  <span>Beiträge gesamt</span>
                  <strong>
                    {chf(contributedRappen)}
                    {expectedRappen !== null ? ` / ${chf(expectedRappen)}` : ""}
                  </strong>
                </div>
              )}
              <div className="allocation-status" role="status">
                {!packageMinutes || !packagePrice
                  ? "Gib Paketminuten und Preis für die Vorschau ein."
                  : allocationMessage ||
                    `${packageMinutes} Minuten · ${chf(allocation.reduce((sum, c) => sum + c.amount_rappen, 0))} aufgeteilt`}
              </div>
              <small>
                Rundungsreste gehen an die grössten Nachkommaanteile. Bei
                Gleichstand entscheidet die Mitglieds-ID.
              </small>
            </fieldset>
          )}

          {(kind === "ride" || kind === "package") && (
            <>
              <label>
                {kind === "ride" ? "Fahrtzeitpunkt" : "Kaufzeitpunkt"}
                <input
                  type="datetime-local"
                  name="when"
                  required
                  defaultValue={when}
                />
                <small>
                  Zeitzone dieses Geräts; Anzeige der Übersicht in Zürich-Zeit.
                </small>
              </label>
              <label>
                Notiz <span className="optional">optional</span>
                <input
                  name="note"
                  maxLength={500}
                  placeholder={
                    kind === "ride"
                      ? "z. B. Vom Bahnhof nach Hause"
                      : "z. B. Gemeinsames Minutenpaket"
                  }
                />
              </label>
            </>
          )}

          {(kind === "credit" || kind === "void") && (
            <label>
              Grund
              <input
                ref={kind === "void" ? first : undefined}
                name="reason"
                required
                maxLength={500}
                placeholder={
                  kind === "credit"
                    ? "z. B. Anteil am Minutenpaket"
                    : "z. B. Fahrt doppelt erfasst"
                }
              />
            </label>
          )}

          {(error || remoteError) && (
            <div className="notice error" role="alert">
              {error || remoteError}
            </div>
          )}

          <div className="dialog-actions">
            <button
              className="button secondary"
              type="button"
              disabled={busy}
              onClick={(e) => void dismiss(e.detail > 0)}
            >
              Abbrechen
            </button>
            <button
              onClick={(e) => {
                pointerSubmit.current = e.detail > 0;
              }}
              className={`button ${kind === "void" ? "destructive" : "primary"}`}
              disabled={busy || locating !== null}
            >
              {busy ? (
                <LoaderCircle size={18} className="spin" />
              ) : (
                <Check size={18} />
              )}{" "}
              {busy
                ? "Wird gespeichert …"
                : kind === "void"
                  ? "Stornieren"
                  : kind === "unlock"
                    ? "Fahrt starten"
                    : "Speichern"}
            </button>
          </div>
        </form>
      </div>
    </dialog>
  );
}

function QuotaChart({ data }: { data: Snapshot }) {
  const rows = data.members
    .map((m) => ({ ...m, ...summary(data, m.id) }))
    .filter((m) => m.active || m.quota || m.consumed);
  const max = Math.max(60, ...rows.flatMap((m) => [m.quota, m.consumed]));
  return (
    <div className="quota-chart">
      <div className="quota-legend">
        <span>
          <i className="quota-swatch-total" />
          Kontingent insgesamt
        </span>
        <span>
          <i className="quota-swatch-used" />
          Bereits verbraucht
        </span>
      </div>
      <div className="quota-columns">
        {rows.map((m) => (
          <div className="quota-person" key={m.id}>
            <div
              className="quota-bars"
              role="img"
              aria-label={`${m.display_name}: ${minutes(m.consumed)} von ${minutes(m.quota)} Minuten verbraucht, ${minutes(m.balance)} Minuten übrig.`}
            >
              <div
                className="quota-back"
                style={{ height: `${(m.quota / max) * 100}%` }}
              />
              <div
                className="quota-used"
                style={{ height: `${(m.consumed / max) * 100}%` }}
              />
            </div>
            <strong className="quota-name">{m.display_name}</strong>
            <span>
              {minutes(m.consumed)} / {minutes(m.quota)} Min.
            </span>
            <small className={m.balance < 0 ? "negative" : ""}>
              {minutes(m.balance)} Min. übrig
            </small>
          </div>
        ))}
      </div>
      <p className="panel-footnote">
        Alle Balken haben dieselbe Skala. Stornierte Fahrten sind
        herausgerechnet.
      </p>
    </div>
  );
}
