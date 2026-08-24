'use client'

import * as React from 'react'
import { format, parse, isValid, isBefore, isAfter } from 'date-fns'
import { CalendarIcon } from 'lucide-react'
import { useForm } from 'react-hook-form'
import { z } from 'zod'
import { zodResolver } from '@hookform/resolvers/zod'
import Link from 'next/link'

import { signUpAction } from '@/app/actions'
import { FormMessage, Message } from '@/components/form-message'
import { SubmitButton } from '@/components/submit-button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from '@/components/ui/select'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage as FieldMessage,
} from '@/components/ui/form'
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from '@/components/ui/popover'
import { cn } from '@/lib/utils'

function parseDateString(val: string): Date | null {
  const trimmed = val.trim()
  if (!trimmed) return null

  // Support common formats: DD/MM/YYYY, D/M/YYYY, YYYY-MM-DD, DD-MM-YYYY, MM/DD/YYYY
  const formats = [
    'dd/MM/yyyy',
    'd/M/yyyy',
    'yyyy-MM-dd',
    'dd-MM-yyyy',
    'd-M-yyyy',
    'MM/dd/yyyy',
    'M/d/yyyy',
  ]
  const referenceDate = new Date()

  for (const fmt of formats) {
    try {
      const parsed = parse(trimmed, fmt, referenceDate)
      if (isValid(parsed)) {
        const year = parsed.getFullYear()
        if (year >= 1900 && year <= new Date().getFullYear()) {
          const minDate = new Date(1900, 0, 1)
          const today = new Date()
          if (!isBefore(parsed, minDate) && !isAfter(parsed, today)) {
            return parsed
          }
        }
      }
    } catch {
      // Continue to next format
    }
  }

  return null
}

const SignupSchema = z.object({
  date_of_birth: z
    .date({ required_error: 'Date of birth is required' })
    .refine((date) => !isAfter(date, new Date()), {
      message: 'Date of birth cannot be in the future',
    })
    .refine((date) => !isBefore(date, new Date('1900-01-01')), {
      message: 'Date of birth must be after 1900-01-01',
    }),
  gender: z.string().min(1, 'Gender is required'),
  blood_type: z.string().min(1, 'Blood type is required'),
})

export default function SignupWrapper(props: {
  searchParams: Promise<Message>
}) {
  const [message, setMessage] = React.useState<Message>()

  React.useEffect(() => {
    props.searchParams.then(setMessage)
  }, [props.searchParams])

  return <Signup message={message} />
}

