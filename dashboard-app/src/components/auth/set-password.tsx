import * as React from "react";
import { KeyRound } from "lucide-react";

import { GlassInputWrapper } from "@/components/ui/sign-in";
import { useToast } from "@/lib/store";
import type { HWGlobal, Profile } from "@/lib/hw";

/** Shown when the dashboard is opened from a "reset password" e-mail. */
export function SetPasswordScreen({ hw, me, onDone }: { hw: HWGlobal; me: Profile; onDone: (p: Profile) => void }) {
  const toast = useToast();
  const [busy, setBusy] = React.useState(false);
  return (
    <div className="grid min-h-svh place-items-center bg-background p-6 text-foreground">
      <form
        className="w-full max-w-md space-y-5"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const a = String(f.get("p1") || ""), b = String(f.get("p2") || "");
          if (a !== b) return toast("The two passwords don’t match", "error");
          setBusy(true);
          try { const p = await hw.api.updatePassword(a); toast("Password changed. You’re signed in."); onDone(p || me); }
          catch (er) { toast((er as Error).message, "error"); setBusy(false); }
        }}
      >
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary"><KeyRound className="size-6" /></span>
        <h1 className="text-3xl font-semibold tracking-tight">Set a new password</h1>
        <p className="text-muted-foreground">For <b>{me.email}</b>. The same password works in the field app and this dashboard.</p>
        <div><label className="text-sm font-medium text-muted-foreground" htmlFor="p1">New password</label>
          <GlassInputWrapper><input id="p1" name="p1" type="password" minLength={6} required autoFocus autoComplete="new-password" className="w-full rounded-2xl bg-transparent p-4 text-sm focus:outline-none" /></GlassInputWrapper></div>
        <div><label className="text-sm font-medium text-muted-foreground" htmlFor="p2">Repeat it</label>
          <GlassInputWrapper><input id="p2" name="p2" type="password" minLength={6} required autoComplete="new-password" className="w-full rounded-2xl bg-transparent p-4 text-sm focus:outline-none" /></GlassInputWrapper></div>
        <button disabled={busy} className="w-full rounded-2xl bg-primary py-4 font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-60">{busy ? "Saving…" : "Save new password"}</button>
      </form>
    </div>
  );
}
