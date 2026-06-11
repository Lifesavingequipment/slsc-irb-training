export interface Club {
  id: string
  club_name: string
  club_code: string
  country: string
  state_region: string
}

export interface Member {
  id: string
  club_id: string
  first_name: string
  last_name: string
  preferred_name: string | null
  email: string
  phone: string | null
  auth_user_id: string | null
  membership_status: string
}

export interface Role {
  id: string
  club_id: string
  member_id: string
  role_name: string
  is_active: boolean
}

export interface Qualification {
  id: string
  code: string
  name: string
  category: string
}

export interface MemberQualification {
  id: string
  club_id: string
  member_id: string
  qualification_id: string
  expiry_date: string | null
  status: string
}

export interface IrbSession {
  id: string
  club_id: string
  title: string
  session_type: string
  scheduled_date: string
  start_time: string | null
  end_time: string | null
  location_id: string | null
  lead_trainer_id: string | null
  max_participants: number | null
  min_drivers: number | null
  min_crew: number | null
  status: string
  weather_conditions: string | null
  sea_conditions: string | null
  wind_speed: string | null
  tide_info: string | null
  qualification_id: string | null
  notes: string | null
  debrief_notes: string | null
  created_by: string | null
}

export interface IrbSessionRsvp {
  id: string
  club_id: string
  session_id: string
  member_id: string
  preferred_role: string | null
  rsvp_status: string
}

export interface IrbSessionTeam {
  id: string
  club_id: string
  session_id: string
  wave_number: number | null
  lane_number: number | null
  boat_id: string | null
  driver_id: string | null
  crew_id: string | null
  patient_id: string | null
  notes: string | null
}

export interface IrbAttendance {
  id: string
  club_id: string
  session_id: string
  member_id: string
  role_on_day: string | null
  attended: boolean
  performance_rating: number | null
  trainer_notes: string | null
  signed_off: boolean
}

export interface IrbEquipment {
  id: string
  club_id: string
  equipment_type: string
  name: string
  identifier: string | null
  status: string
}

export interface IrbLocation {
  id: string
  club_id: string
  name: string
  description: string | null
}

export interface IrbTrainingDrill {
  id: string
  club_id: string
  name: string
  description: string | null
  category: string | null
  duration_minutes: number | null
  difficulty: string | null
}

export interface IrbSessionTrainingBlock {
  id: string
  club_id: string
  session_id: string
  drill_id: string | null
  block_order: number
  title: string
  duration_minutes: number | null
}
