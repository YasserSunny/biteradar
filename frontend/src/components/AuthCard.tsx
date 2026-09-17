"use client";
import { useState, type FormEvent } from "react";
import {
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  updateProfile,
} from "firebase/auth";
import { auth, googleProvider } from "@/firebase";
import { Icon } from "./discovery/Icon";
function friendlyError(error: unknown) {
  const code =
    typeof error === "object" && error && "code" in error
      ? String(error.code)
      : "";
  const messages: Record<string, string> = {
    "auth/invalid-credential":
      "That email and password combination didn’t work. Please try again.",
    "auth/invalid-email": "Enter a valid email address.",
    "auth/email-already-in-use":
      "This email already has an account. Please sign in.",
    "auth/weak-password": "Choose a password with at least 6 characters.",
    "auth/popup-closed-by-user":
      "The sign-in window was closed. You can try again.",
    "auth/popup-blocked": "Allow popups to continue with Google.",
    "auth/too-many-requests":
      "Too many attempts. Please wait a moment and try again.",
  };
  return (
    messages[code] || "We couldn’t complete that request. Please try again."
  );
}
export function AuthCard() {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [visible, setVisible] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const changeMode = (next: typeof mode) => {
    setMode(next);
    setError("");
    setSent(false);
  };
  async function submit(event: FormEvent) {
    event.preventDefault();
    setLoading(true);
    setError("");
    try {
      if (mode === "forgot") {
        await sendPasswordResetEmail(auth, email.trim());
        setSent(true);
      } else if (mode === "signup") {
        const credential = await createUserWithEmailAndPassword(
          auth,
          email.trim(),
          password,
        );
        await updateProfile(credential.user, { displayName: name.trim() });
      } else await signInWithEmailAndPassword(auth, email.trim(), password);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }
  async function google() {
    setLoading(true);
    setError("");
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setLoading(false);
    }
  }
  return (
    <div className="auth-card">
      <span className="eyebrow">WELCOME TO BITERADAR</span>
      <h2>
        {mode === "signup"
          ? "A seat at the table."
          : mode === "forgot"
            ? "Let’s get you back in."
            : "Good to see you."}
      </h2>
      <p className="muted">
        {mode === "signup"
          ? "Create an account and find your next favorite."
          : mode === "forgot"
            ? "We’ll email you a link to reset your password."
            : "Sign in to find something worth craving."}
      </p>
      {error && (
        <div role="alert" className="error-banner">
          {error}
        </div>
      )}
      {mode !== "forgot" && (
        <>
          <button
            className="button secondary google-button"
            disabled={loading}
            onClick={google}
          >
            <span className="google-mark">G</span>Continue with Google
          </button>
          <div className="auth-divider">
            <span>or use your email</span>
          </div>
        </>
      )}
      {sent ? (
        <div className="notice" role="status">
          If an account matches {email}, a reset link will arrive shortly.
        </div>
      ) : (
        <form onSubmit={submit} className="auth-fields">
          {mode === "signup" && (
            <label>
              Full name
              <input
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
              />
            </label>
          )}
          <label>
            Email address
            <input
              type="email"
              autoComplete="email"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>
          {mode !== "forgot" && (
            <label>
              Password
              <div className="password-field">
                <input
                  aria-label="Password"
                  type={visible ? "text" : "password"}
                  autoComplete={
                    mode === "signup" ? "new-password" : "current-password"
                  }
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
                <button
                  type="button"
                  aria-label={visible ? "Hide password" : "Show password"}
                  onClick={() => setVisible(!visible)}
                >
                  {visible ? "Hide" : "Show"}
                </button>
              </div>
            </label>
          )}
          {mode === "signin" && (
            <button
              type="button"
              className="text-link forgot-link"
              onClick={() => changeMode("forgot")}
            >
              Forgot password?
            </button>
          )}
          <button className="button primary" disabled={loading}>
            {loading
              ? "One moment…"
              : mode === "signup"
                ? "Create account"
                : mode === "forgot"
                  ? "Send reset link"
                  : "Sign in"}
            <Icon name="arrow" />
          </button>
        </form>
      )}
      <p className="auth-switch">
        {mode === "signin"
          ? "New around here? "
          : mode === "signup"
            ? "Already have an account? "
            : ""}
        <button
          className="text-link"
          onClick={() => changeMode(mode === "signin" ? "signup" : "signin")}
        >
          {mode === "signin" ? "Create an account" : "Back to sign in"}
        </button>
      </p>
    </div>
  );
}
