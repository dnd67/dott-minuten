"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  ArrowRight,
  Zap,
  LoaderCircle,
  Mail,
  ExternalLink,
} from "lucide-react";
import {
  getSupabase,
  GroupAccessLost,
  listGroups,
  loadSnapshot,
} from "@/lib/supabase";
import { DEMO_USER, demoAction, demoSnapshot } from "@/lib/demo";
import type { Action, Group, RpcArgs, Snapshot } from "@/lib/domain";
import { Dashboard } from "./dashboard";

const DEMO_KEY = "minutenclub-demo-v1";
function errorText(error: unknown) {
  if (error && typeof error === "object" && "message" in error)
    return String(error.message);
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
  const refreshRef = useRef<() => Promise<void>>(async () => {});
  const command = useRef<{ payload: string; id: string } | null>(null);
  const busyRef = useRef(false);
  const createId = useRef<string | null>(null);

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
      if (new URLSearchParams(window.location.search).get("demo") === "1")
        startDemo();
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
  }, [client, userId, demo]); // Token-Refresh setzt die Gruppenansicht nicht zurück.
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
    const payload = JSON.stringify([groupId, action, args]);
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
        else if (snapshot) {
          const next = demoAction(snapshot, action, full);
          setSnapshot(next);
          try {
            localStorage.setItem(DEMO_KEY, JSON.stringify(next));
          } catch {}
        }
        setSyncedAt(new Date());
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
  async function setup(name: string, displayName: string, token?: string) {
    if (busyRef.current || !client) return;
    busyRef.current = true;
    setBusy(true);
    setError("");
    createId.current ??= crypto.randomUUID();
    try {
      const response = token
        ? await client.rpc("join_group", {
            p_token: token,
            p_display_name: displayName,
          })
        : await client.rpc("create_group", {
            p_name: name,
            p_display_name: displayName,
            p_request_id: createId.current,
          });
      if (response.error) throw response.error;
      createId.current = null;
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
  if (
    (demo || session) &&
    snapshot &&
    (demo ||
      (snapshot.group.id === groupId &&
        snapshot.members.some((m) => m.user_id === userId && m.active)))
  )
    return (
      <Dashboard
        data={snapshot}
        groups={demo ? [snapshot.group] : groups}
        userId={demo ? DEMO_USER : session!.user.id}
        demo={demo}
        online={online}
        connected={connected}
        syncedAt={syncedAt}
        error={error}
        busy={busy}
        mutate={mutate}
        onGroup={(id) => {
          setGroupId(id);
          setConnected(false);
          setSyncedAt(null);
        }}
        onLogout={logout}
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
      <div className="entry-brand">
        <span className="brand-icon">
          <Zap size={23} fill="currentColor" />
        </span>
        minutenclub<span className="brand-dot">.</span>
      </div>
      <div className="entry-layout">
        <section className="entry-intro">
          <span className="eyebrow">ZUSAMMEN WEITERKOMMEN</span>
          <h1>
            Eure Crew.
            <br />
            Eure Minuten.
            <br />
            <span>Alles im Blick.</span>
          </h1>
          <p>
            Weniger Kopfrechnen, mehr unterwegs sein. Teilt eure Minutenpakete
            und behaltet gemeinsam den Überblick.
          </p>
          <div className="entry-people">
            <span className="avatar av-0">O</span>
            <span className="avatar av-1">A</span>
            <span className="avatar av-2">M</span>
            <span>Ein Konto für die ganze Crew.</span>
          </div>
        </section>
        <section className="entry-card">
          {error && (
            <div role="alert" className="notice error">
              {error}
            </div>
          )}
          {!authReady ? (
            <Loading />
          ) : !client && !demo ? (
            <>
              <span className="eyebrow">BEREIT FÜR EURE CREW</span>
              <h2>Das ist euer Minutenclub.</h2>
              <p>
                Probiert die App mit Beispieldaten aus. Für eure gemeinsamen
                Daten verbindet ihr sie einmal mit Supabase.
              </p>
              <button className="button primary wide" onClick={startDemo}>
                Demo ausprobieren <ArrowRight size={18} />
              </button>
              <a
                className="text-link"
                href="https://github.com/dnd67/dott-minuten/blob/main/docs/setup.md"
                target="_blank"
                rel="noreferrer"
              >
                Einrichtung für Supabase & Vercel <ExternalLink size={15} />
              </a>
              <small>Die Demo speichert nur auf diesem Gerät.</small>
            </>
          ) : session ? (
            !groupsReady ? (
              <Loading />
            ) : groups.length === 0 ? (
              <GroupSetup busy={busy} onSubmit={setup} />
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
            <AuthForm client={client!} startDemo={startDemo} />
          )}
          {session && groups.length === 0 && (
            <button className="text-link" disabled={busy} onClick={logout}>
              Abmelden
            </button>
          )}
        </section>
      </div>
      <footer className="entry-footer">
        Für gemeinsame Wege in Zürich.{" "}
        <span>Unabhängiges Projekt · Keine Verbindung zu Dott</span>
      </footer>
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
  startDemo,
}: {
  client: NonNullable<ReturnType<typeof getSupabase>>;
  startDemo: () => void;
}) {
  const [email, setEmail] = useState(""),
    [token, setToken] = useState(""),
    [sent, setSent] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  return (
    <>
      <span className="eyebrow">WILLKOMMEN ZURÜCK</span>
      <h2>Steig wieder ein.</h2>
      <p>
        Melde dich mit deiner eigenen E-Mail-Adresse an. Du erhältst einen
        einmaligen Anmeldecode per E-Mail.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          setError("");
          try {
            const response = sent
              ? await client.auth.verifyOtp({
                  email: email.trim(),
                  token: token.trim(),
                  type: "email",
                })
              : await client.auth.signInWithOtp({
                  email: email.trim(),
                  options: { emailRedirectTo: window.location.origin },
                });
            if (response.error) throw response.error;
            if (!sent) setSent(true);
          } catch (error) {
            setError(errorText(error));
          } finally {
            setBusy(false);
          }
        }}
      >
        <label>
          E-Mail-Adresse
          <div className="input-icon">
            <Mail size={18} />
            <input
              type="email"
              required
              autoComplete="email"
              placeholder="du@beispiel.ch"
              value={email}
              disabled={sent}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </label>
        {sent && (
          <label>
            Anmeldecode
            <input
              autoFocus
              required
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6,10}"
              minLength={6}
              maxLength={10}
              value={token}
              onChange={(e) => setToken(e.target.value)}
              placeholder="Code aus deiner E-Mail"
            />
          </label>
        )}
        {error && (
          <p role="alert" className="notice error">
            {error}
          </p>
        )}
        {sent && (
          <p role="status" className="notice">
            E-Mail verschickt. Gib den Code hier ein. Prüfe auch den
            Spam-Ordner. Falls deine E-Mail nur einen Link enthält, kannst du
            dich darüber anmelden.
          </p>
        )}
        <button className="button primary wide" disabled={busy}>
          {busy ? (
            <LoaderCircle size={18} className="spin" />
          ) : (
            <>
              {sent ? "Anmelden" : "Anmeldecode senden"}{" "}
              <ArrowRight size={18} />
            </>
          )}
        </button>
        {sent && (
          <button
            className="text-link"
            type="button"
            disabled={busy}
            onClick={() => {
              setSent(false);
              setToken("");
              setError("");
            }}
          >
            Andere Adresse / neuen Code anfordern
          </button>
        )}
      </form>
      <button className="text-link" onClick={startDemo}>
        Zuerst die Demo ansehen
      </button>
    </>
  );
}
function GroupSetup({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (name: string, displayName: string, token?: string) => void;
}) {
  const [join, setJoin] = useState(false);
  return (
    <>
      <span className="eyebrow">GEMEINSAM STARTEN</span>
      <h2>{join ? "Zu eurer Crew." : "Gründe euren Club."}</h2>
      <p>
        {join
          ? "Den Einladungscode bekommst du von eurem Admin."
          : "Du wirst Admin und kannst danach deine Freunde einladen."}
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
          Dein Name
          <input
            name="name"
            required
            maxLength={60}
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
