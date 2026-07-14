import { supabase } from './supabase';
import type { RoundName, Category, FinalRound } from '../types/game';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface BuilderDraft {
  gameName: string;
  totalRounds: number;
  categoriesPerRound: number;
  rounds: Record<RoundName, Category[]>;
  final: FinalRound;
}

export interface DraftMetadata {
  id: string;
  game_name: string;
  created_by: string;
  created_at: string;
  updated_at: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateUUID(): string {
  // Use crypto.randomUUID() when available (secure contexts), fallback otherwise
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  // Fallback: generate a v4 UUID using crypto.getRandomValues
  const bytes = new Uint8Array(16)
  crypto.getRandomValues(bytes)
  bytes[6] = (bytes[6] & 0x0f) | 0x40 // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80 // variant 1
  const hex = Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}

async function getAuthUser() {
  // Verify we have a valid session with the server
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) return null;
  return { id: user.id, email: user.email ?? '' };
}

// ─── API Functions ────────────────────────────────────────────────────────────

export async function createDraft(
  draft: BuilderDraft
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    const id = generateUUID();
    const storagePath = `${user.id}/drafts/${id}.json`;

    // Upload JSON to Storage
    const { error: uploadErr } = await supabase.storage
      .from('games')
      .upload(storagePath, JSON.stringify(draft), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadErr) {
      const { data: { session: debugSession } } = await supabase.auth.getSession();
      console.error('[draftApi] Storage upload failed:', {
        path: storagePath,
        userId: user.id,
        email: user.email,
        error: uploadErr,
        statusCode: (uploadErr as unknown as Record<string, unknown>).statusCode,
        hasSession: !!debugSession,
        hasAccessToken: !!debugSession?.access_token,
        tokenPrefix: debugSession?.access_token?.substring(0, 20),
      });
      return { success: false, error: `Storage upload failed: ${uploadErr.message}` };
    }

    // Insert metadata row — created_by is the user's UUID (matches auth.uid() in RLS)
    const { error: insertErr } = await supabase
      .from('drafts')
      .insert({
        id,
        game_name: draft.gameName,
        created_by: user.id,
      })
      .select();

    if (insertErr) {
      // Rollback: delete the uploaded file
      await supabase.storage.from('games').remove([storagePath]);
      return { success: false, error: `Database insert failed: ${insertErr.message}` };
    }

    return { success: true, id };
  } catch (err) {
    console.error('[draftApi] createDraft caught error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: `Save failed: ${message}` };
  }
}

export async function updateDraft(
  draftId: string,
  draft: BuilderDraft
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    const storagePath = `${user.id}/drafts/${draftId}.json`;

    // Overwrite JSON in Storage
    const { error: uploadErr } = await supabase.storage
      .from('games')
      .upload(storagePath, JSON.stringify(draft), {
        contentType: 'application/json',
        upsert: true,
      });

    if (uploadErr) {
      return { success: false, error: `Storage upload failed: ${uploadErr.message}` };
    }

    // Update metadata row
    const { error: updateErr } = await supabase
      .from('drafts')
      .update({
        game_name: draft.gameName,
        updated_at: new Date().toISOString(),
      })
      .eq('id', draftId);

    if (updateErr) {
      return { success: false, error: `Database update failed: ${updateErr.message}` };
    }

    return { success: true };
  } catch (err) {
    console.error('[draftApi] updateDraft caught error:', err);
    const message = err instanceof Error ? err.message : 'Unknown error';
    return { success: false, error: `Save failed: ${message}` };
  }
}

export async function loadDraft(
  draftId: string
): Promise<{ success: true; draft: BuilderDraft } | { success: false; error: string }> {
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    const storagePath = `${user.id}/drafts/${draftId}.json`;

    const { data, error: downloadErr } = await supabase.storage
      .from('games')
      .download(storagePath);

    if (downloadErr || !data) {
      return { success: false, error: `Storage download failed: ${downloadErr?.message ?? 'File not found'}` };
    }

    const text = await data.text();
    const draft: BuilderDraft = JSON.parse(text);

    return { success: true, draft };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

export async function deleteDraft(
  draftId: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const user = await getAuthUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    const storagePath = `${user.id}/drafts/${draftId}.json`;

    // Delete JSON from Storage
    const { error: storageErr } = await supabase.storage
      .from('games')
      .remove([storagePath]);

    if (storageErr) {
      return { success: false, error: `Storage deletion failed: ${storageErr.message}` };
    }

    // Clean up any media files associated with this draft (best-effort)
    const mediaFolder = `${user.id}/clue-media/${draftId}`;
    const { data: mediaFiles } = await supabase.storage
      .from('games')
      .list(mediaFolder, { limit: 1000 });

    if (mediaFiles && mediaFiles.length > 0) {
      // Supabase list only returns files in the immediate folder; media is nested
      // under subfolders like {roundIndex}-{categoryIndex}-{clueIndex}/filename.
      // We need to list each subfolder recursively.
      const allMediaPaths: string[] = [];

      for (const item of mediaFiles) {
        if (item.id === null) {
          // It's a subfolder — list its contents
          const subPath = `${mediaFolder}/${item.name}`;
          const { data: subFiles } = await supabase.storage
            .from('games')
            .list(subPath, { limit: 1000 });

          if (subFiles) {
            for (const subFile of subFiles) {
              if (subFile.id !== null) {
                allMediaPaths.push(`${subPath}/${subFile.name}`);
              }
            }
          }
        } else {
          // It's a file directly in the media folder
          allMediaPaths.push(`${mediaFolder}/${item.name}`);
        }
      }

      if (allMediaPaths.length > 0) {
        await supabase.storage.from('games').remove(allMediaPaths);
      }
    }

    // Delete metadata row from DB (RLS ensures only owner can delete)
    const { error: dbErr } = await supabase
      .from('drafts')
      .delete()
      .eq('id', draftId);

    if (dbErr) {
      return { success: false, error: `Database deletion failed: ${dbErr.message}` };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

export async function listDrafts(): Promise<{ success: true; drafts: DraftMetadata[] } | { success: false; error: string }> {
  try {
    // RLS automatically scopes to the authenticated user's drafts via auth.uid()
    const { data, error } = await supabase
      .from('drafts')
      .select('id, game_name, created_by, created_at, updated_at')
      .order('updated_at', { ascending: false });

    if (error) {
      return { success: false, error: `Database query failed: ${error.message}` };
    }

    return { success: true, drafts: data as DraftMetadata[] };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}
