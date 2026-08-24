-- ==============================================================================
-- HEALTHCARE APPOINTMENT & FOLLOW-UP MANAGER SCHEMA MIGRATION
-- Database: PostgreSQL (Supabase)
-- ==============================================================================

-- 1. EXTENSIONS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. USERS & PROFILES
-- Enhance users table if exists, or create baseline
CREATE TABLE IF NOT EXISTS public.users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    national_id VARCHAR(50),
    first_name VARCHAR(100) NOT NULL,
    last_name VARCHAR(100) NOT NULL,
    date_of_birth DATE,
    gender VARCHAR(20),
    address TEXT,
    phone_number VARCHAR(30),
    email VARCHAR(255),
    role VARCHAR(30) DEFAULT 'Patient',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 3. DEPARTMENTS
CREATE TABLE IF NOT EXISTS public.departments (
    department_id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL UNIQUE,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert common departments if not exists
INSERT INTO public.departments (name, description) VALUES
('General Medicine', 'Primary care and routine checkups'),
('Cardiology', 'Heart and cardiovascular system care'),
('Dermatology', 'Skin, hair, and nail treatments'),
('Pediatrics', 'Infant, child, and adolescent medicine'),
('Orthopedics', 'Musculoskeletal and bone surgery/care'),
('Neurology', 'Brain and nervous system disorders'),
('Psychiatry', 'Mental health and behavioral wellness'),
('Ophthalmology', 'Eye and vision care')
ON CONFLICT (name) DO NOTHING;

-- 4. MEDICAL STAFF / DOCTORS
CREATE TABLE IF NOT EXISTS public.medical_staff (
    staff_id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.users(user_id) ON DELETE CASCADE,
    department_id INT REFERENCES public.departments(department_id) ON DELETE SET NULL,
    staff_type VARCHAR(50) NOT NULL DEFAULT 'Doctor', -- 'Doctor', 'Nurse', 'Pharmacist', 'Admin'
    license_number VARCHAR(100),
    employment_status VARCHAR(50) DEFAULT 'Active', -- 'Active', 'On_Leave', 'Resigned', 'Retired'
    specialization VARCHAR(150),
    bio TEXT,
    slot_duration_minutes INT DEFAULT 30,
    consultation_fee NUMERIC(10, 2) DEFAULT 500.00,
    date_hired DATE DEFAULT CURRENT_DATE,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. PATIENTS
CREATE TABLE IF NOT EXISTS public.patients (
    patient_id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES public.users(user_id) ON DELETE CASCADE UNIQUE,
    blood_type VARCHAR(10),
    emergency_contact_id VARCHAR(100),
    medical_history TEXT,
    allergies TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 6. DOCTOR WORKING HOURS
CREATE TABLE IF NOT EXISTS public.doctor_working_hours (
    id SERIAL PRIMARY KEY,
    doctor_id INT NOT NULL REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 1=Monday, ... 6=Saturday
    start_time TIME NOT NULL DEFAULT '09:00:00',
    end_time TIME NOT NULL DEFAULT '17:00:00',
    is_available BOOLEAN DEFAULT TRUE,
    slot_duration_minutes INT DEFAULT 30,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT uq_doctor_day UNIQUE (doctor_id, day_of_week)
);

-- 7. DOCTOR LEAVES
CREATE TABLE IF NOT EXISTS public.doctor_leaves (
    leave_id SERIAL PRIMARY KEY,
    doctor_id INT NOT NULL REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
    start_date DATE NOT NULL,
    end_date DATE NOT NULL,
    reason TEXT,
    status VARCHAR(30) DEFAULT 'Approved', -- 'Approved', 'Cancelled'
    created_by UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT chk_leave_dates CHECK (end_date >= start_date)
);

-- 8. APPOINTMENTS
CREATE TABLE IF NOT EXISTS public.appointments (
    appointment_id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
    doctor_id INT NOT NULL REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
    appointment_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'Scheduled', -- 'Scheduled', 'Completed', 'Cancelled', 'Reschedule_Required'
    symptoms TEXT,
    patient_notes TEXT,
    clinical_notes TEXT,
    diagnosis TEXT,
    treatment_plan TEXT,
    cancellation_reason TEXT,
    cancelled_at TIMESTAMPTZ,
    rescheduled_from_id INT REFERENCES public.appointments(appointment_id) ON DELETE SET NULL,
    google_event_id VARCHAR(255),
    google_calendar_status VARCHAR(30) DEFAULT 'pending', -- 'synced', 'failed', 'pending', 'deleted'
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- CRITICAL DATABASE-LEVEL DOUBLE BOOKING PREVENTION:
-- Unique partial index enforcing that a doctor CANNOT have two non-cancelled appointments at the same date and time.
CREATE UNIQUE INDEX IF NOT EXISTS idx_unique_doctor_slot_active 
ON public.appointments (doctor_id, appointment_date, start_time) 
WHERE status NOT IN ('Cancelled');

-- Indexes for fast appointment queries
CREATE INDEX IF NOT EXISTS idx_appointments_patient ON public.appointments(patient_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_doctor ON public.appointments(doctor_id, appointment_date);
CREATE INDEX IF NOT EXISTS idx_appointments_status ON public.appointments(status);

-- 9. SLOT HOLDS (Temporary lock when a user selects a slot)
CREATE TABLE IF NOT EXISTS public.slot_holds (
    id SERIAL PRIMARY KEY,
    doctor_id INT NOT NULL REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
    slot_date DATE NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    hold_token VARCHAR(100) NOT NULL UNIQUE,
    patient_id INT REFERENCES public.patients(patient_id) ON DELETE CASCADE,
    user_session_id VARCHAR(100),
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_slot_holds_active 
ON public.slot_holds(doctor_id, slot_date, start_time, expires_at);

-- 10. PRE-VISIT AI SUMMARIES (Groq LLM)
CREATE TABLE IF NOT EXISTS public.pre_visit_summaries (
    id SERIAL PRIMARY KEY,
    appointment_id INT NOT NULL REFERENCES public.appointments(appointment_id) ON DELETE CASCADE UNIQUE,
    urgency VARCHAR(20) NOT NULL DEFAULT 'Low', -- 'Low', 'Medium', 'High'
    chief_complaint TEXT NOT NULL,
    suggested_questions JSONB NOT NULL DEFAULT '[]'::jsonb, -- exactly 3 questions
    raw_response TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'completed', -- 'completed', 'failed', 'pending'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 11. POST-VISIT AI SUMMARIES (Groq LLM)
CREATE TABLE IF NOT EXISTS public.post_visit_summaries (
    id SERIAL PRIMARY KEY,
    appointment_id INT NOT NULL REFERENCES public.appointments(appointment_id) ON DELETE CASCADE UNIQUE,
    patient_friendly_notes TEXT,
    medication_schedule JSONB DEFAULT '[]'::jsonb,
    follow_up_instructions TEXT,
    raw_response TEXT,
    status VARCHAR(30) NOT NULL DEFAULT 'completed', -- 'completed', 'failed', 'pending'
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 12. PRESCRIPTIONS & MEDICATION SCHEDULE
CREATE TABLE IF NOT EXISTS public.prescriptions (
    prescription_id SERIAL PRIMARY KEY,
    appointment_id INT REFERENCES public.appointments(appointment_id) ON DELETE CASCADE,
    patient_id INT NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
    doctor_id INT NOT NULL REFERENCES public.medical_staff(staff_id) ON DELETE CASCADE,
    diagnosis TEXT,
    general_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.prescription_items (
    item_id SERIAL PRIMARY KEY,
    prescription_id INT NOT NULL REFERENCES public.prescriptions(prescription_id) ON DELETE CASCADE,
    medicine_name VARCHAR(200) NOT NULL,
    dosage VARCHAR(100) NOT NULL, -- e.g. '500mg'
    frequency VARCHAR(100) NOT NULL, -- e.g. 'Twice daily after meals'
    duration_days INT NOT NULL DEFAULT 7,
    timing VARCHAR(100), -- e.g. 'Morning, Night'
    instructions TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 13. MEDICATION REMINDERS
CREATE TABLE IF NOT EXISTS public.medication_reminders (
    id SERIAL PRIMARY KEY,
    patient_id INT NOT NULL REFERENCES public.patients(patient_id) ON DELETE CASCADE,
    prescription_item_id INT REFERENCES public.prescription_items(item_id) ON DELETE CASCADE,
    medicine_name VARCHAR(200) NOT NULL,
    dosage VARCHAR(100) NOT NULL,
    scheduled_time TIME NOT NULL, -- e.g. '08:00:00'
    start_date DATE NOT NULL DEFAULT CURRENT_DATE,
    end_date DATE NOT NULL,
    is_active BOOLEAN DEFAULT TRUE,
    last_sent_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 14. NOTIFICATIONS (Resend Email Queue & History)
CREATE TABLE IF NOT EXISTS public.notifications (
    id SERIAL PRIMARY KEY,
    recipient_email VARCHAR(255) NOT NULL,
    recipient_name VARCHAR(200),
    user_id UUID REFERENCES public.users(user_id) ON DELETE SET NULL,
    type VARCHAR(50) NOT NULL, -- 'booking_confirmation', 'reminder_24h', 'reminder_2h', 'cancellation', 'leave_conflict', 'doctor_alert', 'medication_reminder'
    subject VARCHAR(255) NOT NULL,
    content_html TEXT NOT NULL,
    status VARCHAR(30) DEFAULT 'pending', -- 'pending', 'sent', 'failed'
    retry_count INT DEFAULT 0,
    max_retries INT DEFAULT 3,
    error_message TEXT,
    scheduled_for TIMESTAMPTZ DEFAULT NOW(),
    sent_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_notifications_pending 
ON public.notifications(status, scheduled_for) 
WHERE status IN ('pending', 'failed');

-- 15. GOOGLE CALENDAR OAUTH TOKENS
CREATE TABLE IF NOT EXISTS public.google_calendar_tokens (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES public.users(user_id) ON DELETE CASCADE UNIQUE,
    access_token TEXT NOT NULL,
    refresh_token TEXT,
    token_type VARCHAR(50) DEFAULT 'Bearer',
    scope TEXT,
    expiry_date BIGINT, -- millisecond timestamp
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 16. COMPATIBILITY VIEW / SYNC with existing medical_records
-- If existing queries use medical_records, this ensures backward compatibility
CREATE OR REPLACE VIEW public.medical_records_view AS
SELECT 
    a.appointment_id AS record_id,
    a.patient_id,
    a.doctor_id,
    a.symptoms,
    a.diagnosis,
    a.treatment_plan,
    '' AS medicine_prescribed,
    (a.appointment_date || 'T' || a.start_time)::timestamp AS visit_date,
    a.status AS visit_status,
    'Outpatient' AS patient_status,
    a.created_at
FROM public.appointments a;

-- 17. SEED INITIAL WORKING HOURS FOR DOCTORS (Monday to Friday, 9:00 - 17:00)
-- Function to automatically populate doctor working hours upon staff insertion
CREATE OR REPLACE FUNCTION public.seed_default_doctor_working_hours()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.staff_type = 'Doctor' THEN
        INSERT INTO public.doctor_working_hours (doctor_id, day_of_week, start_time, end_time, is_available, slot_duration_minutes)
        VALUES 
            (NEW.staff_id, 1, '09:00:00', '17:00:00', true, COALESCE(NEW.slot_duration_minutes, 30)),
            (NEW.staff_id, 2, '09:00:00', '17:00:00', true, COALESCE(NEW.slot_duration_minutes, 30)),
            (NEW.staff_id, 3, '09:00:00', '17:00:00', true, COALESCE(NEW.slot_duration_minutes, 30)),
            (NEW.staff_id, 4, '09:00:00', '17:00:00', true, COALESCE(NEW.slot_duration_minutes, 30)),
            (NEW.staff_id, 5, '09:00:00', '17:00:00', true, COALESCE(NEW.slot_duration_minutes, 30))
        ON CONFLICT (doctor_id, day_of_week) DO NOTHING;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_seed_doctor_working_hours ON public.medical_staff;
CREATE TRIGGER trg_seed_doctor_working_hours
AFTER INSERT ON public.medical_staff
FOR EACH ROW
EXECUTE FUNCTION public.seed_default_doctor_working_hours();

-- ==============================================================================

-- ==============================================================================
-- 18. ROW LEVEL SECURITY (RLS) & ACCESS CONTROL POLICIES
-- ==============================================================================
-- Sensitive healthcare data is restricted by authenticated user, doctor,
-- patient, or admin ownership. Server-side system jobs should use the
-- Supabase service-role client and must never expose that key to the browser.
-- ==============================================================================

CREATE OR REPLACE FUNCTION public.get_auth_role()
RETURNS VARCHAR
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
    SELECT role
    FROM public.users
    WHERE user_id = auth.uid()
    LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_auth_role() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_auth_role() TO authenticated;

-- Enable RLS
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.patients ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medical_staff ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.appointments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.slot_holds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_working_hours ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.doctor_leaves ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pre_visit_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.post_visit_summaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prescription_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.medication_reminders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.google_calendar_tokens ENABLE ROW LEVEL SECURITY;

-- ------------------------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------------------------
CREATE POLICY "Users can read own profile or staff/admin can read"
ON public.users FOR SELECT
TO authenticated, anon
USING (
    auth.uid() = user_id
    OR role IN ('Doctor', 'Nurse', 'Pharmacist', 'Admin')
    OR user_id IN (SELECT user_id FROM public.medical_staff)
    OR public.get_auth_role() IN ('Admin', 'Doctor', 'Nurse', 'Pharmacist')
);

CREATE POLICY "Users can update own profile"
ON public.users FOR UPDATE
TO authenticated
USING (auth.uid() = user_id OR public.get_auth_role() = 'Admin')
WITH CHECK (auth.uid() = user_id OR public.get_auth_role() = 'Admin');

-- ------------------------------------------------------------------------------
-- PATIENTS
-- ------------------------------------------------------------------------------
CREATE POLICY "Patients can view own patient record"
ON public.patients FOR SELECT
TO authenticated
USING (
    auth.uid() = user_id
    OR public.get_auth_role() IN ('Admin', 'Doctor', 'Nurse', 'Pharmacist')
);

CREATE POLICY "Patients can create own patient record"
ON public.patients FOR INSERT
TO authenticated
WITH CHECK (
    auth.uid() = user_id
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Patients can update own record"
ON public.patients FOR UPDATE
TO authenticated
USING (
    auth.uid() = user_id
    OR public.get_auth_role() = 'Admin'
)
WITH CHECK (
    auth.uid() = user_id
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Admins can delete patients"
ON public.patients FOR DELETE
TO authenticated
USING (public.get_auth_role() = 'Admin');

-- ------------------------------------------------------------------------------
-- MEDICAL STAFF
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view medical staff"
ON public.medical_staff FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Doctors can update own staff record"
ON public.medical_staff FOR UPDATE
TO authenticated
USING (
    user_id = auth.uid()
    OR public.get_auth_role() = 'Admin'
)
WITH CHECK (
    user_id = auth.uid()
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Admins can manage medical staff"
ON public.medical_staff FOR ALL
TO authenticated
USING (public.get_auth_role() = 'Admin')
WITH CHECK (public.get_auth_role() = 'Admin');

-- ------------------------------------------------------------------------------
-- APPOINTMENTS
-- ------------------------------------------------------------------------------
CREATE POLICY "Patients and doctors can view relevant appointments"
ON public.appointments FOR SELECT
TO authenticated
USING (
    patient_id IN (
        SELECT p.patient_id
        FROM public.patients p
        WHERE p.user_id = auth.uid()
    )
    OR doctor_id IN (
        SELECT ms.staff_id
        FROM public.medical_staff ms
        WHERE ms.user_id = auth.uid()
    )
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Patients and authorized staff can create appointments"
ON public.appointments FOR INSERT
TO authenticated
WITH CHECK (
    patient_id IN (
        SELECT p.patient_id
        FROM public.patients p
        WHERE p.user_id = auth.uid()
    )
    OR public.get_auth_role() IN ('Admin', 'Doctor')
);

CREATE POLICY "Patients and doctors can update relevant appointments"
ON public.appointments FOR UPDATE
TO authenticated
USING (
    patient_id IN (
        SELECT p.patient_id
        FROM public.patients p
        WHERE p.user_id = auth.uid()
    )
    OR doctor_id IN (
        SELECT ms.staff_id
        FROM public.medical_staff ms
        WHERE ms.user_id = auth.uid()
    )
    OR public.get_auth_role() = 'Admin'
)
WITH CHECK (
    patient_id IN (
        SELECT p.patient_id
        FROM public.patients p
        WHERE p.user_id = auth.uid()
    )
    OR doctor_id IN (
        SELECT ms.staff_id
        FROM public.medical_staff ms
        WHERE ms.user_id = auth.uid()
    )
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Patients and doctors can delete relevant appointments"
ON public.appointments FOR DELETE
TO authenticated
USING (
    patient_id IN (
        SELECT p.patient_id
        FROM public.patients p
        WHERE p.user_id = auth.uid()
    )
    OR doctor_id IN (
        SELECT ms.staff_id
        FROM public.medical_staff ms
        WHERE ms.user_id = auth.uid()
    )
    OR public.get_auth_role() = 'Admin'
);

-- ------------------------------------------------------------------------------
-- SLOT HOLDS
-- ------------------------------------------------------------------------------
-- user_session_id is VARCHAR in this schema, so compare it to auth.uid()::text.
CREATE POLICY "Users can view own slot holds"
ON public.slot_holds FOR SELECT
TO authenticated
USING (
    user_session_id = auth.uid()::text
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Users can create own slot holds"
ON public.slot_holds FOR INSERT
TO authenticated
WITH CHECK (
    user_session_id = auth.uid()::text
);

CREATE POLICY "Users can update own slot holds"
ON public.slot_holds FOR UPDATE
TO authenticated
USING (
    user_session_id = auth.uid()::text
    OR public.get_auth_role() = 'Admin'
)
WITH CHECK (
    user_session_id = auth.uid()::text
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Users can delete own slot holds"
ON public.slot_holds FOR DELETE
TO authenticated
USING (
    user_session_id = auth.uid()::text
    OR public.get_auth_role() = 'Admin'
);

-- ------------------------------------------------------------------------------
-- DOCTOR WORKING HOURS
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view working hours"
ON public.doctor_working_hours FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Doctors can manage own working hours"
ON public.doctor_working_hours FOR ALL
TO authenticated
USING (
    doctor_id IN (
        SELECT ms.staff_id
        FROM public.medical_staff ms
        WHERE ms.user_id = auth.uid()
    )
    OR public.get_auth_role() = 'Admin'
)
WITH CHECK (
    doctor_id IN (
        SELECT ms.staff_id
        FROM public.medical_staff ms
        WHERE ms.user_id = auth.uid()
    )
    OR public.get_auth_role() = 'Admin'
);

-- ------------------------------------------------------------------------------
-- DOCTOR LEAVES
-- ------------------------------------------------------------------------------
CREATE POLICY "Authenticated users can view doctor leaves"
ON public.doctor_leaves FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Doctors can manage own leaves"
ON public.doctor_leaves FOR ALL
TO authenticated
USING (
    doctor_id IN (
        SELECT ms.staff_id
        FROM public.medical_staff ms
        WHERE ms.user_id = auth.uid()
    )
    OR public.get_auth_role() = 'Admin'
)
WITH CHECK (
    doctor_id IN (
        SELECT ms.staff_id
        FROM public.medical_staff ms
        WHERE ms.user_id = auth.uid()
    )
    OR public.get_auth_role() = 'Admin'
);

-- ------------------------------------------------------------------------------
-- PRE-VISIT SUMMARIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Relevant users can view pre visit summaries"
ON public.pre_visit_summaries FOR SELECT
TO authenticated
USING (
    appointment_id IN (
        SELECT a.appointment_id
        FROM public.appointments a
        WHERE
            a.patient_id IN (
                SELECT p.patient_id
                FROM public.patients p
                WHERE p.user_id = auth.uid()
            )
            OR a.doctor_id IN (
                SELECT ms.staff_id
                FROM public.medical_staff ms
                WHERE ms.user_id = auth.uid()
            )
    )
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Patients or assigned doctors can create pre visit summaries"
ON public.pre_visit_summaries FOR INSERT
TO authenticated
WITH CHECK (
    appointment_id IN (
        SELECT a.appointment_id
        FROM public.appointments a
        WHERE
            a.patient_id IN (
                SELECT p.patient_id
                FROM public.patients p
                WHERE p.user_id = auth.uid()
            )
            OR a.doctor_id IN (
                SELECT ms.staff_id
                FROM public.medical_staff ms
                WHERE ms.user_id = auth.uid()
            )
    )
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Assigned doctors can update pre visit summaries"
ON public.pre_visit_summaries FOR UPDATE
TO authenticated
USING (
    appointment_id IN (
        SELECT a.appointment_id
        FROM public.appointments a
        WHERE a.doctor_id IN (
            SELECT ms.staff_id
            FROM public.medical_staff ms
            WHERE ms.user_id = auth.uid()
        )
    )
    OR public.get_auth_role() = 'Admin'
)
WITH CHECK (
    appointment_id IN (
        SELECT a.appointment_id
        FROM public.appointments a
        WHERE a.doctor_id IN (
            SELECT ms.staff_id
            FROM public.medical_staff ms
            WHERE ms.user_id = auth.uid()
        )
    )
    OR public.get_auth_role() = 'Admin'
);

-- ------------------------------------------------------------------------------
-- POST-VISIT SUMMARIES
-- ------------------------------------------------------------------------------
CREATE POLICY "Relevant users can view post visit summaries"
ON public.post_visit_summaries FOR SELECT
TO authenticated
USING (
    appointment_id IN (
        SELECT a.appointment_id
        FROM public.appointments a
        WHERE
            a.patient_id IN (
                SELECT p.patient_id
                FROM public.patients p
                WHERE p.user_id = auth.uid()
            )
            OR a.doctor_id IN (
                SELECT ms.staff_id
                FROM public.medical_staff ms
                WHERE ms.user_id = auth.uid()
            )
    )
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Assigned doctors can create post visit summaries"
ON public.post_visit_summaries FOR INSERT
TO authenticated
WITH CHECK (
    appointment_id IN (
        SELECT a.appointment_id
        FROM public.appointments a
        WHERE a.doctor_id IN (
            SELECT ms.staff_id
            FROM public.medical_staff ms
            WHERE ms.user_id = auth.uid()
        )
    )
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Assigned doctors can update post visit summaries"
ON public.post_visit_summaries FOR UPDATE
TO authenticated
USING (
    appointment_id IN (
        SELECT a.appointment_id
        FROM public.appointments a
        WHERE a.doctor_id IN (
            SELECT ms.staff_id
            FROM public.medical_staff ms
            WHERE ms.user_id = auth.uid()
        )
    )
    OR public.get_auth_role() = 'Admin'
)
WITH CHECK (
    appointment_id IN (
        SELECT a.appointment_id
        FROM public.appointments a
        WHERE a.doctor_id IN (
            SELECT ms.staff_id
            FROM public.medical_staff ms
            WHERE ms.user_id = auth.uid()
        )
    )
    OR public.get_auth_role() = 'Admin'
);

-- ------------------------------------------------------------------------------
-- PRESCRIPTIONS
-- ------------------------------------------------------------------------------
CREATE POLICY "Relevant users can view prescriptions"
ON public.prescriptions FOR SELECT
TO authenticated
USING (
    patient_id IN (
        SELECT p.patient_id
        FROM public.patients p
        WHERE p.user_id = auth.uid()
    )
    OR doctor_id IN (
        SELECT ms.staff_id
        FROM public.medical_staff ms
        WHERE ms.user_id = auth.uid()
    )
    OR public.get_auth_role() IN ('Admin', 'Pharmacist')
);

CREATE POLICY "Doctors can create prescriptions"
ON public.prescriptions FOR INSERT
TO authenticated
WITH CHECK (
    doctor_id IN (
        SELECT ms.staff_id
        FROM public.medical_staff ms
        WHERE ms.user_id = auth.uid()
    )
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Doctors can update prescriptions"
ON public.prescriptions FOR UPDATE
TO authenticated
USING (
    doctor_id IN (
        SELECT ms.staff_id
        FROM public.medical_staff ms
        WHERE ms.user_id = auth.uid()
    )
    OR public.get_auth_role() = 'Admin'
)
WITH CHECK (
    doctor_id IN (
        SELECT ms.staff_id
        FROM public.medical_staff ms
        WHERE ms.user_id = auth.uid()
    )
    OR public.get_auth_role() = 'Admin'
);

-- ------------------------------------------------------------------------------
-- PRESCRIPTION ITEMS
-- ------------------------------------------------------------------------------
CREATE POLICY "Relevant users can view prescription items"
ON public.prescription_items FOR SELECT
TO authenticated
USING (
    prescription_id IN (
        SELECT pr.prescription_id
        FROM public.prescriptions pr
        WHERE
            pr.patient_id IN (
                SELECT p.patient_id
                FROM public.patients p
                WHERE p.user_id = auth.uid()
            )
            OR pr.doctor_id IN (
                SELECT ms.staff_id
                FROM public.medical_staff ms
                WHERE ms.user_id = auth.uid()
            )
            OR public.get_auth_role() IN ('Admin', 'Pharmacist')
    )
);

CREATE POLICY "Doctors can manage prescription items"
ON public.prescription_items FOR ALL
TO authenticated
USING (
    prescription_id IN (
        SELECT pr.prescription_id
        FROM public.prescriptions pr
        WHERE
            pr.doctor_id IN (
                SELECT ms.staff_id
                FROM public.medical_staff ms
                WHERE ms.user_id = auth.uid()
            )
            OR public.get_auth_role() = 'Admin'
    )
)
WITH CHECK (
    prescription_id IN (
        SELECT pr.prescription_id
        FROM public.prescriptions pr
        WHERE
            pr.doctor_id IN (
                SELECT ms.staff_id
                FROM public.medical_staff ms
                WHERE ms.user_id = auth.uid()
            )
            OR public.get_auth_role() = 'Admin'
    )
);

-- ------------------------------------------------------------------------------
-- MEDICATION REMINDERS
-- ------------------------------------------------------------------------------
CREATE POLICY "Patients can view own medication reminders"
ON public.medication_reminders FOR SELECT
TO authenticated
USING (
    patient_id IN (
        SELECT p.patient_id
        FROM public.patients p
        WHERE p.user_id = auth.uid()
    )
    OR public.get_auth_role() IN ('Admin', 'Pharmacist')
);

CREATE POLICY "Assigned doctors can manage medication reminders"
ON public.medication_reminders FOR ALL
TO authenticated
USING (
    prescription_item_id IN (
        SELECT pi.item_id
        FROM public.prescription_items pi
        JOIN public.prescriptions pr
          ON pr.prescription_id = pi.prescription_id
        WHERE
            pr.doctor_id IN (
                SELECT ms.staff_id
                FROM public.medical_staff ms
                WHERE ms.user_id = auth.uid()
            )
            OR public.get_auth_role() = 'Admin'
    )
)
WITH CHECK (
    prescription_item_id IN (
        SELECT pi.item_id
        FROM public.prescription_items pi
        JOIN public.prescriptions pr
          ON pr.prescription_id = pi.prescription_id
        WHERE
            pr.doctor_id IN (
                SELECT ms.staff_id
                FROM public.medical_staff ms
                WHERE ms.user_id = auth.uid()
            )
            OR public.get_auth_role() = 'Admin'
    )
);

-- ------------------------------------------------------------------------------
-- NOTIFICATIONS
-- ------------------------------------------------------------------------------
CREATE POLICY "Users can view own notifications"
ON public.notifications FOR SELECT
TO authenticated
USING (
    user_id = auth.uid()
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Users can update own notifications"
ON public.notifications FOR UPDATE
TO authenticated
USING (
    user_id = auth.uid()
    OR public.get_auth_role() = 'Admin'
)
WITH CHECK (
    user_id = auth.uid()
    OR public.get_auth_role() = 'Admin'
);

CREATE POLICY "Admins can manage notifications"
ON public.notifications FOR ALL
TO authenticated
USING (public.get_auth_role() = 'Admin')
WITH CHECK (public.get_auth_role() = 'Admin');

-- ------------------------------------------------------------------------------
-- GOOGLE CALENDAR TOKENS
-- ------------------------------------------------------------------------------
CREATE POLICY "Users can manage own calendar tokens"
ON public.google_calendar_tokens FOR ALL
TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

-- End RLS section.