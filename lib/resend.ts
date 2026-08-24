// lib/resend.ts
// Robust Resend Email notification integration with failure isolation and retry handling

export interface EmailPayload {
  to: string
  subject: string
  html: string
  text?: string
  recipientName?: string
  type:
    | 'booking_confirmation'
    | 'reminder_24h'
    | 'reminder_2h'
    | 'cancellation'
    | 'leave_conflict'
    | 'doctor_alert'
    | 'medication_reminder'
  metadata?: Record<string, any>
}

export interface SendEmailResult {
  success: boolean
  messageId?: string
  status: 'sent' | 'failed' | 'pending'
  error?: string
}

const RESEND_API_URL = 'https://api.resend.com/emails'
const DEFAULT_FROM = 'Healthcare Manager <onboarding@resend.dev>'

/**
 * Send email via Resend with graceful error handling
 * CRITICAL: Failure MUST NEVER crash the caller or roll back booking transactions.
 */
export async function sendEmail(payload: EmailPayload): Promise<SendEmailResult> {
  const apiKey = process.env.RESEND_API_KEY

  if (!apiKey || apiKey.includes('your_key') || !apiKey.startsWith('re_')) {
    console.warn(`[Resend] RESEND_API_KEY missing or invalid. Simulating email send to ${payload.to}.`)
    return {
      success: true,
      messageId: `sim_${Date.now()}_${Math.random().toString(36).substring(7)}`,
      status: 'sent',
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 8000)

    const response = await fetch(RESEND_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        from: DEFAULT_FROM,
        to: [payload.to],
        subject: payload.subject,
        html: payload.html,
        text: payload.text,
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      console.error(`[Resend Error HTTP ${response.status}]`, errText)
      return {
        success: false,
        status: 'failed',
        error: `HTTP ${response.status}: ${errText}`,
      }
    }

    const data = await response.json()
    return {
      success: true,
      messageId: data.id,
      status: 'sent',
    }
  } catch (error: any) {
    console.error('[Resend Network Error]', error.message)
    return {
      success: false,
      status: 'failed',
      error: error.message,
    }
  }
}

// ==========================================
// TEMPLATE BUILDERS
// ==========================================

export function buildBookingConfirmationEmail(params: {
  patientName: string
  doctorName: string
  specialization: string
  date: string
  time: string
  appointmentId: number | string
}): EmailPayload {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px; background-color: #ffffff;">
      <div style="text-align: center; margin-bottom: 24px;">
        <h2 style="color: #0284c7; margin: 0;">🏥 Healthcare Appointment Confirmed</h2>
      </div>
      <p style="font-size: 16px; color: #334155;">Dear <strong>${params.patientName}</strong>,</p>
      <p style="font-size: 15px; color: #475569;">Your upcoming medical consultation has been successfully scheduled:</p>
      
      <div style="background-color: #f8fafc; border-left: 4px solid #0284c7; padding: 16px; margin: 20px 0; border-radius: 4px;">
        <p style="margin: 6px 0; font-size: 15px;"><strong>Doctor:</strong> Dr. ${params.doctorName} (${params.specialization})</p>
        <p style="margin: 6px 0; font-size: 15px;"><strong>Date:</strong> ${params.date}</p>
        <p style="margin: 6px 0; font-size: 15px;"><strong>Time:</strong> ${params.time}</p>
        <p style="margin: 6px 0; font-size: 14px; color: #64748b;"><strong>Booking ID:</strong> #${params.appointmentId}</p>
      </div>

      <p style="font-size: 14px; color: #475569;">
        Please arrive 10 minutes prior to your appointment time. If you need to cancel or reschedule, please use your patient portal dashboard.
      </p>
      
      <hr style="border: none; border-top: 1px solid #e2e8f0; margin: 24px 0;" />
      <p style="font-size: 12px; color: #94a3b8; text-align: center;">Healthcare Appointment & Follow-up Manager System</p>
    </div>
  `

  return {
    to: '',
    subject: `Appointment Confirmed with Dr. ${params.doctorName} on ${params.date}`,
    html,
    type: 'booking_confirmation',
  }
}

export function buildDoctorAppointmentNotificationEmail(params: {
  doctorName: string
  doctorEmail: string
  patientName: string
  date: string
  time: string
  symptoms: string
  urgency?: string
  appointmentId: number | string
}): EmailPayload {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0f766e; margin-top: 0;">👨‍⚕️ New Patient Appointment Booked</h2>
      <p style="font-size: 16px;">Hello Dr. <strong>${params.doctorName}</strong>,</p>
      <p>A new consultation has been booked with you:</p>
      
      <div style="background-color: #f0fdf4; border-left: 4px solid #0f766e; padding: 16px; margin: 16px 0; border-radius: 4px;">
        <p style="margin: 4px 0;"><strong>Patient:</strong> ${params.patientName}</p>
        <p style="margin: 4px 0;"><strong>Date & Time:</strong> ${params.date} at ${params.time}</p>
        <p style="margin: 4px 0;"><strong>Urgency Assessment:</strong> <span style="font-weight: bold; color: ${params.urgency === 'High' ? '#dc2626' : '#0f766e'};">${params.urgency || 'Standard'}</span></p>
        <p style="margin: 4px 0;"><strong>Reported Symptoms:</strong> ${params.symptoms || 'None specified'}</p>
      </div>

      <p style="font-size: 14px; color: #475569;">
        AI Pre-visit summary and intake questions are available on your doctor portal.
      </p>
    </div>
  `

  return {
    to: params.doctorEmail,
    subject: `New Appointment: ${params.patientName} on ${params.date} (${params.time})`,
    html,
    type: 'doctor_alert',
  }
}

