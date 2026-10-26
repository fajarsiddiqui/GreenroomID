BEGIN;

-- Blok 1: Lepas policy dan trigger yang melekat hanya pada tabel fitur yang dihapus.
DO $cleanup$
DECLARE
  feature_table text;
  feature_policy record;
  feature_trigger record;
BEGIN
  FOREACH feature_table IN ARRAY ARRAY[
    'free_service_usage_events', 'free_services',
    'prompt_tool_question_conditions', 'prompt_tool_options',
    'prompt_tool_questions', 'prompt_tool_sections', 'prompt_tools',
    'learning_payments', 'learning_reviews', 'learning_entries',
    'learning_sources', 'learning_payment_settings', 'learning_materials',
    'donations', 'donor_anonymous_identities', 'donation_settings'
  ] LOOP
    IF to_regclass(format('public.%I', feature_table)) IS NULL THEN
      CONTINUE;
    END IF;

    FOR feature_policy IN
      SELECT policyname
      FROM pg_catalog.pg_policies
      WHERE schemaname = 'public' AND tablename = feature_table
    LOOP
      EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', feature_policy.policyname, feature_table);
    END LOOP;

    FOR feature_trigger IN
      SELECT tgname
      FROM pg_catalog.pg_trigger
      WHERE tgrelid = to_regclass(format('public.%I', feature_table))
        AND NOT tgisinternal
    LOOP
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON public.%I', feature_trigger.tgname, feature_table);
    END LOOP;
  END LOOP;
END
$cleanup$;

-- Blok 2: Lepas RPC dan fungsi trigger eksklusif Layanan Gratis.
DROP FUNCTION IF EXISTS public.get_public_free_services();
DROP FUNCTION IF EXISTS public.track_free_service_usage(text, text, text);
DROP FUNCTION IF EXISTS public.get_free_service_usage_total();
DROP FUNCTION IF EXISTS public.get_free_service_admin_stats();
DROP FUNCTION IF EXISTS public.update_free_service_status(text, text, text);

-- Blok 3: Lepas fungsi trigger eksklusif AI Tools.
DROP FUNCTION IF EXISTS public.set_prompt_tools_published_at();
DROP FUNCTION IF EXISTS public.prevent_prompt_tool_tool_id_change();
DROP FUNCTION IF EXISTS public.validate_prompt_tool_question_refs();
DROP FUNCTION IF EXISTS public.set_prompt_tools_content_updated_at();
DROP FUNCTION IF EXISTS public.validate_prompt_tool_question_condition();
DROP FUNCTION IF EXISTS public.normalize_prompt_tool_structured_settings();
DROP FUNCTION IF EXISTS public.normalize_prompt_tool_question_structured_mapping();
DROP FUNCTION IF EXISTS public.protect_prompt_tool_structured_pass_option();

-- Blok 4: Lepas RPC dan fungsi trigger eksklusif Ruang Belajar/Studio Artikel.
DROP FUNCTION IF EXISTS public.submit_learning_payment_confirmation(uuid);
DROP FUNCTION IF EXISTS public.admin_verify_learning_payment(uuid, text, text);
DROP FUNCTION IF EXISTS public.sync_learning_entry_after_payment();
DROP FUNCTION IF EXISTS public.set_learning_materials_published_at();

-- Blok 5: Lepas RPC eksklusif Donasi dan identitas donatur anonim.
DROP FUNCTION IF EXISTS public.get_public_donation_settings();
DROP FUNCTION IF EXISTS public.get_public_donation_summary();
DROP FUNCTION IF EXISTS public.get_public_top_donors(text);
DROP FUNCTION IF EXISTS public.get_public_recent_donations(integer);
DROP FUNCTION IF EXISTS public.get_admin_donation_stats();
DROP FUNCTION IF EXISTS public.get_admin_donations(integer);
DROP FUNCTION IF EXISTS public.ensure_donor_anonymous_identity(uuid, text);

-- Blok 6: Hapus tabel AI Tools dari anak ke induk; indeks dan constraint miliknya ikut terhapus.
DROP TABLE IF EXISTS public.prompt_tool_question_conditions;
DROP TABLE IF EXISTS public.prompt_tool_options;
DROP TABLE IF EXISTS public.prompt_tool_questions;
DROP TABLE IF EXISTS public.prompt_tool_sections;
DROP TABLE IF EXISTS public.prompt_tools;

-- Blok 7: Hapus tabel Ruang Belajar/Studio Artikel dari anak ke induk.
DROP TABLE IF EXISTS public.learning_payments;
DROP TABLE IF EXISTS public.learning_reviews;
DROP TABLE IF EXISTS public.learning_entries;
DROP TABLE IF EXISTS public.learning_sources;
DROP TABLE IF EXISTS public.learning_payment_settings;
DROP TABLE IF EXISTS public.learning_materials;

-- Blok 8: Hapus tabel dan sequence Donasi tanpa mengubah tabel akun atau pembayaran layanan.
DROP TABLE IF EXISTS public.donations;
DROP TABLE IF EXISTS public.donor_anonymous_identities;
DROP TABLE IF EXISTS public.donation_settings;
DROP SEQUENCE IF EXISTS public.donor_anonymous_number_seq;

-- Blok 9: Hapus tabel Layanan Gratis dari anak ke induk.
DROP TABLE IF EXISTS public.free_service_usage_events;
DROP TABLE IF EXISTS public.free_services;

-- Blok 10: Hapus hanya indeks dan dua kolom preferensi donatur dari profil client.
DROP INDEX IF EXISTS public.user_profiles_donor_public_idx;
ALTER TABLE IF EXISTS public.user_profiles
  DROP COLUMN IF EXISTS donor_display_name,
  DROP COLUMN IF EXISTS donor_public_default;

-- Blok 11: Hapus hanya key landing fitur lama yang tercantum dalam H9, H11, RB01, dan H43.
DELETE FROM public.landing_content
WHERE content_key IN (
  'stats_free_services_usage',
  'menu_free_label', 'menu_free_description',
  'menu_learning_label', 'menu_learning_description',
  'menu_studio_label', 'menu_studio_description',
  'menu_ai_tools_label', 'menu_ai_tools_description',
  'menu_donate_label', 'menu_donate_description',
  'menu_top_donatur_label', 'menu_top_donatur_description'
);

-- Storage: SQL sumber tidak mendefinisikan bucket/policy khusus fitur lama; cek dashboard secara manual, pertahankan request-files, site-assets, landing-assets, proofs, dan shop-images.
COMMIT;
