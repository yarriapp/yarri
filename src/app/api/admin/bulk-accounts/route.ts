import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isAllowedAdminEmail } from "@/lib/admin";

export const runtime = "nodejs";
export const maxDuration = 300;

const MAX_BULK_USERS = 200;
const MAX_DELETE_USERS = 5000;
const ID_QUERY_BATCH_SIZE = 100;
const DISABLE_DURATION = "876000h";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type AuthorizedContext = {
  admin: SupabaseClient;
  actor: SupabaseClient;
  adminUserId: string;
};

type ActionProfile = {
  id: string;
  is_admin: boolean | null;
  dating_mode: string | null;
  photos: unknown;
};

type DuoUnit = {
  id: string;
  user1_id: string;
  user2_id: string;
};

type GroupMember = {
  group_id: string;
  user_id: string;
};

type AccountResolution = {
  resolvedIds: string[];
  protectedIds: string[];
  profiles: Map<string, ActionProfile>;
  units: {
    soloIds: string[];
    duoIds: string[];
    groupIds: string[];
  };
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

function parseUserIds(value: unknown) {
  if (!Array.isArray(value)) return [];
  return Array.from(
    new Set(value.map((item) => String(item || "").trim()).filter((item) => UUID_PATTERN.test(item)))
  );
}

function chunkItems<T>(items: T[], size = ID_QUERY_BATCH_SIZE) {
  const chunks: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    chunks.push(items.slice(index, index + size));
  }
  return chunks;
}

function getErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    const message = String((error as { message?: unknown }).message || "").trim();
    if (message) return message;
  }
  return fallback;
}

function isMissingAuthUserError(error: unknown) {
  const status = error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 0;
  const message = getErrorMessage(error, "").toLowerCase();
  return status === 404 || message.includes("user not found") || message.includes("not found");
}

async function ensureAuthUserDeleted(admin: SupabaseClient, userId: string) {
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId, false);
  if (deleteError && !isMissingAuthUserError(deleteError)) throw deleteError;

  const { data, error: verifyError } = await admin.auth.admin.getUserById(userId);
  if (data?.user) throw new Error("Supabase Auth still contains this user after deletion.");
  if (verifyError && !isMissingAuthUserError(verifyError)) throw verifyError;
}

function getPhotoUrls(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((photo): photo is string => typeof photo === "string" && Boolean(photo.trim()));
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed)
      ? parsed.filter((photo): photo is string => typeof photo === "string" && Boolean(photo.trim()))
      : [];
  } catch {
    return [];
  }
}

function getAvatarStoragePath(fileUrl: string, supabaseUrl: string) {
  try {
    const file = new URL(fileUrl);
    const project = new URL(supabaseUrl);
    const marker = "/storage/v1/object/public/avatars/";
    if (file.origin !== project.origin || !file.pathname.includes(marker)) return null;
    const encodedPath = file.pathname.slice(file.pathname.indexOf(marker) + marker.length);
    return decodeURIComponent(encodedPath);
  } catch {
    return null;
  }
}

async function authorize(request: Request): Promise<AuthorizedContext | { response: NextResponse }> {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
  const authorization = request.headers.get("authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) {
    return { response: NextResponse.json({ error: "Admin session is required." }, { status: 401 }) };
  }

  const verifier = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await verifier.auth.getUser(token);
  if (error || !data.user || !isAllowedAdminEmail(data.user.email)) {
    return { response: NextResponse.json({ error: "This account cannot manage users." }, { status: 403 }) };
  }

  const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
  return {
    admin: createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    }),
    actor: createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    }),
    adminUserId: data.user.id,
  };
}

