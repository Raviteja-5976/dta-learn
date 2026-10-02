-- Reference data: compile languages and the default sandbox image.
--
-- Judge0 language ids differ between Judge0 versions. These are the Judge0 CE
-- ids that exist on the public/RapidAPI CE instance. After connecting your
-- Judge0, open Studio → Settings → "Fetch from Judge0" to compare and adjust.

insert into public.compile_languages (slug, provider_language_id, label, monaco_language, main_file, default_limits) values
  ('python3',    71, 'Python 3',           'python',     'main.py',    '{"cpuSeconds":2,"wallSeconds":5,"memoryMiB":256}'),
  ('javascript', 63, 'JavaScript (Node)',  'javascript', 'main.js',    '{"cpuSeconds":2,"wallSeconds":5,"memoryMiB":512}'),
  ('typescript', 74, 'TypeScript',         'typescript', 'main.ts',    '{"cpuSeconds":5,"wallSeconds":10,"memoryMiB":512}'),
  ('java',       62, 'Java',               'java',       'Main.java',  '{"cpuSeconds":5,"wallSeconds":10,"memoryMiB":512}'),
  ('c',          50, 'C (GCC)',            'c',          'main.c',     '{"cpuSeconds":2,"wallSeconds":5,"memoryMiB":256}'),
  ('cpp',        54, 'C++ (GCC)',          'cpp',        'main.cpp',   '{"cpuSeconds":2,"wallSeconds":5,"memoryMiB":256}'),
  ('go',         60, 'Go',                 'go',         'main.go',    '{"cpuSeconds":2,"wallSeconds":5,"memoryMiB":512}'),
  ('rust',       73, 'Rust',               'rust',       'main.rs',    '{"cpuSeconds":2,"wallSeconds":10,"memoryMiB":256}'),
  ('csharp',     51, 'C# (Mono)',          'csharp',     'Main.cs',    '{"cpuSeconds":5,"wallSeconds":10,"memoryMiB":512}'),
  ('kotlin',     78, 'Kotlin',             'kotlin',     'Main.kt',    '{"cpuSeconds":5,"wallSeconds":15,"memoryMiB":512}'),
  ('sqlite',     82, 'SQL (SQLite)',       'sql',        'query.sql',  '{"cpuSeconds":2,"wallSeconds":5,"memoryMiB":256}'),
  ('multi',      89, 'Multi-file program', 'plaintext',  'main.txt',   '{"cpuSeconds":5,"wallSeconds":10,"memoryMiB":512}')
on conflict (slug) do nothing;

-- The public WebVM image is for EVALUATION ONLY (design §4.10). Build your own
-- Debian 12 i386 image with images/linux-git and add it as a new version.
insert into public.sandbox_images (slug, version, url, image_type, notes) values
  ('webvm-debian', 1, 'wss://disks.webvm.io/debian_buster_large_permis_fixed_01-06-2026.ext2', 'cloud',
   'Public WebVM evaluation image (Debian buster). Replace with your own image before launch.')
on conflict (slug, version) do nothing;
