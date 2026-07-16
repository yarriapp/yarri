import { supabase } from "@/lib/supabase";

export const ADMIN_ACCOUNT_PAGE_SIZE = 50;
export const ADMIN_SEARCH_ID_BATCH_SIZE = 200;
export const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function sanitizeAdminSearch(value: string) {
  return value.trim().replace(/[,%()]/g, " ").replace(/\s+/g, " ").slice(0, 100);
}

export async function findMatchingProfileIds(search: string, mode: "duo" | "group") {
  const ids: string[] = [];
  const pattern = `%${search}%`;
  const pageSize = 1000;
  for (let page = 0; ; page += 1) {
    const from = page * pageSize;
    const { data, error } = await supabase
      .from("profiles")
      .select("id")
      .ilike("dating_mode", mode)
      .or(`full_name.ilike.${pattern},city.ilike.${pattern},bio.ilike.${pattern}`)
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    if (error) throw error;
    const rows = (data || []) as Array<{ id: string }>;
    ids.push(...rows.map((row) => row.id));
    if (rows.length < pageSize) break;
  }
  return ids;
}
