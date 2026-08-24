// app/api/appointments/route.ts
// Robust appointment listing for Patient, Doctor, and Admin with full AI pre/post visit summaries

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getUserRole } from '@/utils/get-role'

export async function GET(req: Request) {
  try {
    const supabase = await createClient()
    const userRole = await getUserRole()

    if (!userRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { role, userId } = userRole

    // Base query selecting from appointments with relational joins
    let query = supabase
      .from('appointments')
      .select(
        `
        appointment_id,
        appointment_date,
        start_time,
        end_time,
        status,
        symptoms,
        patient_notes,
        clinical_notes,
        diagnosis,
        treatment_plan,
        cancellation_reason,
        cancelled_at,
        google_event_id,
        created_at,
        medical_staff: doctor_id (
          staff_id,
          specialization,
          slot_duration_minutes,
          consultation_fee,
          departments (name),
          users (
            first_name,
            last_name,
            email,
            phone_number
          )
        ),
        patients: patient_id (
          patient_id,
          blood_type,
          emergency_contact_id,
          users (
            first_name,
            last_name,
            email,
            phone_number,
            gender,
            date_of_birth
          )
        ),
        pre_visit_summaries (
          urgency,
          chief_complaint,
          suggested_questions,
          status
        ),
        post_visit_summaries (
          patient_friendly_notes,
          medication_schedule,
          follow_up_instructions,
          status
        ),
        prescriptions (
          prescription_id,
          diagnosis,
          general_notes,
          prescription_items (
            item_id,
            medicine_name,
            dosage,
            frequency,
            duration_days,
            timing,
            instructions
          )
        )
      `,
      )
      .order('appointment_date', { ascending: false })
      .order('start_time', { ascending: false })

    if (role === 'Patient') {
      // Find patient_id for current user
      const { data: patient } = await supabase
        .from('patients')
        .select('patient_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (!patient) {
        return NextResponse.json([])
      }

      query = query.eq('patient_id', patient.patient_id)
    } else if (role === 'Doctor') {
      const { data: doctor } = await supabase
        .from('medical_staff')
        .select('staff_id')
        .eq('user_id', userId)
        .maybeSingle()

      if (!doctor) {
        return NextResponse.json([])
      }

      query = query.eq('doctor_id', doctor.staff_id)
    }

    const { data, error } = await query

    if (error) {
      console.warn('[Appointments Table Query Failed, checking fallback]', error.message)
      // Fallback: try medical_records if appointments table not populated yet
      const fallbackQuery = supabase
        .from('medical_records')
        .select(
          `
          record_id,
          visit_date,
          visit_status,
          patient_status,
          symptoms,
          diagnosis,
          treatment_plan,
          medicine_prescribed,
          patients(
            patient_id,
            users(first_name, last_name, email)
          ),
          medical_staff: doctor_id(
            staff_id,
            users(first_name, last_name, email)
          )
        `,
        )
        .order('visit_date', { ascending: false })

      const { data: fallbackData } = await fallbackQuery

      const normalizedFallback = (fallbackData || []).map((rec: any) => ({
        appointment_id: rec.record_id,
        appointment_date: rec.visit_date ? rec.visit_date.split('T')[0] : '',
        start_time: rec.visit_date && rec.visit_date.includes('T') ? rec.visit_date.split('T')[1].substring(0, 5) : '09:00',
        end_time: '09:30',
        status: rec.visit_status || 'Scheduled',
        visit_date: rec.visit_date,
        visit_status: rec.visit_status,
        patient_status: rec.patient_status,
        symptoms: rec.symptoms,
        diagnosis: rec.diagnosis,
        treatment_plan: rec.treatment_plan,
        medical_staff: rec.medical_staff,
        patients: rec.patients,
      }))

      return NextResponse.json(normalizedFallback)
    }

    // Normalize records to include backwards-compatible fields
    const formatted = (data || []).map((appt: any) => {
      const dateStr = appt.appointment_date || ''
      const timeStr = appt.start_time || '00:00'
      const combinedIso = `${dateStr}T${timeStr}`

      return {
        ...appt,
        record_id: appt.appointment_id,
        visit_date: combinedIso,
        visit_status: appt.status,
        patient_status: 'Outpatient',
      }
    })

    return NextResponse.json(formatted)
  } catch (err: any) {
    console.error('[Appointments API Exception]', err)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
