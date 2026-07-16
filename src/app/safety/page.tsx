import type { Metadata } from "next";
import { BellRing, EyeOff, ShieldCheck, UserCheck } from "lucide-react";
import PublicInfoPage from "@/components/PublicInfoPage";

export const metadata: Metadata = {
  title: "Safety",
  description: "The profile, privacy, reporting, blocking, and notification controls built into Yarri.",
};

const safetyItems = [
  { icon: UserCheck, title: "Profile verification", copy: "Verification requests can be reviewed so approved profiles carry a clear trust signal." },
  { icon: EyeOff, title: "Privacy choices", copy: "People can choose whether their birthday appears publicly and can keep premium likes private until access is active." },
  { icon: ShieldCheck, title: "Connection controls", copy: "Blocking, reporting, passing, unmatching, and account moderation help people control unwanted access." },
  { icon: BellRing, title: "Relevant notifications", copy: "Messages, matches, likes, replies, and other important activity can reach the right people without exposing private content." },
];

export default function SafetyPage() {
  return (
    <PublicInfoPage
      eyebrow="Safety at Yarri"
      title="Trust is not an extra screen."
      intro="It is part of how profiles, discovery, matches, conversations, privacy choices, and moderation work across Solo, Duo, and Group."
    >
      <section className="yarri-safety-page-grid">
        {safetyItems.map(({ icon: Icon, title, copy }, index) => <article key={title}><span>{String(index + 1).padStart(2, "0")}</span><Icon size={27} /><h2>{title}</h2><p>{copy}</p></article>)}
      </section>
      <section className="yarri-info-section"><h2>Shared modes still keep people visible</h2><p>Duo and Group profiles are designed to show the people inside the shared identity. Member details and photos help everyone understand who is part of the connection before a match begins.</p></section>
      <section className="yarri-info-section"><h2>Use the tools early</h2><p>Do not continue a conversation that feels unsafe or unwanted. Block, report, or unmatch when needed, protect personal contact and location details, and meet in a public place when moving from Yarri to real life.</p></section>
    </PublicInfoPage>
  );
}
