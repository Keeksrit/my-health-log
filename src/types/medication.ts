export interface MedicationType {
  id: string
  display_name: string
  technical_name: string | null
  form: string | null
  strength: string | null
  created_at: string
}

export interface MedicationSchedule {
  id: string
  medication_type_id: string
  start_date: string
  end_date: string | null
  default_count: string
  default_time: string
  created_at: string
  // joined
  medication_type?: MedicationType
}

export interface MedicationLog {
  id: string
  schedule_id: string
  date: string
  time: string
  count: string
  created_at: string
}
