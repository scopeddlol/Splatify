import Link from "next/link";
import { ArrowLeft, ArrowUpRight, Crosshair } from "lucide-react";
import { Brand, Notice } from "./shell";
import { Submit } from "./ui";
import { loginAction, signupAction, recoverAction } from "@/app/actions";
import { PasswordInput } from "./password-input";

export function AuthPage({
  mode,
  params,
}: {
  mode: "login" | "signup" | "recover";
  params: Record<string, string | string[] | undefined>;
}) {
  const signup = mode === "signup";
  const recover = mode === "recover";
  const next = typeof params.next === "string" ? params.next : "/dashboard";
  const authUrl = (path: string) => `${path}?next=${encodeURIComponent(next)}`;
  return (
    <div className="auth-layout">
      <aside className="auth-art">
        <Brand />
        <div>
          <span className="eyebrow">YOUR NEXT GREAT DAY STARTS HERE</span>
          <h1>
            Good crew.
            <br />
            Great field.
            <br />
            <span>Game on.</span>
          </h1>
          <p>
            One place for every detail.
            <br />
            More room for the good stuff.
          </p>
          <Crosshair className="auth-target" size={280} strokeWidth={0.5} />
        </div>
        <span className="eyebrow">SPLATIFY / BUILT FOR THE CREW</span>
      </aside>
      <main className="auth-main">
        <Link href="/" className="text-link">
          <ArrowLeft size={16} /> Back to home
        </Link>
        <div className="auth-card">
          <span className="eyebrow">
            {recover
              ? "BACK IN THE GAME"
              : signup
                ? "ASSEMBLE YOUR CREW"
                : "WELCOME BACK, PLAYER"}
          </span>
          <h2>
            {recover ? "Recover account" : signup ? "Join Splatify" : "Sign in"}
          </h2>
          <p>
            {recover
              ? "Use a saved, single-use recovery code."
              : signup
                ? "Your profile, days, and crew."
                : "Welcome back."}
          </p>
          <Notice params={params} />
          <form
            action={
              recover ? recoverAction : signup ? signupAction : loginAction
            }
            className="form-stack"
          >
            <input type="hidden" name="next" value={next} />
            {signup && (
              <label>
                Display name
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={80}
                  placeholder="What should we call you?"
                />
              </label>
            )}
            <label>
              Email address
              <input
                type="email"
                name="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="you@example.com"
              />
            </label>
            {recover && (
              <label>
                Recovery code
                <input
                  name="recoveryCode"
                  required
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={100}
                  placeholder="Your saved recovery code"
                />
              </label>
            )}
            <label>
              {recover ? "New password" : "Password"}
              <PasswordInput
                name="password"
                autoComplete={
                  signup || recover ? "new-password" : "current-password"
                }
                minLength={signup || recover ? 12 : 1}
                required
                placeholder={
                  signup || recover ? "At least 12 characters" : "Your password"
                }
              />
            </label>
            {signup && (
              <p className="field-help">
                Save your recovery codes after signup. No reset emails are sent.
              </p>
            )}
            <Submit>
              {recover
                ? "Reset password"
                : signup
                  ? "Create my account"
                  : "Sign in"}
              <ArrowUpRight size={17} />
            </Submit>
          </form>
          <div className="auth-links">
            {signup ? (
              <p>
                Already have an account?{" "}
                <Link href={authUrl("/login")}>Sign in</Link>
              </p>
            ) : (
              <p>
                New to the crew?{" "}
                <Link href={authUrl("/signup")}>Create an account</Link>
              </p>
            )}
            {!recover && !signup && (
              <Link href={authUrl("/recover")}>Forgot your password?</Link>
            )}
            {recover && <Link href={authUrl("/login")}>Back to sign in</Link>}
          </div>
          <p className="auth-footnote">
            <Link href="/explore">Browse without signing in</Link>
          </p>
        </div>
      </main>
    </div>
  );
}
