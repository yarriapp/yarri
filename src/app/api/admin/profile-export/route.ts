import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { randomBytes } from "node:crypto";
import { isAllowedAdminEmail } from "@/lib/admin";
import {
  DEMO_CSV_HEADERS,
  getDemoTemplateRows,
  MAX_DEMO_CSV_FILE_SIZE,
  MAX_DEMO_IMPORT_ENTITIES,
  MAX_DEMO_IMPORT_MEMBERS,
  normalizeDemoCsvRows,
  validateAndGroupDemoRows,
  type DemoCsvHeader,
  type DemoMode,
} from "@/lib/demoImport";

export const runtime = "nodejs";
export const maxDuration = 120;

const MAX_EXPORT_PROFILES = 5000;
const QUERY_BATCH_SIZE = 100;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AuthorizedContext = {
  admin: SupabaseClient;
};

type ProfileRow = Record<string, unknown> & {
  id: string;
  dating_mode?: string | null;
  is_admin?: boolean | null;
  is_banned?: boolean | null;
  photos?: unknown;
};

const CSV_COLUMNS = DEMO_CSV_HEADERS;

const GROUP_ICEBREAKER_QUESTIONS = [
  "Our favorite group plan is...",
  "The vibe people should expect from us is...",
  "A perfect night with us looks like...",
] as const;

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

function chunkItems<T>(items: T[], size = QUERY_BATCH_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) chunks.push(items.slice(index, index + size));
  return chunks;
}

function getPhotos(value: unknown) {
  let candidates = value;
  if (typeof value === "string" && value.trim()) {
    try {
      candidates = JSON.parse(value);
    } catch {
      candidates = [];
    }
  }
  if (!Array.isArray(candidates)) return [];
  return candidates.filter((photo): photo is string => {
    if (typeof photo !== "string" || !photo.trim()) return false;
    try {
      const url = new URL(photo.trim());
      return url.protocol === "https:" || url.protocol === "http:";
    } catch {
      return false;
    }
  });
}

function getPromptAnswer(value: unknown, question: string) {
  let prompts = value;
  if (typeof value === "string" && value.trim()) {
    try {
      prompts = JSON.parse(value);
    } catch {
      prompts = [];
    }
  }
  if (!Array.isArray(prompts)) return "";
  const match = prompts.find((prompt) => {
    if (!prompt || typeof prompt !== "object") return false;
    return String((prompt as { question?: unknown }).question || "").trim().toLowerCase() === question.toLowerCase();
  });
  return match && typeof match === "object"
    ? String((match as { answer?: unknown }).answer || "").trim()
    : "";
}

function getStringList(value: unknown) {
  let candidates = value;
  if (typeof value === "string" && value.trim()) {
    try {
      candidates = JSON.parse(value);
    } catch {
      candidates = value.split(/[;|,]/);
    }
  }
  if (!Array.isArray(candidates)) return [];
  return candidates.map((item) => String(item || "").trim()).filter(Boolean);
}

function toSemicolonList(value: unknown) {
  return getStringList(value).join(";");
}

function getBirthday(profile: ProfileRow, fallback: Record<DemoCsvHeader, string>) {
  const answer = getPromptAnswer(profile.prompts, "Birthday");
  const match = answer.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (match) {
    const month = Number(match[1]);
    const day = Number(match[2]);
    const year = Number(match[3]);
    const value = new Date(year, month - 1, day);
    if (
      value.getFullYear() === year &&
      value.getMonth() === month - 1 &&
      value.getDate() === day
    ) {
      return { month: String(month), day: String(day), year: String(year) };
    }
  }

  const age = Number(profile.age);
  if (Number.isInteger(age) && age >= 18 && age <= 99) {
    return { month: "1", day: "1", year: String(new Date().getFullYear() - age) };
  }
  return {
    month: fallback.birth_month,
    day: fallback.birth_day,
    year: fallback.birth_year,
  };
}

