import { createClient } from "npm:@supabase/supabase-js@2.49.8";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") || "";
const SUPABASE_ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") || "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
const ALLOWED_ORIGINS = (Deno.env.get("ALLOWED_ORIGINS") || "")
  .split(",")
  .map(value => value.trim())
  .filter(Boolean);

function corsHeaders(request: Request): Record<string, string> {
  const origin = request.headers.get("origin") || "";
  const allowedOrigin = ALLOWED_ORIGINS.length === 0 || ALLOWED_ORIGINS.includes(origin)
    ? origin || "*"
    : ALLOWED_ORIGINS[0];
  return {
    "Access-Control-Allow-Origin": allowedOrigin,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin"
  };
}

function jsonResponse(request: Request, body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders(request),
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

Deno.serve(async request => {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== "POST") {
    return jsonResponse(request, { ok: false, code: "METHOD_NOT_ALLOWED" }, 405);
  }
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY || !SUPABASE_SERVICE_ROLE_KEY) {
    console.error("delete-account: required environment variables are missing");
    return jsonResponse(request, { ok: false, code: "SERVER_CONFIG_ERROR" }, 500);
  }

  const authorization = request.headers.get("authorization") || "";
  if (!authorization.toLowerCase().startsWith("bearer ")) {
    return jsonResponse(request, { ok: false, code: "UNAUTHORIZED" }, 401);
  }

  try {
    const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authorization } },
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { data: userData, error: userError } = await userClient.auth.getUser();
    const user = userData.user;
    if (userError || !user) {
      console.warn("delete-account: token validation failed", userError?.message || "missing user");
      return jsonResponse(request, { ok: false, code: "UNAUTHORIZED" }, 401);
    }

    const { data: blockers, error: blockersError } = await userClient
      .rpc("get_my_account_deletion_blockers");
    if (blockersError) {
      console.error("delete-account: blockers request failed", blockersError.message);
      return jsonResponse(request, { ok: false, code: "BLOCKERS_CHECK_FAILED" }, 500);
    }
    if (!blockers || blockers.can_delete !== true) {
      return jsonResponse(request, {
        ok: false,
        code: "ACCOUNT_DELETE_BLOCKED",
        blockers: blockers || { can_delete: false }
      }, 409);
    }

    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false, autoRefreshToken: false }
    });
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(user.id, false);
    if (deleteError) {
      console.error("delete-account: admin deletion failed", deleteError.message);
      return jsonResponse(request, {
        ok: false,
        code: deleteError.message.includes("ACCOUNT_DELETE_BLOCKED")
          ? "ACCOUNT_DELETE_BLOCKED"
          : "ACCOUNT_DELETE_FAILED"
      }, deleteError.message.includes("ACCOUNT_DELETE_BLOCKED") ? 409 : 500);
    }

    return jsonResponse(request, { ok: true, deleted: true }, 200);
  } catch (error) {
    console.error("delete-account: unhandled error", error);
    return jsonResponse(request, { ok: false, code: "UNEXPECTED_ERROR" }, 500);
  }
});
