import { supabase } from "@/lib/supabase";

type DuoMembership = {
  id: string;
  user1_id: string | null;
  user2_id: string | null;
};

type GroupMembership = {
  group_id: string | null;
};

export async function syncSharedVerificationForProfile(profileId: string) {
  const { data: duoRows, error: duoError } = await supabase
    .from("duos")
    .select("id, user1_id, user2_id")
    .or(`user1_id.eq.${profileId},user2_id.eq.${profileId}`);

  if (duoError) throw duoError;

  for (const duo of (duoRows || []) as DuoMembership[]) {
    const memberIds = [duo.user1_id, duo.user2_id].filter(Boolean) as string[];
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, is_verified")
      .in("id", memberIds);

    if (profileError) throw profileError;

    const allVerified =
      memberIds.length === 2 &&
      memberIds.every((memberId) =>
        (profiles || []).some(
          (profile) => profile.id === memberId && profile.is_verified === true
        )
      );

    const { error: updateError } = await supabase
      .from("duos")
      .update({ is_verified: allVerified })
      .eq("id", duo.id);

    if (updateError) throw updateError;
  }

  const { data: membershipRows, error: membershipError } = await supabase
    .from("group_members")
    .select("group_id")
    .eq("user_id", profileId);

  if (membershipError) throw membershipError;

  for (const membership of (membershipRows || []) as GroupMembership[]) {
    if (!membership.group_id) continue;

    const { data: memberRows, error: memberError } = await supabase
      .from("group_members")
      .select("user_id")
      .eq("group_id", membership.group_id);

    if (memberError) throw memberError;

    const memberIds = (memberRows || [])
      .map((member) => member.user_id)
      .filter(Boolean) as string[];
    const { data: profiles, error: profileError } = await supabase
      .from("profiles")
      .select("id, is_verified")
      .in("id", memberIds);

    if (profileError) throw profileError;

    const allVerified =
      memberIds.length > 0 &&
      memberIds.every((memberId) =>
        (profiles || []).some(
          (profile) => profile.id === memberId && profile.is_verified === true
        )
      );

    const { error: updateError } = await supabase
      .from("groups")
      .update({ is_verified: allVerified })
      .eq("id", membership.group_id);

    if (updateError) throw updateError;
  }
}
