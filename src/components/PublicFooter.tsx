import Image from "next/image";
import Link from "next/link";

const footerColumns = [
  {
    title: "Explore",
    links: [
      ["Duo Dating", "/duo-dating"],
      ["Group Dating", "/group-dating"],
      ["Safety", "/safety"],
    ],
  },
  {
    title: "Company",
    links: [
      ["About Us", "/about"],
      ["Contact", "/contact"],
    ],
  },
  {
    title: "Legal",
    links: [
      ["Privacy", "/privacy"],
      ["Terms", "/terms"],
    ],
  },
];

export default function PublicFooter() {
  return (
    <footer className="yarri-site-footer">
      <div className="yarri-footer-main">
        <div className="yarri-footer-intro">
          <Link className="yarri-footer-logo" href="/" aria-label="Yarri home">
            <Image src="/yarri-icon.png" alt="" width={50} height={50} />
            <span>Yarri</span>
          </Link>
          <p>Real people. Real connections. More than one way to begin.</p>
          <div className="yarri-footer-modes" aria-label="Yarri dating modes">
            <span>Solo</span><span>Duo</span><span>Group</span>
          </div>
        </div>
        <div className="yarri-footer-links">
          {footerColumns.map((column) => (
            <div key={column.title}>
              <h2>{column.title}</h2>
              {column.links.map(([label, href]) => (
                <Link href={href} key={href}>{label}</Link>
              ))}
            </div>
          ))}
        </div>
      </div>
      <div className="yarri-footer-bottom">
        <span>Copyright 2026 Yarri. All rights reserved.</span>
        <span>Designed for intentional connection.</span>
      </div>
    </footer>
  );
}
