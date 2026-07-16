import { NextResponse } from "next/server";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { isAllowedAdminEmail } from "@/lib/admin";
import type {
  DemoEntityInput,
  DemoMemberInput,
  DemoMode,
} from "@/lib/demoImport";
import {
  MAX_DEMO_IMPORT_ENTITIES,
  MAX_DEMO_IMPORT_MEMBERS,
} from "@/lib/demoImport";

export const runtime = "nodejs";

type ImportResult = {
  key: string;
  mode: DemoMode;
  status: "created" | "failed";
  accounts: Array<{ id: string; email: string; fullName: string }>;
  error?: string;
};

const AUTH_PAGE_SIZE = 1000;
const MAX_AUTH_SCAN_PAGES = 50;

type ExistingAuthUser = {
  id: string;
  email?: string;
  user_metadata?: Record<string, unknown>;
};

function requiredEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing server environment variable: ${name}`);
  return value;
}

function cleanError(error: unknown) {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    return String((error as { message?: unknown }).message || "Import failed.");
  }
  return "Import failed.";
}

function isMissingAuthUserError(error: unknown) {
  const status = error && typeof error === "object" && "status" in error
    ? Number((error as { status?: unknown }).status)
    : 0;
  const message = cleanError(error).toLowerCase();
  return status === 404 || message.includes("user not found") || message.includes("not found");
}

async function findAuthUsersByEmail(
  admin: SupabaseClient,
  emails: string[]
) {
  const wanted = new Set(emails.map((email) => email.trim().toLowerCase()).filter(Boolean));
  const found = new Map<string, ExistingAuthUser>();
  for (let page = 1; page <= MAX_AUTH_SCAN_PAGES && found.size < wanted.size; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: AUTH_PAGE_SIZE });
    if (error) throw error;
    const users = (data.users || []) as ExistingAuthUser[];
    users.forEach((user) => {
      const email = String(user.email || "").trim().toLowerCase();
      if (wanted.has(email)) found.set(email, user);
    });
    if (users.length < AUTH_PAGE_SIZE) break;
  }
  return found;
}

async function reclaimOrphanedDemoUsers(
  admin: SupabaseClient,
  entities: DemoEntityInput[]
) {
  const emails = entities.flatMap((entity) => entity.members.map((member) => member.email));
  const usersByEmail = await findAuthUsersByEmail(admin, emails);
  const authUsers = Array.from(usersByEmail.values());
  if (!authUsers.length) return new Map<string, string>();

  const { data: profileRows, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .in("id", authUsers.map((user) => user.id));
  if (profileError) throw profileError;
  const profileIds = new Set(((profileRows || []) as Array<{ id: string }>).map((profile) => String(profile.id)));
  const errors = new Map<string, string>();

  for (const [email, user] of usersByEmail) {
    const demoMarker = user.user_metadata?.demo_account;
    const isDemoAccount = demoMarker === true || String(demoMarker).toLowerCase() === "true";
    if (profileIds.has(user.id) || !isDemoAccount) continue;

    const { error } = await admin.auth.admin.deleteUser(user.id, false);
    if (error && !isMissingAuthUserError(error)) {
      errors.set(email, cleanError(error));
    }
  }
  return errors;
}

function validatePayload(entities: unknown): DemoEntityInput[] {
  if (!Array.isArray(entities) || !entities.length) {
    throw new Error("No validated demo accounts were supplied.");
  }
  if (entities.length > MAX_DEMO_IMPORT_ENTITIES) {
    throw new Error(`Import no more than ${MAX_DEMO_IMPORT_ENTITIES} profile sets at once.`);
  }

  let memberCount = 0;
  for (const entity of entities) {
    if (!entity || typeof entity !== "object") throw new Error("Invalid import payload.");
    const value = entity as Partial<DemoEntityInput>;
    if (!value.key || !["solo", "duo", "group"].includes(String(value.mode))) {
      throw new Error("Every profile set needs a valid entity key and mode.");
    }
    if (!Array.isArray(value.members)) throw new Error(`Entity ${value.key} has no members.`);
    const expected =
      value.mode === "solo"
        ? value.members.length === 1
        : value.mode === "duo"
          ? value.members.length === 2
          : value.members.length >= 2 && value.members.length <= 5;
    if (!expected) throw new Error(`Entity ${value.key} has the wrong number of members.`);

    memberCount += value.members.length;
    for (const member of value.members) {
      if (
        !member.email ||
        !member.password ||
        member.password.length < 6 ||
        !member.fullName ||
        !Array.isArray(member.photos)
      ) {
        throw new Error(`Entity ${value.key} contains an incomplete member.`);
      }
    }
  }

  if (memberCount > MAX_DEMO_IMPORT_MEMBERS) {
    throw new Error(`Import no more than ${MAX_DEMO_IMPORT_MEMBERS} member accounts at once.`);
  }
  return entities as DemoEntityInput[];
}

function buildPrompts(member: DemoMemberInput, entity: DemoEntityInput) {
  const prompts: Array<{ question: string; answer: string }> = [
    {
      question: "Birthday",
      answer: `${member.birthMonth}/${member.birthDay}/${member.birthYear}`,
    },
    { question: "Visible: Birthday", answer: String(!member.hideBirthday) },
    {
      question: "Preferred age range",
      answer: `${member.preferredAgeMin}-${member.preferredAgeMax}`,
    },
    { question: "Work status", answer: member.workStatus },
    { question: "School", answer: member.school },
    { question: "Hometown", answer: member.hometown },
    { question: "Ethnicity", answer: member.ethnicity },
    { question: "Preferred ethnicities", answer: member.preferredEthnicities.join(", ") },
    { question: "Religion", answer: member.religion },
    { question: "Workout", answer: member.workout },
    { question: "Smoking", answer: member.smoking },
    { question: "Drinking", answer: member.drinking },
    { question: "Diet", answer: member.diet },
    { question: "Pets", answer: member.pets },
    { question: "Sleep", answer: member.sleep },
    { question: "Lifestyle", answer: member.lifestyle },
  ];

  if (entity.mode !== "solo") {
    prompts.push(
      {
        question: entity.mode === "duo" ? "Duo name" : "Group name",
        answer: entity.shared.name,
      },
      { question: "What we like together", answer: entity.shared.activities.join(", ") }
    );
  }

  const groupQuestions = [
    "Our favorite group plan is...",
    "The vibe people should expect from us is...",
    "A perfect night with us looks like...",
  ];
  if (entity.mode === "group") {
    entity.shared.icebreakers.slice(0, 3).forEach((answer, index) => {
      prompts.push({ question: groupQuestions[index], answer });
    });
  }

  member.photoCaptions.forEach((answer, index) => {
    if (answer) prompts.push({ question: `Photo ${index + 1} caption`, answer });
  });

  return prompts.filter((prompt) => prompt.answer.trim());
}

function profilePayload(
  id: string,
  member: DemoMemberInput,
  entity: DemoEntityInput
) {
  const shared = entity.shared;
  return {
    id,
    email: member.email,
    full_name: member.fullName,
    age: member.age,
    gender: member.gender,
    interested_in: member.interestedIn,
    height: member.height || null,
    occupation: member.occupation || member.workStatus || null,
    education: member.education || null,
    lifestyle: member.lifestyle || shared.lifestyle || null,
    vibe: member.vibe || shared.vibe || null,
    intent: member.intent || shared.intent || null,
    looking_for: member.lookingFor || shared.lookingFor || null,
    photos: member.photos,
    city: member.city || shared.city,
    address_line: member.addressLine || null,
    state_region: member.stateRegion || null,
    postal_code: member.postalCode || null,
    country: member.country || null,
    search_radius_miles: member.searchRadiusMiles,
    bio: member.bio || shared.bio,
    interests: member.interests.slice(0, 8),
    prompts: buildPrompts(member, entity),
    dating_mode: entity.mode,
    is_verified: member.isVerified,
  };
}

export async function POST(request: Request) {
  try {
    const supabaseUrl = requiredEnv("NEXT_PUBLIC_SUPABASE_URL");
    const anonKey = requiredEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY");
    const authorization = request.headers.get("authorization") || "";
    const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";

    if (!token) return NextResponse.json({ error: "Admin session is required." }, { status: 401 });

    const verifier = createClient(supabaseUrl, anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userError } = await verifier.auth.getUser(token);
    if (userError || !isAllowedAdminEmail(userData.user?.email)) {
      return NextResponse.json({ error: "This account cannot import demo users." }, { status: 403 });
    }

    const body = (await request.json()) as { entities?: unknown };
    const entities = validatePayload(body.entities);
    const serviceRoleKey = requiredEnv("SUPABASE_SERVICE_ROLE_KEY");
    const admin = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const orphanReclaimErrors = await reclaimOrphanedDemoUsers(admin, entities);
    const results: ImportResult[] = [];

    for (const entity of entities) {
      const createdUsers: Array<{ id: string; email: string; fullName: string }> = [];
      let entityTable: "duos" | "groups" | null = null;
      let entityId = "";

      try {
        const blockedMember = entity.members.find((member) =>
          orphanReclaimErrors.has(member.email.trim().toLowerCase())
        );
        if (blockedMember) {
          throw new Error(
            `Could not clear the previous demo login for ${blockedMember.email}: ${orphanReclaimErrors.get(blockedMember.email.trim().toLowerCase())}`
          );
        }
        for (const member of entity.members) {
          const { data, error } = await admin.auth.admin.createUser({
            email: member.email,
            password: member.password,
            email_confirm: true,
            user_metadata: {
              display_name: member.fullName,
              dating_mode: entity.mode,
              demo_account: true,
              demo_entity_key: entity.key,
            },
          });
          if (error || !data.user) throw error || new Error(`Could not create ${member.email}.`);
          createdUsers.push({ id: data.user.id, email: member.email, fullName: member.fullName });
        }

        const profiles = entity.members.map((member, index) =>
          profilePayload(createdUsers[index].id, member, entity)
        );
        const { error: profileError } = await admin.from("profiles").upsert(profiles, {
          onConflict: "id",
        });
        if (profileError) throw profileError;

        if (entity.mode === "duo") {
          entityTable = "duos";
          const { data, error } = await admin
            .from("duos")
            .insert({
              user1_id: createdUsers[0].id,
              user2_id: createdUsers[1].id,
              is_verified: entity.members.every((member) => member.isVerified),
            })
            .select("id")
            .single();
          if (error || !data?.id) throw error || new Error("Could not create the Duo relationship.");
          entityId = String(data.id);
        }

        if (entity.mode === "group") {
          entityTable = "groups";
          const { data, error } = await admin
            .from("groups")
            .insert({ is_verified: entity.members.every((member) => member.isVerified) })
            .select("id")
            .single();
          if (error || !data?.id) throw error || new Error("Could not create the Group relationship.");
          entityId = String(data.id);

          const { error: memberError } = await admin.from("group_members").insert(
            createdUsers.map((user) => ({ group_id: entityId, user_id: user.id }))
          );
          if (memberError) throw memberError;
        }

        results.push({
          key: entity.key,
          mode: entity.mode,
          status: "created",
          accounts: createdUsers,
        });
      } catch (error) {
        if (entityTable && entityId) {
          await admin.from(entityTable).delete().eq("id", entityId);
        }
        for (const user of [...createdUsers].reverse()) {
          await admin.auth.admin.deleteUser(user.id);
        }
        results.push({
          key: entity.key,
          mode: entity.mode,
          status: "failed",
          accounts: [],
          error: cleanError(error),
        });
      }
    }

    return NextResponse.json({
      results,
      createdEntities: results.filter((result) => result.status === "created").length,
      failedEntities: results.filter((result) => result.status === "failed").length,
      createdAccounts: results.reduce((count, result) => count + result.accounts.length, 0),
    });
  } catch (error) {
    const message = cleanError(error);
    const status = message.includes("SUPABASE_SERVICE_ROLE_KEY") ? 503 : 400;
    return NextResponse.json({ error: message }, { status });
  }
}
