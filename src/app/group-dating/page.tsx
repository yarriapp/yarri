import type { Metadata } from "next";
import { HeartHandshake, MessagesSquare, SlidersHorizontal, UsersRound } from "lucide-react";
import ModeDetailPage from "@/components/ModeDetailPage";

export const metadata: Metadata = {
  title: "Group Dating",
  description: "Learn how Yarri Group Dating lets up to five people create one group profile, discover other groups, match mutually, and share a group conversation.",
};

const steps = [
  { icon: UsersRound, title: "Add your circle", copy: "Create member profiles for your group, with individual photos, interests, preferences, and details for each person." },
  { icon: HeartHandshake, title: "Shape the group identity", copy: "Choose a group name, photos, activities, vibe, intent, location, and what the group wants to find." },
  { icon: SlidersHorizontal, title: "Discover other groups", copy: "Browse complete group profiles while member preferences help prioritize relevant circles first." },
  { icon: MessagesSquare, title: "Match the whole group", copy: "A mutual group like creates a Group match and opens the shared conversation for the connection." },
];

const faqs = [
  { question: "How many people can be in a Yarri group?", answer: "A Group profile can include up to five members. Each member can carry their own photos, interests, details, and preferences." },
  { question: "Does the group have one shared profile?", answer: "Yes. Yarri combines the member stories with shared group photos, name, bio, activities, vibe, intent, location, and discovery radius." },
  { question: "How does Group discovery work?", answer: "Groups browse other group profiles. Yarri uses member preference signals to prioritize stronger fits while still keeping the broader eligible community discoverable." },
  { question: "When does a Group chat open?", answer: "Your group can like another group. When that group likes yours back, Yarri creates the mutual Group match and the shared conversation becomes available." },
];

export default function GroupDatingPage() {
  return (
    <ModeDetailPage
      mode="Group"
      heroImage="/yarri-group-hero.png"
      heroAlt="Two groups of friends meeting for an evening together"
      eyebrow="Bring the people who bring out your best"
      headline="Turn matching into a social plan from the start."
      intro="Group Dating gives your circle a shared identity, a group discovery feed, mutual group matches, and one place to begin the conversation together."
      stats={["Up to 5 members", "1 shared Group profile", "Group-to-group matching"]}
      memberCount={5}
      identityTitle="A whole circle, without losing the individuals."
      identityCopy="The group profile tells the shared story while keeping every member visible. People can understand the energy of the group and who is actually part of it."
      identityPoints={["Individual member photos, interests, preferences, and prompts", "Shared group name, photos, activities, vibe, intent, and location", "A complete group identity for social dates, friendship, and new experiences"]}
      steps={steps}
      discoveryTitle="The group is visible, and the members still matter."
      discoveryCopy="Yarri evaluates preference signals across the people inside each group, then combines those signals with relevant discovery settings to order eligible groups."
      discoveryPoints={["Pass, Like, or use a premium reaction as the group", "Mutual group likes create a dedicated Group match"]}
      faqs={faqs}
      otherModeHref="/duo-dating"
      otherModeLabel="Duo Dating"
    />
  );
}
