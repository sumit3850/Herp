import * as React from "react";

import { SignInPage } from "@/components/ui/sign-in";
import { SignUpPage } from "@/components/auth/sign-up";
import { HERO_IMAGE, HIGHLIGHTS } from "@/components/auth/highlights";
import { useToast } from "@/lib/store";
import type { HWGlobal, Profile, Region } from "@/lib/hw";

export function AuthScreen({ hw, onAuthed }: { hw: HWGlobal; onAuthed: (p: Profile) => void }) {
  const toast = useToast();
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [regions, setRegions] = React.useState<Region[]>([]);
  const [busy, setBusy] = React.useState(false);
  const emailRef = React.useRef("");
  React.useEffect(() => { hw.api.regions().then(setRegions).catch(() => {}); }, [hw]);

  const [pending, setPending] = React.useState<string | null>(null); // e-mail awaiting confirmation
  const run = async (fn: () => Promise<Profile | null>, email: string) => {
    setBusy(true);
    try {
      const p = await fn();
      if (p) onAuthed(p);
      else { setPending(email); setMode("signin"); toast(`Confirm the e-mail we sent to ${email}, then sign in.`); }
    } catch (e) {
      const err = e as Error & { code?: string };
      toast(err.message, "error");
      if (err.code === "already_registered") { emailRef.current = email; setMode("signin"); }
      if (err.code === "email_not_confirmed") setPending(email);
    }
    setBusy(false);
  };
  const resend = () => pending && hw.api.resendConfirmation(pending).then(() => toast(`Confirmation e-mail sent to ${pending}`)).catch((e: Error) => toast(e.message, "error"));
  // pre-fill the e-mail after switching from sign-up to sign-in
  React.useEffect(() => {
    if (mode !== "signin" || !emailRef.current) return;
    const t = setTimeout(() => { const el = document.querySelector<HTMLInputElement>('input[name="email"]'); if (el && !el.value) el.value = emailRef.current; }, 50);
    return () => clearTimeout(t);
  }, [mode]);

  const demoHint = hw.DEMO ? <> Demo: <b>admin@demo / admin</b> (or reviewer <b>anu@demo / anu</b>).</> : null;

  if (mode === "signup") {
    return (
      <div className="bg-background text-foreground">
        <SignUpPage
          title={<span className="font-light tracking-tighter">Join <span className="font-semibold text-primary">{hw.C.APP_NAME}</span></span>}
          description="One free account for the field app and this dashboard: record reptiles and amphibians, log road-kill and help build your state's checklist."
          heroImageSrc={HERO_IMAGE}
          testimonials={HIGHLIGHTS}
          regions={regions}
          defaultRegion={hw.C.DEFAULT_REGION}
          busy={busy}
          onSignIn={() => setMode("signin")}
          onSignUp={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
            run(() => hw.api.signUp({ email: f.email.trim(), password: f.password, username: f.username.trim().toLowerCase(), full_name: f.full_name.trim(), phone: f.phone, home_region: f.home_region }), f.email.trim());
          }}
        />
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground">
      <SignInPage
        title={<span className="font-light text-foreground tracking-tighter">Welcome to <span className="font-semibold text-primary">{hw.C.APP_NAME}</span></span>}
        description={<>
          Use the same account as the field app. Sign in to review submissions and manage the core checklists.{demoHint}
          {pending && <span className="mt-3 flex items-center gap-2 rounded-xl bg-primary/10 px-3 py-2 text-sm text-foreground">Waiting for you to confirm {pending}. <button type="button" className="font-medium text-primary hover:underline" onClick={resend}>Resend e-mail</button></span>}
        </>}
        heroImageSrc={HERO_IMAGE}
        testimonials={HIGHLIGHTS}
        onSignIn={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          emailRef.current = String(f.get("email") || "");
          const email = String(f.get("email") || "").trim();
          run(() => hw.api.signIn(email, String(f.get("password") || "")), email);
        }}
        onGoogleSignIn={() => hw.api.signInWithGoogle(window.location.href.split("#")[0]).catch((e: Error) => toast(e.message, "error"))}
        onResetPassword={() => {
          const email = window.prompt("Email address for the reset link:", emailRef.current);
          if (email) hw.api.resetPassword(email.trim()).then(() => toast(`Reset link sent to ${email}`)).catch((e: Error) => toast(e.message, "error"));
        }}
        onCreateAccount={() => setMode("signup")}
      />
    </div>
  );
}
