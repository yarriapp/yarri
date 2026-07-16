"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { ADMIN_EMAIL } from "@/lib/admin";

const adminRoutes = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/duo", label: "Duo" },
  { href: "/group", label: "Group" },
  { href: "/plans", label: "Plans" },
  { href: "/interests", label: "Interests" },
  { href: "/verification", label: "Verification" },
  { href: "/location-show", label: "Location Show" },
  { href: "/pending-likes", label: "Pending Likes" },
  { href: "/user-actions", label: "User Actions" },
  { href: "/accounts", label: "Accounts" },
  { href: "/bulk-accounts", label: "Bulk Accounts" },
  { href: "/demo-import", label: "Demo Import" },
  { href: "/notifications-admin", label: "Notifications" },
  { href: "/exit-feedback", label: "Exit Feedback" },
  { href: "/settings", label: "Settings" },
];

const pageCopy: Record<string, { eyebrow: string; title: string; subtitle: string }> = {
  "/dashboard": {
    eyebrow: "Welcome",
    title: "Dashboard",
    subtitle: "System overview, profiles, dating modes, revenue, and moderation.",
  },
  "/duo": {
    eyebrow: "Dating mode",
    title: "Duo Management",
    subtitle: "Pair profiles, duo matches, and duo conversations.",
  },
  "/group": {
    eyebrow: "Dating mode",
    title: "Group Management",
    subtitle: "Group profiles, members, group matches, and group chats.",
  },
  "/plans": {
    eyebrow: "Revenue",
    title: "Plans",
    subtitle: "Mode-based subscription plans and premium bundles.",
  },
  "/liked-you": {
    eyebrow: "Revenue",
    title: "Who Liked You",
    subtitle: "Products, purchases, grants, and active access.",
  },
  "/boosts": {
    eyebrow: "Revenue",
    title: "Boosts",
    subtitle: "Boost products, wallets, purchases, and active boosts.",
  },
  "/top-placement": {
    eyebrow: "Revenue",
    title: "Top Placement",
    subtitle: "Priority placement products, purchases, and active slots.",
  },
  "/vibe": {
    eyebrow: "Revenue",
    title: "Vibe Wallet",
    subtitle: "Vibe products, purchases, grants, and wallet balances.",
  },
  "/flowers": {
    eyebrow: "Revenue",
    title: "Flowers",
    subtitle: "Flower packs and private reaction wallet management.",
  },
  "/interests": {
    eyebrow: "Content",
    title: "Interests",
    subtitle: "Interest categories and profile prompt cards.",
  },
  "/verification": {
    eyebrow: "Trust",
    title: "Verification",
    subtitle: "Review selfie checks and approve blue profile ticks.",
  },
  "/user-actions": {
    eyebrow: "Safety",
    title: "User Actions",
    subtitle: "Passes, unmatches, blocks, and admin reversal tools.",
  },
  "/location-show": {
    eyebrow: "Discovery",
    title: "Location Show",
    subtitle: "Pin selected solo, duo, and group profiles into nearby discovery.",
  },
  "/pending-likes": {
    eyebrow: "Discovery",
    title: "Pending Likes",
    subtitle: "One-way likes where the other side has not liked back yet.",
  },
  "/accounts": {
    eyebrow: "Safety",
    title: "Accounts",
    subtitle: "Account review, deletion, and leave records.",
  },
  "/bulk-accounts": {
    eyebrow: "Safety",
    title: "Bulk Account Control",
    subtitle: "Filter, sample, disable, or restore multiple user accounts safely.",
  },
  "/demo-import": {
    eyebrow: "Testing",
    title: "Demo Account Import",
    subtitle: "Create complete Solo, Duo, and Group demo accounts from CSV.",
  },
  "/notifications-admin": {
    eyebrow: "Growth",
    title: "Notifications",
    subtitle: "Targeted campaigns, promotions, and system messages.",
  },
  "/exit-feedback": {
    eyebrow: "Retention",
    title: "Exit Feedback",
    subtitle: "Reasons users delete accounts.",
  },
  "/settings": {
    eyebrow: "Platform",
    title: "Settings",
    subtitle: "Discovery scope and matching visibility rules.",
  },
};

export default function Header() {
  const router = useRouter();
  const pathname = usePathname();
  const [adminEmail, setAdminEmail] = useState("");
  const [showMenu, setShowMenu] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const page = useMemo(() => pageCopy[pathname] || pageCopy["/dashboard"], [pathname]);

  useEffect(() => {
    const getSession = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();

      if (session?.user?.email) setAdminEmail(session.user.email);
    };

    void getSession();
  }, []);

  const handleLogout = async () => {
    setLoggingOut(true);
    await supabase.auth.signOut();
    router.replace("/admin");
  };

  return (
    <>
      <aside className="admin-app-sidebar">
        <button
          type="button"
          className="admin-sidebar-brand"
          onClick={() => router.push("/dashboard")}
        >
          <span className="admin-sidebar-logo">Y</span>
          <span>
            <span className="admin-sidebar-brand-kicker">Admin Panel</span>
            <span className="admin-sidebar-brand-name">Yarri</span>
          </span>
        </button>

        <div className="admin-sidebar-divider" />

        <span className="admin-sidebar-section-label">Navigation</span>
        <nav className="admin-route-nav" aria-label="Admin sections">
          {adminRoutes.map((route) => {
            const isActive = pathname === route.href;

            return (
              <button
                key={route.href}
                type="button"
                className={`admin-route-link ${isActive ? "admin-route-link-active" : ""}`}
                onClick={() => router.push(route.href)}
              >
                <span>{route.label}</span>
                <span aria-hidden="true">&gt;</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <header className="admin-topbar">
        <div className="admin-topbar-title-wrap">
          <span className="admin-page-eyebrow">{page.eyebrow}</span>
          <h1 className="admin-topbar-title">{page.title}</h1>
          <p className="admin-topbar-subtitle">{page.subtitle}</p>
        </div>

        <div className="admin-menu-wrap">
          <button
            type="button"
            onClick={() => setShowMenu((current) => !current)}
            className="admin-account-button"
            aria-expanded={showMenu}
          >
            <span className="admin-account-avatar">
              {(adminEmail || ADMIN_EMAIL || "A").slice(0, 1).toUpperCase()}
            </span>
            <span className="admin-account-text">Menu</span>
          </button>

          {showMenu ? (
            <div className="admin-menu-popover">
              <div className="admin-menu-user">
                <span className="admin-menu-label">Logged in as</span>
                <span className="admin-menu-email">{adminEmail || ADMIN_EMAIL}</span>
              </div>
              <button type="button" className="admin-menu-item" onClick={() => router.push("/dashboard")}>
                Dashboard
              </button>
              <button type="button" className="admin-menu-item" onClick={() => router.push("/settings")}>
                System Settings
              </button>
              <button type="button" className="admin-menu-item" onClick={() => router.push("/notifications-admin")}>
                Notifications
              </button>
              <button
                type="button"
                className="admin-menu-item admin-menu-item-danger"
                onClick={handleLogout}
                disabled={loggingOut}
              >
                {loggingOut ? "Signing out..." : "Logout"}
              </button>
            </div>
          ) : null}
        </div>
      </header>
    </>
  );
}
