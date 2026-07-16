import type { LucideIcon } from "lucide-react";
import { ArrowRight, Check, MessageCircleMore, SlidersHorizontal, UsersRound } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import PublicFooter from "./PublicFooter";
import PublicHeader from "./PublicHeader";

export type ModeStep = {
  icon: LucideIcon;
  title: string;
  copy: string;
};

type ModeDetailPageProps = {
  mode: "Duo" | "Group";
  heroImage: string;
  heroAlt: string;
  eyebrow: string;
  headline: string;
  intro: string;
  stats: string[];
  memberCount: number;
  identityTitle: string;
  identityCopy: string;
  identityPoints: string[];
  steps: ModeStep[];
  discoveryTitle: string;
  discoveryCopy: string;
  discoveryPoints: string[];
  faqs: { question: string; answer: string }[];
  otherModeHref: string;
  otherModeLabel: string;
};

export default function ModeDetailPage({
  mode,
  heroImage,
  heroAlt,
  eyebrow,
  headline,
  intro,
  stats,
  memberCount,
  identityTitle,
  identityCopy,
  identityPoints,
  steps,
  discoveryTitle,
  discoveryCopy,
  discoveryPoints,
  faqs,
  otherModeHref,
  otherModeLabel,
}: ModeDetailPageProps) {
  const modeKey = mode.toLowerCase();

  return (
    <main className={`yarri-site yarri-mode-page yarri-mode-page-${modeKey}`}>
      <section className="yarri-mode-hero">
        <Image src={heroImage} alt={heroAlt} fill priority sizes="100vw" />
        <div className="yarri-mode-hero-shade" aria-hidden="true" />
        <PublicHeader overlay />
        <div className="yarri-mode-hero-copy">
          <p className="yarri-eyebrow">{eyebrow}</p>
          <h1>{mode} Dating</h1>
          <p className="yarri-mode-hero-headline">{headline}</p>
          <p>{intro}</p>
          <a className="yarri-hero-action" href="#how-it-works">
            <span>See how it works</span><ArrowRight size={18} aria-hidden="true" />
          </a>
        </div>
        <div className="yarri-mode-stats">
          {stats.map((stat) => <span key={stat}>{stat}</span>)}
        </div>
      </section>

      <section className="yarri-mode-explainer" id="how-it-works">
        <div className="yarri-section-heading yarri-section-heading-left">
          <p className="yarri-kicker">The full {mode} journey</p>
          <h2>From your shared identity to a shared conversation.</h2>
          <p>This is a complete Yarri mode, not a group tag added to a Solo profile.</p>
        </div>
        <div className="yarri-mode-step-grid">
          {steps.map(({ icon: Icon, title, copy }, index) => (
            <article key={title}>
              <div><Icon size={24} aria-hidden="true" /></div>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="yarri-identity-band">
        <div className="yarri-identity-diagram" aria-label={`${mode} profile structure`}>
          <div className="yarri-identity-members">
            {Array.from({ length: memberCount }).map((_, index) => (
              <span key={index}>M{index + 1}</span>
            ))}
          </div>
          <div className="yarri-identity-connector" aria-hidden="true" />
          <div className="yarri-shared-identity">
            <UsersRound size={32} aria-hidden="true" />
            <strong>1 shared {mode.toLowerCase()} profile</strong>
          </div>
        </div>
        <div className="yarri-identity-copy">
          <p className="yarri-kicker">Built together</p>
          <h2>{identityTitle}</h2>
          <p>{identityCopy}</p>
          <ul>
            {identityPoints.map((point) => <li key={point}><Check size={17} aria-hidden="true" />{point}</li>)}
          </ul>
        </div>
      </section>

      <section className="yarri-discovery-story">
        <div className="yarri-discovery-orbit" aria-hidden="true">
          <span className="yarri-discovery-self">Your {mode}</span>
          <span className="yarri-discovery-candidate yarri-candidate-one">A</span>
          <span className="yarri-discovery-candidate yarri-candidate-two">B</span>
          <span className="yarri-discovery-candidate yarri-candidate-three">C</span>
          <HeartLine />
        </div>
        <div className="yarri-discovery-copy">
          <p className="yarri-kicker">Discovery with context</p>
          <h2>{discoveryTitle}</h2>
          <p>{discoveryCopy}</p>
          <div className="yarri-discovery-points">
            <div><SlidersHorizontal size={22} /><span><strong>Preferences first</strong>Profiles aligned with member preferences are prioritized in discovery.</span></div>
            {discoveryPoints.map((point) => <div key={point}><Check size={20} /><span>{point}</span></div>)}
            <div><MessageCircleMore size={22} /><span><strong>One shared match space</strong>A mutual like opens the right {mode.toLowerCase()} conversation.</span></div>
          </div>
        </div>
      </section>

      <section className="yarri-mode-faq">
        <div className="yarri-section-heading yarri-section-heading-left">
          <p className="yarri-kicker">Clear before you begin</p>
          <h2>{mode} Dating questions.</h2>
        </div>
        <div className="yarri-faq-list">
          {faqs.map((faq) => (
            <details key={faq.question}>
              <summary>{faq.question}<span aria-hidden="true">+</span></summary>
              <p>{faq.answer}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="yarri-mode-next">
        <p className="yarri-kicker">Another way to begin</p>
        <h2>Curious about {otherModeLabel}?</h2>
        <Link href={otherModeHref}>Explore {otherModeLabel}<ArrowRight size={18} aria-hidden="true" /></Link>
      </section>
      <PublicFooter />
    </main>
  );
}

function HeartLine() {
  return <span className="yarri-discovery-pulse" />;
}
