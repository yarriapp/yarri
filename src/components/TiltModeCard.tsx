"use client";

import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import type { PointerEvent } from "react";

type TiltModeCardProps = {
  href: string;
  image: string;
  eyebrow: string;
  title: string;
  copy: string;
  flow: string[];
  alt: string;
};

export default function TiltModeCard({ href, image, eyebrow, title, copy, flow, alt }: TiltModeCardProps) {
  const handleMove = (event: PointerEvent<HTMLAnchorElement>) => {
    if (event.pointerType === "touch") return;
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width - 0.5;
    const y = (event.clientY - rect.top) / rect.height - 0.5;
    event.currentTarget.style.setProperty("--tilt-x", `${(-y * 7).toFixed(2)}deg`);
    event.currentTarget.style.setProperty("--tilt-y", `${(x * 7).toFixed(2)}deg`);
  };

  const resetTilt = (event: PointerEvent<HTMLAnchorElement>) => {
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <Link
      className="yarri-tilt-card"
      href={href}
      onPointerMove={handleMove}
      onPointerLeave={resetTilt}
      onPointerCancel={resetTilt}
    >
      <Image src={image} alt={alt} fill sizes="(max-width: 760px) 100vw, 50vw" />
      <div className="yarri-tilt-shade" aria-hidden="true" />
      <div className="yarri-tilt-content">
        <p>{eyebrow}</p>
        <h3>{title}</h3>
        <span className="yarri-tilt-copy">{copy}</span>
        <div className="yarri-tilt-flow" aria-label={`${title} flow`}>
          {flow.map((item) => <span key={item}>{item}</span>)}
        </div>
        <span className="yarri-tilt-link">Explore the mode <ArrowUpRight size={17} aria-hidden="true" /></span>
      </div>
    </Link>
  );
}