function Signup({ message }: { message?: Message }) {
  const form = useForm<z.infer<typeof SignupSchema>>({
    resolver: zodResolver(SignupSchema),
    defaultValues: {
      gender: '',
    },
  })

  const [dobTextInput, setDobTextInput] = React.useState('')
  const [popoverOpen, setPopoverOpen] = React.useState(false)

  const handleDobChange = (val: string) => {
    setDobTextInput(val)
    const parsed = parseDateString(val)
    if (parsed) {
      form.setValue('date_of_birth', parsed, { shouldValidate: true })
    } else if (!val.trim()) {
      form.setValue('date_of_birth', undefined as any, { shouldValidate: true })
    }
  }

  const handleDobBlur = () => {
    if (dobTextInput.trim()) {
      const parsed = parseDateString(dobTextInput)
      if (parsed) {
        setDobTextInput(format(parsed, 'dd/MM/yyyy'))
        form.setValue('date_of_birth', parsed, { shouldValidate: true })
      } else {
        form.setError('date_of_birth', {
          type: 'manual',
          message: 'Please enter a valid date (e.g. DD/MM/YYYY) between 1900 and today',
        })
      }
    }
  }

  const watchDate = form.watch('date_of_birth')
  const watchGender = form.watch('gender')
  const watchBloodType = form.watch('blood_type')

  return (
    <div className="w-full flex flex-col items-center justify-start min-h-screen">
      <Form {...form}>
        <form
          action={signUpAction}
          className="flex-1 flex flex-col min-w-64 w-full max-w-md"
        >
          <h1 className="text-2xl font-medium">Sign up</h1>
          <p className="text-sm text-foreground">
            Already have an account?{' '}
            <Link
              className="text-foreground font-medium underline"
              href="/sign-in"
            >
              Sign in
            </Link>
          </p>

          <div className="flex flex-col gap-2 [&>input]:mb-3 mt-8">
            <Label htmlFor="first_name">First Name</Label>
            <Input name="first_name" placeholder="First Name" required />

            <Label htmlFor="last_name">Last Name</Label>
            <Input name="last_name" placeholder="Last Name" required />

            <FormField
              control={form.control}
              name="date_of_birth"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date of Birth</FormLabel>
                  <div className="flex gap-2">
                    <FormControl>
                      <Input
                        placeholder="DD/MM/YYYY or YYYY-MM-DD"
                        value={dobTextInput}
                        onChange={(e) => handleDobChange(e.target.value)}
                        onBlur={handleDobBlur}
                      />
                    </FormControl>
                    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
                      <PopoverTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="icon"
                          className="shrink-0"
                          aria-label="Pick date from calendar"
                        >
                          <CalendarIcon className="h-4 w-4" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="end">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={(date) => {
                            if (date) {
                              field.onChange(date)
                              setDobTextInput(format(date, 'dd/MM/yyyy'))
                              setPopoverOpen(false)
                            }
                          }}
                          disabled={(date) =>
                            date > new Date() || date < new Date('1900-01-01')
                          }
                          defaultMonth={field.value || new Date(1990, 0, 1)}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                  </div>
                  <FieldMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="gender"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Gender</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Gender" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="Male">Male</SelectItem>
                      <SelectItem value="Female">Female</SelectItem>
                      <SelectItem value="Other">Other</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldMessage />
                </FormItem>
              )}
            />

            <input
              type="hidden"
              name="date_of_birth"
              value={watchDate ? format(watchDate, 'yyyy-MM-dd') : ''}
            />
            <input type="hidden" name="gender" value={watchGender} />
            <input
              type="hidden"
              name="blood_type"
              value={watchBloodType || ''}
            />

            <Label htmlFor="national_id">National ID</Label>
            <Input
              name="national_id"
              placeholder="1234567890123"
              type="text"
              minLength={13}
              maxLength={13}
              required
            />

            <Label htmlFor="address">Address</Label>
            <Input name="address" placeholder="Your address" required />

            <Label htmlFor="phone_number">Phone Number</Label>
            <Input
              name="phone_number"
              placeholder="0812345678"
              type="text"
              minLength={10}
              maxLength={10}
              required
            />

            <Label htmlFor="email">Email</Label>
            <Input
              type="email"
              name="email"
              placeholder="you@example.com"
              required
            />

            <Label htmlFor="password">Password</Label>
            <Input
              type="password"
              name="password"
              placeholder="Your password"
              minLength={6}
              required
            />

            <Label htmlFor="confirm_password">Confirm Password</Label>
            <Input
              type="password"
              name="confirm_password"
              placeholder="Confirm your password"
              minLength={6}
              required
            />

            <FormField
              control={form.control}
              name="blood_type"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Blood Type</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Select Blood Type" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectItem value="A+">A+</SelectItem>
                      <SelectItem value="A-">A-</SelectItem>
                      <SelectItem value="B+">B+</SelectItem>
                      <SelectItem value="B-">B-</SelectItem>
                      <SelectItem value="AB+">AB+</SelectItem>
                      <SelectItem value="AB-">AB-</SelectItem>
                      <SelectItem value="O+">O+</SelectItem>
                      <SelectItem value="O-">O-</SelectItem>
                    </SelectContent>
                  </Select>
                  <FieldMessage />
                </FormItem>
              )}
            />

            <Label htmlFor="emergency_contact">Emergency Contact</Label>
            <Input
              name="emergency_contact"
              placeholder="0812345678"
              type="text"
              minLength={10}
              maxLength={10}
              required
            />

            <SubmitButton pendingText="Signing up...">Sign up</SubmitButton>
            {message && <FormMessage message={message} />}
          </div>
        </form>
      </Form>
    </div>
  )
}
