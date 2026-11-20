"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  Check,
  ExternalLink,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  Lock,
  Sparkles,
  Ticket,
  User,
  Zap,
} from "lucide-react";
import {
  getSupabase,
  GroupAccessLost,
  listGroups,
  loadSnapshot,
} from "@/lib/supabase";
import {
  adminCreateMemberAccount,
  adminSetMemberPassword,
  emailToUsername,
  extractInviteToken,
  normalizeUsername,
  registerUsernameAccount,
  requestPasswordReset,
  updateOwnPassword,
  usernameToAuthEmail,
} from "@/lib/accounts";
import { DEMO_USER, demoAction, demoSnapshot } from "@/lib/demo";
import type { Action, Group, RpcArgs, Snapshot } from "@/lib/domain";
import { availableFeatures } from "@/lib/onboarding";
import { Dashboard } from "./dashboard";
import { OnboardingModal } from "./onboarding-modal";
import { ThemeCycleButton } from "./theme-toggle";

const DEMO_KEY = "minutenclub-demo-v1";
const INVITE_KEY = "minutenclub-pending-invite-v1";

function errorText(error: unknown) {
  if (error && typeof error === "object" && "message" in error) {
    const msg = String(error.message);
    if (/invalid login credentials/i.test(msg)) {
      return "Benutzername oder Passwort stimmt nicht.";
    }
    return msg;
  }
  return "Das hat nicht geklappt. Bitte erneut versuchen.";
}

