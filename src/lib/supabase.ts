import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://wrhjentdpnszfugfgrjb.supabase.co'
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6IndyaGplbnRkcG5zemZ1Z2ZncmpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEwNTEwMzEsImV4cCI6MjA5NjYyNzAzMX0.FX_5DxEnWGf7k2eyKypvayYpzG_z4I2o8knUustT4Zc'

export const supabase = createClient(supabaseUrl, supabaseAnonKey)
