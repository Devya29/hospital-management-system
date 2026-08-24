'use client'

import React, { useState, useEffect, useCallback } from 'react'
import PatientInfoCard from '@/components/patient/patient-info-card'
import DoctorSearchBooking from '@/components/patient/doctor-search-booking'
import PatientAppointmentsList, { AppointmentItem } from '@/components/patient/patient-appointments-list'
import GoogleCalendarBanner from '@/components/patient/google-calendar-banner'
import { Skeleton } from '@/components/ui/skeleton'
import { getGreeting } from '@/utils/greeting'
import { Toaster } from 'sonner'
import ErrorPage from '@/app/error'

function PatientSkeleton() {
  return (
    <div className="flex flex-col w-full gap-6 px-4 py-8 container mx-auto max-w-7xl">
      <Skeleton className="h-10 w-1/3" />
      <Skeleton className="h-20 w-full" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Skeleton className="h-64 md:col-span-1" />
        <Skeleton className="h-64 md:col-span-2" />
      </div>
      <Skeleton className="h-96 w-full" />
    </div>
  )
}

export default function PatientDashboard() {
  const [patientProfile, setPatientProfile] = useState<any>(null)
  const [appointments, setAppointments] = useState<AppointmentItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const [patientRes, apptRes] = await Promise.all([
        fetch('/api/patients/me'),
        fetch('/api/appointments'),
      ])

      if (patientRes.ok) {
        const patientData = await patientRes.json()
        setPatientProfile(patientData)
      }

      if (apptRes.ok) {
        const apptData = await apptRes.json()
        setAppointments(Array.isArray(apptData) ? apptData : [])
      }
    } catch (err: any) {
      console.error(err)
      setError('An error occurred while loading your patient portal.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  if (loading) {
    return <PatientSkeleton />
  }

  if (error) {
    return <ErrorPage error={new Error(error)} reset={fetchData} />
  }

  const patientName = patientProfile?.users
    ? `${patientProfile.users.first_name} ${patientProfile.users.last_name}`
    : 'Patient'

  return (
    <div className="flex flex-col w-full gap-8 px-4 py-8 container mx-auto max-w-7xl">
      <Toaster position="top-right" richColors />

      {/* Header Greeting */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/40 pb-5">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground">
            {getGreeting()}, {patientName}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Healthcare Appointment & Follow-up Portal • Search specialists, manage visits, and review prescriptions
          </p>
        </div>
      </header>

      {/* Google Calendar Sync Banner */}
      <GoogleCalendarBanner />

      {/* Patient Profile & Info */}
      <div className="grid grid-cols-1 gap-6">
        <PatientInfoCard patientProfile={patientProfile} refreshData={fetchData} />
      </div>

      {/* Doctor Search & Booking Engine */}
      <section aria-labelledby="booking-section">
        <DoctorSearchBooking onBookingSuccess={fetchData} />
      </section>

      {/* Appointments List (Upcoming, Past, AI summaries, Prescriptions) */}
      <section aria-labelledby="appointments-section">
        <PatientAppointmentsList appointments={appointments} onRefresh={fetchData} />
      </section>
    </div>
  )
}
