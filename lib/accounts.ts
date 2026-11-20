import type { SupabaseClient } from "@supabase/supabase-js";

const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;

export function normalizeUsername(value: string): string {
  return value.trim().toLowerCase().replace(/^@+/, "");
}

export function validateUsername(value: string): string {
  const clean = normalizeUsername(value);
  if (!USERNAME_RE.test(clean)) {
    throw new Error(
      "Benutzername muss 2 bis 32 Zeichen lang sein (nur a–z, 0–9, Punkt, Unterstrich, Bindestrich).",
    );
  }
  return clean;
}

export function validatePassword(value: string): string {
  if (typeof value !== "string" || value.length < 6 || value.length > 128) {
    throw new Error("Das Passwort muss zwischen 6 und 128 Zeichen lang sein.");
  }
  return value;
}

export function usernameToAuthEmail(username: string): string {
  return `${normalizeUsername(username)}@users.minutenclub.local`;
}

export function emailToUsername(email: string | undefined | null): string {
  if (!email) return "";
  const suffix = "@users.minutenclub.local";
  if (email.toLowerCase().endsWith(suffix)) {
    return email.slice(0, -suffix.length);
  }
  return email.split("@")[0] ?? "";
}

const WORDS = [
  "velo",
  "dott",
  "zueri",
  "limmat",
  "seefeld",
  "crew",
  "pass",
  "funken",
];

export function generateTempPassword(): string {
  const buf = new Uint32Array(3);
  crypto.getRandomValues(buf);
  const w1 = WORDS[buf[0] % WORDS.length];
  const w2 = WORDS[buf[1] % WORDS.length];
  const digits = String(1000 + (buf[2] % 9000));
  return `${w1}-${digits}-${w2}`;
}

function supabaseFunctionsBase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase ist nicht konfiguriert.");
  }
  return { url: url.replace(/\/+$/, ""), key };
}

async function callAccountFunction<T = Record<string, unknown>>(
  fnName: "public-account" | "admin-account" | "delete-account",
  payload: Record<string, unknown>,
  accessToken?: string,
  fallbackError = "Anfrage konnte nicht verarbeitet werden.",
): Promise<T> {
  const { url, key } = supabaseFunctionsBase();
  const res = await fetch(`${url}/functions/v1/${fnName}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: key,
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify(payload),
  });
  let body: Record<string, unknown> = {};
  try {
    body = (await res.json()) as Record<string, unknown>;
  } catch {
    /* Kein JSON-Body */
  }
  if (!res.ok) {
    throw new Error(
      typeof body.error === "string" && body.error.trim()
        ? body.error
        : fallbackError,
    );
  }
  return body as T;
}

export function extractInviteToken(value: string | undefined | null): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("invite=")) {
    try {
      const parsed = new URL(raw);
      return (parsed.searchParams.get("invite") ?? "").trim();
    } catch {
      const match = /[?&]invite=([^&#\s]+)/.exec(raw);
      if (match?.[1]) {
        try {
          return decodeURIComponent(match[1]).trim();
        } catch {
          return match[1].trim();
        }
      }
    }
  }
  return raw;
}

export async function registerUsernameAccount(
  username: string,
  password: string,
  inviteToken?: string,
): Promise<string> {
  const cleanUser = validateUsername(username);
  const cleanPass = validatePassword(password);
  const cleanInvite = extractInviteToken(inviteToken);
  await callAccountFunction("public-account", {
    action: "register",
    username: cleanUser,
    password: cleanPass,
    ...(cleanInvite ? { invite_token: cleanInvite } : {}),
  });
  return cleanUser;
}

export async function requestPasswordReset(
  username: string,
  note: string,
): Promise<void> {
  const cleanUser = validateUsername(username);
  await callAccountFunction("public-account", {
    action: "request_reset",
    username: cleanUser,
    note: note.trim().slice(0, 300),
  });
}

async function requireToken(client: SupabaseClient): Promise<string> {
  const { data, error } = await client.auth.getSession();
  if (error || !data.session?.access_token) {
    throw new Error("Bitte neu anmelden.");
  }
  return data.session.access_token;
}

export async function adminSetMemberPassword(
  client: SupabaseClient,
  groupId: string,
  memberId: string,
  newPassword: string,
): Promise<void> {
  const cleanPass = validatePassword(newPassword);
  const token = await requireToken(client);
  await callAccountFunction(
    "admin-account",
    {
      action: "set_member_password",
      group_id: groupId,
      member_id: memberId,
      new_password: cleanPass,
    },
    token,
  );
}

export async function adminCreateMemberAccount(
  client: SupabaseClient,
  args: {
    groupId: string;
    displayName: string;
    username: string;
    password: string;
    role: "member" | "admin";
  },
): Promise<string> {
  const cleanUser = validateUsername(args.username);
  const cleanPass = validatePassword(args.password);
  const displayName = args.displayName.trim();
  if (!displayName || displayName.length > 60) {
    throw new Error("Bitte einen Anzeigenamen mit 1 bis 60 Zeichen eingeben.");
  }
  const token = await requireToken(client);
  await callAccountFunction(
    "admin-account",
    {
      action: "create_member_account",
      group_id: args.groupId,
      display_name: displayName,
      username: cleanUser,
      password: cleanPass,
      role: args.role,
    },
    token,
  );
  return cleanUser;
}

export async function updateOwnPassword(
  client: SupabaseClient,
  newPassword: string,
): Promise<void> {
  const cleanPass = validatePassword(newPassword);
  const { error } = await client.auth.updateUser({ password: cleanPass });
  if (error) throw new Error(error.message);
  await client.rpc("mark_own_password_updated");
}

export async function deleteOwnAccount(client: SupabaseClient): Promise<void> {
  const token = await requireToken(client);
  await callAccountFunction(
    "delete-account",
    { confirm: true },
    token,
    "Das Konto konnte nicht gelöscht werden. Bitte erneut versuchen.",
  );
}