async function resolveAccountSelection(
  context: AuthorizedContext,
  requestedIds: string[]
): Promise<AccountResolution> {
  const [{ data: duoData, error: duoError }, { data: memberData, error: memberError }] = await Promise.all([
    context.admin.from("duos").select("id, user1_id, user2_id"),
    context.admin.from("group_members").select("group_id, user_id"),
  ]);
  if (duoError) throw duoError;
  if (memberError) throw memberError;

  const duos = (duoData || []) as DuoUnit[];
  const members = (memberData || []) as GroupMember[];
  const membersByGroup = new Map<string, string[]>();
  members.forEach((member) => {
    const current = membersByGroup.get(member.group_id) || [];
    current.push(member.user_id);
    membersByGroup.set(member.group_id, current);
  });

  const candidateIds = new Set(requestedIds);
  let changed = true;
  while (changed) {
    changed = false;
    duos.forEach((duo) => {
      if (!candidateIds.has(duo.user1_id) && !candidateIds.has(duo.user2_id)) return;
      if (!candidateIds.has(duo.user1_id)) {
        candidateIds.add(duo.user1_id);
        changed = true;
      }
      if (!candidateIds.has(duo.user2_id)) {
        candidateIds.add(duo.user2_id);
        changed = true;
      }
    });
    membersByGroup.forEach((groupMembers) => {
      if (!groupMembers.some((userId) => candidateIds.has(userId))) return;
      groupMembers.forEach((userId) => {
        if (!candidateIds.has(userId)) {
          candidateIds.add(userId);
          changed = true;
        }
      });
    });
  }

  if (!candidateIds.size) {
    return {
      resolvedIds: [],
      protectedIds: [],
      profiles: new Map(),
      units: { soloIds: [], duoIds: [], groupIds: [] },
    };
  }

  const profileData: ActionProfile[] = [];
  for (const idBatch of chunkItems(Array.from(candidateIds))) {
    const { data, error } = await context.admin
      .from("profiles")
      .select("id, is_admin, dating_mode, photos")
      .in("id", idBatch);
    if (error) throw error;
    profileData.push(...((data || []) as ActionProfile[]));
  }

  const profiles = new Map(
    profileData.map((profile) => [profile.id, profile])
  );
  const validIds = new Set(profiles.keys());
  const protectedIds = new Set(
    Array.from(validIds).filter(
      (userId) => userId === context.adminUserId || Boolean(profiles.get(userId)?.is_admin)
    )
  );

  changed = true;
  while (changed) {
    changed = false;
    duos.forEach((duo) => {
      const ids = [duo.user1_id, duo.user2_id].filter((userId) => validIds.has(userId));
      if (!ids.some((userId) => protectedIds.has(userId))) return;
      ids.forEach((userId) => {
        if (!protectedIds.has(userId)) {
          protectedIds.add(userId);
          changed = true;
        }
      });
    });
    membersByGroup.forEach((groupMembers) => {
      const ids = groupMembers.filter((userId) => validIds.has(userId));
      if (!ids.some((userId) => protectedIds.has(userId))) return;
      ids.forEach((userId) => {
        if (!protectedIds.has(userId)) {
          protectedIds.add(userId);
          changed = true;
        }
      });
    });
  }

  const resolvedIds = Array.from(validIds).filter((userId) => !protectedIds.has(userId));
  const resolvedSet = new Set(resolvedIds);
  const duoIds = duos
    .filter((duo) => resolvedSet.has(duo.user1_id) || resolvedSet.has(duo.user2_id))
    .map((duo) => duo.id);
  const groupIds = Array.from(membersByGroup.entries())
    .filter(([, groupMembers]) => groupMembers.some((userId) => resolvedSet.has(userId)))
    .map(([groupId]) => groupId);
  const sharedMemberIds = new Set<string>();
  duos.forEach((duo) => {
    if (!duoIds.includes(duo.id)) return;
    sharedMemberIds.add(duo.user1_id);
    sharedMemberIds.add(duo.user2_id);
  });
  groupIds.forEach((groupId) => {
    (membersByGroup.get(groupId) || []).forEach((userId) => sharedMemberIds.add(userId));
  });

  return {
    resolvedIds,
    protectedIds: Array.from(protectedIds),
    profiles,
    units: {
      soloIds: resolvedIds.filter((userId) => !sharedMemberIds.has(userId)),
      duoIds,
      groupIds,
    },
  };
}

