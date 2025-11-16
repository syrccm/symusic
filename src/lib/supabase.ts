import { createClient } from '@supabase/supabase-js'

// Supabase configuration - fallback to dummy values to prevent errors
const supabaseUrl = process.env.REACT_APP_SUPABASE_URL || 'https://dummy.supabase.co'
const supabaseAnonKey = process.env.REACT_APP_SUPABASE_ANON_KEY || 'dummy-key'

// Create Supabase client - will work in offline mode if not configured
export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Track type for database
export interface DbTrack {
  id: string
  title: string
  url: string
  artist?: string
  category?: '주일예배' | '금요철야' | '매일성경'
  info1?: string
  info2?: string
  youtube?: string
  youtube_sermon?: string
  youtube_mv?: string
  date?: string
  lyrics?: string
  created_at: string
  updated_at: string
}

// Real-time subscription payload type
export interface RealtimePayload {
  eventType: 'INSERT' | 'UPDATE' | 'DELETE'
  new: DbTrack | null
  old: DbTrack | null
}

// Database service class
export class MusicService {
  // Check if Supabase is available and properly configured
  static isAvailable(): boolean {
    const hasValidUrl = supabaseUrl && supabaseUrl !== 'https://dummy.supabase.co'
    const hasValidKey = supabaseAnonKey && supabaseAnonKey !== 'dummy-key'
    return !!(hasValidUrl && hasValidKey)
  }

  // Get all tracks
  static async getAllTracks(): Promise<DbTrack[]> {
    if (!this.isAvailable()) {
      throw new Error('Supabase not configured')
    }

    const { data, error } = await supabase
      .from('music_tracks')
      .select('*')
      .order('created_at', { ascending: true })

    if (error) {
      console.error('Error fetching tracks:', error)
      throw error
    }

    return data || []
  }

  // Add a new track
  static async addTrack(track: Omit<DbTrack, 'id' | 'created_at' | 'updated_at'>): Promise<DbTrack> {
    if (!this.isAvailable()) {
      throw new Error('Supabase not configured')
    }

    const { data, error } = await supabase
      .from('music_tracks')
      .insert([track])
      .select()
      .single()

    if (error) {
      console.error('Error adding track:', error)
      throw error
    }

    return data
  }

  // Update a track
  static async updateTrack(id: string, updates: Partial<Omit<DbTrack, 'id' | 'created_at' | 'updated_at'>>): Promise<DbTrack> {
    if (!this.isAvailable()) {
      throw new Error('Supabase not configured')
    }

    const { data, error } = await supabase
      .from('music_tracks')
      .update(updates)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('Error updating track:', error)
      throw error
    }

    return data
  }

  // Delete a track
  static async deleteTrack(id: string): Promise<void> {
    if (!this.isAvailable()) {
      throw new Error('Supabase not configured')
    }

    const { error } = await supabase
      .from('music_tracks')
      .delete()
      .eq('id', id)

    if (error) {
      console.error('Error deleting track:', error)
      throw error
    }
  }

  // Subscribe to real-time changes
  static subscribeToChanges(callback: (payload: RealtimePayload) => void) {
    if (!this.isAvailable()) {
      console.warn('Supabase not configured, real-time updates disabled')
      return null
    }

    return supabase
      .channel('music_tracks_changes')
      .on('postgres_changes', 
        { 
          event: '*', 
          schema: 'public', 
          table: 'music_tracks' 
        }, 
        callback
      )
      .subscribe()
  }

  // Unsubscribe from real-time changes
  static unsubscribe(subscription: ReturnType<typeof supabase.channel> | null) {
    if (subscription) {
      supabase.removeChannel(subscription)
    }
  }
}