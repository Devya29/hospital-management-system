'use client'

import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Separator } from '@/components/ui/separator'
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs'
import {
  Stethoscope,
  Sparkles,
  FileText,
  Pill,
  Plus,
  Trash2,
  AlertCircle,
  User,
  CheckCircle2,
  Loader2,
  Calendar,
  Clock,
} from 'lucide-react'
import { toast } from 'sonner'

export interface PrescriptionItemInput {
  medicine_name: string
  dosage: string
  frequency: string
  duration_days: number
  timing: string
  instructions: string
}

interface Props {
  appointment: any | null
  open: boolean
  onOpenChange: (open: boolean) => void
  onSuccess: () => void
}

export default function DoctorConsultationModal({
  appointment,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [clinicalNotes, setClinicalNotes] = useState('')
  const [diagnosis, setDiagnosis] = useState('')
  const [treatmentPlan, setTreatmentPlan] = useState('')
  const [prescriptions, setPrescriptions] = useState<PrescriptionItemInput[]>([
    {
      medicine_name: '',
      dosage: '500mg',
      frequency: 'Twice daily',
      duration_days: 7,
      timing: 'Morning, Night',
      instructions: 'Take after meals with plenty of water',
    },
  ])
  const [isSubmitting, setIsSubmitting] = useState(false)

  if (!appointment) return null

  const patientUser = appointment.patients?.users
  const patientName = patientUser
    ? `${patientUser.first_name} ${patientUser.last_name}`
    : 'Patient'

  // Extract Pre-Visit AI Summary
  const preVisit = Array.isArray(appointment.pre_visit_summaries)
    ? appointment.pre_visit_summaries[0]
    : appointment.pre_visit_summaries

  // Prescription list handlers
  const handleAddPrescriptionRow = () => {
    setPrescriptions((prev) => [
      ...prev,
      {
        medicine_name: '',
        dosage: '500mg',
        frequency: 'Once daily',
        duration_days: 7,
        timing: 'Morning',
        instructions: 'Take with food',
      },
    ])
  }

  const handleRemovePrescriptionRow = (idx: number) => {
    setPrescriptions((prev) => prev.filter((_, i) => i !== idx))
  }

  const handlePrescriptionChange = (
    idx: number,
    field: keyof PrescriptionItemInput,
    val: any,
  ) => {
    setPrescriptions((prev) => {
      const updated = [...prev]
      updated[idx] = { ...updated[idx], [field]: val }
      return updated
    })
  }

  const handleSubmitConsultation = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!clinicalNotes.trim() && !diagnosis.trim()) {
      toast.error('Please provide a diagnosis or clinical consultation notes.')
      return
    }

    setIsSubmitting(true)
    try {
      const validPrescriptions = prescriptions.filter((p) => p.medicine_name.trim().length > 0)

      const res = await fetch(`/api/doctor/appointments/${appointment.appointment_id || appointment.record_id}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clinical_notes: clinicalNotes,
          diagnosis,
          treatment_plan: treatmentPlan,
          prescriptions: validPrescriptions,
        }),
      })

      const data = await res.json()

      if (res.ok) {
        toast.success('Consultation completed and AI post-visit summary generated!', {
          description: `Care plan and prescriptions saved for ${patientName}`,
        })
        onOpenChange(false)
        onSuccess()
      } else {
        toast.error(data.error || 'Failed to submit consultation notes.')
      }
    } catch {
      toast.error('An error occurred while saving consultation.')
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[760px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <div className="flex items-center justify-between pr-4">
            <DialogTitle className="text-xl flex items-center gap-2">
              <Stethoscope className="w-5 h-5 text-primary" />
              Clinical Consultation & Notes
            </DialogTitle>
            <Badge variant="outline" className="font-mono text-xs">
              ID: #{appointment.appointment_id || appointment.record_id}
            </Badge>
          </div>
          <DialogDescription>
            Review patient intake, examine AI pre-visit triage, record diagnosis, prescribe medications, and generate patient-friendly summary.
          </DialogDescription>
        </DialogHeader>

        {/* Patient Summary Bar */}
        <div className="bg-muted/40 p-3 rounded-lg flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <User className="w-4 h-4 text-primary" />
            <span className="font-semibold text-sm">{patientName}</span>
            {patientUser?.gender && <span>• {patientUser.gender}</span>}
            {patientUser?.phone_number && <span>• 📞 {patientUser.phone_number}</span>}
          </div>
          <div className="flex items-center gap-3 text-muted-foreground">
            <span className="flex items-center gap-1">
              <Calendar className="w-3.5 h-3.5" />
              {appointment.appointment_date || appointment.visit_date?.split('T')[0]}
            </span>
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5" />
              {appointment.start_time || '09:00'} - {appointment.end_time || '09:30'}
            </span>
          </div>
        </div>

        {/* AI Pre-Visit Symptom Summary Panel */}
        <div className="border border-primary/20 bg-primary/5 rounded-lg p-3.5 space-y-2.5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-1.5 font-semibold text-xs text-primary">
              <Sparkles className="w-4 h-4" />
              AI Pre-Visit Intake Summary
            </div>
            {preVisit?.urgency && (
              <Badge
                className={
                  preVisit.urgency === 'High'
                    ? 'bg-red-500 text-white text-[10px]'
                    : preVisit.urgency === 'Medium'
                      ? 'bg-amber-500 text-white text-[10px]'
                      : 'bg-emerald-500 text-white text-[10px]'
                }
              >
                {preVisit.urgency} Urgency
              </Badge>
            )}
          </div>

          <div className="text-xs text-foreground">
            <span className="font-semibold text-muted-foreground">Chief Complaint: </span>
            {preVisit?.chief_complaint || appointment.symptoms || 'General Checkup'}
          </div>

          {/* 3 Suggested Questions */}
          {preVisit?.suggested_questions && (
            <div className="space-y-1 pt-1 border-t border-primary/10">
              <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
                Suggested Questions for Physician:
              </span>
              <div className="grid grid-cols-1 gap-1 text-xs">
                {(Array.isArray(preVisit.suggested_questions)
                  ? preVisit.suggested_questions
                  : []
                ).map((q: string, i: number) => (
                  <div key={i} className="flex items-start gap-1.5 text-muted-foreground">
                    <span className="font-bold text-primary">{i + 1}.</span>
                    <span>{q}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Consultation Form */}
        <form onSubmit={handleSubmitConsultation} className="space-y-4 pt-1">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="diagnosis" className="text-xs font-semibold">
                Clinical Diagnosis <span className="text-destructive">*</span>
              </Label>
              <Input
                id="diagnosis"
                placeholder="e.g. Acute Upper Respiratory Tract Infection"
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="treatment_plan" className="text-xs font-semibold">
                Treatment Plan & Care Instructions
              </Label>
              <Input
                id="treatment_plan"
                placeholder="e.g. Hydration, rest for 3 days, avoid cold drinks"
                value={treatmentPlan}
                onChange={(e) => setTreatmentPlan(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="clinical_notes" className="text-xs font-semibold">
              Doctor&apos;s Clinical Examination Notes <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="clinical_notes"
              placeholder="Record physical findings, vitals, examination notes, and medical rationale..."
              value={clinicalNotes}
              onChange={(e) => setClinicalNotes(e.target.value)}
              rows={3}
              required
            />
          </div>

          {/* Structured Prescriptions Section */}
          <div className="space-y-3 pt-2 border-t border-border/40">
            <div className="flex items-center justify-between">
              <Label className="text-xs font-semibold uppercase tracking-wider flex items-center gap-1.5">
                <Pill className="w-4 h-4 text-primary" /> Prescriptions & Medication Schedule
              </Label>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleAddPrescriptionRow}
              >
                <Plus className="w-3.5 h-3.5" /> Add Medication
              </Button>
            </div>

            <div className="space-y-2.5 max-h-48 overflow-y-auto pr-1">
              {prescriptions.map((p, idx) => (
                <div
                  key={idx}
                  className="p-3 bg-muted/30 border border-border/60 rounded-lg space-y-2 text-xs"
                >
                  <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                    <div className="sm:col-span-2 space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium">Medicine Name</span>
                      <Input
                        placeholder="e.g. Amoxicillin"
                        value={p.medicine_name}
                        onChange={(e) =>
                          handlePrescriptionChange(idx, 'medicine_name', e.target.value)
                        }
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="space-y-1">
                      <span className="text-[11px] text-muted-foreground font-medium">Dosage</span>
                      <Input
                        placeholder="500mg"
                        value={p.dosage}
                        onChange={(e) => handlePrescriptionChange(idx, 'dosage', e.target.value)}
                        className="h-8 text-xs"
                      />
                    </div>
                    <div className="flex items-end gap-1.5">
                      <div className="flex-1 space-y-1">
                        <span className="text-[11px] text-muted-foreground font-medium">Days</span>
                        <Input
                          type="number"
                          value={p.duration_days}
                          onChange={(e) =>
                            handlePrescriptionChange(
                              idx,
                              'duration_days',
                              parseInt(e.target.value) || 1,
                            )
                          }
                          className="h-8 text-xs"
                        />
                      </div>
                      {prescriptions.length > 1 && (
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-destructive"
                          onClick={() => handleRemovePrescriptionRow(idx)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input
                      placeholder="Frequency: e.g. Twice daily after meals"
                      value={p.frequency}
                      onChange={(e) => handlePrescriptionChange(idx, 'frequency', e.target.value)}
                      className="h-7 text-xs"
                    />
                    <Input
                      placeholder="Timing: e.g. Morning, Night"
                      value={p.timing}
                      onChange={(e) => handlePrescriptionChange(idx, 'timing', e.target.value)}
                      className="h-7 text-xs"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-3 border-t border-border/40">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={isSubmitting} className="gap-1.5 font-semibold">
              {isSubmitting ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Generating AI Post-Visit Summary...
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4" /> Complete Consultation & Generate Summary
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