async function loadVerificationPhotos(admin: SupabaseClient, userIds: string[]) {
  const urlsByUser = new Map<string, string[]>();
  if (!userIds.length) return urlsByUser;

  const verificationRows: Array<{ user_id: string | null; member_user_id: string | null; selfie_url: string | null }> = [];
  for (const idBatch of chunkItems(userIds)) {
    const [memberResult, ownerResult] = await Promise.all([
      admin
        .from("profile_verification_requests")
        .select("user_id, member_user_id, selfie_url")
        .in("member_user_id", idBatch),
      admin
        .from("profile_verification_requests")
        .select("user_id, member_user_id, selfie_url")
        .in("user_id", idBatch),
    ]);
    if (memberResult.error) throw memberResult.error;
    if (ownerResult.error) throw ownerResult.error;
    verificationRows.push(...(memberResult.data || []), ...(ownerResult.data || []));
  }

  verificationRows.forEach((row) => {
    const userId = String(row.member_user_id || row.user_id || "");
    const selfieUrl = String(row.selfie_url || "");
    if (!userId || !selfieUrl) return;
    const current = urlsByUser.get(userId) || [];
    current.push(selfieUrl);
    urlsByUser.set(userId, current);
  });
  return urlsByUser;
}

async function cleanupUserStorage(
  admin: SupabaseClient,
  userId: string,
  knownUrls: string[]
) {
  const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
  const paths = new Set(
    knownUrls.map((url) => getAvatarStoragePath(url, supabaseUrl)).filter((path): path is string => Boolean(path))
  );

  for (const prefix of [`chat-images/${userId}`, `voice-notes/${userId}`]) {
    const { data } = await admin.storage.from("avatars").list(prefix, { limit: 1000 });
    (data || []).forEach((file) => {
      if (file.name) paths.add(`${prefix}/${file.name}`);
    });
  }

  if (!paths.size) return "";
  const { error } = await admin.storage.from("avatars").remove(Array.from(paths));
  return error?.message || "";
}

