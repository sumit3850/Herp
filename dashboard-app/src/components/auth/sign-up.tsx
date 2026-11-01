import React, { useState } from "react";
import { Eye, EyeOff } from "lucide-react";

import { GlassInputWrapper, TestimonialCard, type Testimonial } from "@/components/ui/sign-in";
import type { Region } from "@/lib/hw";

interface SignUpPageProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  heroImageSrc?: string;
  testimonials?: Testimonial[];
  regions: Region[];
  defaultRegion?: string;
  busy?: boolean;
  onSignUp: (event: React.FormEvent<HTMLFormElement>) => void;
  onSignIn: () => void;
}

const field = "w-full bg-transparent text-sm p-4 rounded-2xl focus:outline-none";

/** Companion to <SignInPage/> with the same layout, glass inputs and motion. */
export function SignUpPage({ title, description, heroImageSrc, testimonials = [], regions, defaultRegion, busy, onSignUp, onSignIn }: SignUpPageProps) {
  const [show, setShow] = useState(false);
  const countries = regions.filter((r) => !r.parent);
  return (
    <div className="min-h-[100dvh] flex flex-col md:flex-row font-geist w-full">
      <section className="flex-1 flex items-center justify-center p-8">
        <div className="w-full max-w-md">
          <div className="flex flex-col gap-5">
            <h1 className="animate-element animate-delay-100 text-4xl md:text-5xl font-semibold leading-tight">{title}</h1>
            <p className="animate-element animate-delay-200 text-muted-foreground">{description}</p>
            <form className="space-y-4" onSubmit={onSignUp}>
              <div className="animate-element animate-delay-300 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground" htmlFor="su-name">Full name</label>
                  <GlassInputWrapper><input id="su-name" name="full_name" required autoComplete="name" placeholder="Your name" className={field} /></GlassInputWrapper>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground" htmlFor="su-user">Username</label>
                  <GlassInputWrapper><input id="su-user" name="username" required pattern="[a-z0-9_.\-]{3,30}" title="3–30 lowercase letters, digits, . _ -" placeholder="e.g. herper.ravi" className={field} /></GlassInputWrapper>
                </div>
              </div>
              <div className="animate-element animate-delay-400">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="su-email">Email Address</label>
                <GlassInputWrapper><input id="su-email" name="email" type="email" required autoComplete="email" placeholder="Enter your email address" className={field} /></GlassInputWrapper>
              </div>
              <div className="animate-element animate-delay-500 grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="text-sm font-medium text-muted-foreground" htmlFor="su-phone">Phone (optional)</label>
                  <GlassInputWrapper><input id="su-phone" name="phone" type="tel" autoComplete="tel" placeholder="+91…" className={field} /></GlassInputWrapper>
                </div>
                <div>
                  <label className="text-sm font-medium text-muted-foreground" htmlFor="su-region">Home state</label>
                  <GlassInputWrapper>
                    <select id="su-region" name="home_region" defaultValue={defaultRegion} className={`${field} appearance-none`}>
                      {countries.map((c) => (
                        <optgroup key={c.code} label={c.name}>
                          <option value={c.code}>{c.name} (whole country)</option>
                          {regions.filter((r) => r.parent === c.code).map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
                        </optgroup>
                      ))}
                    </select>
                  </GlassInputWrapper>
                </div>
              </div>
              <div className="animate-element animate-delay-600">
                <label className="text-sm font-medium text-muted-foreground" htmlFor="su-pw">Password</label>
                <GlassInputWrapper>
                  <div className="relative">
                    <input id="su-pw" name="password" type={show ? "text" : "password"} minLength={6} required autoComplete="new-password" placeholder="At least 6 characters" className={`${field} pr-12`} />
                    <button type="button" onClick={() => setShow(!show)} className="absolute inset-y-0 right-3 flex items-center" aria-label={show ? "Hide password" : "Show password"}>
                      {show ? <EyeOff className="w-5 h-5 text-muted-foreground" /> : <Eye className="w-5 h-5 text-muted-foreground" />}
                    </button>
                  </div>
                </GlassInputWrapper>
              </div>
              <button type="submit" disabled={busy} className="animate-element animate-delay-700 w-full rounded-2xl bg-primary py-4 font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-60">
                {busy ? "Creating account…" : "Create account"}
              </button>
            </form>
            <p className="animate-element animate-delay-800 text-center text-sm text-muted-foreground">
              Already have an account? <a href="#" onClick={(e) => { e.preventDefault(); onSignIn(); }} className="text-primary hover:underline">Sign in</a>
            </p>
          </div>
        </div>
      </section>
      {heroImageSrc && (
        <section className="hidden md:block flex-1 relative p-4">
          <div className="animate-slide-right animate-delay-300 absolute inset-4 rounded-3xl bg-cover bg-center" style={{ backgroundImage: `url(${heroImageSrc})` }} />
          {testimonials.length > 0 && (
            <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex gap-4 px-8 w-full justify-center">
              <TestimonialCard testimonial={testimonials[0]} delay="animate-delay-1000" />
              {testimonials[1] && <div className="hidden xl:flex"><TestimonialCard testimonial={testimonials[1]} delay="animate-delay-1200" /></div>}
              {testimonials[2] && <div className="hidden 2xl:flex"><TestimonialCard testimonial={testimonials[2]} delay="animate-delay-1400" /></div>}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
