// lib/groq.ts
// Robust Groq LLM integration for Healthcare Pre-Visit and Post-Visit Summaries

export interface PreVisitSummaryResult {
  urgency: 'Low' | 'Medium' | 'High'
  chief_complaint: string
  suggested_questions: [string, string, string] | string[]
  raw_response?: string
  status: 'completed' | 'failed'
  error_message?: string
}

export interface PostVisitSummaryResult {
  patient_friendly_notes: string
  medication_schedule: Array<{
    medicine: string
    dosage: string
    frequency: string
    timing: string
    instructions: string
  }> | string
  follow_up_instructions: string
  raw_response?: string
  status: 'completed' | 'failed'
  error_message?: string
}

const GROQ_API_URL = 'https://api.groq.com/openai/v1/chat/completions'
const DEFAULT_MODEL = 'qwen/qwen3.6-27b'

/**
 * Generate structured Pre-Visit Summary from patient symptoms
 * CRITICAL RULE: AI must NOT diagnose the patient.
 */
export async function generatePreVisitSummary(
  symptoms: string,
  patientInfo?: { age?: number | string; gender?: string },
): Promise<PreVisitSummaryResult> {
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey || apiKey.includes('your_key')) {
    console.warn('[Groq] GROQ_API_KEY is not configured or placeholder used. Generating safe fallback summary.')
    return generateFallbackPreVisitSummary(symptoms)
  }

  const systemPrompt = `You are a clinical intake assistant for a hospital appointment system.
Your job is to analyze the patient's reported symptoms and prepare a structured pre-visit intake summary for the attending doctor.

CRITICAL SAFETY INSTRUCTIONS:
- You must NOT diagnose the patient.
- You must NOT suggest specific diseases or prescribe treatments.
- Assess urgency strictly as 'Low', 'Medium', or 'High' based on standard triage (e.g., chest pain, shortness of breath, severe bleeding = High; persistent moderate symptoms = Medium; mild routine issues = Low).
- Identify the primary chief complaint in concise clinical wording.
- Provide EXACTLY 3 relevant clinical questions that the doctor should ask the patient to clarify symptoms, onset, and severity.

You MUST reply ONLY with valid JSON in this exact structure without markdown code fences:
{
  "urgency": "Low" | "Medium" | "High",
  "chief_complaint": "string summarizing main issue",
  "suggested_questions": [
    "Question 1?",
    "Question 2?",
    "Question 3?"
  ]
}`

  const userPrompt = `Patient reported symptoms:
"${symptoms || 'No specific symptoms described.'}"
${patientInfo?.age ? `Patient Age: ${patientInfo.age}` : ''}
${patientInfo?.gender ? `Patient Gender: ${patientInfo.gender}` : ''}`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 12000) // 12s timeout

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.2,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Groq API returned HTTP ${response.status}: ${errText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('Groq returned empty completion content')
    }

    const parsed = JSON.parse(content)

    // Validate and clean questions array
    const questions = Array.isArray(parsed.suggested_questions)
      ? parsed.suggested_questions.slice(0, 3)
      : []

    while (questions.length < 3) {
      questions.push(`When did the symptoms first start, and have they changed over time?`)
      questions.push(`Are there any other associated symptoms or triggers you have noticed?`)
      questions.push(`Have you taken any over-the-counter medication or treatments for this?`)
    }

    const validUrgency = ['Low', 'Medium', 'High'].includes(parsed.urgency)
      ? (parsed.urgency as 'Low' | 'Medium' | 'High')
      : 'Medium'

    return {
      urgency: validUrgency,
      chief_complaint: parsed.chief_complaint || symptoms.slice(0, 100),
      suggested_questions: questions.slice(0, 3),
      raw_response: content,
      status: 'completed',
    }
  } catch (error: any) {
    console.error('[Groq Pre-Visit Error]', error.message)
    const fallback = generateFallbackPreVisitSummary(symptoms)
    fallback.error_message = error.message
    return fallback
  }
}

/**
 * Fallback generator if Groq is offline or API key is missing
 */
function generateFallbackPreVisitSummary(symptoms: string): PreVisitSummaryResult {
  const lower = (symptoms || '').toLowerCase()
  let urgency: 'Low' | 'Medium' | 'High' = 'Low'

  if (
    lower.includes('chest pain') ||
    lower.includes('difficulty breathing') ||
    lower.includes('shortness of breath') ||
    lower.includes('severe bleeding') ||
    lower.includes('unconscious')
  ) {
    urgency = 'High'
  } else if (
    lower.includes('fever') ||
    lower.includes('vomiting') ||
    lower.includes('severe') ||
    lower.includes('infection') ||
    lower.includes('dizziness')
  ) {
    urgency = 'Medium'
  }

  return {
    urgency,
    chief_complaint: symptoms ? symptoms.slice(0, 120) : 'General Medical Consultation',
    suggested_questions: [
      'How long have you been experiencing these symptoms?',
      'Are there any activities or foods that make the symptoms better or worse?',
      'Do you have any known allergies or current medications?',
    ],
    status: 'completed',
    raw_response: 'Generated via fallback rule-based system',
  }
}