function getPreferredAgeRange(profile: ProfileRow, fallback: Record<DemoCsvHeader, string>) {
  const answer = getPromptAnswer(profile.prompts, "Preferred age range");
  const match = answer.match(/(\d{1,2})\s*[-\u2013\u2014]\s*(\d{1,2})/);
  if (!match) {
    return { minimum: fallback.preferred_age_min, maximum: fallback.preferred_age_max };
  }
  const minimum = Number(match[1]);
  const maximum = Number(match[2]);
  if (minimum < 18 || maximum > 99 || minimum >= maximum) {
    return { minimum: fallback.preferred_age_min, maximum: fallback.preferred_age_max };
  }
  return { minimum: String(minimum), maximum: String(maximum) };
}

function getHideBirthday(profile: ProfileRow, fallback: Record<DemoCsvHeader, string>) {
  const answer = getPromptAnswer(profile.prompts, "Visible: Birthday").toLowerCase();
  if (["true", "yes", "1", "y"].includes(answer)) return "false";
  if (["false", "no", "0", "n"].includes(answer)) return "true";
  return fallback.hide_birthday;
}

function getPhotoCaptions(profile: ProfileRow, photoCount: number) {
  return Array.from({ length: photoCount }, (_, index) =>
    getPromptAnswer(profile.prompts, `Photo ${index + 1} caption`)
  ).filter(Boolean).join(";");
}

function getMode(value: unknown): DemoMode {
  const mode = String(value || "").trim().toLowerCase();
  return mode === "duo" || mode === "group" ? mode : "solo";
}

function getMemberOrder(role: string) {
  const match = role.match(/member_(\d+)/i);
  return match ? String(Math.max(1, Number(match[1]) || 1)) : "1";
}

function createImportPassword() {
  return `Yarri-${randomBytes(12).toString("base64url")}!`;
}

function getBoolean(value: unknown) {
  if (typeof value === "boolean") return value;
  return ["true", "yes", "1", "y"].includes(String(value || "").trim().toLowerCase());
}

function mergeInterests(value: unknown, fallback: string) {
  const interests = getStringList(value);
  const fallbackInterests = getStringList(fallback);
  for (const interest of fallbackInterests) {
    if (interests.length >= 5) break;
    if (!interests.some((existing) => existing.toLowerCase() === interest.toLowerCase())) {
      interests.push(interest);
    }
  }
  return interests.slice(0, 8).join(";");
}

