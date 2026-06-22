import { useState } from 'react'
import { supabase } from '../utils/supabase'
import { validateYouTubeUrl as validateYouTube } from '../utils/builderValidation'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface MediaUploadResult {
  success: boolean
  storagePath?: string
  publicUrl?: string
  error?: string
}

export interface UseMediaUploadReturn {
  uploadImage: (file: File, draftId: string, clueKey: string) => Promise<MediaUploadResult>
  uploadAudio: (file: File, draftId: string, clueKey: string) => Promise<MediaUploadResult>
  validateYouTubeUrl: (url: string) => boolean
  deleteMedia: (storagePath: string) => Promise<{ success: boolean; error?: string }>
  isUploading: boolean
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/gif', 'image/webp']
const ALLOWED_AUDIO_TYPES = ['audio/mpeg']
const MAX_IMAGE_SIZE = 5 * 1024 * 1024 // 5MB
const MAX_AUDIO_SIZE = 10 * 1024 * 1024 // 10MB

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useMediaUpload(): UseMediaUploadReturn {
  const [isUploading, setIsUploading] = useState(false)

  async function getUserEmail(): Promise<string | null> {
    const { data: { user } } = await supabase.auth.getUser()
    return user?.email ?? null
  }

  async function uploadFile(
    file: File,
    draftId: string,
    allowedTypes: string[],
    maxSize: number,
    typeLabel: string,
  ): Promise<MediaUploadResult> {
    // Validate format
    if (!allowedTypes.includes(file.type)) {
      const formats = typeLabel === 'image'
        ? 'JPEG, PNG, GIF, or WebP'
        : 'MP3'
      return { success: false, error: `Unsupported format. Please upload a ${formats} file.` }
    }

    // Validate size
    if (file.size > maxSize) {
      const limitMB = maxSize / (1024 * 1024)
      return { success: false, error: `File exceeds the ${limitMB}MB size limit.` }
    }

    setIsUploading(true)
    try {
      const userEmail = await getUserEmail()
      if (!userEmail) {
        return { success: false, error: 'Not authenticated.' }
      }

      const storagePath = `${userEmail}/drafts/${draftId}/media/${file.name}`

      const { error: uploadErr } = await supabase.storage
        .from('games')
        .upload(storagePath, file, {
          contentType: file.type,
          upsert: true,
        })

      if (uploadErr) {
        return { success: false, error: `Upload failed: ${uploadErr.message}` }
      }

      const { data: urlData } = supabase.storage
        .from('games')
        .getPublicUrl(storagePath)

      return {
        success: true,
        storagePath,
        publicUrl: urlData.publicUrl,
      }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    } finally {
      setIsUploading(false)
    }
  }

  async function uploadImage(file: File, draftId: string, _clueKey: string): Promise<MediaUploadResult> {
    return uploadFile(file, draftId, ALLOWED_IMAGE_TYPES, MAX_IMAGE_SIZE, 'image')
  }

  async function uploadAudio(file: File, draftId: string, _clueKey: string): Promise<MediaUploadResult> {
    return uploadFile(file, draftId, ALLOWED_AUDIO_TYPES, MAX_AUDIO_SIZE, 'audio')
  }

  function validateYouTubeUrl(url: string): boolean {
    return validateYouTube(url)
  }

  async function deleteMedia(storagePath: string): Promise<{ success: boolean; error?: string }> {
    setIsUploading(true)
    try {
      const { error } = await supabase.storage
        .from('games')
        .remove([storagePath])

      if (error) {
        return { success: false, error: `Delete failed: ${error.message}` }
      }

      return { success: true }
    } catch {
      return { success: false, error: 'Network error. Please try again.' }
    } finally {
      setIsUploading(false)
    }
  }

  return {
    uploadImage,
    uploadAudio,
    validateYouTubeUrl,
    deleteMedia,
    isUploading,
  }
}