export function ClubApp() {
  const [client] = useState(getSupabase);
  const [session, setSession] = useState<Session | null>(null);
  const [authReady, setAuthReady] = useState(!client);
  const userId = session?.user.id;
  const [demo, setDemo] = useState(false);
  const [groups, setGroups] = useState<Group[]>([]);
  const [groupId, setGroupId] = useState("");
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [groupsReady, setGroupsReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [connected, setConnected] = useState(false);
  const [online, setOnline] = useState(true);
  const [syncedAt, setSyncedAt] = useState<Date | null>(null);
  const [pendingInvite, setPendingInvite] = useState("");
  const [entryTour, setEntryTour] = useState(false);
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const command = useRef<{ payload: string; id: string } | null>(null);
  const busyRef = useRef(false);
  const createId = useRef<string | null>(null);

  const persistDemo = useCallback((next: Snapshot) => {
    setSnapshot(next);
    try {
      localStorage.setItem(DEMO_KEY, JSON.stringify(next));
    } catch {}
    setSyncedAt(new Date());
  }, []);

  const startDemo = useCallback(() => {
    let data = demoSnapshot();
    try {
      const stored = localStorage.getItem(DEMO_KEY);
      if (stored) data = JSON.parse(stored) as Snapshot;
    } catch {
      /* Demo bleibt auch ohne Browser-Speicher nutzbar. */
    }
    setDemo(true);
    setSnapshot(data);
    setError("");
    setSyncedAt(new Date());
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      const params = new URLSearchParams(window.location.search);
      if (params.get("demo") === "1") startDemo();
      const urlInvite = params.get("invite")?.trim() ?? "";
      if (urlInvite) {
        setPendingInvite(urlInvite);
        try {
          sessionStorage.setItem(INVITE_KEY, urlInvite);
        } catch {}
      } else {
        try {
          const saved = sessionStorage.getItem(INVITE_KEY);
          if (saved) setPendingInvite(saved);
        } catch {}
      }
      setOnline(navigator.onLine);
    });
    const on = () => setOnline(true),
      off = () => setOnline(false);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, [startDemo]);

  useEffect(() => {
    if (!client) return;
    let alive = true;
    client.auth.getSession().then(({ data, error }) => {
      if (!alive) return;
      if (error) setError(error.message);
      setSession(data.session);
      setAuthReady(true);
    });
    const { data } = client.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setAuthReady(true);
    });
    return () => {
      alive = false;
      data.subscription.unsubscribe();
    };
  }, [client]);

  const loadGroups = useCallback(async () => {
    if (!client) return;
    const result = await listGroups(client);
    setGroups(result);
    setGroupId((old) =>
      result.some((g) => g.id === old) ? old : (result[0]?.id ?? ""),
    );
    setGroupsReady(true);
  }, [client]);

  useEffect(() => {
    if (!userId || demo) return;
    let alive = true;
    listGroups(client!)
      .then((result) => {
        if (alive) {
          setGroups(result);
          setGroupId((old) =>
            result.some((g) => g.id === old) ? old : (result[0]?.id ?? ""),
          );
          setGroupsReady(true);
        }
      })
      .catch((e) => {
        if (alive) {
          setError(errorText(e));
          setGroupsReady(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [client, userId, demo]);

  useEffect(() => {
    if (demo || !client || !userId || !groupId) return;
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;
    let alive = true,
      sequence = 0;
    let timer: ReturnType<typeof setTimeout>;
    const load = async () => {
      const ticket = ++sequence;
      try {
        const result = await loadSnapshot(client, group);
        if (alive && ticket === sequence) {
          setSnapshot(result);
          setSyncedAt(new Date());
          setError("");
        }
      } catch (e) {
        if (alive && ticket === sequence) {
          setError(errorText(e));
          if (e instanceof GroupAccessLost) {
            setSnapshot(null);
            void loadGroups().catch((error) => setError(errorText(error)));
          }
        }
      }
    };
    refreshRef.current = load;
    void load();
    const schedule = () => {
      clearTimeout(timer);
      timer = setTimeout(() => void load(), 150);
    };
    const channel = client.channel(`club-${group.id}`);
    for (const table of [
      "groups",
      "memberships",
      "rides",
      "minute_entries",
      "packages",
      "package_contributions",
      "feedback",
      "password_reset_requests",
      "group_places",
    ]) {
      channel.on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table,
          filter: `${table === "groups" ? "id" : "group_id"}=eq.${group.id}`,
        },
        schedule,
      );
    }
    channel.on(
      "postgres_changes",
      { event: "*", schema: "public", table: "user_accounts" },
      schedule,
    );
    channel.subscribe((status) => {
      if (alive) {
        setConnected(status === "SUBSCRIBED");
        if (status === "SUBSCRIBED") void load();
      }
    });
    const visible = () => {
      if (document.visibilityState === "visible") void load();
    };
    const interval = setInterval(visible, 30000);
    window.addEventListener("online", schedule);
    window.addEventListener("focus", visible);
    document.addEventListener("visibilitychange", visible);
    return () => {
      alive = false;
      clearTimeout(timer);
      clearInterval(interval);
      refreshRef.current = async () => {};
      void client.removeChannel(channel);
      window.removeEventListener("online", schedule);
      window.removeEventListener("focus", visible);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [client, demo, userId, groupId, groups, loadGroups]);

  async function mutate(
    action: Action,
    args: RpcArgs,
  ): Promise<string | boolean> {
    if (busyRef.current) return false;
    if (!demo && !online) {
      setError("Du bist offline. Bitte wieder verbinden und erneut speichern.");
      return false;
    }
    busyRef.current = true;
    setBusy(true);
    setError("");
    const payload = JSON.stringify([groupId, action]);
    if (command.current?.payload !== payload)
      command.current = { payload, id: crypto.randomUUID() };
    try {
      const full = {
        ...args,
        p_group_id: demo ? "demo-group" : groupId,
        p_request_id: command.current.id,
      };
      let result: string | boolean = true;
      if (demo) {
        if (action === "create_invite") result = "demo-einladung";
        else if (action === "revoke_invites") result = true;
        else if (snapshot) {
          const next = demoAction(snapshot, action, full);
          persistDemo(next);
        }
      } else {
        const response = await client!.rpc(action, full);
        if (response.error) throw response.error;
        if (action === "create_invite") result = String(response.data);
        await refreshRef.current();
      }
      command.current = null;
      return result;
    } catch (e) {
      setError(errorText(e));
      return false;
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }

  async function handleSetMemberPassword(
    memberId: string,
    newPassword: string,
  ): Promise<boolean> {
    setError("");
    if (demo) {
      if (!snapshot) return false;
      const next = structuredClone(snapshot);
      const target = next.members.find((m) => m.id === memberId);
      if (!target) return false;
      const now = new Date().toISOString();
      next.accounts ??= [];
      const acc = next.accounts.find((a) => a.user_id === target.user_id);
      if (acc) acc.password_updated_at = now;
      for (const r of next.reset_requests ?? []) {
        if (r.member_id === memberId && r.status === "open") {
          r.status = "completed";
          r.resolved_at = now;
          r.resolved_by_member_id = "demo-0";
        }
      }
      persistDemo(next);
      return true;
    }
    if (!client) return false;
    await adminSetMemberPassword(client, groupId, memberId, newPassword);
    await refreshRef.current();
    return true;
  }

  async function handleCreateMemberAccount(args: {
    displayName: string;
    username: string;
    password: string;
    role: "member" | "admin";
  }): Promise<string | false> {
    setError("");
    if (demo) {
      if (!snapshot) return false;
      const cleanUser = normalizeUsername(args.username);
      if ((snapshot.accounts ?? []).some((a) => a.username === cleanUser)) {
        throw new Error("Dieser Benutzername ist bereits vergeben.");
      }
      const next = structuredClone(snapshot);
      const uid = `user-${crypto.randomUUID()}`;
      const mid = `demo-${crypto.randomUUID()}`;
      const now = new Date().toISOString();
      next.members.push({
        id: mid,
        group_id: next.group.id,
        user_id: uid,
        display_name: args.displayName.trim(),
        role: args.role,
        active: true,
      });
      next.accounts ??= [];
      next.accounts.push({
        user_id: uid,
        username: cleanUser,
        password_updated_at: now,
      });
      persistDemo(next);
      return cleanUser;
    }
    if (!client) return false;
    const created = await adminCreateMemberAccount(client, {
      groupId,
      ...args,
    });
    await refreshRef.current();
    return created;
  }

  async function handleUpdateOwnPassword(
    newPassword: string,
  ): Promise<boolean> {
    setError("");
    if (demo) {
      if (!snapshot) return false;
      const next = structuredClone(snapshot);
      const acc = (next.accounts ?? []).find((a) => a.user_id === DEMO_USER);
      if (acc) acc.password_updated_at = new Date().toISOString();
      persistDemo(next);
      return true;
    }
    if (!client) return false;
    await updateOwnPassword(client, newPassword);
    await refreshRef.current();
    return true;
  }

  async function setup(name: string, displayName: string, token?: string) {
    if (busyRef.current || !client) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    createId.current ??= crypto.randomUUID();
    try {
      const cleanToken = token ? extractInviteToken(token) : undefined;
      const response = cleanToken
        ? await client.rpc("join_group", {
            p_token: cleanToken,
            p_display_name: displayName,
          })
        : await client.rpc("create_group", {
            p_name: name,
            p_display_name: displayName,
            p_request_id: createId.current,
          });
      if (response.error) throw response.error;
      createId.current = null;
      setPendingInvite("");
      try {
        sessionStorage.removeItem(INVITE_KEY);
      } catch {}
      if (window.location.search.includes("invite="))
        window.history.replaceState({}, "", window.location.pathname);
      await loadGroups();
      setGroupId(String(response.data));
    } catch (e) {
      setError(errorText(e));
    } finally {
      setBusy(false);
      busyRef.current = false;
    }
  }

  async function logout() {
    if (busyRef.current) return;
    if (client) {
      const { error } = await client.auth.signOut();
      if (error) {
        setError(error.message);
        return;
      }
    }
    setDemo(false);
    setSnapshot(null);
    setSession(null);
    setGroups([]);
    setGroupId("");
    setGroupsReady(false);
    setError("");
    setSyncedAt(null);
    command.current = null;
    if (window.location.search)
      window.history.replaceState({}, "", window.location.pathname);
  }

  const ownUsername = demo
    ? "oskar"
    : ((session?.user.app_metadata?.username as string | undefined) ??
      emailToUsername(session?.user.email));

  const activeMember = snapshot?.members.find(
    (m) => m.user_id === (demo ? DEMO_USER : userId) && m.active,
  );

  if (
    (demo || session) &&
    snapshot &&
    (demo || (snapshot.group.id === groupId && activeMember))
  )
    return (
      <Dashboard
        key={`${demo ? "demo" : userId}-${activeMember?.role}`}
        data={snapshot}
        groups={demo ? [snapshot.group] : groups}
        userId={demo ? DEMO_USER : session!.user.id}
        ownUsername={ownUsername}
        demo={demo}
        online={online}
        connected={connected}
        syncedAt={syncedAt}
        error={error}
        busy={busy}
        mutate={mutate}
        onSetMemberPassword={handleSetMemberPassword}
        onCreateMemberAccount={handleCreateMemberAccount}
        onUpdateOwnPassword={handleUpdateOwnPassword}
        onGroup={(id) => {
          setGroupId(id);
          setConnected(false);
          setSyncedAt(null);
        }}
        onLogout={logout}
        onBeginAction={() => {
          command.current = null;
        }}
        onRefresh={() => void refreshRef.current()}
        onResetDemo={() => {
          try {
            localStorage.removeItem(DEMO_KEY);
          } catch {
            /* Demo auch ohne Storage zurücksetzen. */
          }
          setSnapshot(demoSnapshot());
        }}
      />
    );

  return (
    <main className="entry-page">
      <div className="entry-header">
        <div className="entry-brand">
          <span className="brand-icon">
            <Zap size={23} fill="currentColor" />
          </span>
          minutenclub<span className="brand-dot">.</span>
        </div>
        <div className="entry-header-actions">
          <button
            type="button"
            className="button secondary compact-btn"
            onClick={() => setEntryTour(true)}
          >
            <Sparkles size={16} />
            So funktioniert&apos;s
          </button>
          <ThemeCycleButton />
        </div>
      </div>

      <div className="entry-layout">
        <section className="entry-intro">
          <h1>
            Euer gemeinsames <span>Minutenkonto.</span>
          </h1>
          <p>
            Teilt eure Dott-Minutenpakete, entsperrt Fahrten mit freiwilligem
            Standort-Schutz und seht, wie viele Minuten euch in Zürich noch
            bleiben.
          </p>
          <div className="entry-highlights">
            <span>
              <Ticket size={15} /> Anmeldung per Benutzername &amp; Passwort
            </span>
            <span>
              <Sparkles size={15} /> Standort nur aktiv beim Tippen
            </span>
          </div>
        </section>

        <section className="entry-card">
          {pendingInvite && !session && (
            <div className="notice invite-banner" role="status">
              <Ticket size={18} />
              <span>
                Einladung erkannt – melde dich an oder erstelle kurz einen
                Benutzernamen, dein Code wird danach automatisch übernommen.
              </span>
            </div>
          )}
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
          {!authReady ? (
            <Loading />
          ) : !client && !demo ? (
            <>
              <h2>Minutenclub ausprobieren</h2>
              <p>
                Probiert die App mit Beispieldaten aus. Für eure gemeinsamen
                Daten verbindet ihr sie einmal mit Supabase.
              </p>
              <button className="button primary wide" onClick={startDemo}>
                Demo ausprobieren <ArrowRight size={18} />
              </button>
              <button
                type="button"
                className="button secondary wide entry-secondary-cta"
                onClick={() => setEntryTour(true)}
              >
                <Sparkles size={17} /> Interaktive Einführung ansehen
              </button>
              <a
                className="text-link"
                href="https://github.com/dnd67/dott-minuten/blob/main/docs/setup.md"
                target="_blank"
                rel="noreferrer"
              >
                Einrichtung für Supabase &amp; Vercel <ExternalLink size={15} />
              </a>
              <small>Die Demo speichert nur auf diesem Gerät.</small>
            </>
          ) : session ? (
            !groupsReady ? (
              <Loading />
            ) : groups.length === 0 || pendingInvite ? (
              <GroupSetup
                busy={busy}
                defaultDisplayName={ownUsername}
                initialToken={pendingInvite}
                onSubmit={setup}
              />
            ) : (
              <>
                <Loading />
                <button
                  className="button secondary"
                  onClick={() => void refreshRef.current()}
                >
                  Erneut laden
                </button>
                <button
                  className="text-link"
                  onClick={() =>
                    void loadGroups().catch((e) => setError(errorText(e)))
                  }
                >
                  Gruppenliste neu laden
                </button>
                <button className="text-link" onClick={logout}>
                  Abmelden
                </button>
              </>
            )
          ) : (
            <AuthForm
              client={client!}
              pendingInvite={pendingInvite}
              onInviteCaptured={(tok) => {
                setPendingInvite(tok);
                try {
                  sessionStorage.setItem(INVITE_KEY, tok);
                } catch {}
              }}
              startDemo={startDemo}
            />
          )}
          {session && (groups.length === 0 || Boolean(pendingInvite)) && (
            <button className="text-link" disabled={busy} onClick={logout}>
              Abmelden
            </button>
          )}
        </section>
      </div>

      <footer className="entry-footer">
        <span>Unabhängiges Privatprojekt · Keine Verbindung zu Dott</span>
        <nav className="footer-legal-links" aria-label="Rechtliche Hinweise">
          <Link href="/datenschutz">Datenschutzerklärung</Link>
          <Link href="/datenschutz#nutzungsbedingungen">
            Nutzungsbedingungen &amp; Haftung
          </Link>
          <Link href="/datenschutz#impressum">Impressum</Link>
        </nav>
      </footer>

      {entryTour && (
        <OnboardingModal
          tour={{ features: availableFeatures(false), updates: false }}
          groupName="Minutenclub"
          onClose={() => setEntryTour(false)}
        />
      )}
    </main>
  );
}

function Loading() {
  return (
    <div className="loading">
      <LoaderCircle className="spin" size={24} />
      <span>Dein Minutenclub wird geladen …</span>
    </div>
  );
}

function AuthForm({
  client,
  pendingInvite,
  onInviteCaptured,
  startDemo,
}: {
  client: NonNullable<ReturnType<typeof getSupabase>>;
  pendingInvite: string;
  onInviteCaptured: (token: string) => void;
  startDemo: () => void;
}) {
  const [mode, setMode] = useState<"login" | "register" | "reset">(
    pendingInvite ? "register" : "login",
  );
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [inviteInput, setInviteInput] = useState<string | null>(null);
  const [requiresInvite, setRequiresInvite] = useState(true);
  const [acceptedLegal, setAcceptedLegal] = useState(false);
  const [showPw, setShowPw] = useState(false);
  const [resetNote, setResetNote] = useState("");
  const [resetSent, setResetSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const effectiveInvite = inviteInput ?? pendingInvite;

  useEffect(() => {
    let alive = true;
    client
      .rpc("registration_requires_invite")
      .then(({ data, error: rpcErr }) => {
        if (!alive || rpcErr) return;
        if (typeof data === "boolean") setRequiresInvite(data);
      });
    return () => {
      alive = false;
    };
  }, [client]);

  function switchMode(next: "login" | "register" | "reset") {
    setMode(next);
    setError("");
    setResetSent(false);
  }

  return (
    <>
      <div className="auth-tabs" role="tablist" aria-label="Zugangsart">
        <button
          type="button"
          role="tab"
          aria-selected={mode === "login"}
          className={mode === "login" ? "active" : ""}
          onClick={() => switchMode("login")}
        >
          Anmelden
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === "register"}
          className={mode === "register" ? "active" : ""}
          onClick={() => switchMode("register")}
        >
          Konto erstellen
        </button>
      </div>

      <h2>
        {mode === "login"
          ? "Willkommen zurück"
          : mode === "register"
            ? "Neues Konto erstellen"
            : "Passwort zurücksetzen"}
      </h2>
      <p>
        {mode === "login"
          ? "Melde dich direkt mit deinem Benutzernamen und Passwort an – ganz ohne E-Mail-Code."
          : mode === "register"
            ? requiresInvite
              ? "Erstelle dein Konto mit einem Einladungscode von eurem Gruppen-Admin (Invite-Only Schutz)."
              : "Wähle deinen Benutzernamen und ein Passwort (mind. 6 Zeichen), um den ersten Club zu gründen."
            : "Sende eine Anfrage an euren Gruppen-Admin. Er kann dir im Passwort-Dashboard sofort ein neues Passwort setzen."}
      </p>

      {mode === "reset" && resetSent ? (
        <div className="notice" role="status">
          <Check size={18} />
          <span>
            Anfrage gesendet! Sag deinem Gruppen-Admin kurz Bescheid – er sieht
            sie direkt im Passwort-Dashboard unter «Mitglieder» und gibt dir ein
            neues Passwort.
          </span>
        </div>
      ) : (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError("");
            try {
              const cleanUser = normalizeUsername(username);
              if (mode === "reset") {
                await requestPasswordReset(cleanUser, resetNote);
                setResetSent(true);
                return;
              }
              if (mode === "register") {
                const cleanInvite = extractInviteToken(effectiveInvite);
                await registerUsernameAccount(cleanUser, password, cleanInvite);
                if (cleanInvite) {
                  onInviteCaptured(cleanInvite);
                }
              }
              const { error: signInErr } = await client.auth.signInWithPassword(
                {
                  email: usernameToAuthEmail(cleanUser),
                  password,
                },
              );
              if (signInErr) throw signInErr;
            } catch (err) {
              setError(errorText(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          {mode === "register" && (
            <label>
              <span>
                Einladungscode{" "}
                {!requiresInvite && (
                  <span className="optional">optional beim Gründer-Konto</span>
                )}
              </span>
              <div className="input-icon">
                <Ticket size={18} />
                <input
                  type="text"
                  required={requiresInvite}
                  maxLength={300}
                  autoCapitalize="none"
                  autoCorrect="off"
                  placeholder={
                    requiresInvite
                      ? "Code oder Einladungslink einfügen"
                      : "Leer lassen für erstes Gründer-Konto"
                  }
                  value={effectiveInvite}
                  onChange={(e) => setInviteInput(e.target.value)}
                />
              </div>
            </label>
          )}

          <label>
            Benutzername
            <div className="input-icon">
              <User size={18} />
              <input
                type="text"
                required
                minLength={2}
                maxLength={32}
                autoCapitalize="none"
                autoCorrect="off"
                autoComplete="username"
                placeholder="z. B. oskar"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
              />
            </div>
          </label>

          {mode !== "reset" ? (
            <div className="field-group">
              <label htmlFor="auth-password">Passwort</label>
              <div className="input-icon location-input-wrap">
                <Lock size={18} />
                <input
                  id="auth-password"
                  type={showPw ? "text" : "password"}
                  required
                  minLength={6}
                  maxLength={128}
                  autoComplete={
                    mode === "register" ? "new-password" : "current-password"
                  }
                  placeholder={
                    mode === "register"
                      ? "Mindestens 6 Zeichen"
                      : "Dein Passwort"
                  }
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
                <button
                  type="button"
                  className="icon-button locate-inline-btn"
                  aria-label={
                    showPw ? "Passwort verbergen" : "Passwort anzeigen"
                  }
                  onClick={() => setShowPw((v) => !v)}
                >
                  {showPw ? <EyeOff size={17} /> : <Eye size={17} />}
                </button>
              </div>
            </div>
          ) : (
            <label>
              <span>
                Hinweis für den Admin <span className="optional">optional</span>
              </span>
              <input
                type="text"
                maxLength={300}
                placeholder="z. B. Neues Handy / Passwort vergessen"
                value={resetNote}
                onChange={(e) => setResetNote(e.target.value)}
              />
            </label>
          )}

          {mode === "register" && (
            <label className="legal-consent">
              <input
                type="checkbox"
                required
                checked={acceptedLegal}
                onChange={(e) => setAcceptedLegal(e.target.checked)}
              />
              <span>
                Ich habe die{" "}
                <Link href="/datenschutz">Datenschutzerklärung</Link> sowie die{" "}
                <Link href="/datenschutz#nutzungsbedingungen">
                  Nutzungsbedingungen &amp; den Haftungsausschluss
                </Link>{" "}
                gelesen und akzeptiere sie.
              </span>
            </label>
          )}

          {error && (
            <p role="alert" className="notice error">
              {error}
            </p>
          )}

          <button className="button primary wide" disabled={busy}>
            {busy ? (
              <LoaderCircle size={18} className="spin" />
            ) : mode === "reset" ? (
              <>
                <KeyRound size={18} /> Zurücksetzung anfragen
              </>
            ) : (
              <>
                {mode === "register" ? "Konto erstellen & starten" : "Anmelden"}{" "}
                <ArrowRight size={18} />
              </>
            )}
          </button>
        </form>
      )}

      <div className="auth-footer-links">
        {mode !== "reset" ? (
          <button
            type="button"
            className="text-link"
            onClick={() => switchMode("reset")}
          >
            Passwort vergessen?
          </button>
        ) : (
          <button
            type="button"
            className="text-link"
            onClick={() => switchMode("login")}
          >
            Zurück zum Login
          </button>
        )}
        <button type="button" className="text-link" onClick={startDemo}>
          Demo ansehen
        </button>
      </div>
    </>
  );
}

function GroupSetup({
  busy,
  defaultDisplayName,
  initialToken,
  onSubmit,
}: {
  busy: boolean;
  defaultDisplayName?: string;
  initialToken?: string;
  onSubmit: (name: string, displayName: string, token?: string) => void;
}) {
  const [join, setJoin] = useState(Boolean(initialToken));
  const prettyDefault = defaultDisplayName
    ? defaultDisplayName.charAt(0).toUpperCase() + defaultDisplayName.slice(1)
    : "";
  return (
    <>
      <h2>{join ? "Zu eurer Crew" : "Gründe euren Club"}</h2>
      <p>
        {join
          ? "Den Einladungscode bekommst du von eurem Admin – per Einladungslink ist er bereits ausgefüllt."
          : "Du wirst Admin und kannst im Passwort-Dashboard Freunde einladen oder direkt Konten für sie anlegen."}
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          onSubmit(
            String(f.get("group") ?? ""),
            String(f.get("name")),
            join ? String(f.get("token")) : undefined,
          );
        }}
      >
        <label>
          Dein Anzeigename
          <input
            name="name"
            required
            maxLength={60}
            defaultValue={prettyDefault}
            placeholder="Oskar"
            autoComplete="given-name"
          />
        </label>
        {join ? (
          <label>
            Einladungscode
            <input
              name="token"
              required
              defaultValue={initialToken ?? ""}
              autoCapitalize="none"
              autoCorrect="off"
              placeholder="Code einfügen"
            />
          </label>
        ) : (
          <label>
            Name eurer Gruppe
            <input
              name="group"
              required
              maxLength={80}
              defaultValue="Zürich Crew"
            />
          </label>
        )}
        <button className="button primary wide" disabled={busy}>
          {busy
            ? "Wird gespeichert …"
            : join
              ? "Gruppe beitreten"
              : "Gruppe erstellen"}
          <ArrowRight size={18} />
        </button>
      </form>
      <button className="text-link" onClick={() => setJoin(!join)}>
        {join
          ? "Eine neue Gruppe erstellen"
          : "Ich habe schon einen Einladungscode"}
      </button>
    </>
  );
}
