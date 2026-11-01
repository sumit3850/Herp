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

  const run = async (fn: () => Promise<Profile | null>) => {
    setBusy(true);
    try {
      const p = await fn();
      if (p) onAuthed(p); else toast("Check your inbox to confirm your email, then sign in.");
    } catch (e) { toast((e as Error).message, "error"); }
    setBusy(false);
  };

  const demoHint = hw.DEMO ? <> Demo: <b>admin@demo / admin</b> (or reviewer <b>anu@demo / anu</b>).</> : null;

  if (mode === "signup") {
    return (
      <div className="bg-background text-foreground">
        <SignUpPage
          title={<span className="font-light tracking-tighter">Join <span className="font-semibold text-primary">{hw.C.APP_NAME}</span></span>}
          description="Create a free account to record reptiles and amphibians, log road-kill and help build your state's checklist."
          heroImageSrc={HERO_IMAGE}
          testimonials={HIGHLIGHTS}
          regions={regions}
          defaultRegion={hw.C.DEFAULT_REGION}
          busy={busy}
          onSignIn={() => setMode("signin")}
          onSignUp={(e) => {
            e.preventDefault();
            const f = Object.fromEntries(new FormData(e.currentTarget)) as Record<string, string>;
            run(() => hw.api.signUp({ email: f.email.trim(), password: f.password, username: f.username.trim().toLowerCase(), full_name: f.full_name.trim(), phone: f.phone, home_region: f.home_region }));
          }}
        />
      </div>
    );
  }

  return (
    <div className="bg-background text-foreground">
      <SignInPage
        title={<span className="font-light text-foreground tracking-tighter">Welcome to <span className="font-semibold text-primary">{hw.C.APP_NAME}</span></span>}
        description={<>Sign in to review submissions and manage the core checklists.{demoHint}</>}
        heroImageSrc={HERO_IMAGE}
        testimonials={HIGHLIGHTS}
        onSignIn={(e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          emailRef.current = String(f.get("email") || "");
          run(() => hw.api.signIn(String(f.get("email") || "").trim(), String(f.get("password") || "")));
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
