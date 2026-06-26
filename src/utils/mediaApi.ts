import { supabase } from './supabase';

// ─── Constants ────────────────────────────────────────────────────────────────

const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.gif', '.webp'];
const AUDIO_EXTENSIONS = ['.mp3'];
const IMAGE_MAX_SIZE = 5_242_880; // 5 MB
const AUDIO_MAX_SIZE = 10_485_760; // 10 MB

const YOUTUBE_PATTERN = /^https?:\/\/(www\.)?(youtube\.com\/watch|youtu\.be)\/.+/;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFileExtension(fileName: string): string {
  const lastDot = fileName.lastIndexOf('.');
  if (lastDot === -1) return '';
  return fileName.slice(lastDot).toLowerCase();
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
): Promise<{ success: true; url: string } | { success: false; error: string }> {
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    const storagePath = `${user.id}/clue-media/${draftId}/${roundIndex}-${categoryIndex}-${clueIndex}/${file.name}`;

    const { error: uploadErr } = await supabase.storage
      .from('games')
      .upload(storagePath, file, {
        contentType: file.type,
        upsert: true,
      });

    if (uploadErr) {
      return { success: false, error: `Upload failed: ${uploadErr.message}` };
    }

    const { data: urlData } = supabase.storage
      .from('games')
      .getPublicUrl(storagePath);

    return { success: true, url: urlData.publicUrl };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

export async function deleteClueMedia(
  url: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    // Extract the storage path from the public URL.
    // Public URLs follow the pattern: {supabaseUrl}/storage/v1/object/public/games/{path}
    const bucketPrefix = '/storage/v1/object/public/games/';
    const prefixIndex = url.indexOf(bucketPrefix);

    if (prefixIndex === -1) {
      return { success: false, error: 'Invalid media URL format.' };
    }

    const storagePath = decodeURIComponent(url.slice(prefixIndex + bucketPrefix.length));

    const { error: removeErr } = await supabase.storage
      .from('games')
      .remove([storagePath]);

    if (removeErr) {
      return { success: false, error: `Deletion failed: ${removeErr.message}` };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}
