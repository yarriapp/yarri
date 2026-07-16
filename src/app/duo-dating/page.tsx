import type { Metadata } from "next";
import { HeartHandshake, MessagesSquare, SlidersHorizontal, UserRoundPlus } from "lucide-react";
import ModeDetailPage from "@/components/ModeDetailPage";

export const metadata: Metadata = {
  title: "Duo Dating",
  description: "Learn how Yarri Duo Dating lets two friends build a shared profile, discover other duos, match together, and share a conversation.",
};

const steps = [
  { icon: UserRoundPlus, title: "Build both member stories", copy: "Set up each person with their own photos, interests, preferences, prompts, and personality." },
  { icon: HeartHandshake, title: "Create the duo identity", copy: "Add a shared name, location, bio, and the things you both enjoy doing together." },
  { icon: SlidersHorizontal, title: "Discover other duos", copy: "Browse other two-person profiles, with member preferences helping shape who appears first." },
  { icon: MessagesSquare, title: "Match and talk together", copy: "When both duos like each other, the connection becomes a shared match and duo conversation." },
];

const faqs = [
  { question: "Is Duo Dating the same as a Solo match?", answer: "No. Duo has its own shared profile, discovery feed, duo-to-duo likes, mutual matches, and duo conversations." },
  { question: "What appears on a Duo profile?", answer: "Both member profiles appear alongside shared details such as the duo name, city, bio, interests, photos, and what the pair is looking for." },
  { question: "How does a Duo match happen?", answer: "Your duo can like another duo. When the other duo likes yours back, Yarri creates a mutual Duo match and opens the shared conversation." },
  { question: "Do preferences still matter?", answer: "Yes. Yarri evaluates member preferences on both sides and uses those signals to prioritize the most relevant duos first." },
];

export default function DuoDatingPage() {
  return (
    <ModeDetailPage
      mode="Duo"
      heroImage="/yarri-duo-hero.png"
      heroAlt="Two pairs of friends meeting together at sunset"
      eyebrow="Bring one person you trust"
      headline="The confidence of a friend, built into discovery."
      intro="Duo Dating lets two people show up as one shared profile, meet another duo, and let the connection grow with everyone already in the room."
      stats={["2 members", "1 shared Duo profile", "1 shared match space"]}
      memberCount={2}
      identityTitle="Two complete people. One clear shared story."
      identityCopy="A Duo profile keeps both people visible while adding the context that belongs to the pair. No one disappears behind a generic group photo."
      identityPoints={["Individual photos, prompts, interests, and preferences", "Shared duo name, bio, city, radius, and activities", "A combined discovery profile designed for double dates and social chemistry"]}
      steps={steps}
      discoveryTitle="Yarri looks at the people inside each duo."
      discoveryCopy="Duo discovery is not random pair-to-pair browsing. The app checks how member preferences align, then orders the available duos so stronger preference fits can appear first."
      discoveryPoints={["Pass, Like, or use a premium reaction as your duo", "Mutual duo likes create a dedicated Duo match"]}
      faqs={faqs}
      otherModeHref="/group-dating"
      otherModeLabel="Group Dating"
    />
  );
}
