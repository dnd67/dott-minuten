"use client";

import { useState, type ReactNode } from "react";
import {
  Check,
  Copy,
  Eye,
  EyeOff,
  KeyRound,
  LoaderCircle,
  RefreshCw,
  ShieldAlert,
  UserPlus,
  X,
} from "lucide-react";
import {
  dateLabel,
  type Member,
  type PasswordResetRequest,
  type UserAccount,
} from "@/lib/domain";
import {
  generateTempPassword,
  normalizeUsername,
  validatePassword,
  validateUsername,
} from "@/lib/accounts";

type IssuedCredential = {
  title: string;
  username: string;
  password: string;
};

type Props = {
  me?: Member;
  ownUsername: string;
  admin: boolean;
  members: Member[];
  accounts: UserAccount[];
  resetRequests: PasswordResetRequest[];
  busy: boolean;
  renderAvatar: (member: Member | undefined, size?: string) => ReactNode;
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
  onDismissReset: (resetId: string) => Promise<boolean>;
  onUpdateOwnPassword: (newPassword: string) => Promise<boolean>;
};

export function PasswordDashboard({
  me,
  ownUsername,
  admin,
  members,
  accounts,
  resetRequests,
  busy,
  renderAvatar,
  onSetMemberPassword,
  onCreateMemberAccount,
  onDismissReset,
  onUpdateOwnPassword,
}: Props) {
  const [targetMember, setTargetMember] = useState<Member | null>(null);
  const [memberPassword, setMemberPassword] = useState("");
  const [showMemberPw, setShowMemberPw] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newDisplay, setNewDisplay] = useState("");
  const [newUsername, setNewUsername] = useState("");
  const [newPassword, setNewPassword] = useState(() => generateTempPassword());
  const [newRole, setNewRole] = useState<"member" | "admin">("member");
  const [ownPw, setOwnPw] = useState("");
  const [ownPwConfirm, setOwnPwConfirm] = useState("");
  const [showOwnPw, setShowOwnPw] = useState(false);
  const [ownSaved, setOwnSaved] = useState(false);
  const [localBusy, setLocalBusy] = useState(false);
  const [error, setError] = useState("");
  const [issued, setIssued] = useState<IssuedCredential | null>(null);
  const [copiedIssued, setCopiedIssued] = useState(false);

  const accountByUserId = new Map(accounts.map((a) => [a.user_id, a]));
  const openResets = resetRequests.filter((r) => r.status === "open");
  const resolvedResets = resetRequests.filter((r) => r.status !== "open");
  const isWorking = busy || localBusy;

  const usernameOf = (m: Member | undefined) => {
    if (!m) return "";
    return accountByUserId.get(m.user_id)?.username ?? "";
  };

  function startSetPassword(member: Member) {
    setError("");
    setIssued(null);
    setTargetMember(member);
    setMemberPassword(generateTempPassword());
    setShowMemberPw(true);
  }

  async function submitMemberPassword(e: React.FormEvent) {
    e.preventDefault();
    if (!targetMember || isWorking) return;
    setError("");
    try {
      const cleanPw = validatePassword(memberPassword);
      setLocalBusy(true);
      const ok = await onSetMemberPassword(targetMember.id, cleanPw);
      if (ok) {
        const u =
          usernameOf(targetMember) ||
          normalizeUsername(targetMember.display_name);
        setIssued({
          title: `Neues Passwort für ${targetMember.display_name} gespeichert`,
          username: u,
          password: cleanPw,
        });
        setCopiedIssued(false);
        setTargetMember(null);
        setMemberPassword("");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Fehler beim Speichern.");
    } finally {
      setLocalBusy(false);
    }
  }

  async function submitCreateAccount(e: React.FormEvent) {
    e.preventDefault();
    if (isWorking) return;
    setError("");
    try {
      const cleanUser = validateUsername(newUsername);
      const cleanPw = validatePassword(newPassword);
      const cleanDisplay = newDisplay.trim();
      if (!cleanDisplay || cleanDisplay.length > 60) {
        throw new Error(
          "Bitte einen Anzeigenamen mit 1 bis 60 Zeichen eingeben.",
        );
      }
      setLocalBusy(true);
      const createdUsername = await onCreateMemberAccount({
        displayName: cleanDisplay,
        username: cleanUser,
        password: cleanPw,
        role: newRole,
      });
      if (createdUsername) {
        setIssued({
          title: `Zugang für ${cleanDisplay} erstellt`,
          username: createdUsername,
          password: cleanPw,
        });
        setCopiedIssued(false);
        setCreateOpen(false);
        setNewDisplay("");
        setNewUsername("");
        setNewPassword(generateTempPassword());
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Konto konnte nicht erstellt werden.",
      );
    } finally {
      setLocalBusy(false);
    }
  }

  async function submitOwnPassword(e: React.FormEvent) {
    e.preventDefault();
    if (isWorking) return;
    setError("");
    setOwnSaved(false);
    try {
      const cleanPw = validatePassword(ownPw);
      if (cleanPw !== ownPwConfirm) {
        throw new Error("Die beiden Passwörter stimmen nicht überein.");
      }
      setLocalBusy(true);
      const ok = await onUpdateOwnPassword(cleanPw);
      if (ok) {
        setOwnPw("");
        setOwnPwConfirm("");
        setOwnSaved(true);
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Passwort konnte nicht geändert werden.",
      );
    } finally {
      setLocalBusy(false);
    }
  }

  return (
    <section
      id="passwort-dashboard"
      className="panel password-dashboard-panel"
      aria-labelledby="pw-dashboard-heading"
    >
      <div className="panel-heading">
        <div>
          <h2 id="pw-dashboard-heading">
            Passwort- &amp; Zurücksetzungs-Dashboard
          </h2>
          <p>
            {admin
              ? "Verwalte offene Zurücksetzungs-Anfragen, setze Mitglieder-Passwörter neu oder lege direkte Zugänge für eure Crew an."
              : "Ändere hier jederzeit dein eigenes Passwort."}
          </p>
        </div>
        {admin && (
          <div className="pw-header-badges">
            <span className={`pill ${openResets.length > 0 ? "active" : ""}`}>
              {openResets.length === 1
                ? "1 offene Anfrage"
                : `${openResets.length} offene Anfragen`}
            </span>
            <button
              type="button"
              className="button secondary compact-btn"
              onClick={() => {
                setError("");
                setCreateOpen((v) => !v);
              }}
            >
              <UserPlus size={15} />
              Mitglied direkt anlegen
            </button>
          </div>
        )}
      </div>

      <div className="pw-dashboard-body">
        {error && (
          <div className="notice error" role="alert">
            {error}
          </div>
        )}

        {issued && (
          <div className="invite-box credential-box" role="status">
            <div className="credential-box-header">
              <strong>{issued.title}</strong>
              <button
                type="button"
                className="icon-button"
                aria-label="Zugangsdaten-Hinweis schliessen"
                onClick={() => setIssued(null)}
              >
                <X size={17} />
              </button>
            </div>
            <p>
              Schicke diese Zugangsdaten privat (z. B. per WhatsApp) an die
              Person:
            </p>
            <div className="credential-values">
              <code>
                Benutzername: {issued.username} · Passwort: {issued.password}
              </code>
              <button
                type="button"
                className="button secondary compact-btn"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(
                      `Minutenclub Login\nBenutzername: ${issued.username}\nPasswort: ${issued.password}`,
                    );
                    setCopiedIssued(true);
                  } catch {
                    setCopiedIssued(false);
                  }
                }}
              >
                {copiedIssued ? <Check size={15} /> : <Copy size={15} />}
                {copiedIssued ? "Kopiert" : "Zugangsdaten kopieren"}
              </button>
            </div>
          </div>
        )}

        {admin && createOpen && (
          <form className="pw-subcard" onSubmit={submitCreateAccount}>
            <div className="pw-subcard-header">
              <strong>
                Neues Mitglied mit Benutzername &amp; Passwort erstellen
              </strong>
              <button
                type="button"
                className="icon-button"
                aria-label="Formular schliessen"
                onClick={() => setCreateOpen(false)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="form-row">
              <label>
                Anzeigename
                <input
                  required
                  maxLength={60}
                  value={newDisplay}
                  onChange={(e) => {
                    const v = e.target.value;
                    setNewDisplay(v);
                    if (!newUsername) {
                      setNewUsername(
                        v
                          .trim()
                          .toLowerCase()
                          .replace(/[^a-z0-9._-]+/g, ""),
                      );
                    }
                  }}
                  placeholder="z. B. August"
                />
              </label>
              <label>
                Benutzername (Login)
                <input
                  required
                  maxLength={32}
                  autoCapitalize="none"
                  autoCorrect="off"
                  value={newUsername}
                  onChange={(e) =>
                    setNewUsername(normalizeUsername(e.target.value))
                  }
                  placeholder="z. B. august"
                />
              </label>
            </div>
            <div className="form-row">
              <div className="field-group">
                <label htmlFor="admin-create-pw">Startpasswort</label>
                <div className="location-input-wrap">
                  <input
                    id="admin-create-pw"
                    required
                    minLength={6}
                    maxLength={128}
                    type="text"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="icon-button locate-inline-btn"
                    aria-label="Zufallspasswort generieren"
                    title="Neues Zufallspasswort erzeugen"
                    onClick={() => setNewPassword(generateTempPassword())}
                  >
                    <RefreshCw size={15} />
                  </button>
                </div>
              </div>
              <label>
                Rolle
                <select
                  value={newRole}
                  onChange={(e) =>
                    setNewRole(e.target.value === "admin" ? "admin" : "member")
                  }
                >
                  <option value="member">Mitglied</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary compact-btn"
                onClick={() => setCreateOpen(false)}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="button primary compact-btn"
                disabled={isWorking}
              >
                {isWorking ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <UserPlus size={16} />
                )}
                Konto anlegen
              </button>
            </div>
          </form>
        )}

        {admin && targetMember && (
          <form className="pw-subcard" onSubmit={submitMemberPassword}>
            <div className="pw-subcard-header">
              <strong>
                Neues Passwort setzen für {targetMember.display_name}
                {usernameOf(targetMember)
                  ? ` (@${usernameOf(targetMember)})`
                  : ""}
              </strong>
              <button
                type="button"
                className="icon-button"
                aria-label="Passwort-Editor schliessen"
                onClick={() => setTargetMember(null)}
              >
                <X size={17} />
              </button>
            </div>
            <div className="field-group">
              <label htmlFor="member-reset-pw">
                Neues Passwort (mind. 6 Zeichen)
              </label>
              <div className="pw-editor-row">
                <div className="location-input-wrap">
                  <input
                    id="member-reset-pw"
                    required
                    minLength={6}
                    maxLength={128}
                    type={showMemberPw ? "text" : "password"}
                    value={memberPassword}
                    onChange={(e) => setMemberPassword(e.target.value)}
                  />
                  <button
                    type="button"
                    className="icon-button locate-inline-btn"
                    aria-label={
                      showMemberPw ? "Passwort verbergen" : "Passwort anzeigen"
                    }
                    onClick={() => setShowMemberPw((v) => !v)}
                  >
                    {showMemberPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <button
                  type="button"
                  className="button secondary compact-btn"
                  onClick={() => setMemberPassword(generateTempPassword())}
                >
                  <RefreshCw size={15} /> Zufallspasswort
                </button>
              </div>
            </div>
            <div className="dialog-actions">
              <button
                type="button"
                className="button secondary compact-btn"
                onClick={() => setTargetMember(null)}
              >
                Abbrechen
              </button>
              <button
                type="submit"
                className="button primary compact-btn"
                disabled={isWorking}
              >
                {isWorking ? (
                  <LoaderCircle size={16} className="spin" />
                ) : (
                  <KeyRound size={16} />
                )}
                Passwort speichern
              </button>
            </div>
          </form>
        )}

        {admin && (
          <div className="pw-section">
            <h3>Offene Zurücksetzungs-Anfragen</h3>
            {openResets.length === 0 ? (
              <p className="pw-empty-hint">
                Aktuell keine offenen «Passwort vergessen»-Anfragen aus eurer
                Crew.
              </p>
            ) : (
              <div className="pw-reset-list">
                {openResets.map((req) => {
                  const m = members.find((x) => x.id === req.member_id);
                  return (
                    <div className="pw-reset-row" key={req.id}>
                      <div className="person-cell">
                        <span className="reset-alert-icon">
                          <ShieldAlert size={18} />
                        </span>
                        <div>
                          <strong>
                            {m?.display_name ?? req.username}{" "}
                            <small>@{req.username}</small>
                          </strong>
                          <small>
                            Angefragt {dateLabel(req.requested_at, true)}
                            {req.note ? ` · «${req.note}»` : ""}
                          </small>
                        </div>
                      </div>
                      <div className="pw-reset-actions">
                        {m && (
                          <button
                            type="button"
                            className="button primary compact-btn"
                            disabled={isWorking}
                            onClick={() => startSetPassword(m)}
                          >
                            <KeyRound size={15} /> Neues Passwort setzen
                          </button>
                        )}
                        <button
                          type="button"
                          className="button secondary compact-btn"
                          disabled={isWorking}
                          onClick={() => void onDismissReset(req.id)}
                        >
                          Erledigt
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {admin && (
          <div className="pw-section">
            <h3>Mitglieder-Passwörter direkt verwalten</h3>
            <div className="pw-member-list">
              {members.map((m) => {
                const acc = accountByUserId.get(m.user_id);
                return (
                  <div className="pw-member-row" key={m.id}>
                    <div className="person-cell">
                      {renderAvatar(m, "small")}
                      <div>
                        <strong>
                          {acc
                            ? `@${acc.username}`
                            : `Konto · ${m.display_name}`}
                        </strong>
                        <small>
                          {m.display_name}
                          {acc
                            ? ` · Passwort aktualisiert ${dateLabel(acc.password_updated_at, true)}`
                            : ""}
                        </small>
                      </div>
                    </div>
                    <button
                      type="button"
                      className="button secondary compact-btn"
                      disabled={isWorking}
                      onClick={() => startSetPassword(m)}
                    >
                      <KeyRound size={15} /> Passwort neu setzen
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        <div className="pw-section">
          <h3>
            Eigenes Passwort ändern
            {ownUsername ? ` (@${ownUsername})` : ""}
          </h3>
          <form className="pw-own-form" onSubmit={submitOwnPassword}>
            <div className="form-row">
              <div className="field-group">
                <label htmlFor="own-new-pw">Neues Passwort</label>
                <div className="location-input-wrap">
                  <input
                    id="own-new-pw"
                    required
                    minLength={6}
                    maxLength={128}
                    autoComplete="new-password"
                    type={showOwnPw ? "text" : "password"}
                    value={ownPw}
                    onChange={(e) => setOwnPw(e.target.value)}
                    placeholder="Mindestens 6 Zeichen"
                  />
                  <button
                    type="button"
                    className="icon-button locate-inline-btn"
                    aria-label={
                      showOwnPw ? "Passwort verbergen" : "Passwort anzeigen"
                    }
                    onClick={() => setShowOwnPw((v) => !v)}
                  >
                    {showOwnPw ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
              </div>
              <div className="field-group">
                <label htmlFor="own-confirm-pw">Passwort wiederholen</label>
                <input
                  id="own-confirm-pw"
                  required
                  minLength={6}
                  maxLength={128}
                  autoComplete="new-password"
                  type={showOwnPw ? "text" : "password"}
                  value={ownPwConfirm}
                  onChange={(e) => setOwnPwConfirm(e.target.value)}
                  placeholder="Nochmals eingeben"
                />
              </div>
            </div>
            {ownSaved && (
              <p className="notice" role="status">
                <Check size={17} /> Dein Passwort wurde aktualisiert.
              </p>
            )}
            <button
              type="submit"
              className="button secondary compact-btn"
              disabled={isWorking}
            >
              {isWorking ? (
                <LoaderCircle size={15} className="spin" />
              ) : (
                <Check size={15} />
              )}
              Eigenes Passwort speichern
            </button>
          </form>
        </div>

        {admin && resolvedResets.length > 0 && (
          <details className="feedback-history">
            <summary>
              Erledigte Zurücksetzungen ({resolvedResets.length})
            </summary>
            <div className="feedback-list">
              {resolvedResets.slice(0, 8).map((r) => (
                <div className="feedback-item" key={r.id}>
                  <strong>@{r.username}</strong> ·{" "}
                  <span className="pill">
                    {r.status === "completed" ? "Neu gesetzt" : "Geschlossen"}
                  </span>
                  {r.resolved_at && (
                    <small> · {dateLabel(r.resolved_at, true)}</small>
                  )}
                  {r.note && <p>Notiz: {r.note}</p>}
                </div>
              ))}
            </div>
          </details>
        )}
      </div>
    </section>
  );
}
