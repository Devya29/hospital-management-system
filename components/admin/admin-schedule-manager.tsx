'use client'

import React, { useState, useEffect, useCallback } from 'react'
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  Clock,
  Calendar,
  Save,
  Loader2,
  Stethoscope,
  DollarSign,
} from 'lucide-react'
import { toast } from 'sonner'

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export default function AdminScheduleManager() {
  const [doctors, setDoctors] = useState<any[]>([])
  const [selectedDoctorId, setSelectedDoctorId] = useState('')
  const [slotDuration, setSlotDuration] = useState<number>(30)
  const [consultationFee, setConsultationFee] = useState<number>(500)
  const [specialization, setSpecialization] = useState('')
  const [schedule, setSchedule] = useState<
    Array<{
      day_of_week: number
      start_time: string
      end_time: string
      is_available: boolean
    }>
  >([])
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  // Fetch doctors list
  useEffect(() => {
    fetch('/api/doctors')
      .then((r) => r.json())
      .then((data) => {
        if (Array.isArray(data) && data.length > 0) {
          setDoctors(data)
          setSelectedDoctorId(String(data[0].staff_id))
        }
      })
      .catch(console.error)
  }, [])

  // Fetch schedule for selected doctor
  const loadDoctorSchedule = useCallback(async (docId: string) => {
    if (!docId) return
    setLoading(true)
    try {
      const res = await fetch(`/api/admin/doctor-schedule?doctor_id=${docId}`)
      if (res.ok) {
        const data = await res.json()
        setSlotDuration(data.doctor?.slot_duration_minutes || 30)
        setConsultationFee(data.doctor?.consultation_fee || 500)
        setSpecialization(data.doctor?.specialization || '')

        // Initialize all 7 days
        const existingMap = new Map()
        ;(data.workingHours || []).forEach((item: any) => {
          existingMap.set(item.day_of_week, item)
        })

        const fullSchedule = DAYS.map((_, dayIndex) => {
          if (existingMap.has(dayIndex)) {
            const h = existingMap.get(dayIndex)
            return {
              day_of_week: dayIndex,
              start_time: h.start_time?.substring(0, 5) || '09:00',
              end_time: h.end_time?.substring(0, 5) || '17:00',
              is_available: h.is_available !== false,
            }
          }
          return {
            day_of_week: dayIndex,
            start_time: '09:00',
            end_time: '17:00',
            is_available: dayIndex >= 1 && dayIndex <= 5, // Mon-Fri default
          }
        })

        setSchedule(fullSchedule)
      }
    } catch {
      toast.error('Failed to load doctor schedule.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (selectedDoctorId) {
      loadDoctorSchedule(selectedDoctorId)
    }
  }, [selectedDoctorId, loadDoctorSchedule])

  const handleScheduleChange = (dayIndex: number, field: string, value: any) => {
    setSchedule((prev) => {
      const copy = [...prev]
      copy[dayIndex] = { ...copy[dayIndex], [field]: value }
      return copy
    })
  }

  const handleSaveSettings = async () => {
    if (!selectedDoctorId) return
    setSaving(true)
    try {
      const res = await fetch('/api/admin/doctor-schedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          doctor_id: Number(selectedDoctorId),
          slot_duration_minutes: Number(slotDuration),
          consultation_fee: Number(consultationFee),
          schedule,
        }),
      })

      const data = await res.json()
      if (res.ok) {
        toast.success('Doctor working hours and slot settings saved successfully!')
      } else {
        toast.error(data.error || 'Failed to save settings.')
      }
    } catch {
      toast.error('An unexpected error occurred.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="border-border/60 shadow-sm">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4">
        <div>
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Clock className="w-5 h-5 text-primary" /> Doctor Working Hours & Slot Configuration
          </CardTitle>
          <CardDescription>
            Configure weekly clinic shifts, consult durations (15-60 min), and consultation pricing
          </CardDescription>
        </div>

        <div className="w-full sm:w-64">
          <Select value={selectedDoctorId} onValueChange={setSelectedDoctorId}>
            <SelectTrigger>
              <SelectValue placeholder="Select Doctor" />
            </SelectTrigger>
            <SelectContent>
              {doctors.map((doc) => (
                <SelectItem key={doc.staff_id} value={String(doc.staff_id)}>
                  Dr. {doc.users?.first_name} {doc.users?.last_name} ({doc.specialization || 'Doctor'})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {loading ? (
          <div className="py-12 text-center text-muted-foreground flex justify-center items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin text-primary" /> Loading doctor settings...
          </div>
        ) : (
          <>
            {/* Slot Duration & Consultation Fee Settings */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 p-4 bg-muted/20 border border-border/60 rounded-lg">
              <div className="space-y-1.5">
                <Label htmlFor="slot-dur" className="text-xs font-semibold">
                  Slot Duration (Minutes)
                </Label>
                <Select
                  value={String(slotDuration)}
                  onValueChange={(val) => setSlotDuration(Number(val))}
                >
                  <SelectTrigger id="slot-dur">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 Minutes</SelectItem>
                    <SelectItem value="20">20 Minutes</SelectItem>
                    <SelectItem value="30">30 Minutes (Standard)</SelectItem>
                    <SelectItem value="45">45 Minutes</SelectItem>
                    <SelectItem value="60">60 Minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="consult-fee" className="text-xs font-semibold">
                  Consultation Fee ($)
                </Label>
                <Input
                  id="consult-fee"
                  type="number"
                  value={consultationFee}
                  onChange={(e) => setConsultationFee(Number(e.target.value))}
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Specialization</Label>
                <Input value={specialization || 'General'} disabled className="bg-muted/50" />
              </div>
            </div>

            {/* Weekly Days Schedule Grid */}
            <div className="space-y-3">
              <Label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Weekly Working Hours
              </Label>

              <div className="space-y-2">
                {schedule.map((item, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-lg border flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-colors ${
                      item.is_available
                        ? 'bg-card border-border/80'
                        : 'bg-muted/30 border-border/40 opacity-60'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-[140px]">
                      <input
                        type="checkbox"
                        id={`day-${idx}`}
                        checked={item.is_available}
                        onChange={(e) =>
                          handleScheduleChange(idx, 'is_available', e.target.checked)
                        }
                        className="h-4 w-4 rounded text-primary focus:ring-primary"
                      />
                      <Label htmlFor={`day-${idx}`} className="font-semibold text-sm cursor-pointer">
                        {DAYS[idx]}
                      </Label>
                    </div>

                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">Start:</span>
                        <Input
                          type="time"
                          value={item.start_time}
                          disabled={!item.is_available}
                          onChange={(e) =>
                            handleScheduleChange(idx, 'start_time', e.target.value)
                          }
                          className="h-8 w-28 text-xs"
                        />
                      </div>

                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-muted-foreground">End:</span>
                        <Input
                          type="time"
                          value={item.end_time}
                          disabled={!item.is_available}
                          onChange={(e) =>
                            handleScheduleChange(idx, 'end_time', e.target.value)
                          }
                          className="h-8 w-28 text-xs"
                        />
                      </div>

                      <Badge
                        variant={item.is_available ? 'default' : 'secondary'}
                        className="text-[10px]"
                      >
                        {item.is_available ? 'Active Shift' : 'Off Duty'}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        )}
      </CardContent>

      <CardFooter className="flex justify-end pt-2 border-t border-border/40">
        <Button onClick={handleSaveSettings} disabled={saving || loading} className="gap-1.5 font-semibold">
          {saving ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" /> Saving Settings...
            </>
          ) : (
            <>
              <Save className="w-4 h-4" /> Save Schedule & Slot Duration
            </>
          )}
        </Button>
      </CardFooter>
    </Card>
  )
}
