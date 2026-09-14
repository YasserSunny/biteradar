"use client";

import { useState } from "react";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  sendPasswordResetEmail,
} from "firebase/auth";
import { auth, googleProvider, appleProvider, microsoftProvider } from "../firebase";
import { Logo } from "./Logo";

interface AuthCardProps {
  onSuccess?: () => void;
  onError?: (msg: string) => void;
}

export function AuthCard({ onSuccess, onError }: AuthCardProps) {
  const [mode, setMode] = useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);
  const [resetSent, setResetSent] = useState(false);

  const formatFirebaseError = (err: any): string => {
    const code = err.code || "";
    switch (code) {
      case "auth/invalid-email":
        return "Please enter a valid email address.";
      case "auth/user-disabled":
        return "This account has been disabled. Please contact support.";
      case "auth/user-not-found":
        return "No account found with this email. Please sign up first.";
      case "auth/wrong-password":
        return "Incorrect password. Please try again or use 'Forgot password?'.";
      case "auth/invalid-credential":
        return "Incorrect email or password. Please verify your credentials.";
      case "auth/email-already-in-use":
        return "An account with this email already exists. Please sign in instead.";
      case "auth/weak-password":
        return "Password is too weak. Please use at least 6 characters.";
      case "auth/popup-closed-by-user":
        return "Sign-in popup was closed before completing.";
      case "auth/popup-blocked":
        return "Popup was blocked by your browser. Please allow popups for this site.";
      case "auth/operation-not-allowed":
        return "This sign-in provider is not currently enabled in Firebase Console.";
      case "auth/account-exists-with-different-credential":
        return "An account already exists with the same email using a different sign-in method.";
      default:
        return err.message || "An authentication error occurred. Please try again.";
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthError("Please enter your email address.");
      return;
    }
    if (password.length < 6) {
      setAuthError("Password must be at least 6 characters.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "signup") {
        const userCredential = await createUserWithEmailAndPassword(auth, trimmedEmail, password);
        if (fullName.trim() && userCredential.user) {
          await updateProfile(userCredential.user, {
            displayName: fullName.trim(),
          });
        }
      } else {
        await signInWithEmailAndPassword(auth, trimmedEmail, password);
      }
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Email auth failed:", err);
      const friendlyMsg = formatFirebaseError(err);
      setAuthError(friendlyMsg);
      if (onError) onError(friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthNotice(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
      if (onSuccess) onSuccess();
    } catch (err: any) {
      console.error("Google login failed:", err);
      const friendlyMsg = formatFirebaseError(err);
      setAuthError(friendlyMsg);
      if (onError) onError(friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleAppleClick = () => {
    setAuthError(null);
    setAuthNotice("Sign in with Apple is not enabled yet. Please continue with Google or Email/Password.");
  };

  const handleMicrosoftClick = () => {
    setAuthError(null);
    setAuthNotice("Sign in with Outlook / Microsoft is not enabled yet. Please continue with Google or Email/Password.");
  };

  const handlePasswordReset = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setAuthError("Please enter your email address to receive the password reset link.");
      return;
    }

    setLoading(true);
    try {
      await sendPasswordResetEmail(auth, trimmedEmail);
      setResetSent(true);
    } catch (err: any) {
      console.error("Password reset error:", err);
      const friendlyMsg = formatFirebaseError(err);
      setAuthError(friendlyMsg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full max-w-md bg-white p-7 sm:p-9 rounded-2xl shadow-xl border border-gray-100 flex flex-col items-center">
      {/* Brand Emblem */}
      <div className="mb-2">
        <Logo size="lg" orientation="vertical" showTagline={true} />
      </div>
      <p className="text-gray-500 mb-6 text-center text-sm">
        Discover the best dish in town, ranked by Gemini AI.
      </p>

      {/* Error Banner */}
      {authError && (
        <div className="w-full mb-5 p-3.5 bg-red-50 border border-red-200 text-red-700 text-xs rounded-xl flex items-start justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-start gap-2">
            <span className="text-red-500 text-base leading-none shrink-0">⚠️</span>
            <span className="leading-snug">{authError}</span>
          </div>
          <button
            onClick={() => setAuthError(null)}
            className="text-red-400 hover:text-red-700 font-bold shrink-0 text-sm leading-none"
            aria-label="Dismiss alert"
          >
            ×
          </button>
        </div>
      )}

      {/* Notice Banner */}
      {authNotice && (
        <div className="w-full mb-5 p-3.5 bg-amber-50 border border-amber-200 text-amber-900 text-xs rounded-xl flex items-start justify-between gap-2 animate-in fade-in duration-200">
          <div className="flex items-start gap-2">
            <span className="text-amber-500 text-base leading-none shrink-0">ℹ️</span>
            <span className="leading-snug font-medium">{authNotice}</span>
          </div>
          <button
            onClick={() => setAuthNotice(null)}
            className="text-amber-400 hover:text-amber-700 font-bold shrink-0 text-sm leading-none cursor-pointer"
            aria-label="Dismiss notice"
          >
            ×
          </button>
        </div>
      )}

      {/* Password Reset Mode */}
      {mode === "forgot" ? (
        <div className="w-full">
          <h3 className="text-base font-bold text-gray-900 mb-1">Reset your password</h3>
          <p className="text-xs text-gray-500 mb-4">
            Enter the email associated with your account and we&apos;ll send you a password recovery link.
          </p>

          {resetSent ? (
            <div className="p-4 bg-green-50 border border-green-200 text-green-800 text-xs rounded-xl mb-4 text-center">
              <p className="font-semibold text-green-900 mb-1">Check your inbox!</p>
              <p>We sent a reset link to <span className="font-bold">{email}</span>. Click the link to choose a new password.</p>
              <button
                type="button"
                onClick={() => {
                  setResetSent(false);
                  setMode("signin");
                }}
                className="mt-3 text-xs font-semibold text-orange-600 hover:text-orange-700 underline"
              >
                Back to sign in
              </button>
            </div>
          ) : (
            <form onSubmit={handlePasswordReset} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  required
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
                />
              </div>
              <button
                type="submit"
                disabled={loading}
                className="w-full bg-orange-600 hover:bg-orange-700 text-white font-semibold py-2.5 px-4 rounded-lg transition disabled:opacity-50 text-sm shadow-sm"
              >
                {loading ? "Sending link..." : "Send Reset Link"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthError(null);
                  setMode("signin");
                }}
                className="w-full text-xs text-gray-500 hover:text-gray-800 font-medium text-center py-1 transition"
              >
                Cancel and return to sign in
              </button>
            </form>
          )}
        </div>
      ) : (
        <div className="w-full">
          {/* Sign In / Sign Up Mode Tabs */}
          <div className="flex bg-gray-100 p-1 rounded-xl mb-5">
            <button
              type="button"
              onClick={() => {
                setAuthError(null);
                setMode("signin");
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                mode === "signin"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthError(null);
                setMode("signup");
              }}
              className={`flex-1 py-1.5 text-xs font-semibold rounded-lg transition ${
                mode === "signup"
                  ? "bg-white text-gray-900 shadow-xs"
                  : "text-gray-500 hover:text-gray-900"
              }`}
            >
              Create Account
            </button>
          </div>

          {/* Social / OAuth SSO Buttons */}
          <div className="space-y-2.5 mb-5">
            {/* Google Sign-In */}
            <button
              type="button"
              onClick={handleGoogleLogin}
              disabled={loading}
              className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-4 rounded-xl transition flex items-center justify-center gap-3 text-sm shadow-2xs hover:shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24">
                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
              </svg>
              <span>Continue with Google</span>
            </button>

            {/* Apple ID Sign-In */}
            <button
              type="button"
              onClick={handleAppleClick}
              disabled={loading}
              className="w-full bg-black hover:bg-neutral-900 text-white font-medium py-2.5 px-4 rounded-xl transition flex items-center justify-between text-sm shadow-2xs hover:shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 fill-current shrink-0" viewBox="0 0 170 170">
                  <path d="M150.37 130.25c-2.45 5.66-5.35 10.87-8.71 15.66-4.58 6.53-8.33 11.05-11.22 13.56-4.48 4.12-9.28 6.23-14.42 6.35-3.69 0-8.14-1.05-13.32-3.18-5.19-2.12-9.97-3.17-14.34-3.17-4.58 0-9.49 1.05-14.75 3.17-5.26 2.13-9.5 3.24-12.74 3.35-4.35.13-9.16-1.9-14.42-6.08-3.7-3.04-7.6-7.7-11.71-13.98-6.19-9.57-11.03-20.73-14.53-33.48-3.5-12.76-5.25-24.52-5.25-35.29 0-14.02 3.48-25.59 10.45-34.72 6.96-9.12 15.68-13.78 26.15-13.98 4.78 0 10.23 1.25 16.34 3.75 6.12 2.5 10.05 3.8 11.8 3.92 2.12 0 6.29-1.39 12.52-4.17 6.22-2.78 11.77-4.04 16.64-3.77 12.87.63 23.18 5.16 30.93 13.59-11.08 6.72-16.51 16.16-16.29 28.32.22 9.57 3.96 17.58 11.22 24.03 7.25 6.45 15.82 10.07 25.7 10.86-2.61 7.82-5.77 15.44-9.48 22.86zM119.22 31.84c0-7.28 2.65-14.28 7.95-21.01 5.3-6.72 11.89-10.83 19.77-12.33.22 1.13.33 2.18.33 3.16 0 7.37-2.73 14.52-8.19 21.45-5.46 6.93-12.08 10.96-19.86 12.08z" />
                </svg>
                <span>Continue with Apple</span>
              </div>
              <span className="text-[10px] uppercase font-semibold text-neutral-400 bg-neutral-800 px-2 py-0.5 rounded-full shrink-0">
                Not Enabled Yet
              </span>
            </button>

            {/* Outlook / Microsoft Sign-In */}
            <button
              type="button"
              onClick={handleMicrosoftClick}
              disabled={loading}
              className="w-full bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-2.5 px-4 rounded-xl transition flex items-center justify-between text-sm shadow-2xs hover:shadow-xs active:scale-[0.99] cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <svg className="w-4 h-4 shrink-0" viewBox="0 0 21 21">
                  <rect x="1" y="1" width="9" height="9" fill="#f25022" />
                  <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
                  <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
                  <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
                </svg>
                <span>Continue with Outlook / Microsoft</span>
              </div>
              <span className="text-[10px] uppercase font-semibold text-gray-500 bg-gray-100 px-2 py-0.5 rounded-full shrink-0">
                Not Enabled Yet
              </span>
            </button>
          </div>

          {/* Divider */}
          <div className="relative flex py-2 items-center mb-5">
            <div className="grow border-t border-gray-200"></div>
            <span className="shrink mx-3 text-gray-400 text-xs uppercase tracking-wider font-semibold">
              Or with email
            </span>
            <div className="grow border-t border-gray-200"></div>
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleEmailAuth} className="space-y-3.5">
            {mode === "signup" && (
              <div>
                <label className="block text-xs font-semibold text-gray-700 mb-1">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Alex Rivera"
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
                />
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-gray-700 mb-1">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="name@example.com"
                required
                className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-gray-700">Password</label>
                {mode === "signin" && (
                  <button
                    type="button"
                    onClick={() => {
                      setAuthError(null);
                      setResetSent(false);
                      setMode("forgot");
                    }}
                    className="text-[11px] text-orange-600 hover:text-orange-700 font-medium hover:underline"
                  >
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="w-full px-3.5 py-2.5 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 transition pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 text-xs"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "🙈" : "👁️"}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full mt-2 bg-orange-600 hover:bg-orange-700 active:bg-orange-800 text-white font-semibold py-2.5 px-4 rounded-xl transition disabled:opacity-50 text-sm shadow-sm active:scale-[0.99] flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span>{mode === "signin" ? "Signing in..." : "Creating account..."}</span>
                </>
              ) : (
                <span>{mode === "signin" ? "Sign In with Email" : "Create My Account"}</span>
              )}
            </button>
          </form>
        </div>
      )}

      {/* Terms footnote */}
      <p className="mt-6 text-center text-[11px] text-gray-400 leading-relaxed">
        By continuing, you agree to discover exceptional food with BiteRadar.
      </p>
    </div>
  );
}
