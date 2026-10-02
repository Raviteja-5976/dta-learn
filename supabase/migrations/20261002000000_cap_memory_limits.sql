-- Cap per-language memory at 256 MiB.
--
-- Judge0 rejects memory_limit above 256000 KB, and the app now clamps to that.
-- Studio validation also caps memoryMiB at 256, so rows seeded at 512 could
-- not be saved from Settings until they were lowered.

update public.compile_languages
set default_limits = jsonb_set(default_limits, '{memoryMiB}', '256')
where (default_limits->>'memoryMiB')::int > 256;
