import type { Metadata } from "next";
import { Mail, ShieldCheck } from "lucide-react";
import PublicInfoPage from "@/components/PublicInfoPage";

export const metadata: Metadata = { title: "Contact", description: "Contact Yarri support and privacy teams." };

export default function ContactPage() {
  return (
    <PublicInfoPage eyebrow="Contact Yarri" title="We are here to help." intro="Choose the address that best fits your question. Include the email connected to your Yarri account when you need account-specific help.">
      <section className="yarri-contact-grid">
        <a href="mailto:support@yarri.com"><Mail size={27} /><span><strong>Product and account support</strong>support@yarri.com</span></a>
        <a href="mailto:privacy@yarri.com"><ShieldCheck size={27} /><span><strong>Privacy requests</strong>privacy@yarri.com</span></a>
      </section>
      <section className="yarri-info-section"><h2>Safety concerns</h2><p>Use Yarri&apos;s in-app report and block controls when the concern involves a profile, match, or conversation. These controls preserve the relevant connection context for review.</p></section>
    </PublicInfoPage>
  );
}
