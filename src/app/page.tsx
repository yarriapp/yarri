import {
  BellRing,
  HeartHandshake,
  Images,
  MessagesSquare,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
  UsersRound,
} from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import HeroCarousel from "@/components/HeroCarousel";
import PublicFooter from "@/components/PublicFooter";
import TiltModeCard from "@/components/TiltModeCard";

const experiencePoints = [
  { icon: Images, title: "A profile with texture", copy: "Photos, captions, interests, prompts, and the details that make a first message easier." },
  { icon: SlidersHorizontal, title: "Preferences lead", copy: "Yarri shows the broad community while putting the people who fit your preferences first." },
  { icon: MessagesSquare, title: "Conversation has range", copy: "Share photos, reply to a specific message, react, send voice notes, and keep context intact." },
  { icon: BellRing, title: "Moments reach you", copy: "Likes, matches, messages, replies, and reactions can arrive as timely notifications." },
];

const trustPoints = [
  ["Verified profiles", "Profile verification helps real people stand out with confidence."],
  ["Your privacy, your choice", "Control what appears publicly, including whether your birthday is shown."],
  ["Safer connections", "Block, report, unmatch, and control who remains connected with you."],
  ["Private premium moments", "Choose when to reveal who liked you through plans made for each Yarri mode."],
];

export default function HomePage() {
  return (
    <main className="yarri-site yarri-site-v2">
      <HeroCarousel />

      <section className="yarri-usp-intro" id="ways">
        <div className="yarri-usp-statement">
          <p className="yarri-kicker">The Yarri difference</p>
          <h2>Dating does not have to start alone.</h2>
        </div>
        <p className="yarri-usp-copy">
          Most dating apps begin with one profile and one swipe. Yarri keeps that
          familiar Solo experience, then opens two new doors: bring one trusted
          friend in Duo mode or bring your circle in Group mode.
        </p>
      </section>

      <section className="yarri-mode-showcase" aria-label="Yarri social dating modes">
        <TiltModeCard
          href="/duo-dating"
          image="/yarri-duo-hero.png"
          alt="Two duos meeting together"
          eyebrow="Two friends, one shared profile"
          title="Duo Dating"
          copy="Less first-date pressure. More confidence, context, and shared energy from the first hello."
          flow={["Build together", "Discover duos", "Match together", "Shared chat"]}
        />
        <TiltModeCard
          href="/group-dating"
          image="/yarri-group-hero.png"
          alt="Two groups meeting for a social evening"
          eyebrow="Up to five people, one group identity"
          title="Group Dating"
          copy="Turn discovery into a social plan where the whole group can meet, match, and talk together."
          flow={["Add your circle", "Discover groups", "Mutual like", "Group chat"]}
        />
      </section>

      <section className="yarri-social-logic">
        <div className="yarri-social-logic-heading">
          <p className="yarri-kicker">A smarter social starting point</p>
          <h2>Your people make the first step feel easier.</h2>
          <p>
            Duo and Group are not side features. They are complete dating modes
            with their own shared profiles, discovery, likes, matches, and conversations.
          </p>
        </div>
        <div className="yarri-logic-grid">
          <article>
            <div className="yarri-logic-icon"><UserRound size={25} /><UserRound size={25} /></div>
            <span>01</span>
            <h3>Show who is coming</h3>
            <p>Every member brings photos, interests, preferences, and personality into one clear shared identity.</p>
          </article>
          <article>
            <div className="yarri-logic-icon"><UsersRound size={28} /></div>
            <span>02</span>
            <h3>Discover as a team</h3>
            <p>Browse other duos or groups while Yarri prioritizes profiles that align with member preferences.</p>
          </article>
          <article>
            <div className="yarri-logic-icon"><HeartHandshake size={28} /></div>
            <span>03</span>
            <h3>Make it mutual</h3>
            <p>A shared match begins when both sides like each other, keeping the connection intentional.</p>
          </article>
          <article>
            <div className="yarri-logic-icon"><MessagesSquare size={28} /></div>
            <span>04</span>
            <h3>Talk in one place</h3>
            <p>The match opens into the right shared conversation, ready for everyone involved to connect.</p>
          </article>
        </div>
      </section>

      <section className="yarri-feature-band yarri-feature-dark" id="experience">
        <div className="yarri-feature-inner">
          <div className="yarri-phone-wrap yarri-phone-depth">
            <div className="yarri-phone yarri-phone-product">
              <div className="yarri-phone-bar"><strong>Yarri</strong><span>Discovery</span></div>
              <div className="yarri-legacy-mask" aria-hidden="true" />
              <Image src="/yarri-discovery.jpeg" alt="Yarri discovery profile" width={589} height={1280} sizes="(max-width: 760px) 78vw, 360px" />
            </div>
          </div>
          <div className="yarri-feature-copy">
            <p className="yarri-kicker">Inside the experience</p>
            <h2>Real detail creates better reasons to connect.</h2>
            <p>
              Yarri gives people more than a face and a button. Profiles carry
              context, and every mode keeps discovery focused on the people behind the match.
            </p>
            <div className="yarri-experience-list">
              {experiencePoints.map(({ icon: Icon, title, copy }) => (
                <div key={title}>
                  <Icon size={21} aria-hidden="true" />
                  <span><strong>{title}</strong>{copy}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="yarri-feature-band yarri-feature-light">
        <div className="yarri-feature-inner yarri-feature-reverse">
          <div className="yarri-phone-wrap yarri-phone-depth yarri-phone-depth-mint">
            <div className="yarri-phone yarri-phone-light">
              <Image src="/yarri-chat.jpeg" alt="A photo conversation inside Yarri chat" width={589} height={1280} sizes="(max-width: 760px) 78vw, 360px" />
            </div>
          </div>
          <div className="yarri-feature-copy">
            <p className="yarri-kicker">Conversation that keeps its context</p>
            <h2>Say more than “hey.”</h2>
            <p>
              Send photos, reply to the exact message, react to moments, record a
              voice note, and open shared pictures in full view.
            </p>
            <div className="yarri-detail-row">
              <span>Photo sharing</span><span>Message replies</span><span>Voice notes</span><span>Reactions</span>
            </div>
          </div>
        </div>
      </section>

      <section className="yarri-section yarri-safety" id="safety">
        <div className="yarri-section-heading yarri-section-heading-left">
          <p className="yarri-kicker">Trust is part of the design</p>
          <h2>Feel seen. Stay in control.</h2>
          <p>Express yourself while keeping clear choices around identity, privacy, and access.</p>
        </div>
        <div className="yarri-trust-grid">
          {trustPoints.map(([title, copy], index) => (
            <article key={title}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <ShieldCheck size={24} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{copy}</p>
            </article>
          ))}
        </div>
        <Link className="yarri-inline-link" href="/safety">Explore Yarri safety</Link>
      </section>

      <section className="yarri-closing yarri-closing-v2">
        <Image src="/yarri-icon.png" alt="Yarri" width={76} height={76} />
        <p className="yarri-kicker">Made for iOS and Android</p>
        <h2>Come solo. Bring a friend. Bring the group.</h2>
        <p>Yarri gives every kind of connection a more natural place to begin.</p>
        <div className="yarri-closing-links">
          <Link href="/duo-dating">Understand Duo Dating</Link>
          <Link href="/group-dating">Understand Group Dating</Link>
        </div>
      </section>

      <PublicFooter />
    </main>
  );
}
