-- ==============================================================================
-- DEMO DOCTOR SEED SCRIPT (Fictional Development / Demo Record)
-- ==============================================================================
-- Description:
-- Creates a single fictional Demo Doctor profile in public.users and public.medical_staff
-- so the Patient doctor search, slot viewing, and booking flows can be tested.
--
-- Note:
-- - This does NOT create a Supabase Auth user.
-- - Idempotent: safe to run multiple times without creating duplicate records.
-- - The existing database trigger (trg_seed_doctor_working_hours) will automatically
--   populate Monday–Friday working hours upon medical_staff insertion.
-- ==============================================================================

-- Ensure the Cardiology department exists
INSERT INTO public.departments (name, description)
VALUES ('Cardiology', 'Heart and cardiovascular system care')
ON CONFLICT (name) DO NOTHING;

DO $$
DECLARE
    v_user_id UUID;
    v_department_id INT;
    v_staff_id INT;
BEGIN
    -- 1. Retrieve or Insert Demo Doctor in public.users
    SELECT user_id INTO v_user_id
    FROM public.users
    WHERE email = 'demo.doctor@example.com';

    IF v_user_id IS NULL THEN
        INSERT INTO public.users (
            user_id,
            first_name,
            last_name,
            email,
            phone_number,
            role
        ) VALUES (
            gen_random_uuid(),
            'Demo',
            'Doctor',
            'demo.doctor@example.com',
            '0000000000',
            'Doctor'
        )
        RETURNING user_id INTO v_user_id;
    END IF;

    -- 2. Lookup Department ID for Cardiology
    SELECT department_id INTO v_department_id
    FROM public.departments
    WHERE name = 'Cardiology'
    LIMIT 1;

    -- 3. Retrieve or Insert Medical Staff record
    SELECT staff_id INTO v_staff_id
    FROM public.medical_staff
    WHERE license_number = 'DEMO-CARD-2026' OR user_id = v_user_id;

    IF v_staff_id IS NULL THEN
        -- Insert new staff record (triggers trg_seed_doctor_working_hours)
        INSERT INTO public.medical_staff (
            user_id,
            department_id,
            staff_type,
            employment_status,
            specialization,
            slot_duration_minutes,
            consultation_fee,
            bio,
            license_number
        ) VALUES (
            v_user_id,
            v_department_id,
            'Doctor',
            'Active',
            'Cardiology',
            30,
            500.00,
            'Fictional demo cardiologist for testing doctor discovery, live availability slots, symptom intake, and booking workflows.',
            'DEMO-CARD-2026'
        );
    ELSE
        -- Update existing record to guarantee consistent demo values
        UPDATE public.medical_staff
        SET
            department_id = v_department_id,
            staff_type = 'Doctor',
            employment_status = 'Active',
            specialization = 'Cardiology',
            slot_duration_minutes = 30,
            consultation_fee = 500.00,
            bio = 'Fictional demo cardiologist for testing doctor discovery, live availability slots, symptom intake, and booking workflows.',
            license_number = 'DEMO-CARD-2026'
        WHERE staff_id = v_staff_id;
    END IF;
END $$;
