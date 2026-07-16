"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ADMIN_EMAIL, isAllowedAdminEmail } from "@/lib/admin";
import { supabase } from "@/lib/supabase";

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState(ADMIN_EMAIL);
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [errorMessage, setErrorMessage] = useState("");

  const emailHint = useMemo(
    () => `Only ${ADMIN_EMAIL} can enter this admin panel right now.`,
    []
  );

  useEffect(() => {
    let mounted = true;

    const checkSession = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const sessionEmail = session?.user?.email?.toLowerCase() ?? "";

        if (mounted && sessionEmail && isAllowedAdminEmail(sessionEmail)) {
          router.replace("/dashboard");
          return;
        }
        if (mounted) setCheckingSession(false);
      } catch {
        if (mounted) setCheckingSession(false);
      }
    };

    void checkSession();
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      const sessionEmail = session?.user?.email?.toLowerCase() ?? "";
      if (isAllowedAdminEmail(sessionEmail)) router.replace("/dashboard");
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [router]);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMessage("");
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail) {
      setErrorMessage("Please enter the admin email.");
      return;
    }
    if (!isAllowedAdminEmail(cleanEmail)) {
      setErrorMessage("This email is not allowed for admin access.");
      return;
    }
    if (!cleanPassword) {
      setErrorMessage("Please enter the password.");
      return;
    }

    try {
      setLoading(true);
      const { data, error } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (error) {
        setErrorMessage(error.message);
        return;
      }
      const signedInEmail = data.user?.email?.toLowerCase() ?? "";
      if (!isAllowedAdminEmail(signedInEmail)) {
        await supabase.auth.signOut();
        setErrorMessage("You do not have access to this admin panel.");
        return;
      }
      router.replace("/dashboard");
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setLoading(false);
    }
  };

  if (checkingSession) {
    return (
      <main className="admin-auth-page">
        <div className="admin-auth-shell">
          <div className="admin-auth-card">
            <div className="admin-badge">Yarri Admin</div>
            <h1 className="admin-title">Checking session...</h1>
            <p className="admin-subtitle">Please wait while we verify admin access.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-auth-page">
      <div className="admin-auth-glow admin-auth-glow-top" />
      <div className="admin-auth-glow admin-auth-glow-bottom" />
      <section className="admin-auth-shell">
        <div className="admin-auth-card">
          <div className="admin-badge">Yarri Admin</div>
          <h1 className="admin-title">Sign in to the admin panel</h1>
          <p className="admin-subtitle">
            Manage users, profiles, matches, chats, duos, and groups from one place.
          </p>
          <div className="admin-info-box">
            <span className="admin-info-label">Access rule</span>
            <p className="admin-info-text">{emailHint}</p>
          </div>
          <form className="admin-form" onSubmit={handleLogin}>
            <div className="admin-field">
              <label htmlFor="email" className="admin-label">Admin email</label>
              <input
                id="email"
                type="email"
                className="admin-input"
                placeholder="Enter admin email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                autoComplete="email"
                disabled={loading}
              />
            </div>
            <div className="admin-field">
              <label htmlFor="password" className="admin-label">Password</label>
              <input
                id="password"
                type="password"
                className="admin-input"
                placeholder="Enter password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="current-password"
                disabled={loading}
              />
            </div>
            {errorMessage ? <div className="admin-error-box">{errorMessage}</div> : null}
            <button className="admin-primary-button" type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Enter Admin Panel"}
            </button>
          </form>
        </div>
      </section>
    </main>
  );
}
