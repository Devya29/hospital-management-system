// lib/slot-engine.ts
// Robust Slot Generation Engine taking into account:
// 1. Doctor Weekly Working Hours
// 2. Doctor Slot Duration (e.g. 15, 30, 45, 60 min)
// 3. Approved Doctor Leaves
// 4. Existing Non-Cancelled Appointments (Database-level sync)
// 5. Active Slot Holds (Temporary reservations with expiration)
// 6. Past times for the current day

export interface TimeSlot {
  startTime: string // "09:00"
  endTime: string   // "09:30"
  isAvailable: boolean
  status: 'available' | 'booked' | 'held' | 'on_leave' | 'past' | 'unavailable'
  holdExpiresAt?: string
}

export interface WorkingHoursConfig {
  dayOfWeek: number // 0 = Sunday, 1 = Monday, ... 6 = Saturday
  startTime: string // "09:00:00" or "09:00"
  endTime: string   // "17:00:00" or "17:00"
  isAvailable: boolean
  slotDurationMinutes?: number
}

export interface DoctorLeave {
  startDate: string // "YYYY-MM-DD"
  endDate: string   // "YYYY-MM-DD"
  status?: string
}

export interface ExistingAppointment {
  startTime: string // "09:00:00" or "09:00"
  endTime: string   // "09:30:00" or "09:30"
  status: string
}

export interface ActiveHold {
  startTime: string
  endTime: string
  expiresAt: string
}

/**
 * Convert time string "HH:MM" or "HH:MM:SS" to minutes from midnight
 */
export function timeToMinutes(timeStr: string): number {
  if (!timeStr) return 0
  const parts = timeStr.split(':')
  const hours = parseInt(parts[0], 10) || 0
  const minutes = parseInt(parts[1], 10) || 0
  return hours * 60 + minutes
}

/**
 * Convert minutes from midnight to "HH:MM"
 */
export function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

/**
 * Check if target date falls within any doctor approved leave
 */
export function isDoctorOnLeave(dateStr: string, leaves: DoctorLeave[]): boolean {
  if (!leaves || leaves.length === 0) return false
  const target = new Date(dateStr).getTime()

  return leaves.some((leave) => {
    if (leave.status && leave.status.toLowerCase() === 'cancelled') return false
    const start = new Date(leave.startDate).getTime()
    const end = new Date(leave.endDate).getTime()
    return target >= start && target <= end
  })
}

/**
 * Generate discrete time slots for a specific date given doctor schedule, leaves, bookings & holds
 */
export function generateDoctorSlots(params: {
  date: string // "YYYY-MM-DD"
  slotDurationMinutes?: number
  workingHours?: WorkingHoursConfig | null
  leaves?: DoctorLeave[]
  existingAppointments?: ExistingAppointment[]
  activeHolds?: ActiveHold[]
  now?: Date
}): { slots: TimeSlot[]; reason?: string } {
  const {
    date,
    slotDurationMinutes = 30,
    workingHours,
    leaves = [],
    existingAppointments = [],
    activeHolds = [],
    now = new Date(),
  } = params

  // 1. Check if doctor is on leave on this date
  if (isDoctorOnLeave(date, leaves)) {
    return {
      slots: [],
      reason: 'Doctor is on scheduled leave on this date.',
    }
  }

  // 2. Determine day of week
  const targetDate = new Date(`${date}T00:00:00`)
  const dayOfWeek = targetDate.getDay() // 0=Sun, 1=Mon, etc.

  // 3. Fallback standard working hours if not explicitly customized (Mon-Fri 09:00 - 17:00)
  const schedule: WorkingHoursConfig = workingHours || {
    dayOfWeek,
    startTime: '09:00',
    endTime: '17:00',
    isAvailable: dayOfWeek >= 1 && dayOfWeek <= 5, // Active Mon-Fri by default
    slotDurationMinutes,
  }

  if (!schedule.isAvailable) {
    return {
      slots: [],
      reason: 'Doctor does not hold clinic hours on this day.',
    }
  }

  const startMinutes = timeToMinutes(schedule.startTime)
  const endMinutes = timeToMinutes(schedule.endTime)
  const duration = schedule.slotDurationMinutes || slotDurationMinutes || 30

  if (startMinutes >= endMinutes || duration <= 0) {
    return { slots: [], reason: 'Invalid working hours configuration.' }
  }

  // 4. Map existing active appointments
  const bookedRanges = existingAppointments
    .filter((a) => a.status !== 'Cancelled')
    .map((a) => ({
      start: timeToMinutes(a.startTime),
      end: timeToMinutes(a.endTime),
    }))

  // 5. Map active slot holds that haven't expired
  const nowMs = now.getTime()
  const holdRanges = activeHolds
    .filter((h) => new Date(h.expiresAt).getTime() > nowMs)
    .map((h) => ({
      start: timeToMinutes(h.startTime),
      end: timeToMinutes(h.endTime),
      expiresAt: h.expiresAt,
    }))

  // 6. Check if target date is today to filter past time slots
  const todayStr = now.toISOString().split('T')[0]
  const isToday = date === todayStr
  const currentMinutesNow = now.getHours() * 60 + now.getMinutes()

  const slots: TimeSlot[] = []

  // 7. Iterate through time in duration increments
  for (let current = startMinutes; current + duration <= endMinutes; current += duration) {
    const slotStartMin = current
    const slotEndMin = current + duration
    const startTime = minutesToTime(slotStartMin)
    const endTime = minutesToTime(slotEndMin)

    // Check past time
    if (isToday && slotStartMin <= currentMinutesNow + 5) {
      slots.push({
        startTime,
        endTime,
        isAvailable: false,
        status: 'past',
      })
      continue
    }

    // Check overlap with booked appointments
    const isBooked = bookedRanges.some(
      (b) => Math.max(slotStartMin, b.start) < Math.min(slotEndMin, b.end),
    )

    if (isBooked) {
      slots.push({
        startTime,
        endTime,
        isAvailable: false,
        status: 'booked',
      })
      continue
    }

    // Check overlap with active hold
    const activeHold = holdRanges.find(
      (h) => Math.max(slotStartMin, h.start) < Math.min(slotEndMin, h.end),
    )

    if (activeHold) {
      slots.push({
        startTime,
        endTime,
        isAvailable: false,
        status: 'held',
        holdExpiresAt: activeHold.expiresAt,
      })
      continue
    }

    // Available slot!
    slots.push({
      startTime,
      endTime,
      isAvailable: true,
      status: 'available',
    })
  }

  return { slots }
}
