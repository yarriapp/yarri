import type { Metadata } from "next";
import PublicInfoPage from "@/components/PublicInfoPage";

export const metadata: Metadata = { title: "Privacy Policy", description: "Yarri Privacy Policy." };

export default function PrivacyPage() {
  return (
    <PublicInfoPage eyebrow="Legal" title="Privacy Policy" intro="This policy explains the information Yarri processes, why it is used, and the choices available to people using the service." updated="July 13, 2026">
      <section className="yarri-info-section"><h2>1. Information you provide</h2><p>We may process account details, profile information, birthdays and visibility choices, photos, prompts, interests, preferences, location details, verification submissions, messages, reactions, reports, purchase records, and support communications.</p></section>
      <section className="yarri-info-section"><h2>2. Information created through use</h2><p>We may process likes, passes, matches, blocks, unmatches, notifications, device and push-token information, feature usage, timestamps, and technical data needed to operate and secure Yarri.</p></section>
      <section className="yarri-info-section"><h2>3. How information is used</h2><p>Information is used to create and display profiles, apply discovery preferences, provide Solo, Duo, and Group functionality, deliver conversations and notifications, process purchases, verify accounts, prevent misuse, provide support, and improve the service.</p></section>
      <section className="yarri-info-section"><h2>4. Duo and Group information</h2><p>Shared profiles combine information from their members. Details submitted for another member should be provided with that person&apos;s knowledge and permission. Members of a shared mode may see information and activity associated with that shared profile and its matches.</p></section>
      <section className="yarri-info-section"><h2>5. Service providers and legal disclosures</h2><p>Information may be processed by providers that support hosting, authentication, storage, payments, notifications, analytics, moderation, and customer support. Information may also be disclosed when required by law, to protect safety and rights, or during a business transaction.</p></section>
      <section className="yarri-info-section"><h2>6. Retention and security</h2><p>We retain information for as long as reasonably needed to provide the service, meet legal obligations, resolve disputes, and protect the platform. We use administrative and technical safeguards, but no online service can guarantee absolute security.</p></section>
      <section className="yarri-info-section"><h2>7. Your choices</h2><p>You may edit profile information, manage birthday visibility, adjust discovery settings, control notifications, block or unmatch profiles, and request account deletion through the available Yarri controls.</p></section>
      <section className="yarri-info-section"><h2>8. Age requirement and changes</h2><p>Yarri is intended only for adults aged 18 or older. We may update this policy as the service evolves and will publish the updated date on this page.</p></section>
      <section className="yarri-info-section"><h2>9. Contact</h2><p>Privacy questions can be sent to <a href="mailto:privacy@yarri.com">privacy@yarri.com</a>.</p></section>
    </PublicInfoPage>
  );
}
