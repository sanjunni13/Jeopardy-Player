import { supabase } from './supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const AUDIO_EXTENSIONS = ['.mp3'];
const IMAGE_MAX_SIZE = 5_242_880; // 5 MB
const AUDIO_MAX_SIZE = 10_485_760; // 10 MB

const YOUTUBE_PATTERN = /^https?:\/\/(www\.)?(youtube\.com\/watch\?v=[\w-]+|youtu\.be\/[\w-]+)/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return '';
  return fileName.slice(lastDot).toLowerCase();
}

/** Sanitize a file name for safe use in storage paths (remove spaces, special chars) */
function sanitizeFileName(fileName: string): string {
  const ext = getFileExtension(fileName);
  const base = fileName.slice(0, fileName.length - ext.length);
  // Replace spaces and non-alphanumeric chars (except hyphens/underscores) with underscores
  const sanitized = base.replace(/[^a-zA-Z0-9_-]/g, '_').replace(/_+/g, '_');
  return `${sanitized}${ext}`;
}

async function getAuthUser() {
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { id: user.id };
}

// ─── Validation ───────────────────────────────────────────────────────────────

export function validateMediaFile(
  file: File
): { valid: true } | { valid: false; error: string } {
  const ext = getFileExtension(file.name);

  if (IMAGE_EXTENSIONS.includes(ext)) {
    if (file.size > IMAGE_MAX_SIZE) {
      return { valid: false, error: `Image file must be 5 MB or less.` };
    }
    return { valid: true };
  }

  if (AUDIO_EXTENSIONS.includes(ext)) {
    if (file.size > AUDIO_MAX_SIZE) {
      return { valid: false, error: `Audio file must be 10 MB or less.` };
    }
    return { valid: true };
  }

  return {
    valid: false,
    error: `Unsupported file type. Accepted: ${[...IMAGE_EXTENSIONS, ...AUDIO_EXTENSIONS].join(', ')}`,
  };
}

export function validateYouTubeUrl(url: string): boolean {
  return YOUTUBE_PATTERN.test(url);
}

// ─── Upload / Delete ──────────────────────────────────────────────────────────

export async function uploadClueMedia(
  file: File,
  draftId: string,
  roundIndex: number,
  categoryIndex: number,
  clueIndex: number
): Promise<{ success: true; url: string; storagePath: string } | { success: false; error: string }> {
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    const safeName = sanitizeFileName(file.name);
    const storagePath = `${user.id}/clue-media/${draftId}/${roundIndex}-${categoryIndex}-${clueIndex}/${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from('games')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) {
      return { success: false, error: `Upload failed: ${uploadErr.message}` };
    }

    // Use a signed URL since the games bucket requires authentication
    const { data: signedData, error: signedErr } = await supabase.storage
      .from('games')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7, { download: false }); // 7 days, inline (not download)

    if (signedErr || !signedData?.signedUrl) {
      // Fall back to public URL if signed URL fails
      const { data: urlData } = supabase.storage
        .from('games')
        .getPublicUrl(storagePath);
      return { success: true, url: urlData.publicUrl, storagePath };
    }

    return { success: true, url: signedData.signedUrl, storagePath };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

export async function deleteClueMedia(
  url: string,
  storagePath?: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    let resolvedPath = storagePath;

    if (!resolvedPath) {
      // Try to extract the storage path from the URL.
      // Public URLs: {supabaseUrl}/storage/v1/object/public/games/{path}
      // Signed URLs: {supabaseUrl}/storage/v1/object/sign/games/{path}?token=...
      const publicPrefix = '/storage/v1/object/public/games/';
      const signedPrefix = '/storage/v1/object/sign/games/';

      let prefixIndex = url.indexOf(publicPrefix);
      let prefixLen = publicPrefix.length;

      if (prefixIndex === -1) {
        prefixIndex = url.indexOf(signedPrefix);
        prefixLen = signedPrefix.length;
      }

      if (prefixIndex === -1) {
        return { success: false, error: 'Invalid media URL format.' };
      }

      // Strip query params (signed URL tokens)
      const rawPath = url.slice(prefixIndex + prefixLen).split('?')[0];
      resolvedPath = decodeURIComponent(rawPath);
    }

    const { error: removeErr } = await supabase.storage
      .from('games')
      .remove([resolvedPath]);

    if (removeErr) {
      return { success: false, error: `Deletion failed: ${removeErr.message}` };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

/** Refresh a signed URL for a media file from its storage path */
export async function refreshMediaUrl(
  storagePath: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase.storage
      .from('games')
      .createSignedUrl(storagePath, 60 * 60 * 24 * 7, { download: false }); // 7 days, inline

    if (error || !data?.signedUrl) return null;
    return data.signedUrl;
  } catch {
    return null;
  }
}
