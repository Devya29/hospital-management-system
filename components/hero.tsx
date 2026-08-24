'use client'

import { Button } from './ui/button'
import { Badge } from './ui/badge'
import Link from 'next/link'
import {
  CalendarCheck2,
  Sparkles,
  ShieldCheck,
  Stethoscope,
  ArrowRight,
  Clock,
  Mail,
  Calendar,
} from 'lucide-react'

export default function Hero() {
  return (
    <section className="relative overflow-hidden py-20 px-6 md:px-12 max-w-6xl mx-auto text-center space-y-8">
      {/* Feature pill */}
      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-primary/10 border border-primary/20 text-xs font-semibold text-primary">
        <Sparkles className="w-3.5 h-3.5" />
        <span>Powered by Groq AI, Resend & Google Calendar</span>
      </div>

      {/* Main Title */}
      <h1 className="text-4xl sm:text-5xl md:text-6xl font-extrabold tracking-tight text-foreground max-w-4xl mx-auto leading-tight">
        Healthcare Appointment &{' '}
        <span className="bg-gradient-to-r from-primary to-teal-500 bg-clip-text text-transparent">
          Follow-up Manager
        </span>
      </h1>

      {/* Subtitle */}
      <p className="text-muted-foreground max-w-2xl mx-auto text-base sm:text-lg leading-relaxed">
        Streamlined doctor scheduling with database-enforced concurrency, Groq AI pre-visit intake triage, patient-friendly post-visit summaries, structured medication schedules, and automated email reminders.
      </p>

      {/* Action Buttons */}
      <div className="flex flex-wrap justify-center items-center gap-3 pt-2">
        <Button asChild size="lg" className="gap-2 font-semibold shadow-sm">
          <Link href="/patient">
            Book Appointment <ArrowRight className="w-4 h-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg" className="font-semibold">
          <Link href="/sign-in">Portal Login</Link>
        </Button>
      </div>

      {/* Feature Grid Highlights */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 pt-12 text-left">
        <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-primary">
            <CalendarCheck2 className="w-4 h-4" />
          </div>
          <h3 className="font-semibold text-sm">Concurrency-Safe Slots</h3>
          <p className="text-xs text-muted-foreground">
            Database-level locking and slot hold mechanisms prevent double bookings.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-600 dark:text-teal-400">
            <Sparkles className="w-4 h-4" />
          </div>
          <h3 className="font-semibold text-sm">Groq AI Summaries</h3>
          <p className="text-xs text-muted-foreground">
            Automated pre-visit symptom triage and patient-friendly post-consultation explanations.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-sky-500/10 flex items-center justify-center text-sky-600 dark:text-sky-400">
            <Mail className="w-4 h-4" />
          </div>
          <h3 className="font-semibold text-sm">Resend Email Alerts</h3>
          <p className="text-xs text-muted-foreground">
            Confirmation, 24h & 2h reminders, cancellation notices, and leave conflict alerts.
          </p>
        </div>

        <div className="p-4 rounded-xl border border-border/60 bg-card/60 backdrop-blur-xs space-y-2">
          <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center text-amber-600 dark:text-amber-400">
            <Calendar className="w-4 h-4" />
          </div>
          <h3 className="font-semibold text-sm">Google Calendar Sync</h3>
          <p className="text-xs text-muted-foreground">
            OAuth 2.0 calendar integration keeps patient and doctor calendars in perfect sync.
          </p>
        </div>
      </div>
    </section>
  )
}