export async function GET(request: Request) {
  try {
    const context = await authorize(request);
    if ("response" in context) return context.response;

    const profiles: unknown[] = [];
    const pageSize = 1000;
    for (let page = 0; page < 5; page += 1) {
      const from = page * pageSize;
      const { data, error } = await context.admin
        .from("profiles")
        .select(
          "id, email, full_name, age, gender, dating_mode, city, state_region, country, prompts, photos, is_verified, is_banned, is_admin, created_at"
        )
        .order("created_at", { ascending: false })
        .range(from, from + pageSize - 1);
      if (error) throw error;
      profiles.push(...(data || []));
      if ((data || []).length < pageSize) break;
    }

    return NextResponse.json({ profiles });
  } catch (error) {
    const message = getErrorMessage(error, "Could not load accounts.");
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const context = await authorize(request);
    if ("response" in context) return context.response;

    const body = (await request.json()) as { userIds?: unknown; action?: unknown };
    const action = String(body.action || "").toLowerCase();
    if (!["disable", "enable", "preview-delete", "delete"].includes(action)) {
      return NextResponse.json({ error: "Choose disable, restore, or delete." }, { status: 400 });
    }
    if (!Array.isArray(body.userIds)) {
      return NextResponse.json({ error: "Select at least one account." }, { status: 400 });
    }

    const userIds = parseUserIds(body.userIds);
    if (!userIds.length) {
      return NextResponse.json({ error: "Select at least one valid account." }, { status: 400 });
    }
    const actionLimit = action === "preview-delete" || action === "delete" ? MAX_DELETE_USERS : MAX_BULK_USERS;
    if (userIds.length > actionLimit) {
      return NextResponse.json(
        { error: `Manage no more than ${actionLimit} accounts at once.` },
        { status: 400 }
      );
    }

    if (action === "preview-delete" || action === "delete") {
      const resolution = await resolveAccountSelection(context, userIds);
      if (action === "preview-delete") {
        return NextResponse.json({
          action,
          resolvedIds: resolution.resolvedIds,
          protectedIds: resolution.protectedIds,
          units: resolution.units,
        });
      }
      if (!resolution.resolvedIds.length) {
        return NextResponse.json({ error: "No deletable accounts remain in this selection." }, { status: 400 });
      }

      const verificationPhotos = await loadVerificationPhotos(context.admin, resolution.resolvedIds);
      const results: Array<{ userId: string; status: "deleted" | "failed"; error?: string; warning?: string }> = [];
      for (const userId of resolution.resolvedIds) {
        const profilePhotos = getPhotoUrls(resolution.profiles.get(userId)?.photos);
        const { error } = await context.actor.rpc("admin_delete_user_account", {
          p_user_id: userId,
          p_reason: "admin_bulk_removed",
          p_details: "Permanently removed from Bulk Accounts in the Yarri admin panel.",
        });
        if (error) {
          results.push({ userId, status: "failed", error: error.message });
          continue;
        }

        try {
          await ensureAuthUserDeleted(context.admin, userId);
        } catch (authDeleteError) {
          results.push({
            userId,
            status: "failed",
            error: `Profile data was removed, but Supabase Auth cleanup failed: ${getErrorMessage(authDeleteError, "Unknown Auth error")}`,
          });
          continue;
        }

        const storageWarning = await cleanupUserStorage(context.admin, userId, [
          ...profilePhotos,
          ...(verificationPhotos.get(userId) || []),
        ]);
        results.push({
          userId,
          status: "deleted",
          warning: storageWarning || undefined,
        });
      }

      return NextResponse.json({
        action,
        resolvedIds: resolution.resolvedIds,
        protectedIds: resolution.protectedIds,
        units: resolution.units,
        results,
        deletedIds: results.filter((result) => result.status === "deleted").map((result) => result.userId),
        failed: results.filter((result) => result.status === "failed"),
        storageWarnings: results.filter((result) => result.warning),
      });
    }

    const targetProfiles: Array<{ id: string; is_admin: boolean | null }> = [];
    for (const idBatch of chunkItems(userIds)) {
      const { data, error } = await context.admin
        .from("profiles")
        .select("id, is_admin")
        .in("id", idBatch);
      if (error) throw error;
      targetProfiles.push(...(data || []));
    }

    const allowedIds = (targetProfiles || [])
      .filter((profile) => !profile.is_admin && profile.id !== context.adminUserId)
      .map((profile) => String(profile.id));
    const protectedIds = userIds.filter((id) => !allowedIds.includes(id));
    const results: Array<{ userId: string; status: "updated" | "failed"; error?: string }> = [];

    const updateOne = async (userId: string) => {
      const disabling = action === "disable";
      const { error: authError } = await context.admin.auth.admin.updateUserById(userId, {
        ban_duration: disabling ? DISABLE_DURATION : "none",
      });
      if (authError) {
        results.push({ userId, status: "failed", error: authError.message });
        return;
      }

      const { error: profileError } = await context.admin
        .from("profiles")
        .update({ is_banned: disabling })
        .eq("id", userId);
      if (profileError) {
        await context.admin.auth.admin.updateUserById(userId, {
          ban_duration: disabling ? "none" : DISABLE_DURATION,
        });
        results.push({ userId, status: "failed", error: profileError.message });
        return;
      }

      results.push({ userId, status: "updated" });
    };

    for (let index = 0; index < allowedIds.length; index += 5) {
      await Promise.all(allowedIds.slice(index, index + 5).map(updateOne));
    }

    return NextResponse.json({
      action,
      results,
      protectedIds,
      updatedIds: results.filter((result) => result.status === "updated").map((result) => result.userId),
      failed: results.filter((result) => result.status === "failed"),
    });
  } catch (error) {
    const message = getErrorMessage(error, "Could not update these accounts.");
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
