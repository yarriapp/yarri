import Image from "next/image";
import Link from "next/link";

type PublicHeaderProps = {
  overlay?: boolean;
};

export default function PublicHeader({ overlay = false }: PublicHeaderProps) {
  return (
    <header className={`yarri-public-header ${overlay ? "yarri-public-header-overlay" : ""}`}>
      <Link className="yarri-public-brand" href="/" aria-label="Yarri home">
        <Image src="/yarri-icon.png" alt="" width={42} height={42} />
        <span>Yarri</span>
      </Link>
      <nav className="yarri-public-nav" aria-label="Public navigation">
        <Link className="yarri-nav-home" href="/">Home</Link>
        <Link href="/duo-dating">Duo Dating</Link>
        <Link href="/group-dating">Group Dating</Link>
        <Link className="yarri-nav-secondary" href="/safety">Safety</Link>
        <Link className="yarri-nav-secondary" href="/about">About</Link>
      </nav>
    </header>
  );
}
