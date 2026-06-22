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

// ─── API Functions ────────────────────────────────────────────────────────────

export async function createDraft(
  draft: BuilderDraft,
  userEmail: string
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  try {
    const id = crypto.randomUUID();
    const storagePath = `${userEmail}/drafts/${id}.json`;

    // Upload JSON to Storage
    const { error: uploadErr } = await supabase.storage
      .from('games')
      .upload(storagePath, JSON.stringify(draft), {
        contentType: 'application/json',
        upsert: false,
      });

    if (uploadErr) {
      return { success: false, error: `Storage upload failed: ${uploadErr.message}` };
    }

    // Insert metadata row
    const { error: insertErr } = await supabase
      .from('drafts')
      .insert({
        id,
        game_name: draft.gameName,
        created_by: userEmail,
      });

    if (insertErr) {
      // Rollback: delete the uploaded file
      await supabase.storage.from('games').remove([storagePath]);
      return { success: false, error: `Database insert failed: ${insertErr.message}` };
    }

    return { success: true, id };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

export async function updateDraft(
  draftId: string,
  draft: BuilderDraft,
  userEmail: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const storagePath = `${userEmail}/drafts/${draftId}.json`;

    // Overwrite JSON in Storage (upsert: true)
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
      .eq('id', draftId)
      .eq('created_by', userEmail);

    if (updateErr) {
      // Rollback: best-effort delete of the uploaded file
      await supabase.storage.from('games').remove([storagePath]);
      return { success: false, error: `Database update failed: ${updateErr.message}` };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

export async function loadDraft(
  draftId: string,
  userEmail: string
): Promise<{ success: true; draft: BuilderDraft } | { success: false; error: string }> {
  try {
    const storagePath = `${userEmail}/drafts/${draftId}.json`;

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
  draftId: string,
  userEmail: string
): Promise<{ success: true } | { success: false; error: string }> {
  try {
    const storagePath = `${userEmail}/drafts/${draftId}.json`;

    // Delete JSON from Storage
    const { error: storageErr } = await supabase.storage
      .from('games')
      .remove([storagePath]);

    if (storageErr) {
      return { success: false, error: `Storage deletion failed: ${storageErr.message}` };
    }

    // Delete metadata row from DB
    const { error: dbErr } = await supabase
      .from('drafts')
      .delete()
      .eq('id', draftId)
      .eq('created_by', userEmail);

    if (dbErr) {
      return { success: false, error: `Database deletion failed: ${dbErr.message}` };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}

export async function listDrafts(
  userEmail: string
): Promise<{ success: true; drafts: DraftMetadata[] } | { success: false; error: string }> {
  try {
    const { data, error } = await supabase
      .from('drafts')
      .select('id, game_name, created_by, created_at, updated_at')
      .eq('created_by', userEmail)
      .order('updated_at', { ascending: false });

    if (error) {
      return { success: false, error: `Database query failed: ${error.message}` };
    }

    return { success: true, drafts: data as DraftMetadata[] };
  } catch {
    return { success: false, error: 'Network error. Please try again.' };
  }
}
