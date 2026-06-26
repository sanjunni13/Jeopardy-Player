-- Migration: Rename storage objects from email-based paths to Auth UUID-based paths.
-- This migration is best-effort and NOT transactional for the rename operations.
-- Each user's objects are renamed individually, and failures are logged via RAISE WARNING.
--
-- Storage path convention change:
--   Before: {email}/{gameName}.json  or  {email}/drafts/{draftId}.json
--   After:  {auth_uuid}/{gameName}.json  or  {auth_uuid}/drafts/{draftId}.json
--
-- Validates: Requirements 6.7

-- Create a function that performs the best-effort rename loop.
-- Using a function allows us to use exception handling per-object.
CREATE OR REPLACE FUNCTION migrate_storage_paths_email_to_uuid()
RETURNS TABLE(total_processed int, total_success int, total_failed int) AS $$
DECLARE
  rec RECORD;
  obj RECORD;
  new_name text;
  v_total_processed int := 0;
  v_total_success int := 0;
  v_total_failed int := 0;
  email_prefix text;
  uuid_prefix text;
BEGIN
  -- Loop through all players that have a known auth_uuid mapping.
  -- We join to auth.users to get the email associated with that auth account.
  FOR rec IN
    SELECT
      p.auth_uuid::text AS auth_uuid_text,
      au.email
    FROM public.players p
    INNER JOIN auth.users au ON au.id = p.auth_uuid
    WHERE p.auth_uuid IS NOT NULL
      AND au.email IS NOT NULL
  LOOP
    email_prefix := rec.email || '/';
    uuid_prefix := rec.auth_uuid_text || '/';

    -- Find all storage objects in the "games" bucket whose name starts with this user's email.
    FOR obj IN
      SELECT id, name
      FROM storage.objects
      WHERE bucket_id = 'games'
        AND name LIKE email_prefix || '%'
    LOOP
      v_total_processed := v_total_processed + 1;

      -- Construct the new path by replacing the email prefix with the auth_uuid prefix.
      new_name := uuid_prefix || substring(obj.name FROM length(email_prefix) + 1);

      BEGIN
        UPDATE storage.objects
        SET name = new_name
        WHERE id = obj.id;

        v_total_success := v_total_success + 1;

        RAISE NOTICE 'Renamed storage object: "%" -> "%"', obj.name, new_name;
      EXCEPTION WHEN OTHERS THEN
        v_total_failed := v_total_failed + 1;
        RAISE WARNING 'Failed to rename storage object id=%, name="%": %', obj.id, obj.name, SQLERRM;
      END;
    END LOOP;
  END LOOP;

  RAISE NOTICE 'Storage path migration complete: % processed, % succeeded, % failed',
    v_total_processed, v_total_success, v_total_failed;

  RETURN QUERY SELECT v_total_processed, v_total_success, v_total_failed;
END;
$$ LANGUAGE plpgsql;

-- Execute the migration function.
SELECT * FROM migrate_storage_paths_email_to_uuid();

-- Clean up: drop the function after use since it's a one-time migration utility.
DROP FUNCTION migrate_storage_paths_email_to_uuid();
