// app/api/doctors/[id]/availability/route.ts
// Calculate available appointment slots for a specific doctor on a given date

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateDoctorSlots, WorkingHoursConfig } from '@/lib/slot-engine'

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const { id } = await params
    const doctorId = parseInt(id, 10)

    if (isNaN(doctorId)) {
      return NextResponse.json({ error: 'Invalid doctor ID' }, { status: 400 })
    }

    const { searchParams } = new URL(req.url)
    const date = searchParams.get('date') // YYYY-MM-DD

    if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return NextResponse.json(
        { error: 'Valid date parameter in YYYY-MM-DD format is required' },
        { status: 400 },
      )
    }

    const targetDate = new Date(`${date}T00:00:00`)
    const dayOfWeek = targetDate.getDay() // 0 = Sunday, 1 = Monday, etc.

    const supabase = await createClient()

    // 1. Fetch doctor details (slot duration)
    const { data: doctor, error: doctorError } = await supabase
      .from('medical_staff')
      .select('staff_id, slot_duration_minutes, employment_status')
      .eq('staff_id', doctorId)
      .single()

    if (doctorError || !doctor) {
      return NextResponse.json({ error: 'Doctor not found' }, { status: 404 })
    }

    const slotDuration = doctor.slot_duration_minutes || 30

    // 2. Fetch doctor working hours for this day of the week
    const { data: workingHours } = await supabase
      .from('doctor_working_hours')
      .select('day_of_week, start_time, end_time, is_available, slot_duration_minutes')
      .eq('doctor_id', doctorId)
      .eq('day_of_week', dayOfWeek)
      .maybeSingle()

    // 3. Fetch doctor leaves covering this date
    const { data: leaves } = await supabase
      .from('doctor_leaves')
      .select('start_date, end_date, status')
      .eq('doctor_id', doctorId)
      .eq('status', 'Approved')
      .lte('start_date', date)
      .gte('end_date', date)

    // 4. Fetch existing scheduled appointments on this date
    const { data: existingAppointments } = await supabase
      .from('appointments')
      .select('start_time, end_time, status')
      .eq('doctor_id', doctorId)
      .eq('appointment_date', date)
      .in('status', ['Scheduled', 'Completed', 'Reschedule_Required'])

    // 5. Fetch active unexpired slot holds on this date
    const nowIso = new Date().toISOString()
    const { data: activeHolds } = await supabase
      .from('slot_holds')
      .select('start_time, end_time, expires_at')
      .eq('doctor_id', doctorId)
      .eq('slot_date', date)
      .gt('expires_at', nowIso)

    // 6. Format params for Slot Generation Engine
    const mappedWorkingHours: WorkingHoursConfig | null = workingHours
      ? {
          dayOfWeek: workingHours.day_of_week,
          startTime: workingHours.start_time,
          endTime: workingHours.end_time,
          isAvailable: workingHours.is_available,
          slotDurationMinutes: workingHours.slot_duration_minutes || slotDuration,
        }
      : null

    const mappedLeaves = (leaves || []).map((l: any) => ({
      startDate: l.start_date,
      endDate: l.end_date,
      status: l.status,
    }))

    const mappedAppointments = (existingAppointments || []).map((a: any) => ({
      startTime: a.start_time,
      endTime: a.end_time,
      status: a.status,
    }))

    const mappedHolds = (activeHolds || []).map((h: any) => ({
      startTime: h.start_time,
      endTime: h.end_time,
      expiresAt: h.expires_at,
    }))

    const result = generateDoctorSlots({
      date,
      slotDurationMinutes: slotDuration,
      workingHours: mappedWorkingHours,
      leaves: mappedLeaves,
      existingAppointments: mappedAppointments,
      activeHolds: mappedHolds,
      now: new Date(),
    })

    return NextResponse.json({
      doctorId,
      date,
      slotDurationMinutes: slotDuration,
      availableSlotsCount: result.slots.filter((s) => s.isAvailable).length,
      slots: result.slots,
      reason: result.reason,
    })
  } catch (err: any) {
    console.error('[Doctor Availability Error]', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
