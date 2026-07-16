import type { Metadata } from "next";
import { ArrowRight, HeartHandshake, UserRound, UsersRound } from "lucide-react";
import Link from "next/link";
import PublicInfoPage from "@/components/PublicInfoPage";

export const metadata: Metadata = {
  title: "About Us",
  description: "Why Yarri is building Solo, Duo, and Group Dating for more natural ways to meet.",
};

export default function AboutPage() {
  return (
    <PublicInfoPage
      eyebrow="About Yarri"
      title="Connection should fit real life."
      intro="Sometimes you want to meet one person. Sometimes a trusted friend makes the first step easier. Sometimes the whole group is the energy. Yarri was built for all three."
    >
      <section className="yarri-info-feature">
        <div><p className="yarri-kicker">Our point of view</p><h2>More ways to begin can create more natural chemistry.</h2></div>
        <p>Yarri keeps the familiar one-to-one experience while treating Duo and Group as complete dating modes, each with its own identity, discovery, matching, and conversation flow.</p>
      </section>
      <section className="yarri-about-values">
        <article><UserRound size={27} /><h2>Solo</h2><p>Personal discovery with detailed profiles and expressive ways to start a conversation.</p></article>
        <article><HeartHandshake size={27} /><h2>Duo</h2><p>Two friends build one shared profile and meet another duo with confidence already beside them.</p><Link href="/duo-dating">Explore Duo <ArrowRight size={16} /></Link></article>
        <article><UsersRound size={27} /><h2>Group</h2><p>Up to five people create a group identity, discover other groups, and turn matching into a social plan.</p><Link href="/group-dating">Explore Group <ArrowRight size={16} /></Link></article>
      </section>
      <section className="yarri-info-section"><h2>What we are building toward</h2><p>A dating experience where identity feels richer, preferences make discovery more relevant, safety tools remain close, and a match can begin with less pressure and more context.</p></section>
    </PublicInfoPage>
  );
}
