import type { Metadata } from "next";
import PublicInfoPage from "@/components/PublicInfoPage";

export const metadata: Metadata = { title: "Terms of Service", description: "Yarri Terms of Service." };

export default function TermsPage() {
  return (
    <PublicInfoPage eyebrow="Legal" title="Terms of Service" intro="These terms describe the rules for accessing and using Yarri across Solo, Duo, and Group modes." updated="July 13, 2026">
      <section className="yarri-info-section"><h2>1. Eligibility</h2><p>You must be at least 18 years old and legally able to enter into these terms. You agree to provide accurate information and use Yarri only in compliance with applicable law.</p></section>
      <section className="yarri-info-section"><h2>2. Accounts and shared profiles</h2><p>You are responsible for your account credentials and account activity. When creating or joining a Duo or Group profile, you must have permission to provide information about every member and must not impersonate another person.</p></section>
      <section className="yarri-info-section"><h2>3. Acceptable conduct</h2><p>You may not harass, threaten, deceive, exploit, discriminate against, stalk, spam, or harm another person; post unlawful or infringing content; create fraudulent profiles; scrape the service; bypass access controls; or use Yarri for commercial solicitation without permission.</p></section>
      <section className="yarri-info-section"><h2>4. Content and conversations</h2><p>You keep ownership of content you submit. You grant Yarri the rights reasonably necessary to host, display, process, and deliver that content as part of the service. You are responsible for ensuring you have the right to share it.</p></section>
      <section className="yarri-info-section"><h2>5. Purchases and premium access</h2><p>Prices, duration, included features, and renewal terms are shown at purchase. Payments may be processed by an app store or payment provider and may be subject to that provider&apos;s terms. Premium access may begin after successful payment confirmation.</p></section>
      <section className="yarri-info-section"><h2>6. Safety and real-world meetings</h2><p>Yarri cannot guarantee another person&apos;s identity, intentions, statements, or conduct. Use good judgment, protect private information, meet publicly, tell someone where you are going, and use blocking or reporting tools when needed.</p></section>
      <section className="yarri-info-section"><h2>7. Suspension and termination</h2><p>Access may be limited or terminated when these terms are violated, safety is at risk, the law requires it, or continued access could harm Yarri or its community. You may stop using Yarri and request account deletion.</p></section>
      <section className="yarri-info-section"><h2>8. Service availability and liability</h2><p>Yarri is provided on an as-available basis. Features may change, pause, or end. To the extent permitted by law, Yarri is not responsible for indirect or consequential losses or for conduct occurring outside the service.</p></section>
      <section className="yarri-info-section"><h2>9. Changes and contact</h2><p>We may update these terms as Yarri evolves. Continued use after an updated version takes effect means you accept the revised terms. Questions can be sent to <a href="mailto:support@yarri.com">support@yarri.com</a>.</p></section>
    </PublicInfoPage>
  );
}
