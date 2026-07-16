"use client";

import { ArrowRight } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState } from "react";
import PublicHeader from "./PublicHeader";

const slides = [
  {
    key: "solo",
    label: "Solo",
    image: "/yarri-solo-hero.png",
    alt: "Two people enjoying a first date at sunset",
    eyebrow: "Solo Dating",
    headline: "Follow the spark, one person at a time.",
    copy: "A richer profile, preference-led discovery, and more ways to start a real conversation.",
    href: "#experience",
    action: "Explore Yarri",
  },
  {
    key: "duo",
    label: "Duo",
    image: "/yarri-duo-hero.png",
    alt: "Two pairs of friends meeting at a rooftop cafe",
    eyebrow: "Yarri Duo Dating",
    headline: "Bring a friend. Meet another duo.",
    copy: "Build one shared profile, discover as a pair, match with another duo, and start the conversation together.",
    href: "/duo-dating",
    action: "How Duo works",
  },
  {
    key: "group",
    label: "Group",
    image: "/yarri-group-hero.png",
    alt: "Two friend groups meeting for a social evening",
    eyebrow: "Yarri Group Dating",
    headline: "Two circles. One new kind of night.",
    copy: "Create a group identity with up to five members, meet other groups, and let the whole circle share the match.",
    href: "/group-dating",
    action: "How Group works",
  },
];

export default function HeroCarousel() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  useEffect(() => {
    if (paused || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const timer = window.setInterval(() => {
      setActiveIndex((current) => (current + 1) % slides.length);
    }, 6200);
    return () => window.clearInterval(timer);
  }, [activeIndex, paused]);

  const activeSlide = slides[activeIndex];

  return (
    <section
      className={`yarri-hero yarri-carousel yarri-carousel-${activeSlide.key}`}
      id="top"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
    >
      <div className="yarri-carousel-media" aria-hidden="true">
        {slides.map((slide, index) => (
          <Image
            className={`yarri-carousel-image ${index === activeIndex ? "yarri-carousel-image-active" : ""}`}
            key={slide.key}
            src={slide.image}
            alt=""
            fill
            priority={index === 0}
            sizes="100vw"
          />
        ))}
      </div>
      <div className="yarri-carousel-shade" aria-hidden="true" />
      <PublicHeader overlay />

      <div className="yarri-carousel-copy" key={activeSlide.key}>
        <p className="yarri-eyebrow">{activeSlide.eyebrow}</p>
        <h1>Yarri</h1>
        <p className="yarri-carousel-headline">{activeSlide.headline}</p>
        <p className="yarri-carousel-description">{activeSlide.copy}</p>
        <Link className="yarri-hero-action" href={activeSlide.href}>
          <span>{activeSlide.action}</span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </div>

      <div className="yarri-carousel-controls" role="tablist" aria-label="Choose a Yarri dating mode">
        {slides.map((slide, index) => (
          <button
            type="button"
            role="tab"
            aria-selected={index === activeIndex}
            className={index === activeIndex ? "yarri-carousel-control-active" : ""}
            key={slide.key}
            onClick={() => setActiveIndex(index)}
          >
            <span>{String(index + 1).padStart(2, "0")}</span>
            {slide.label}
          </button>
        ))}
      </div>
    </section>
  );
}
