import { randomUUID } from "node:crypto";
import nextEnv from "@next/env";
import { createClient } from "@supabase/supabase-js";

nextEnv.loadEnvConfig(process.cwd());

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Supabase environment variables are missing.");
}

const service = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const createdUserIds = [];
const stamp = `${Date.now()}-${randomUUID().slice(0, 8)}`;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createTestSession(label) {
  const email = `codex-support-${label}-${stamp}@example.com`;
  const password = `Yarri!${randomUUID()}Aa1`;
  const { data, error } = await service.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  if (error || !data.user) throw error || new Error("Test user creation failed.");
  createdUserIds.push(data.user.id);

  const client = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const signIn = await client.auth.signInWithPassword({ email, password });
  if (signIn.error) throw signIn.error;
  return { client, userId: data.user.id };
}

try {
  const owner = await createTestSession("owner");
  const outsider = await createTestSession("outsider");

  const createResponse = await owner.client.rpc("create_support_ticket", {
    p_subject: "Live support workflow check",
    p_category: "technical",
    p_message: "Temporary automated ticket used to verify the complete support workflow.",
  });
  if (createResponse.error) throw createResponse.error;

  const createdTicket = Array.isArray(createResponse.data)
    ? createResponse.data[0]
    : createResponse.data;
  const ticketId = createdTicket?.ticket_id;
  assert(ticketId, "Ticket RPC did not return a ticket ID.");

  const ownerTicket = await owner.client
    .from("support_tickets")
    .select("id, status")
    .eq("id", ticketId)
    .single();
  if (ownerTicket.error) throw ownerTicket.error;
  assert(ownerTicket.data.status === "waiting_on_support", "New ticket status is incorrect.");

  const outsiderRead = await outsider.client
    .from("support_tickets")
    .select("id")
    .eq("id", ticketId);
  if (outsiderRead.error) throw outsiderRead.error;
  assert((outsiderRead.data || []).length === 0, "Another user could read the private ticket.");

  const outsiderReply = await outsider.client.rpc("reply_to_support_ticket", {
    p_ticket_id: ticketId,
    p_message: "This reply must be rejected.",
  });
  assert(Boolean(outsiderReply.error), "Another user could reply to the private ticket.");

  let adminUser;
  for (let page = 1; page <= 100 && !adminUser; page += 1) {
    const usersResponse = await service.auth.admin.listUsers({ page, perPage: 100 });
    if (usersResponse.error) throw usersResponse.error;
    adminUser = usersResponse.data.users.find(
      (user) => String(user.email || "").toLowerCase() === "jtoor779@gmail.com"
    );
    if (usersResponse.data.users.length < 100) break;
  }
  assert(adminUser, "Admin auth account was not found.");

  const adminMessage = await service.from("support_ticket_messages").insert({
    ticket_id: ticketId,
    sender_user_id: adminUser.id,
    sender_role: "admin",
    message: "Temporary admin reply used to verify notifications and status updates.",
  });
  if (adminMessage.error) throw adminMessage.error;

  const afterAdminReply = await owner.client
    .from("support_tickets")
    .select("status")
    .eq("id", ticketId)
    .single();
  if (afterAdminReply.error) throw afterAdminReply.error;
  assert(afterAdminReply.data.status === "waiting_on_user", "Admin reply did not update status.");

  const visibleMessages = await owner.client
    .from("support_ticket_messages")
    .select("sender_role")
    .eq("ticket_id", ticketId);
  if (visibleMessages.error) throw visibleMessages.error;
  assert(
    (visibleMessages.data || []).some((message) => message.sender_role === "admin"),
    "Owner could not read the admin reply."
  );

  const notification = await service
    .from("app_notifications")
    .select("id, navigation_path")
    .eq("recipient_user_id", owner.userId)
    .eq("target_entity_id", ticketId)
    .eq("notification_type", "admin");
  if (notification.error) throw notification.error;
  assert(notification.data?.[0]?.navigation_path === "/support-ticket", "Support notification was not created.");

  const ownerReply = await owner.client.rpc("reply_to_support_ticket", {
    p_ticket_id: ticketId,
    p_message: "Temporary owner follow-up reply.",
  });
  if (ownerReply.error) throw ownerReply.error;

  const afterOwnerReply = await owner.client
    .from("support_tickets")
    .select("status")
    .eq("id", ticketId)
    .single();
  if (afterOwnerReply.error) throw afterOwnerReply.error;
  assert(afterOwnerReply.data.status === "waiting_on_support", "Owner reply did not update status.");

  const closeTicket = await service
    .from("support_tickets")
    .update({ status: "closed" })
    .eq("id", ticketId);
  if (closeTicket.error) throw closeTicket.error;

  const closedReply = await owner.client.rpc("reply_to_support_ticket", {
    p_ticket_id: ticketId,
    p_message: "This closed-ticket reply must be rejected.",
  });
  assert(Boolean(closedReply.error), "Closed ticket accepted a new reply.");

  console.log(
    JSON.stringify({
      ticketCreated: true,
      ownerRead: true,
      outsiderDenied: true,
      adminReplyVisible: true,
      notificationCreated: true,
      statusTransitions: true,
      closedReplyDenied: true,
    })
  );
} finally {
  for (const userId of createdUserIds.reverse()) {
    await service.auth.admin.deleteUser(userId);
  }
}