/**
 * Generate patient-friendly Post-Visit Summary & Medication Schedule from doctor's clinical notes
 */
export async function generatePostVisitSummary(params: {
  clinicalNotes: string
  diagnosis?: string
  prescriptions?: Array<{
    medicine_name: string
    dosage: string
    frequency: string
    duration_days?: number
    instructions?: string
  }> | string
  doctorName?: string
}): Promise<PostVisitSummaryResult> {
  const apiKey = process.env.GROQ_API_KEY

  if (!apiKey || apiKey.includes('your_key')) {
    console.warn('[Groq] GROQ_API_KEY missing. Generating safe fallback post-visit summary.')
    return generateFallbackPostVisitSummary(params)
  }

  const systemPrompt = `You are an empathetic medical communicator helping patients understand their doctor's visit.
Your task is to translate doctor's clinical notes, diagnosis, and prescription into clear, reassuring, patient-friendly language.

Generate a structured JSON response with:
1. "patient_friendly_notes": A clear, empathetic 2-3 paragraph explanation of what was discussed, what the diagnosis means in simple terms, and reassuring guidance.
2. "medication_schedule": An array of medication objects explaining each medicine, when to take it, and key instructions.
3. "follow_up_instructions": Specific next steps, warning signs that require emergency care, and when to book a follow-up.

Respond ONLY in valid JSON matching this schema:
{
  "patient_friendly_notes": "string",
  "medication_schedule": [
    {
      "medicine": "Name",
      "dosage": "Dosage",
      "frequency": "Frequency",
      "timing": "e.g., Morning and Evening with meals",
      "instructions": "e.g., Drink full glass of water, complete entire course"
    }
  ],
  "follow_up_instructions": "string"
}`

  const userPrompt = `Doctor Consultation Details:
Doctor: ${params.doctorName || 'Attending Physician'}
Diagnosis: ${params.diagnosis || 'Clinical evaluation'}
Clinical Notes: ${params.clinicalNotes}
Prescription Data: ${typeof params.prescriptions === 'string' ? params.prescriptions : JSON.stringify(params.prescriptions || [])}`

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), 14000)

    const response = await fetch(GROQ_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey.trim()}`,
      },
      body: JSON.stringify({
        model: DEFAULT_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        response_format: { type: 'json_object' },
      }),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      const errText = await response.text().catch(() => '')
      throw new Error(`Groq post-visit API error HTTP ${response.status}: ${errText}`)
    }

    const data = await response.json()
    const content = data.choices?.[0]?.message?.content

    if (!content) {
      throw new Error('Groq returned empty response for post-visit summary')
    }

    const parsed = JSON.parse(content)

    return {
      patient_friendly_notes:
        parsed.patient_friendly_notes ||
        'Thank you for your visit today. Please review the care instructions and take all prescribed medications as directed.',
      medication_schedule: parsed.medication_schedule || [],
      follow_up_instructions:
        parsed.follow_up_instructions ||
        'Please rest and monitor your symptoms. Contact the clinic if your symptoms worsen or if you experience unexpected side effects.',
      raw_response: content,
      status: 'completed',
    }
  } catch (error: any) {
    console.error('[Groq Post-Visit Error]', error.message)
    const fallback = generateFallbackPostVisitSummary(params)
    fallback.error_message = error.message
    return fallback
  }
}

function generateFallbackPostVisitSummary(params: {
  clinicalNotes: string
  diagnosis?: string
  prescriptions?: any
}): PostVisitSummaryResult {
  const presList = Array.isArray(params.prescriptions)
    ? params.prescriptions.map((p) => ({
        medicine: p.medicine_name || 'Prescribed Medicine',
        dosage: p.dosage || 'As directed',
        frequency: p.frequency || 'Daily',
        timing: 'Follow bottle label instructions',
        instructions: p.instructions || 'Take with water after meals',
      }))
    : []

  return {
    patient_friendly_notes: `During your visit today, the doctor reviewed your condition (${params.diagnosis || 'Consultation'}). Clinical assessment notes: "${params.clinicalNotes}". Please follow the prescribed medication schedule and allow your body adequate rest to recover.`,
    medication_schedule: presList,
    follow_up_instructions:
      'Please monitor your symptoms over the next 3-5 days. If you experience fever, sudden worsening of pain, or unexpected allergic reactions, contact the hospital immediately or visit the emergency department.',
    status: 'completed',
    raw_response: 'Generated via fallback rule-based system',
  }
}
