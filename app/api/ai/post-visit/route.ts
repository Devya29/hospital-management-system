// app/api/ai/post-visit/route.ts
// Generate or regenerate AI Post-Visit summary on demand with Groq LLM

import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getUserRole } from '@/utils/get-role'
import { generatePostVisitSummary } from '@/lib/groq'

export async function POST(req: Request) {
  try {
    const userRole = await getUserRole()
    if (!userRole) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { appointment_id } = await req.json()

    if (!appointment_id) {
      return NextResponse.json({ error: 'Appointment ID is required' }, { status: 400 })
    }

    const supabase = await createClient()

    // 1. Fetch appointment details
    const { data: appointment, error: fetchError } = await supabase
      .from('appointments')
      .select(
        `
        appointment_id,
        clinical_notes,
        diagnosis,
        treatment_plan,
        medical_staff: doctor_id (
          users: user_id (first_name, last_name)
        ),
        prescriptions (
          prescription_items (
            medicine_name,
            dosage,
            frequency,
            duration_days,
            instructions
          )
        )
      `,
      )
      .eq('appointment_id', Number(appointment_id))
      .single()

    if (fetchError || !appointment) {
      return NextResponse.json({ error: 'Appointment not found' }, { status: 404 })
    }

    const doctorUser = (appointment.medical_staff as any)?.users
    const doctorName = doctorUser ? `${doctorUser.first_name} ${doctorUser.last_name}` : 'Doctor'
    const prescriptionItems =
      appointment.prescriptions?.[0]?.prescription_items || []

    const summary = await generatePostVisitSummary({
      clinicalNotes: appointment.clinical_notes || appointment.treatment_plan || 'Routine consultation',
      diagnosis: appointment.diagnosis,
      prescriptions: prescriptionItems,
      doctorName,
    })

    // Upsert into post_visit_summaries
    await supabase.from('post_visit_summaries').upsert(
      {
        appointment_id: Number(appointment_id),
        patient_friendly_notes: summary.patient_friendly_notes,
        medication_schedule: summary.medication_schedule,
        follow_up_instructions: summary.follow_up_instructions,
        raw_response: summary.raw_response,
        status: summary.status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'appointment_id' },
    )

    return NextResponse.json({
      success: true,
      summary,
    })
  } catch (err: any) {
    console.error('[Generate Post Visit Exception]', err)
    return NextResponse.json({ error: err.message || 'Internal Server Error' }, { status: 500 })
  }
}
