import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(
  body: Record<string, unknown>,
  status = 200,
  extraHeaders: Record<string, string> = {},
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "Content-Type": "application/json",
      ...extraHeaders,
    },
  });
}

function normalizeUsername(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "");
}

function extractInviteToken(value: unknown): string {
  const raw = String(value ?? "").trim();
  if (!raw) return "";
  if (raw.includes("invite=")) {
    try {
      const url = new URL(raw);
      return (url.searchParams.get("invite") ?? "").trim();
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

function extractClientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return (
    req.headers.get("cf-connecting-ip")?.trim() ||
    req.headers.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

async function hashBucketKey(input: string): Promise<string> {
  const bytes = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .slice(0, 16)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;
const INVITE_TOKEN_RE = /^[a-zA-Z0-9_-]{6,128}$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Nur POST erlaubt." }, 405);
  }

  try {
    const rawBody = await req.text();
    if (rawBody.length > 4096) {
      return json({ error: "Anfrage zu gross." }, 413);
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const action = String(body.action ?? "");
    if (action !== "register" && action !== "request_reset") {
      return json({ error: "Unbekannte Aktion." }, 400);
    }

    const username = normalizeUsername(body.username);
    if (!USERNAME_RE.test(username)) {
      return json(
        {
          error:
            "Benutzername muss 2 bis 32 Zeichen lang sein (nur a–z, 0–9, Punkt, Unterstrich, Bindestrich).",
        },
        400,
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    // Datenschutzfreundliches IP-Rate-Limit (gehasht) + globaler Schutzschalter gegen Botnetze.
    const clientIp = extractClientIp(req);
    const ipHash = await hashBucketKey(
      `minutenclub-rl-v1:${action}:${clientIp}`,
    );

    const [
      { data: ipAllowed, error: ipRlErr },
      { data: globalAllowed, error: globalRlErr },
    ] = await Promise.all([
      supabaseAdmin.rpc("check_public_rate_limit", {
        p_bucket: `ip:${action}:${ipHash}`,
        p_limit: 5,
        p_window_seconds: 600,
      }),
      supabaseAdmin.rpc("check_public_rate_limit", {
        p_bucket: `global:${action}`,
        p_limit: 30,
        p_window_seconds: 600,
      }),
    ]);

    if (ipRlErr || globalRlErr || !ipAllowed || !globalAllowed) {
      return json(
        {
          error:
            "Zu viele Versuche. Bitte warte 10 Minuten und versuche es erneut.",
        },
        429,
        { "Retry-After": "600" },
      );
    }

    if (action === "register") {
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < 6 || password.length > 128) {
        return json(
          { error: "Das Passwort muss zwischen 6 und 128 Zeichen lang sein." },
          400,
        );
      }

      // Sobald mindestens ein Konto oder Club existiert, ist Selbstregistrierung streng Invite-Only (Fail-Closed).
      const { data: requiresInvite, error: reqInviteErr } =
        await supabaseAdmin.rpc("registration_requires_invite");

      if (reqInviteErr || requiresInvite !== false) {
        const inviteToken = extractInviteToken(body.invite_token);
        if (!inviteToken || !INVITE_TOKEN_RE.test(inviteToken)) {
          return json(
            {
              error:
                "Registrierung ist nur mit einem gültigen Einladungscode vom Gruppen-Admin möglich.",
            },
            403,
          );
        }

        const { data: validInvite } = await supabaseAdmin
          .from("invitations")
          .select("id")
          .eq("token", inviteToken)
          .gt("expires_at", new Date().toISOString())
          .maybeSingle();

        if (!validInvite) {
          return json(
            {
              error:
                "Ungültiger oder abgelaufener Einladungscode. Bitte lass dir vom Gruppen-Admin einen neuen Link senden.",
            },
            403,
          );
        }
      }

      const { data: existing } = await supabaseAdmin
        .from("user_accounts")
        .select("user_id")
        .eq("username", username)
        .maybeSingle();

      if (existing) {
        return json(
          { error: "Dieser Benutzername ist bereits vergeben." },
          409,
        );
      }

      const email = `${username}@users.minutenclub.local`;
      const { data: created, error: createErr } =
        await supabaseAdmin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
          app_metadata: { username },
        });

      if (createErr || !created.user) {
        return json(
          { error: "Dieser Benutzername ist bereits vergeben." },
          409,
        );
      }

      const { error: insertErr } = await supabaseAdmin
        .from("user_accounts")
        .insert({
          user_id: created.user.id,
          username,
        });

      if (insertErr) {
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        return json(
          { error: "Dieser Benutzername ist bereits vergeben." },
          409,
        );
      }

      return json({ ok: true, username });
    }

    if (action === "request_reset") {
      const note = String(body.note ?? "")
        .trim()
        .slice(0, 300);

      const { data: account } = await supabaseAdmin
        .from("user_accounts")
        .select("user_id, username")
        .eq("username", username)
        .maybeSingle();

      if (account) {
        const { data: memberships } = await supabaseAdmin
          .from("memberships")
          .select("id, group_id")
          .eq("user_id", account.user_id)
          .eq("active", true);

        for (const m of memberships ?? []) {
          const { data: openReq } = await supabaseAdmin
            .from("password_reset_requests")
            .select("id")
            .eq("group_id", m.group_id)
            .eq("member_id", m.id)
            .eq("status", "open")
            .maybeSingle();

          if (openReq) {
            await supabaseAdmin
              .from("password_reset_requests")
              .update({
                note,
                requested_at: new Date().toISOString(),
              })
              .eq("id", openReq.id);
          } else {
            await supabaseAdmin.from("password_reset_requests").insert({
              group_id: m.group_id,
              member_id: m.id,
              target_user_id: account.user_id,
              username: account.username,
              note,
              status: "open",
            });
          }
        }
      }

      return json({ ok: true });
    }

    return json({ error: "Unbekannte Aktion." }, 400);
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }
});
