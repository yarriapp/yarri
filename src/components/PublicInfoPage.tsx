import type { ReactNode } from "react";
import PublicFooter from "./PublicFooter";
import PublicHeader from "./PublicHeader";

type PublicInfoPageProps = {
  eyebrow: string;
  title: string;
  intro: string;
  updated?: string;
  children: ReactNode;
};

export default function PublicInfoPage({ eyebrow, title, intro, updated, children }: PublicInfoPageProps) {
  return (
    <main className="yarri-site yarri-info-page">
      <PublicHeader />
      <header className="yarri-info-hero">
        <p className="yarri-kicker">{eyebrow}</p>
        <h1>{title}</h1>
        <p>{intro}</p>
        {updated ? <span>Last updated {updated}</span> : null}
      </header>
      <div className="yarri-info-body">{children}</div>
      <PublicFooter />
    </main>
  );
}
