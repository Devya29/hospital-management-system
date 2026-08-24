'use client'

import React, { useState, useEffect } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Search,
  Calendar as CalendarIcon,
  Clock,
  UserCheck,
  Stethoscope,
  Sparkles,
  AlertCircle,
  CheckCircle2,
  Lock,
  Loader2,
  DollarSign,
} from 'lucide-react'
import { format, addDays } from 'date-fns'
import { toast } from 'sonner'

interface Doctor {
  staff_id: number
  specialization: string
  slot_duration_minutes: number
  consultation_fee: number
  bio?: string
  departments?: { name: string }
  users: {
    first_name: string
    last_name: string
    email?: string
  }
}

interface Slot {
  startTime: string
  endTime: string
  isAvailable: boolean
  status: 'available' | 'booked' | 'held' | 'on_leave' | 'past' | 'unavailable'
  holdExpiresAt?: string
}

interface Props {
  onBookingSuccess: () => void
}

const SPECIALIZATIONS = [
  'All Specializations',
  'General Medicine',
  'Cardiology',
  'Dermatology',
  'Pediatrics',
  'Orthopedics',
  'Neurology',
  'Psychiatry',
  'Ophthalmology',
]

export default function DoctorSearchBooking({ onBookingSuccess }: Props) {
  const [doctors, setDoctors] = useState<Doctor[]>([])
  const [loadingDoctors, setLoadingDoctors] = useState(true)
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedSpecialization, setSelectedSpecialization] = useState('All Specializations')

  // Selected doctor & date for slot viewing
  const [selectedDoctor, setSelectedDoctor] = useState<Doctor | null>(null)
  const [selectedDate, setSelectedDate] = useState<string>(
    format(addDays(new Date(), 1), 'yyyy-MM-dd'),
  )
  const [slots, setSlots] = useState<Slot[]>([])
  const [loadingSlots, setLoadingSlots] = useState(false)
  const [slotReason, setSlotReason] = useState<string | null>(null)

  // Booking Modal & Symptom Intake State
  const [bookingModalOpen, setBookingModalOpen] = useState(false)
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null)
  const [symptoms, setSymptoms] = useState('')
  const [patientNotes, setPatientNotes] = useState('')
  const [holdToken, setHoldToken] = useState<string | null>(null)
  const [holdCountdown, setHoldCountdown] = useState<number>(300)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // 1. Fetch Doctors
  useEffect(() => {
    const fetchDoctors = async () => {
      setLoadingDoctors(true)
      try {
        const specQuery =
          selectedSpecialization !== 'All Specializations'
            ? `?specialization=${encodeURIComponent(selectedSpecialization)}`
            : ''
        const res = await fetch(`/api/doctors${specQuery}`)
        if (res.ok) {
          const data = await res.json()
          setDoctors(data)
          if (data.length > 0) {
            setSelectedDoctor((prev) => prev || data[0])
          }
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingDoctors(false)
      }
    }
    fetchDoctors()
  }, [selectedSpecialization])

  // 2. Fetch Availability Slots when selected Doctor or Date changes
  useEffect(() => {
    if (!selectedDoctor || !selectedDate) return

    const fetchSlots = async () => {
      setLoadingSlots(true)
      setSlotReason(null)
      try {
        const res = await fetch(
          `/api/doctors/${selectedDoctor.staff_id}/availability?date=${selectedDate}`,
        )
        if (res.ok) {
          const data = await res.json()
          setSlots(data.slots || [])
          setSlotReason(data.reason || null)
        }
      } catch (err) {
        console.error(err)
      } finally {
        setLoadingSlots(false)
      }
    }

    fetchSlots()
  }, [selectedDoctor, selectedDate])

  // 3. Hold Countdown Timer
  useEffect(() => {
    if (!bookingModalOpen || !holdToken) return
    const timer = setInterval(() => {
      setHoldCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(timer)
          toast.warning('Slot hold expired. Please select a slot again.')
          setBookingModalOpen(false)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(timer)
  }, [bookingModalOpen, holdToken])

  // Handle Initiating Booking (Acquires Hold)
  const handleSelectSlotForBooking = async (slot: Slot) => {
    if (!slot.isAvailable || !selectedDoctor) return
    setSelectedSlot(slot)
    setHoldCountdown(300)

    try {
      // Create slot hold
      const res = await fetch('/api/appointments/hold', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: selectedDoctor.staff_id,
          slot_date: selectedDate,
          start_time: slot.startTime,
          end_time: slot.endTime,
        }),
      })

      const data = await res.json()
      if (res.ok && data.holdToken) {
        setHoldToken(data.holdToken)
        setBookingModalOpen(true)
      } else {
        toast.error(data.error || 'This slot is no longer available.')
        // Refresh slots
        if (selectedDoctor) {
          const refreshRes = await fetch(
            `/api/doctors/${selectedDoctor.staff_id}/availability?date=${selectedDate}`,
          )
          if (refreshRes.ok) {
            const fresh = await refreshRes.json()
            setSlots(fresh.slots || [])
          }
        }
      }
    } catch {
      toast.error('Could not hold slot. Please try again.')
    }
  }

  // Handle Cancel Booking Modal
  const handleCloseBookingModal = () => {
    if (holdToken) {
      fetch(`/api/appointments/hold?token=${holdToken}`, { method: 'DELETE' }).catch(() => {})
    }
    setBookingModalOpen(false)
    setSelectedSlot(null)
    setHoldToken(null)
  }

  // Submit Final Booking
  const handleConfirmBooking = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!selectedDoctor || !selectedSlot) return

    if (!symptoms.trim()) {
      toast.error('Please describe your symptoms before confirming.')
      return
    }

    setIsSubmitting(true)
    try {
      const res = await fetch('/api/appointments/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: selectedDoctor.staff_id,
          appointment_date: selectedDate,
          start_time: selectedSlot.startTime,
          end_time: selectedSlot.endTime,
          symptoms,
          patient_notes: patientNotes,
          hold_token: holdToken,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success('Appointment booked successfully! Confirmation email sent.', {
          description: `Dr. ${selectedDoctor.users.first_name} ${selectedDoctor.users.last_name} on ${selectedDate} at ${selectedSlot.startTime}`,
        })
        setBookingModalOpen(false)
        setSymptoms('')
        setPatientNotes('')
        setSelectedSlot(null)
        setHoldToken(null)
        onBookingSuccess()

        // Refresh slots
        const refreshRes = await fetch(
          `/api/doctors/${selectedDoctor.staff_id}/availability?date=${selectedDate}`,
        )
        if (refreshRes.ok) {
          const fresh = await refreshRes.json()
          setSlots(fresh.slots || [])
        }
      } else {
        toast.error(data.error || 'Failed to book appointment.')
      }
    } catch (err: any) {
      toast.error('An unexpected error occurred during booking.')
    } finally {
      setIsSubmitting(false)
    }
  }

  const filteredDoctors = doctors.filter((doc) => {
    const name = `${doc.users?.first_name || ''} ${doc.users?.last_name || ''}`.toLowerCase()
    const spec = (doc.specialization || '').toLowerCase()
    const q = searchQuery.toLowerCase()
    return name.includes(q) || spec.includes(q)
  })

  return (
    <div className="space-y-6">
      {/* Search and Filters Header */}
      <Card className="border-border/60 shadow-sm">
        <CardHeader className="pb-4">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Stethoscope className="w-5 h-5 text-primary" />
            Book a Medical Consultation
          </CardTitle>
          <CardDescription>
            Search specialists, view real-time availability slots, and securely reserve your appointment
          </CardDescription>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="space-y-2">
            <Label htmlFor="search-doctor">Search Doctor / Specialist</Label>
            <div className="relative">
              <Search className="w-4 h-4 absolute left-3 top-3 text-muted-foreground" />
              <Input
                id="search-doctor"
                placeholder="Dr. Smith, Cardiology..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-9"
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="spec-select">Filter Specialization</Label>
            <Select
              value={selectedSpecialization}
              onValueChange={setSelectedSpecialization}
            >
              <SelectTrigger id="spec-select">
                <SelectValue placeholder="All Specializations" />
              </SelectTrigger>
              <SelectContent>
                {SPECIALIZATIONS.map((spec) => (
                  <SelectItem key={spec} value={spec}>
                    {spec}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="appt-date">Select Appointment Date</Label>
            <Input
              id="appt-date"
              type="date"
              value={selectedDate}
              min={format(new Date(), 'yyyy-MM-dd')}
              onChange={(e) => setSelectedDate(e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* Main Doctor List and Slot Picker Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Doctor Selection Cards (5 cols) */}
        <div className="lg:col-span-5 space-y-3">
          <h3 className="font-semibold text-sm text-muted-foreground px-1">
            Available Specialists ({filteredDoctors.length})
          </h3>

          {loadingDoctors ? (
            <div className="p-8 text-center text-muted-foreground flex justify-center items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading doctors...
            </div>
          ) : filteredDoctors.length === 0 ? (
            <Card className="p-6 text-center text-muted-foreground">
              No doctors found matching your criteria.
            </Card>
          ) : (
            <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
              {filteredDoctors.map((doc) => {
                const isSelected = selectedDoctor?.staff_id === doc.staff_id
                return (
                  <Card
                    key={doc.staff_id}
                    onClick={() => setSelectedDoctor(doc)}
                    className={`cursor-pointer transition-all duration-150 border ${
                      isSelected
                        ? 'border-primary bg-primary/5 shadow-sm ring-1 ring-primary/30'
                        : 'border-border/60 hover:border-primary/50'
                    }`}
                  >
                    <CardContent className="p-4">
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-base">
                            Dr. {doc.users?.first_name} {doc.users?.last_name}
                          </h4>
                          <p className="text-sm text-primary font-medium">
                            {doc.specialization || doc.departments?.name || 'General Medicine'}
                          </p>
                        </div>
                        <Badge variant={isSelected ? 'default' : 'outline'}>
                          ${doc.consultation_fee || 500}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          {doc.slot_duration_minutes || 30} min slots
                        </span>
                        <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-medium">
                          <CheckCircle2 className="w-3.5 h-3.5" />
                          Available
                        </span>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </div>

        {/* Right Column: Time Slot Grid (7 cols) */}
        <div className="lg:col-span-7">
          <Card className="border-border/60 shadow-sm h-full">
            <CardHeader className="pb-3 border-b border-border/40">
              <div className="flex justify-between items-center">
                <div>
                  <CardTitle className="text-base font-semibold">
                    {selectedDoctor
                      ? `Dr. ${selectedDoctor.users.first_name} ${selectedDoctor.users.last_name}'s Schedule`
                      : 'Select a Doctor'}
                  </CardTitle>
                  <CardDescription>
                    {format(new Date(`${selectedDate}T00:00:00`), 'EEEE, MMMM d, yyyy')}
                  </CardDescription>
                </div>
                {selectedDoctor && (
                  <Badge variant="secondary" className="text-xs">
                    {selectedDoctor.slot_duration_minutes || 30} min duration
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="pt-5">
              {loadingSlots ? (
                <div className="py-16 text-center text-muted-foreground flex flex-col justify-center items-center gap-2">
                  <Loader2 className="w-6 h-6 animate-spin text-primary" />
                  <p className="text-sm">Calculating real-time slot availability...</p>
                </div>
              ) : slotReason ? (
                <div className="py-12 px-4 text-center bg-muted/30 rounded-lg border border-dashed border-border/80">
                  <AlertCircle className="w-8 h-8 text-amber-500 mx-auto mb-2" />
                  <h4 className="font-semibold text-sm mb-1">No Available Slots</h4>
                  <p className="text-xs text-muted-foreground max-w-sm mx-auto">{slotReason}</p>
                </div>
              ) : slots.length === 0 ? (
                <div className="py-12 text-center text-muted-foreground">
                  No slots configured for this date.
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                    <span className="font-medium text-foreground">
                      Click an open time slot to begin booking:
                    </span>
                    <div className="flex items-center gap-3">
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-primary inline-block" /> Available
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/30 inline-block" /> Booked / Held
                      </span>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2.5 max-h-[380px] overflow-y-auto pr-1">
                    {slots.map((slot, index) => {
                      return (
                        <Button
                          key={index}
                          variant={slot.isAvailable ? 'outline' : 'ghost'}
                          disabled={!slot.isAvailable}
                          onClick={() => handleSelectSlotForBooking(slot)}
                          className={`h-14 flex flex-col items-center justify-center p-2 rounded-lg transition-all ${
                            slot.isAvailable
                              ? 'border-primary/40 hover:bg-primary hover:text-primary-foreground hover:border-primary shadow-xs font-semibold'
                              : 'opacity-40 bg-muted/40 cursor-not-allowed line-through'
                          }`}
                        >
                          <span className="text-sm font-medium">{slot.startTime}</span>
                          <span className="text-[10px] opacity-75">to {slot.endTime}</span>
                        </Button>
                      )
                    })}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>

      {/* Symptom Intake & Confirmation Dialog with 5-Minute Hold */}
      <Dialog open={bookingModalOpen} onOpenChange={(open) => !open && handleCloseBookingModal()}>
        <DialogContent className="sm:max-w-[540px]">
          <DialogHeader>
            <div className="flex items-center justify-between pr-6">
              <DialogTitle className="text-xl flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-primary" />
                Confirm Consultation & Symptoms
              </DialogTitle>
            </div>
            <DialogDescription>
              Your selected slot is temporarily reserved for you. Please enter your symptoms so the doctor and AI intake engine can prepare.
            </DialogDescription>
          </DialogHeader>

          {/* Slot Hold Banner */}
          <div className="flex items-center justify-between bg-primary/10 border border-primary/20 rounded-md p-3 text-xs">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-primary" />
              <span>
                Slot Held: <strong>{selectedDate}</strong> at{' '}
                <strong>{selectedSlot?.startTime} - {selectedSlot?.endTime}</strong>
              </span>
            </div>
            <Badge variant="outline" className="font-mono bg-background text-primary">
              {Math.floor(holdCountdown / 60)}:{(holdCountdown % 60).toString().padStart(2, '0')}
            </Badge>
          </div>

          <form onSubmit={handleConfirmBooking} className="space-y-4 py-2">
            <div className="space-y-1.5">
              <Label htmlFor="symptoms" className="text-sm font-semibold flex items-center gap-1.5">
                Describe Your Current Symptoms <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="symptoms"
                placeholder="e.g. Mild headache and low fever for 3 days, worsening in the evening..."
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                required
                rows={3}
                className="resize-none"
              />
              <p className="text-[11px] text-muted-foreground">
                ✨ Groq AI will prepare a non-diagnostic intake summary to assist your doctor during triage.
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="patient-notes" className="text-sm font-semibold">
                Additional Notes / Questions for Doctor (Optional)
              </Label>
              <Input
                id="patient-notes"
                placeholder="e.g. Need prescription refill, bringing blood test report..."
                value={patientNotes}
                onChange={(e) => setPatientNotes(e.target.value)}
              />
            </div>

            <div className="bg-muted/40 p-3 rounded-md text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Doctor:</span>
                <span className="font-medium">
                  Dr. {selectedDoctor?.users.first_name} {selectedDoctor?.users.last_name}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Specialization:</span>
                <span className="font-medium">{selectedDoctor?.specialization}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Consultation Fee:</span>
                <span className="font-medium">${selectedDoctor?.consultation_fee || 500}</span>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0 pt-2">
              <Button type="button" variant="outline" onClick={handleCloseBookingModal}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Confirming Booking...
                  </>
                ) : (
                  'Confirm & Book Appointment'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
