import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeUsername(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}

const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Nur POST erlaubt." }, 405);
  }

  try {
    const body = (await req.json()) as Record<string, unknown>;
    const action = String(body.action ?? "");
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

    if (action === "register") {
      const password = typeof body.password === "string" ? body.password : "";
      if (password.length < 6 || password.length > 128) {
        return json(
          { error: "Das Passwort muss zwischen 6 und 128 Zeichen lang sein." },
          400,
        );
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
