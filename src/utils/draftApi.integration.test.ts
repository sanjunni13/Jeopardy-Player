import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock the supabase module
vi.mock('./supabase', () => ({
  supabase: {
    auth: {
      getUser: vi.fn(),
    },
    storage: {
      from: vi.fn(),
    },
    from: vi.fn(),
  },
}));

// Mock the retry module to bypass retry logic in tests
vi.mock('./retry', () => ({
  withRetry: (fn: () => Promise<unknown>) => fn(),
}));

import { supabase } from './supabase';
import { createDraft, updateDraft, loadDraft, deleteDraft, listDrafts } from './draftApi';
import type { BuilderDraft } from './draftApi';

// ─── Test Data ────────────────────────────────────────────────────────────────

const sampleDraft: BuilderDraft = {
  gameName: 'Test Game',
  totalRounds: 1,
  categoriesPerRound: 1,
  rounds: {
    single: [
      {
        category: 'Test',
        clues: [
          { value: 100, clue: 'Q1', solution: 'A1', dailyDouble: false, html: false },
          { value: 200, clue: 'Q2', solution: 'A2', dailyDouble: false, html: false },
          { value: 300, clue: 'Q3', solution: 'A3', dailyDouble: false, html: false },
          { value: 400, clue: 'Q4', solution: 'A4', dailyDouble: false, html: false },
          { value: 500, clue: 'Q5', solution: 'A5', dailyDouble: false, html: false },
        ],
      },
    ],
  } as BuilderDraft['rounds'],
  final: { category: 'Final', clue: 'FQ', solution: 'FA', html: false },
};

