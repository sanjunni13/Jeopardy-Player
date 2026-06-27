import { describe, it, expect, vi } from 'vitest';
import {
  validatePlayerName,
  buildPlayerInsertPayload,
  checkPlayerNameAvailable,
  MAX_PLAYER_NAME_LENGTH,
} from './playerProfile';

describe('validatePlayerName', () => {
  it('accepts a simple alphanumeric name', () => {
    const result = validatePlayerName('Player1');
    expect(result).toEqual({ valid: true });
  });

  it('accepts names with spaces, hyphens, and underscores', () => {
    expect(validatePlayerName('John Doe')).toEqual({ valid: true });
    expect(validatePlayerName('player-name')).toEqual({ valid: true });
    expect(validatePlayerName('player_name')).toEqual({ valid: true });
    expect(validatePlayerName('A-B_C D')).toEqual({ valid: true });
  });

  it('trims leading and trailing whitespace before validation', () => {
    const result = validatePlayerName('  Hello  ');
    expect(result).toEqual({ valid: true });
  });

  it('rejects empty string', () => {
    const result = validatePlayerName('');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects whitespace-only input', () => {
    const result = validatePlayerName('   ');
    expect(result.valid).toBe(false);
    expect(result.error).toBeDefined();
  });

  it('rejects names exceeding 50 characters after trimming', () => {
    const longName = 'a'.repeat(MAX_PLAYER_NAME_LENGTH + 1);
    const result = validatePlayerName(longName);
    expect(result.valid).toBe(false);
    expect(result.error).toContain('50');
  });

  it('accepts names exactly at the 50-character limit', () => {
    const exactName = 'a'.repeat(MAX_PLAYER_NAME_LENGTH);
    const result = validatePlayerName(exactName);
    expect(result).toEqual({ valid: true });
  });

  it('rejects names with special characters', () => {
    expect(validatePlayerName('player@name').valid).toBe(false);
    expect(validatePlayerName('player!name').valid).toBe(false);
    expect(validatePlayerName('player#name').valid).toBe(false);
    expect(validatePlayerName('player.name').valid).toBe(false);
  });

  it('rejects names with unicode characters', () => {
    expect(validatePlayerName('plàyer').valid).toBe(false);
    expect(validatePlayerName('名前').valid).toBe(false);
  });

  it('accepts single character names', () => {
    expect(validatePlayerName('A')).toEqual({ valid: true });
    expect(validatePlayerName('1')).toEqual({ valid: true });
  });

  it('provides descriptive error messages', () => {
    const empty = validatePlayerName('');
    expect(empty.error).toContain('empty');

    const tooLong = validatePlayerName('x'.repeat(51));
    expect(tooLong.error).toContain('50');

    const invalidChars = validatePlayerName('hello@world');
    expect(invalidChars.error).toContain('letters');
  });
});

describe('buildPlayerInsertPayload', () => {
  it('returns trimmed player_name and the provided auth_uuid', () => {
    const payload = buildPlayerInsertPayload('  Alice  ', 'abc-123-uuid');
    expect(payload.player_name).toBe('Alice');
    expect(payload.auth_uuid).toBe('abc-123-uuid');
  });

  it('sets all stats fields to zero', () => {
    const payload = buildPlayerInsertPayload('Bob', 'some-uuid');
    expect(payload.total_games_played).toBe(0);
    expect(payload.total_games_won).toBe(0);
    expect(payload.total_correct_answers).toBe(0);
    expect(payload.total_incorrect_answers).toBe(0);
    expect(payload.total_correct_daily_doubles).toBe(0);
    expect(payload.total_incorrect_daily_doubles).toBe(0);
    expect(payload.total_correct_final_jeopardies).toBe(0);
    expect(payload.total_incorrect_final_jeopardies).toBe(0);
    expect(payload.current_balance).toBe(0);
    expect(payload.total_money_earned).toBe(0);
  });

  it('does not add extra fields beyond the expected payload', () => {
    const payload = buildPlayerInsertPayload('Charlie', 'uuid-456');
    const keys = Object.keys(payload);
    expect(keys).toHaveLength(12);
    expect(keys).toContain('player_name');
    expect(keys).toContain('auth_uuid');
  });

  it('preserves internal whitespace in player name while trimming edges', () => {
    const payload = buildPlayerInsertPayload('  John Doe  ', 'uuid-789');
    expect(payload.player_name).toBe('John Doe');
  });
});

describe('checkPlayerNameAvailable', () => {
  function createMockSupabase(data: unknown[] | null, error: unknown = null) {
    const chain = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      ilike: vi.fn().mockReturnThis(),
      limit: vi.fn().mockResolvedValue({ data, error }),
    };
    return chain as unknown as import('@supabase/supabase-js').SupabaseClient;
  }

  it('returns true when no matching player name exists', async () => {
    const supabase = createMockSupabase([]);
    const result = await checkPlayerNameAvailable('NewPlayer', supabase);
    expect(result).toBe(true);
  });

  it('returns false when a matching player name exists and is claimed', async () => {
    const supabase = createMockSupabase([{ id: 1, auth_uuid: 'some-uuid' }]);
    const result = await checkPlayerNameAvailable('ExistingPlayer', supabase);
    expect(result).toBe(false);
  });

  it('returns true when a matching player name exists but is unclaimed', async () => {
    const supabase = createMockSupabase([{ id: 1, auth_uuid: null }]);
    const result = await checkPlayerNameAvailable('UnclaimedPlayer', supabase);
    expect(result).toBe(true);
  });

  it('trims the input name before querying', async () => {
    const supabase = createMockSupabase([]);
    await checkPlayerNameAvailable('  Padded  ', supabase);
    expect(supabase.from).toHaveBeenCalledWith('players');
    expect(supabase.ilike).toHaveBeenCalledWith('player_name', 'Padded');
  });

  it('uses ilike for case-insensitive comparison', async () => {
    const supabase = createMockSupabase([]);
    await checkPlayerNameAvailable('TestName', supabase);
    expect(supabase.ilike).toHaveBeenCalledWith('player_name', 'TestName');
  });

  it('throws when Supabase returns an error', async () => {
    const supabase = createMockSupabase(null, { message: 'DB connection failed' });
    await expect(checkPlayerNameAvailable('Player', supabase)).rejects.toEqual({
      message: 'DB connection failed',
    });
  });
});
