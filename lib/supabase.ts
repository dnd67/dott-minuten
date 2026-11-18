import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Group, Snapshot } from "./domain";
let instance: SupabaseClient | null = null;
export class GroupAccessLost extends Error {}
export function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) return null;
  if (!instance) instance = createClient(url, key);
  return instance;
}
export async function listGroups(client: SupabaseClient): Promise<Group[]> {
  const { data, error } = await client
    .from("groups")
    .select("id,name")
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}
export async function loadSnapshot(
  client: SupabaseClient,
  group: Group,
): Promise<Snapshot> {
  const { data, error } = await client.rpc("get_dashboard", {
    p_group_id: group.id,
  });
  if (error) throw error;
  if (!data)
    throw new GroupAccessLost(
      "Kein Zugriff auf diese Gruppe. Bitte die Gruppenliste neu laden.",
    );
  return data as Snapshot;
}