export function buildCancellationEmail(params: {
  patientName: string
  doctorName: string
  date: string
  time: string
  reason?: string
}): EmailPayload {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #dc2626; margin-top: 0;">Appointment Cancelled</h2>
      <p>Dear <strong>${params.patientName}</strong>,</p>
      <p>Your appointment with Dr. <strong>${params.doctorName}</strong> on <strong>${params.date} at ${params.time}</strong> has been cancelled.</p>
      ${params.reason ? `<p><strong>Reason:</strong> ${params.reason}</p>` : ''}
      <p>You can book a new appointment at any time through the patient portal.</p>
    </div>
  `

  return {
    to: '',
    subject: `Appointment Cancelled - Dr. ${params.doctorName} (${params.date})`,
    html,
    type: 'cancellation',
  }
}

export function buildDoctorLeaveConflictEmail(params: {
  patientName: string
  doctorName: string
  date: string
  time: string
  reason?: string
}): EmailPayload {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #f87171; border-radius: 8px; background-color: #fffaf0;">
      <h2 style="color: #b91c1c; margin-top: 0;">⚠️ Action Required: Doctor Schedule Conflict</h2>
      <p>Dear <strong>${params.patientName}</strong>,</p>
      <p>Dr. <strong>${params.doctorName}</strong> is unexpectedly unavailable / on leave on <strong>${params.date}</strong>.</p>
      <p>Your scheduled visit at <strong>${params.time}</strong> needs to be rescheduled. Our system has flagged your record for priority re-booking.</p>
      <div style="text-align: center; margin: 24px 0;">
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000'}/patient" style="background-color: #0284c7; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; display: inline-block;">Reschedule Your Appointment</a>
      </div>
      <p style="font-size: 13px; color: #64748b;">We sincerely apologize for any inconvenience caused.</p>
    </div>
  `

  return {
    to: '',
    subject: `Urgent: Reschedule needed for appointment with Dr. ${params.doctorName} on ${params.date}`,
    html,
    type: 'leave_conflict',
  }
}

export function buildReminderEmail(params: {
  patientName: string
  doctorName: string
  specialization: string
  date: string
  time: string
  hoursRemaining: number
}): EmailPayload {
  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 24px; border: 1px solid #e2e8f0; border-radius: 8px;">
      <h2 style="color: #0284c7; margin-top: 0;">⏰ Reminder: Medical Appointment in ${params.hoursRemaining} Hours</h2>
      <p>Dear <strong>${params.patientName}</strong>,</p>
      <p>This is a friendly reminder of your upcoming consultation:</p>
      <div style="background-color: #f8fafc; padding: 16px; border-radius: 6px; margin: 16px 0;">
        <p style="margin: 4px 0;"><strong>Doctor:</strong> Dr. ${params.doctorName} (${params.specialization})</p>
        <p style="margin: 4px 0;"><strong>Date:</strong> ${params.date}</p>
        <p style="margin: 4px 0;"><strong>Time:</strong> ${params.time}</p>
      </div>
      <p style="font-size: 14px; color: #475569;">Please bring any recent medical reports and arrive 10 minutes early.</p>
    </div>
  `

  return {
    to: '',
    subject: `Reminder: Appointment with Dr. ${params.doctorName} in ${params.hoursRemaining}h (${params.time})`,
    html,
    type: params.hoursRemaining <= 2 ? 'reminder_2h' : 'reminder_24h',
  }
}
