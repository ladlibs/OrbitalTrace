export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export interface Database {
  public: {
    Tables: {
      analyst: {
        Row: {
          analyst_id: string | number
          name: string
          role: string
          auth_uid: string | null
        }
        Insert: {
          analyst_id: string | number
          name: string
          role: string
          auth_uid?: string | null
        }
        Update: {
          analyst_id?: string | number
          name?: string
          role?: string
          auth_uid?: string | null
        }
      }
      mission: {
        Row: {
          mission_id: string | number
          name: string
          objective: string | null
          start_date: string
          lead_analyst_id: string | number | null
        }
        Insert: {
          mission_id: string | number
          name: string
          objective?: string | null
          start_date: string
          lead_analyst_id?: string | number | null
        }
        Update: {
          mission_id?: string | number
          name?: string
          objective?: string | null
          start_date?: string
          lead_analyst_id?: string | number | null
        }
      }
      satellite: {
        Row: {
          satellite_id: string | number
          name: string
          orbit_type: string
          launch_date: string
          agency: string
          mission_id: string | number
        }
        Insert: {
          satellite_id: string | number
          name: string
          orbit_type: string
          launch_date: string
          agency: string
          mission_id: string | number
        }
        Update: {
          satellite_id?: string | number
          name?: string
          orbit_type?: string
          launch_date?: string
          agency?: string
          mission_id?: string | number
        }
      }
      sensor: {
        Row: {
          sensor_id: string | number
          resolution: string
          sensor_type: 'OPTICAL' | 'INFRARED' | 'RADAR'
          satellite_id: string | number
        }
        Insert: {
          sensor_id: string | number
          resolution: string
          sensor_type: 'OPTICAL' | 'INFRARED' | 'RADAR'
          satellite_id: string | number
        }
        Update: {
          sensor_id?: string | number
          resolution?: string
          sensor_type?: 'OPTICAL' | 'INFRARED' | 'RADAR'
          satellite_id?: string | number
        }
      }
      raw_frame: {
        Row: {
          frame_id: string | number
          capture_timestamp: string
          latitude: number
          longitude: number
          altitude: number
          cloud_cover_pct: number
          status: string
          sensor_id: string | number
        }
        Insert: {
          frame_id: string | number
          capture_timestamp: string
          latitude: number
          longitude: number
          altitude: number
          cloud_cover_pct: number
          status: string
          sensor_id: string | number
        }
        Update: {
          frame_id?: string | number
          capture_timestamp?: string
          latitude?: number
          longitude?: number
          altitude?: number
          cloud_cover_pct?: number
          status?: string
          sensor_id?: string | number
        }
      }
      reconstruction_job: {
        Row: {
          job_id: string | number
          algorithm_used: string
          parameters: Json
          start_time: string
          end_time: string | null
          status: string
          analyst_id: string | number | null
        }
        Insert: {
          job_id?: string | number
          algorithm_used: string
          parameters?: Json
          start_time?: string
          end_time?: string | null
          status: string
          analyst_id?: string | number | null
        }
        Update: {
          job_id?: string | number
          algorithm_used?: string
          parameters?: Json
          start_time?: string
          end_time?: string | null
          status?: string
          analyst_id?: string | number | null
        }
      }
      reconstructed_image: {
        Row: {
          image_id: string | number
          resolution: string
          output_format: string
          generated_timestamp: string
          job_id: string | number
          original_image_id: string | number | null
        }
        Insert: {
          image_id?: string | number
          resolution: string
          output_format: string
          generated_timestamp?: string
          job_id: string | number
          original_image_id?: string | number | null
        }
        Update: {
          image_id?: string | number
          resolution?: string
          output_format?: string
          generated_timestamp?: string
          job_id?: string | number
          original_image_id?: string | number | null
        }
      }
      quality_assessment: {
        Row: {
          image_id: string | number
          metric_type: string
          score: number
          assessed_by: string | number | null
        }
        Insert: {
          image_id: string | number
          metric_type: string
          score: number
          assessed_by?: string | number | null
        }
        Update: {
          image_id?: string | number
          metric_type?: string
          score?: number
          assessed_by?: string | number | null
        }
      }
      contributes_to: {
        Row: {
          frame_id: string | number
          job_id: string | number
          contribution_weight: number
        }
        Insert: {
          frame_id: string | number
          job_id: string | number
          contribution_weight: number
        }
        Update: {
          frame_id?: string | number
          job_id?: string | number
          contribution_weight?: number
        }
      }
    }
  }
}