function serializeCell(value: unknown) {
  if (value === null || value === undefined) return "";
  if (Array.isArray(value) || typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function buildImportRow({
  profile,
  entity,
  sharedProfile,
}: {
  profile: ProfileRow;
  entity: { type: string; id: string; role: string; isVerified: unknown };
  sharedProfile: ProfileRow;
}) {
  const mode = getMode(entity.type);
  const fallback = getDemoTemplateRows(mode)[0];
  const birthday = getBirthday(profile, fallback);
  const preferredAge = getPreferredAgeRange(profile, fallback);
  const photos = getPhotos(profile.photos).slice(0, 5);
  const sharedNameQuestion = mode === "duo" ? "Duo name" : "Group name";
  const sharedName = mode === "solo"
    ? ""
    : getPromptAnswer(sharedProfile.prompts, sharedNameQuestion) || fallback.shared_name;
  const sharedActivities = mode === "solo"
    ? ""
    : toSemicolonList(getPromptAnswer(sharedProfile.prompts, "What we like together")) ||
      mergeInterests(sharedProfile.interests, fallback.shared_activities);
  const row = {
    ...fallback,
    mode,
    entity_key: entity.id,
    member_order: getMemberOrder(entity.role),
    email: serializeCell(profile.email).trim(),
    password: createImportPassword(),
    full_name: serializeCell(profile.full_name).trim(),
    birth_month: birthday.month,
    birth_day: birthday.day,
    birth_year: birthday.year,
    hide_birthday: getHideBirthday(profile, fallback),
    gender: serializeCell(profile.gender).trim() || fallback.gender,
    interested_in: serializeCell(profile.interested_in).trim() || fallback.interested_in,
    height: serializeCell(profile.height).trim(),
    intent: serializeCell(profile.intent).trim() || fallback.intent,
    looking_for: serializeCell(profile.looking_for).trim() || fallback.looking_for,
    preferred_age_min: preferredAge.minimum,
    preferred_age_max: preferredAge.maximum,
    work_status: getPromptAnswer(profile.prompts, "Work status") || fallback.work_status,
    occupation: serializeCell(profile.occupation).trim(),
    education: serializeCell(profile.education).trim(),
    school: getPromptAnswer(profile.prompts, "School"),
    city: serializeCell(profile.city).trim() || fallback.city,
    latitude: serializeCell(profile.latitude).trim(),
    longitude: serializeCell(profile.longitude).trim(),
    hometown: getPromptAnswer(profile.prompts, "Hometown"),
    ethnicity: getPromptAnswer(profile.prompts, "Ethnicity"),
    preferred_ethnicities: toSemicolonList(getPromptAnswer(profile.prompts, "Preferred ethnicities")),
    religion: getPromptAnswer(profile.prompts, "Religion"),
    workout: getPromptAnswer(profile.prompts, "Workout"),
    smoking: getPromptAnswer(profile.prompts, "Smoking"),
    drinking: getPromptAnswer(profile.prompts, "Drinking"),
    diet: getPromptAnswer(profile.prompts, "Diet"),
    pets: getPromptAnswer(profile.prompts, "Pets"),
    sleep: getPromptAnswer(profile.prompts, "Sleep"),
    lifestyle: serializeCell(profile.lifestyle).trim() || fallback.lifestyle,
    vibe: serializeCell(profile.vibe).trim() || fallback.vibe,
    bio: serializeCell(profile.bio).trim() || fallback.bio,
    interests: mergeInterests(profile.interests, fallback.interests),
    photo_urls: photos.join(";"),
    photo_captions: getPhotoCaptions(profile, photos.length),
    address_line: serializeCell(profile.address_line).trim(),
    state_region: serializeCell(profile.state_region).trim(),
    postal_code: serializeCell(profile.postal_code).trim(),
    country: serializeCell(profile.country).trim() || fallback.country,
    search_radius_miles: serializeCell(profile.search_radius_miles).trim() || fallback.search_radius_miles,
    shared_name: sharedName,
    shared_bio: mode === "solo" ? "" : serializeCell(sharedProfile.bio).trim() || fallback.shared_bio,
    shared_city: mode === "solo" ? "" : serializeCell(sharedProfile.city).trim() || fallback.shared_city,
    shared_activities: sharedActivities,
    shared_lifestyle: mode === "solo" ? "" : serializeCell(sharedProfile.lifestyle).trim() || fallback.shared_lifestyle,
    shared_vibe: mode === "solo" ? "" : serializeCell(sharedProfile.vibe).trim() || fallback.shared_vibe,
    shared_intent: mode === "solo" ? "" : serializeCell(sharedProfile.intent).trim() || fallback.shared_intent,
    shared_looking_for: mode === "solo" ? "" : serializeCell(sharedProfile.looking_for).trim() || fallback.shared_looking_for,
    icebreaker_1: mode === "group" ? getPromptAnswer(sharedProfile.prompts, GROUP_ICEBREAKER_QUESTIONS[0]) || fallback.icebreaker_1 : "",
    icebreaker_2: mode === "group" ? getPromptAnswer(sharedProfile.prompts, GROUP_ICEBREAKER_QUESTIONS[1]) || fallback.icebreaker_2 : "",
    icebreaker_3: mode === "group" ? getPromptAnswer(sharedProfile.prompts, GROUP_ICEBREAKER_QUESTIONS[2]) || fallback.icebreaker_3 : "",
    is_verified: String(getBoolean(profile.is_verified ?? entity.isVerified)),
  } satisfies Record<DemoCsvHeader, string>;
  return row;
}

function csvCell(value: unknown) {
  let text = serializeCell(value);
  if (typeof value === "string" && /^[=+\-@]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
}

async function authorize(request: Request): Promise<AuthorizedContext | { response: NextResponse }> {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return { response: NextResponse.json({ error: "Admin session is required." }, { status: 401 }) };

  const verifier = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data.user || !isAllowedAdminEmail(data.user.email)) {
    return { response: NextResponse.json({ error: "This account cannot export profiles." }, { status: 403 }) };
  }

  return {
    admin: createClient(supabaseUrl, requiredEnv("SUPABASE_SERVICE_ROLE_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

function isActiveProfile(profile: ProfileRow) {
  return !profile.is_admin && !profile.is_banned;
}

export async function GET(request: Request) {
  try {
    const context = await authorize(request);
    if ("response" in context) return context.response;

    const profiles: unknown[] = [];
    for (let from = 0; from < MAX_EXPORT_PROFILES; from += 1000) {
      const { data, error } = await context.admin
        .from("profiles")
        .select("id, email, full_name, age, gender, dating_mode, city, state_region, country, prompts, photos, is_verified, is_banned, is_admin, created_at")
        .order("created_at", { ascending: false })
        .range(from, from + 999);
      if (error) throw error;
      profiles.push(...(data || []));
      if ((data || []).length < 1000) break;
    }

    const activeProfiles = (profiles as ProfileRow[]).filter(isActiveProfile).map((profile) => ({
      id: profile.id,
      email: profile.email,
      full_name: profile.full_name,
      age: profile.age,
      gender: profile.gender,
      ethnicity: getPromptAnswer(profile.prompts, "Ethnicity"),
      dating_mode: profile.dating_mode,
      city: profile.city,
      state_region: profile.state_region,
      country: profile.country,
      is_verified: profile.is_verified,
      created_at: profile.created_at,
      photo_count: getPhotos(profile.photos).length,
    }));
    return NextResponse.json({ profiles: activeProfiles });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not load active profiles.";
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}

export async function POST(request: Request) {
  try {
    const context = await authorize(request);
    if ("response" in context) return context.response;
    const body = (await request.json()) as { profileIds?: unknown };
    const profileIds = Array.isArray(body.profileIds)
      ? Array.from(new Set(body.profileIds.map((id) => String(id || "").trim()).filter((id) => UUID_PATTERN.test(id))))
      : [];
    if (!profileIds.length) {
      return NextResponse.json({ error: "Choose at least one active profile to export." }, { status: 400 });
    }
    if (profileIds.length > MAX_EXPORT_PROFILES) {
      return NextResponse.json({ error: `Export no more than ${MAX_EXPORT_PROFILES} profiles at once.` }, { status: 400 });
    }

    const profiles: ProfileRow[] = [];
    for (const idBatch of chunkItems(profileIds)) {
      const { data, error } = await context.admin.from("profiles").select("*").in("id", idBatch);
      if (error) throw error;
      profiles.push(...((data || []) as ProfileRow[]));
    }
    const activeProfiles = profiles.filter(isActiveProfile);
    if (!activeProfiles.length) {
      return NextResponse.json({ error: "No active profiles remain in this selection." }, { status: 400 });
    }

    const [
      { data: duoData, error: duoError },
      { data: groupData, error: groupError },
      { data: groupMemberData, error: groupMemberError },
    ] = await Promise.all([
      context.admin.from("duos").select("id, user1_id, user2_id, created_at, is_verified"),
      context.admin.from("groups").select("id, created_at, is_verified"),
      context.admin.from("group_members").select("id, group_id, user_id"),
    ]);
    if (duoError) throw duoError;
    if (groupError) throw groupError;
    if (groupMemberError) throw groupMemberError;

    const entityByUser = new Map<string, { type: string; id: string; role: string; createdAt: unknown; isVerified: unknown }>();
    (duoData || []).forEach((duo) => {
      const details = { type: "duo", id: String(duo.id), createdAt: duo.created_at, isVerified: duo.is_verified };
      entityByUser.set(String(duo.user1_id), { ...details, role: "member_1" });
      entityByUser.set(String(duo.user2_id), { ...details, role: "member_2" });
    });
    const groupsById = new Map(
      (groupData || []).map((group) => [String(group.id), { createdAt: group.created_at, isVerified: group.is_verified }])
    );
    const groupPosition = new Map<string, number>();
    (groupMemberData || []).forEach((member) => {
      const groupId = String(member.group_id);
      const position = (groupPosition.get(groupId) || 0) + 1;
      groupPosition.set(groupId, position);
      const details = groupsById.get(groupId);
      entityByUser.set(String(member.user_id), {
        type: "group",
        id: groupId,
        role: `member_${position}`,
        createdAt: details?.createdAt || "",
        isVerified: details?.isVerified ?? "",
      });
    });

    const selectedOrder = new Map(profileIds.map((id, index) => [id, index]));
    activeProfiles.sort((left, right) => (selectedOrder.get(left.id) ?? 0) - (selectedOrder.get(right.id) ?? 0));
    const exportEntityByUser = new Map<string, { type: string; id: string; role: string; isVerified: unknown }>();
    const sharedProfileByEntity = new Map<string, ProfileRow>();
    activeProfiles.forEach((profile) => {
      const entity = entityByUser.get(profile.id) || {
        type: "solo",
        id: profile.id,
        role: "member_1",
        isVerified: profile.is_verified,
      };
      exportEntityByUser.set(profile.id, entity);
      const entityKey = `${entity.type}:${entity.id}`;
      if (!sharedProfileByEntity.has(entityKey)) sharedProfileByEntity.set(entityKey, profile);
    });
    const rows = activeProfiles.map((profile) => {
      const entity = exportEntityByUser.get(profile.id)!;
      const sharedProfile = sharedProfileByEntity.get(`${entity.type}:${entity.id}`) || profile;
      return buildImportRow({ profile, entity, sharedProfile });
    });

    const validation = validateAndGroupDemoRows(normalizeDemoCsvRows(rows));
    if (validation.errors.length) {
      return NextResponse.json({
        error: `This selection cannot produce an import-ready CSV. ${validation.errors.slice(0, 5).join(" ")}`,
      }, { status: 422 });
    }
    if (validation.entities.length > MAX_DEMO_IMPORT_ENTITIES || rows.length > MAX_DEMO_IMPORT_MEMBERS) {
      return NextResponse.json({
        error: `This selection exceeds the Demo Import limit of ${MAX_DEMO_IMPORT_ENTITIES} profile sets or ${MAX_DEMO_IMPORT_MEMBERS} member accounts. Narrow the filters or export a smaller selection.`,
      }, { status: 422 });
    }

    const csv = [
      CSV_COLUMNS.map(csvCell).join(","),
      ...rows.map((row) => CSV_COLUMNS.map((column) => csvCell(row[column])).join(",")),
    ].join("\r\n");
    const csvBody = `\uFEFF${csv}`;
    if (new TextEncoder().encode(csvBody).byteLength > MAX_DEMO_CSV_FILE_SIZE) {
      return NextResponse.json({
        error: "This import-ready CSV would exceed the 2 MB upload limit. Narrow the filters or export a smaller selection.",
      }, { status: 422 });
    }
    const date = new Date().toISOString().slice(0, 10);
    return new Response(csvBody, {
      status: 200,
      headers: {
        "Content-Type": "text/csv;charset=utf-8",
        "Content-Disposition": `attachment; filename="yarri-demo-import-profiles-${date}.csv"`,
        "Cache-Control": "private, no-store",
        "X-Exported-Profiles": String(rows.length),
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not export active profiles.";
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