const testEmail = 'user@example.com';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('draftApi integration tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('crypto', { randomUUID: () => 'test-uuid-1234' });
    // Mock authenticated user
    (supabase.auth.getUser as ReturnType<typeof vi.fn>).mockResolvedValue({
      data: { user: { id: 'user-id-abc', email: testEmail } },
      error: null,
    });
  });

  // ─── createDraft ──────────────────────────────────────────────────────────

  describe('createDraft', () => {
    it('returns success with id when storage upload and DB insert succeed', async () => {
      const storageUpload = vi.fn().mockResolvedValue({ data: {}, error: null });
      (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
        upload: storageUpload,
        remove: vi.fn(),
      });

      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ error: null }),
        }),
      });

      const result = await createDraft(sampleDraft);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.id).toBe('test-uuid-1234');
      }
      expect(supabase.storage.from).toHaveBeenCalledWith('games');
      expect(storageUpload).toHaveBeenCalledWith(
        `${testEmail}/drafts/test-uuid-1234.json`,
        JSON.stringify(sampleDraft),
        { contentType: 'application/json', upsert: false }
      );
    });

    it('rolls back storage upload when DB insert fails', async () => {
      const removeFn = vi.fn().mockResolvedValue({ error: null });
      const storageUpload = vi.fn().mockResolvedValue({ data: {}, error: null });

      (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
        upload: storageUpload,
        remove: removeFn,
      });

      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ error: { message: 'DB constraint violation' } }),
        }),
      });

      const result = await createDraft(sampleDraft);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Database insert failed');
        expect(result.error).toContain('DB constraint violation');
      }
      // Verify rollback: storage remove called
      expect(removeFn).toHaveBeenCalledWith([
        `${testEmail}/drafts/test-uuid-1234.json`,
      ]);
    });
  });

  // ─── updateDraft ──────────────────────────────────────────────────────────

  describe('updateDraft', () => {
    it('returns success when storage upload and DB update succeed', async () => {
      const storageUpload = vi.fn().mockResolvedValue({ data: {}, error: null });
      (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
        upload: storageUpload,
        remove: vi.fn(),
      });

      const eqFn = vi.fn().mockResolvedValue({ error: null });
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: updateFn,
      });

      const result = await updateDraft('draft-id-123', sampleDraft);

      expect(result.success).toBe(true);
      expect(supabase.storage.from).toHaveBeenCalledWith('games');
      expect(storageUpload).toHaveBeenCalledWith(
        `${testEmail}/drafts/draft-id-123.json`,
        JSON.stringify(sampleDraft),
        { contentType: 'application/json', upsert: true }
      );
    });

    it('rolls back storage when DB update fails', async () => {
      const removeFn = vi.fn().mockResolvedValue({ error: null });
      const storageUpload = vi.fn().mockResolvedValue({ data: {}, error: null });
      (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
        upload: storageUpload,
        remove: removeFn,
      });

      const eqFn = vi.fn().mockResolvedValue({ error: { message: 'Update failed' } });
      const updateFn = vi.fn().mockReturnValue({ eq: eqFn });
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        update: updateFn,
      });

      const result = await updateDraft('draft-id-123', sampleDraft);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Database update failed');
      }
    });

    it('returns error when storage upload fails', async () => {
      const storageUpload = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Storage quota exceeded' },
      });
      (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
        upload: storageUpload,
        remove: vi.fn(),
      });

      const result = await updateDraft('draft-id-123', sampleDraft);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Storage upload failed');
        expect(result.error).toContain('Storage quota exceeded');
      }
    });
  });

  // ─── loadDraft ────────────────────────────────────────────────────────────

  describe('loadDraft', () => {
    it('returns parsed BuilderDraft when storage download succeeds', async () => {
      const blob = new Blob([JSON.stringify(sampleDraft)], { type: 'application/json' });
      const downloadFn = vi.fn().mockResolvedValue({ data: blob, error: null });
      (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
        download: downloadFn,
      });

      const result = await loadDraft('draft-id-123');

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.draft).toEqual(sampleDraft);
      }
      expect(downloadFn).toHaveBeenCalledWith(
        `${testEmail}/drafts/draft-id-123.json`
      );
    });

    it('returns error when storage download fails', async () => {
      const downloadFn = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'File not found' },
      });
      (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
        download: downloadFn,
      });

      const result = await loadDraft('draft-id-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Storage download failed');
        expect(result.error).toContain('File not found');
      }
    });
  });

  // ─── deleteDraft ──────────────────────────────────────────────────────────

  describe('deleteDraft', () => {
    it('returns success when storage remove and DB delete succeed', async () => {
      const removeFn = vi.fn().mockResolvedValue({ error: null });
      (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
        remove: removeFn,
      });

      const eqFn = vi.fn().mockResolvedValue({ error: null });
      const deleteFn = vi.fn().mockReturnValue({ eq: eqFn });
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        delete: deleteFn,
      });

      const result = await deleteDraft('draft-id-123');

      expect(result.success).toBe(true);
      expect(removeFn).toHaveBeenCalledWith([
        `${testEmail}/drafts/draft-id-123.json`,
      ]);
    });

    it('returns error when storage remove fails', async () => {
      const removeFn = vi.fn().mockResolvedValue({
        error: { message: 'Permission denied' },
      });
      (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
        remove: removeFn,
      });

      const result = await deleteDraft('draft-id-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Storage deletion failed');
        expect(result.error).toContain('Permission denied');
      }
    });

    it('returns error when DB delete fails', async () => {
      const removeFn = vi.fn().mockResolvedValue({ error: null });
      (supabase.storage.from as ReturnType<typeof vi.fn>).mockReturnValue({
        remove: removeFn,
      });

      const eqFn = vi.fn().mockResolvedValue({ error: { message: 'Row not found' } });
      const deleteFn = vi.fn().mockReturnValue({ eq: eqFn });
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        delete: deleteFn,
      });

      const result = await deleteDraft('draft-id-123');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Database deletion failed');
        expect(result.error).toContain('Row not found');
      }
    });
  });

  // ─── listDrafts ───────────────────────────────────────────────────────────

  describe('listDrafts', () => {
    it('returns drafts ordered by updated_at DESC on success', async () => {
      const mockDrafts = [
        {
          id: 'draft-1',
          game_name: 'Newest Game',
          created_by: testEmail,
          created_at: '2024-01-03T00:00:00Z',
          updated_at: '2024-01-03T12:00:00Z',
        },
        {
          id: 'draft-2',
          game_name: 'Older Game',
          created_by: testEmail,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-02T12:00:00Z',
        },
      ];

      const orderFn = vi.fn().mockResolvedValue({ data: mockDrafts, error: null });
      const selectFn = vi.fn().mockReturnValue({ order: orderFn });
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: selectFn,
      });

      const result = await listDrafts();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.drafts).toEqual(mockDrafts);
        expect(result.drafts[0].updated_at > result.drafts[1].updated_at).toBe(true);
      }
      expect(selectFn).toHaveBeenCalledWith('id, game_name, created_by, created_at, updated_at');
      expect(orderFn).toHaveBeenCalledWith('updated_at', { ascending: false });
    });

    it('returns error when DB query fails', async () => {
      const orderFn = vi.fn().mockResolvedValue({
        data: null,
        error: { message: 'Connection timeout' },
      });
      const selectFn = vi.fn().mockReturnValue({ order: orderFn });
      (supabase.from as ReturnType<typeof vi.fn>).mockReturnValue({
        select: selectFn,
      });

      const result = await listDrafts();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error).toContain('Database query failed');
        expect(result.error).toContain('Connection timeout');
      }
    });
  });
});
