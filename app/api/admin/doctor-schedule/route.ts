// app/api/admin/doctor-schedule/route.ts
// Manage doctor weekly working hours and slot durations

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getUserRole } from '@/utils/get-role'

// GET: Fetch doctor working hours and schedule settings
export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const doctorId = searchParams.get('doctor_id')

    if (!doctorId) {
      return NextResponse.json({ error: 'Doctor ID is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // Fetch doctor slot duration
    const { data: doctor } = await supabase
      .from('medical_staff')
      .select('staff_id, slot_duration_minutes, consultation_fee, specialization')
      .eq('staff_id', Number(doctorId))
      .single()

    // Fetch working hours
    const { data: hours, error } = await supabase
      .from('doctor_working_hours')
      .select('*')
      .eq('doctor_id', Number(doctorId))
      .order('day_of_week')

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({
      doctor,
      workingHours: hours || [],
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// POST/PATCH: Save / update doctor weekly schedule & slot duration
export async function POST(req: Request) {
  try {
    const userRole = await getUserRole()
    if (!userRole || (userRole.role !== 'Admin' && userRole.role !== 'Doctor')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { doctor_id, slot_duration_minutes, consultation_fee, schedule } =
      await req.json()

    const supabase = await createClient()

    // If caller is Doctor, ensure they can only edit their own schedule
    if (userRole.role === 'Doctor') {
      const { data: staff } = await supabase
        .from('medical_staff')
        .select('staff_id')
        .eq('user_id', userRole.userId)
        .maybeSingle()

      if (!staff || staff.staff_id !== Number(doctor_id)) {
        return NextResponse.json(
          { error: 'Forbidden: Doctors can only edit their own working hours' },
          { status: 403 },
        )
      }
    }

    // 1. Update doctor slot duration & fee if provided
    if (slot_duration_minutes !== undefined || consultation_fee !== undefined) {
      await supabase
        .from('medical_staff')
        .update({
          slot_duration_minutes: slot_duration_minutes || 30,
          consultation_fee: consultation_fee || 500,
          updated_at: new Date().toISOString(),
        })
        .eq('staff_id', Number(doctor_id))
    }

    // 2. Upsert working hours schedule
    if (Array.isArray(schedule) && schedule.length > 0) {
      for (const item of schedule) {
        await supabase
          .from('doctor_working_hours')
          .upsert(
            {
              doctor_id: Number(doctor_id),
              day_of_week: item.day_of_week,
              start_time: item.start_time || '09:00:00',
              end_time: item.end_time || '17:00:00',
              is_available: item.is_available !== false,
              slot_duration_minutes: slot_duration_minutes || 30,
              updated_at: new Date().toISOString(),
            },
            { onConflict: 'doctor_id,day_of_week' },
          )
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Doctor schedule and settings saved successfully.',
    })
  } catch (err: any) {
    console.error('[Doctor Schedule Save Error]', err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
