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

const USERNAME_RE = /^[a-z0-9._-]{2,32}$/;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Nur POST erlaubt." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.startsWith("Bearer ")
      ? authHeader.slice(7).trim()
      : "";
    if (!token) {
      return json({ error: "Bitte zuerst anmelden." }, 401);
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false, autoRefreshToken: false } },
    );

    const { data: callerData, error: callerErr } =
      await supabaseAdmin.auth.getUser(token);
    if (callerErr || !callerData.user) {
      return json({ error: "Sitzung abgelaufen. Bitte neu anmelden." }, 401);
    }

    const rawBody = await req.text();
    if (rawBody.length > 4096) {
      return json({ error: "Anfrage zu gross." }, 413);
    }

    const body = JSON.parse(rawBody) as Record<string, unknown>;
    const action = String(body.action ?? "");
    const groupId = String(body.group_id ?? "").trim();
    if (!groupId) {
      return json({ error: "Gruppe fehlt." }, 400);
    }

    const { data: adminAllowed, error: rlErr } = await supabaseAdmin.rpc(
      "check_public_rate_limit",
      {
        p_bucket: `admin:${callerData.user.id}`,
        p_limit: 25,
        p_window_seconds: 600,
      },
    );
    if (rlErr || !adminAllowed) {
      return json(
        { error: "Zu viele Admin-Aktionen. Bitte kurz warten." },
        429,
      );
    }

    const { data: adminMember } = await supabaseAdmin
      .from("memberships")
      .select("id, role, active")
      .eq("group_id", groupId)
      .eq("user_id", callerData.user.id)
      .eq("active", true)
      .eq("role", "admin")
      .maybeSingle();

    if (!adminMember) {
      return json(
        {
          error:
            "Nur aktive Gruppen-Admins dürfen Passwörter und Konten verwalten.",
        },
        403,
      );
    }

    if (action === "set_member_password") {
      const memberId = String(body.member_id ?? "").trim();
      const newPassword =
        typeof body.new_password === "string" ? body.new_password : "";
      if (!memberId) {
        return json({ error: "Mitglied fehlt." }, 400);
      }
      if (newPassword.length < 6 || newPassword.length > 128) {
        return json(
          { error: "Das Passwort muss zwischen 6 und 128 Zeichen lang sein." },
          400,
        );
      }

      const { data: targetMember } = await supabaseAdmin
        .from("memberships")
        .select("id, user_id, group_id")
        .eq("id", memberId)
        .eq("group_id", groupId)
        .maybeSingle();

      if (!targetMember) {
        return json({ error: "Mitglied nicht gefunden." }, 404);
      }

      const { error: updateErr } =
        await supabaseAdmin.auth.admin.updateUserById(targetMember.user_id, {
          password: newPassword,
          email_confirm: true,
        });

      if (updateErr) {
        return json(
          { error: "Passwort konnte nicht aktualisiert werden." },
          500,
        );
      }

      const now = new Date().toISOString();
      await supabaseAdmin
        .from("user_accounts")
        .update({ password_updated_at: now })
        .eq("user_id", targetMember.user_id);

      await supabaseAdmin
        .from("password_reset_requests")
        .update({
          status: "completed",
          resolved_at: now,
          resolved_by_member_id: adminMember.id,
        })
        .eq("group_id", groupId)
        .eq("member_id", targetMember.id)
        .eq("status", "open");

      return json({ ok: true });
    }

    if (action === "create_member_account") {
      const displayName = String(body.display_name ?? "").trim();
      const username = String(body.username ?? "")
        .trim()
        .toLowerCase();
      const password = typeof body.password === "string" ? body.password : "";
      const role = body.role === "admin" ? "admin" : "member";

      if (displayName.length < 1 || displayName.length > 60) {
        return json(
          { error: "Bitte einen Anzeigenamen mit 1 bis 60 Zeichen eingeben." },
          400,
        );
      }
      if (!USERNAME_RE.test(username)) {
        return json(
          {
            error:
              "Benutzername muss 2 bis 32 Zeichen lang sein (nur a–z, 0–9, Punkt, Unterstrich, Bindestrich).",
          },
          400,
        );
      }
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

      const { error: accErr } = await supabaseAdmin
        .from("user_accounts")
        .insert({ user_id: created.user.id, username });

      if (accErr) {
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        return json({ error: "Konto konnte nicht gespeichert werden." }, 500);
      }

      const { error: memErr } = await supabaseAdmin.from("memberships").insert({
        group_id: groupId,
        user_id: created.user.id,
        display_name: displayName,
        role,
        active: true,
      });

      if (memErr) {
        await supabaseAdmin.auth.admin.deleteUser(created.user.id);
        return json(
          { error: "Mitgliedschaft konnte nicht erstellt werden." },
          500,
        );
      }

      return json({ ok: true, username });
    }

    return json({ error: "Unbekannte Aktion." }, 400);
  } catch {
    return json({ error: "Ungültige Anfrage." }, 400);
  }
});
