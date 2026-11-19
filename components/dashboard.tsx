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
  Sparkles,
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
  allocateMinutes,
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
  clearActiveUnlock,
  knownPlaceSuggestions,
  loadActiveUnlock,
  requestCurrentSpot,
  saveActiveUnlock,
  type ActiveUnlock,
  type Spot,
} from "@/lib/location";
import { FeedbackDialog } from "./feedback-dialog";
import { LocationStats } from "./location-stats";
import {
  isOnboardingDone,
  markOnboardingDone,
  OnboardingModal,
} from "./onboarding-modal";
import { PasswordDashboard } from "./password-dashboard";
import { ThemeCycleButton, ThemeSegmented } from "./theme-toggle";

type Tab = "overview" | "rides" | "balance" | "stats" | "members";
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
  autoOpenTour?: boolean;
  onTourOpened?: () => void;
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

const routeText = (r: Ride) => {
  const s = r.start_label?.trim() ?? "";
  const e = r.end_label?.trim() ?? "";
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
  const [tourOpen, setTourOpen] = useState(false);
  const [tourBannerHidden, setTourBannerHidden] = useState(true);
  const [feedbackOpen, setFeedbackOpen] = useState<{ motion: boolean } | null>(
    null,
  );
  const [activeUnlock, setActiveUnlock] = useState<ActiveUnlock | null>(null);
  const [nowTick, setNowTick] = useState(() => Date.now());

  useEffect(() => {
    setTourBannerHidden(isOnboardingDone());
  }, []);

  useEffect(() => {
    if (p.autoOpenTour) {
      setTourOpen(true);
      p.onTourOpened?.();
    }
  }, [p]);

  useEffect(() => {
    setActiveUnlock(loadActiveUnlock(data.group.id, p.userId));
  }, [data.group.id, p.userId]);

  useEffect(() => {
    if (!activeUnlock) return;
    setNowTick(Date.now());
    const id = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(id);
  }, [activeUnlock]);

  const me = data.members.find((m) => m.user_id === p.userId && m.active);
  const admin = me?.role === "admin";
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

  const unlockElapsedMinutes = activeUnlock
    ? Math.max(
        1,
        Math.round(
          (nowTick - new Date(activeUnlock.startedAt).getTime()) / 60000,
        ),
      )
    : 0;

  function finishActiveUnlock(clickCount: number) {
    if (!activeUnlock) return;
    open("ride", clickCount, {
      drive: String(unlockElapsedMinutes),
      when: localDateTime(new Date(activeUnlock.startedAt)),
      startSpot: {
        label: activeUnlock.startLabel,
        lat: activeUnlock.startLat,
        lng: activeUnlock.startLng,
      },
      fromUnlock: true,
    });
  }

  const currentTabLabel = tabs.find((t) => t.id === tab)?.label ?? "Übersicht";

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

  const table = (rides: Ride[], compact = false) => (
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
          {rides.map((r) => {
            const route = routeText(r);
            return (
              <tr key={r.id} className={r.voided_at ? "voided" : ""}>
                <td>
                  <span className="person-cell">
                    {avatar(member(r.member_id), "small")}
                    <span>
                      {member(r.member_id)?.display_name ?? "Mitglied"}
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
                          {member(r.voided_by_member_id ?? "")?.display_name ??
                            "Person nicht hinterlegt"}
                          <br />+{minutes(r.charged_seconds)} Min. zurückgebucht
                        </small>
                      )}
                    </>
                  ) : (
                    r.note && <small>{r.note}</small>
                  )}
                </td>
                <td>
                  {minutes(r.duration_seconds)}{" "}
                  <span className="unit">Min.</span>
                </td>
                <td className="optional-column">
                  {minutes(r.pause_seconds)} <span className="unit">Min.</span>
                </td>
                <td>
                  <span className={`pill ${r.voided_at ? "muted" : "active"}`}>
                    {minutes(r.charged_seconds)} Min.
                    {r.voided_at ? " · storniert" : ""}
                  </span>
                </td>
                {!compact && (
                  <>
                    <td>
                      {r.voided_at ? (
                        <span className="unit">Entfällt</span>
                      ) : r.estimated_cost_rappen === null ? (
                        <span className="unit">Offen</span>
                      ) : (
                        <span>≈ {chf(r.estimated_cost_rappen)}</span>
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
      {rides.length === 0 && (
        <Empty
          title="Noch keine Fahrten"
          text="Sobald ihr eine Fahrt eintragt, erscheint sie hier."
        />
      )}
    </div>
  );

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

              {!tourBannerHidden && (
                <section className="onboarding-banner" aria-label="Einführung">
                  <div className="onboarding-banner-text">
                    <span className="onboarding-badge">
                      <Sparkles size={15} /> Neu im Minutenclub
                    </span>
                    <strong>
                      Entdecke Minutenpass, Dott-Entsperrung &amp;
                      Standort-Schutz
                    </strong>
                    <p>
                      Kurze interaktive Tour in 3 Schritten – jederzeit
                      überspringbar.
                    </p>
                  </div>
                  <div className="onboarding-banner-actions">
                    <button
                      type="button"
                      className="button secondary compact-btn"
                      onClick={() => setTourOpen(true)}
                    >
                      Tour starten <ArrowRight size={16} />
                    </button>
                    <button
                      type="button"
                      className="icon-button"
                      aria-label="Einführung ausblenden"
                      onClick={() => {
                        markOnboardingDone();
                        setTourBannerHidden(true);
                      }}
                    >
                      <X size={17} />
                    </button>
                  </div>
                </section>
              )}

              {activeUnlock && (
                <section
                  className="unlock-live-card"
                  role="status"
                  aria-live="polite"
                >
                  <div className="unlock-live-info">
                    <span className="unlock-pulse" aria-hidden="true" />
                    <div>
                      <strong>
                        Scooter entsperrt · ca. {unlockElapsedMinutes} Min.
                        unterwegs
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
                  <div className="unlock-live-actions">
                    <button
                      type="button"
                      className="button primary compact-btn"
                      onClick={(e) => finishActiveUnlock(e.detail)}
                    >
                      <Check size={16} /> Fahrt abschliessen
                    </button>
                    <button
                      type="button"
                      className="text-link"
                      onClick={() => {
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
                {table(sorted.slice(0, 5), true)}
              </section>
            </>
          )}
          {tab === "rides" && (
            <section className="panel">
              <PanelHeading
                title={
                  rideStatus === "voided"
                    ? `${shownRides.length} stornierte Fahrten`
                    : `${shownRides.length} Fahrten`
                }
                description={
                  rideStatus === "voided"
                    ? "Nach Stornozeitpunkt sortiert und gefiltert. Jede Fahrt bleibt mit Grund und Gegenbuchung erhalten."
                    : "Stornierte Fahrten bleiben zur Nachvollziehbarkeit erhalten."
                }
                aside={filters}
              />
              {table(shownRides)}
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
                  description="Paketpreis und Beiträge erfassen. Die Minuten werden entsprechend den bezahlten Anteilen gutgeschrieben."
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
                  Beiträge dokumentieren eure Zahlungen; die App führt keine
                  Überweisungen aus. Minuten werden nach bezahltem Anteil
                  verteilt. Paketkorrekturen, Verfall und Ausgleichszahlungen
                  sind für später vorgesehen.
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
                <Metric
                  icon={<History size={20} />}
                  label="Fahrten"
                  value={String(filtered.length)}
                  note="Im ausgewählten Zeitraum"
                />
                <Metric
                  icon={<Clock3 size={20} />}
                  label="Verbrauch"
                  value={minutes(
                    filtered.reduce((n, r) => n + r.charged_seconds, 0),
                  )}
                  unit="Minuten"
                  note="Fahrzeit + Pausierzeit"
                />
                <Metric
                  icon={<TrendingUp size={20} />}
                  label="Ø pro Fahrt"
                  value={minutes(
                    filtered.length
                      ? filtered.reduce((n, r) => n + r.charged_seconds, 0) /
                          filtered.length
                      : 0,
                  )}
                  unit="Minuten"
                  note="Inklusive Pausen"
                />
              </section>

              <LocationStats
                rides={filtered}
                members={data.members}
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
                        onClick={() => setTourOpen(true)}
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
              · Zürich
            </span>
          </footer>
        </main>
      </div>
      <nav className="mobile-nav" aria-label="Mobile Navigation">
        <span
          aria-hidden="true"
          className="tab-indicator"
          style={{
            transform: `translateX(${tabs.findIndex((t) => t.id === tab) * 100}%)`,
          }}
        />
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
          onStartUnlock={(spot) => {
            const next: ActiveUnlock = {
              groupId: data.group.id,
              userId: p.userId,
              startedAt: new Date().toISOString(),
              startLabel: spot.label.trim(),
              startLat: spot.lat,
              startLng: spot.lng,
            };
            saveActiveUnlock(next);
            setActiveUnlock(next);
          }}
          onFinishUnlock={() => {
            clearActiveUnlock();
            setActiveUnlock(null);
          }}
          onSave={p.mutate}
        />
      )}
      {tourOpen && (
        <OnboardingModal
          motion={true}
          groupName={data.group.name}
          memberName={me?.display_name}
          onClose={() => {
            setTourOpen(false);
            setTourBannerHidden(true);
          }}
          onStartUnlock={
            me
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
  onStartUnlock: (spot: Spot) => void;
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
  const placeSuggestions = useMemo(
    () => knownPlaceSuggestions(data.rides, 5),
    [data.rides],
  );

  let allocation: ReturnType<typeof allocateMinutes> = [],
    allocationMessage = "",
    contributedRappen = 0,
    expectedRappen: number | null = null;
  if (kind === "package") {
    try {
      const inputs = activeMembers.map((m) => ({
        member_id: m.id,
        amount_rappen: moneyRappen(contributions[m.id] || "0"),
      }));
      contributedRappen = inputs.reduce((n, c) => n + c.amount_rappen, 0);
      expectedRappen = moneyRappen(packagePrice);
      allocation = allocateMinutes(
        wholeMinutes(packageMinutes),
        expectedRappen,
        inputs,
      );
    } catch (e) {
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
      const spot = await requestCurrentSpot(data.rides);
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
            ? "Erfasse Paketminuten, Preis und die Beiträge eurer Crew. Eure Minutenanteile werden direkt gutgeschrieben."
            : kind === "rename"
              ? "Der neue Name gilt in der ganzen Gruppe. Fahrten und Guthaben bleiben derselben Person zugeordnet."
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
        onStartUnlock({
          label: cleanLabel,
          lat: cleanLabel ? startSpot.lat : null,
          lng: cleanLabel ? startSpot.lng : null,
        });
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
          p_contributions: allocation.map((c) => ({
            member_id: c.member_id,
            amount_rappen: c.amount_rappen,
          })),
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
                  <small>FAHRENDE PERSON</small>
                  <strong>{me?.display_name}</strong>
                </div>
                <ShieldCheck size={19} />
              </div>
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
              <div className="sum-line">
                <span>Wird vom Guthaben abgezogen</span>
                <strong>
                  {Math.max(0, Math.trunc(Number(drive || 0))) +
                    Math.max(0, Math.trunc(Number(pause || 0)))}{" "}
                  Min.
                </strong>
              </div>

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
              <legend>Wer hat wie viel beigetragen?</legend>
              <p>Trage die Beträge in CHF ein. Kein Beitrag = 0.00.</p>
              {activeMembers.map((m) => (
                <div className="contribution-row" key={m.id}>
                  <label htmlFor={`contribution-${m.id}`}>
                    {m.display_name}
                  </label>
                  <div>
                    <span>CHF</span>
                    <input
                      id={`contribution-${m.id}`}
                      inputMode="decimal"
                      placeholder="0.00"
                      value={contributions[m.id] ?? ""}
                      onChange={(e) =>
                        setContributions((old) => ({
                          ...old,
                          [m.id]: e.target.value,
                        }))
                      }
                    />
                  </div>
                  <strong>
                    {allocation.length
                      ? `${allocation.find((c) => c.member_id === m.id)?.minutes ?? 0} Min.`
                      : "–"}
                  </strong>
                </div>
              ))}
              <div className="sum-line">
                <span>Beiträge gesamt</span>
                <strong>
                  {chf(contributedRappen)}
                  {expectedRappen !== null ? ` / ${chf(expectedRappen)}` : ""}
                </strong>
              </div>
              <div className="allocation-status" role="status">
                {allocationMessage ||
                  `${packageMinutes} Minuten werden gemeinsam aufgeteilt.`}
              </div>
              <small>
                Ganze Minuten, Restminuten nach grösstem Nachkommaanteil. Bei
                Gleichstand entscheidet die feste Mitglieds-ID.
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
