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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (req.method !== "POST") {
    return json({ error: "Nur POST erlaubt." }, 405);
  }

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const bearerMatch = /^Bearer\s+(.+)$/i.exec(authHeader.trim());
    const token = bearerMatch?.[1]?.trim() ?? "";
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
    if (new TextEncoder().encode(rawBody).length > 4096) {
      return json({ error: "Anfrage zu gross." }, 413);
    }

    let body: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(rawBody);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        return json({ error: "Ungültige Anfrage." }, 400);
      }
      body = parsed as Record<string, unknown>;
    } catch {
      return json({ error: "Ungültige Anfrage." }, 400);
    }

    if (body.confirm !== true) {
      return json(
        { error: "Bitte bestätige die endgültige Kontolöschung." },
        400,
      );
    }

    const { data: deleteAllowed, error: rlErr } = await supabaseAdmin.rpc(
      "check_public_rate_limit",
      {
        p_bucket: `delete:${callerData.user.id}`,
        p_limit: 5,
        p_window_seconds: 600,
      },
    );
    if (rlErr || !deleteAllowed) {
      return json(
        {
          error:
            "Zu viele Löschversuche. Bitte warte kurz und versuche es erneut.",
        },
        429,
        { "Retry-After": "600" },
      );
    }

    const { error: prepErr } = await supabaseAdmin.rpc(
      "prepare_account_deletion",
      { p_user_id: callerData.user.id },
    );
    if (prepErr) {
      return json(
        {
          error:
            "Kontodaten konnten nicht für die Löschung vorbereitet werden. Bitte versuche es erneut.",
        },
        500,
      );
    }

    const { error: deleteErr } = await supabaseAdmin.auth.admin.deleteUser(
      callerData.user.id,
      false,
    );
    if (deleteErr) {
      return json(
        {
          error:
            "Das Konto konnte nicht vollständig gelöscht werden. Bitte versuche es erneut.",
        },
        500,
      );
    }

    return json({ ok: true, deleted: true });
  } catch {
    return json(
      { error: "Die Kontolöschung konnte nicht verarbeitet werden." },
      500,
    );
  }
});
