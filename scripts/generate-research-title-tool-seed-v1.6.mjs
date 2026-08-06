import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import manifest from './data/research-title-tool-v1.6.mjs'

const TARGET_SLUG = 'penelusuran-judul-penelitian-mahasiswa'
const OUTPUT_FILE = '../supabase/h41-seed-research-title-tool-v1.6.sql'
const PAYLOAD_TAG = 'research_title_v16'
const PAYLOAD_DELIMITER = `$${PAYLOAD_TAG}$`

const EXPECTED = Object.freeze({
  sections: 10,
  questions: 120,
  options: 658,
  conditions: 330,
  formData: 118,
  structuredPaths: 118,
  acknowledgement: 1,
  consent: 1,
})

const CONDITION_OPERATORS = new Set([
  'equals',
  'not_equals',
  'contains',
  'not_empty',
])

const STRUCTURED_SCOPES = new Set([
  'form_data',
  'acknowledgement',
  'consent',
  'exclude',
])

const normalizeString = (value) => String(value ?? '').trim()

const fail = (message) => {
  throw new Error(message)
}

const assertCount = (label, actual, expected) => {
  if (actual !== expected) {
    fail(`${label} tidak sesuai. Expected ${expected}, actual ${actual}.`)
  }
}

const duplicateValues = (values) => {
  const seen = new Set()
  const duplicates = new Set()

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value)
    seen.add(value)
  }

  return [...duplicates]
}

const sections = Array.isArray(manifest.sections)
  ? [...manifest.sections].sort(
    (first, second) => Number(first.sort_order) - Number(second.sort_order),
  )
  : []

const rawQuestions = Array.isArray(manifest.questions)
  ? [...manifest.questions]
  : []

const tool = manifest.tool || {}

if (normalizeString(tool.slug) !== TARGET_SLUG) {
  fail(`Slug manifest harus ${TARGET_SLUG}.`)
}

if (normalizeString(tool.status) !== 'draft') {
  fail('Status tool manifest harus draft.')
}

if (
  normalizeString(tool.structured_deidentification_policy_version) !== ''
) {
  fail('Versi deidentifikasi harus tetap string kosong.')
}

assertCount('Jumlah section', sections.length, EXPECTED.sections)
assertCount('Jumlah pertanyaan', rawQuestions.length, EXPECTED.questions)

const sectionKeys = sections.map(
  (section) => normalizeString(section.section_key),
)

const duplicatedSectionKeys = duplicateValues(sectionKeys)

if (duplicatedSectionKeys.length > 0) {
  fail(`section_key duplikat: ${duplicatedSectionKeys.join(', ')}`)
}

const sectionOrderByKey = new Map(
  sections.map((section) => [
    normalizeString(section.section_key),
    Number(section.sort_order),
  ]),
)

for (const question of rawQuestions) {
  const variableName = normalizeString(question.variable_name)
  const sectionKey = normalizeString(question.section_key)

  if (!sectionOrderByKey.has(sectionKey)) {
    fail(`section_key tidak ditemukan untuk ${variableName}: ${sectionKey}`)
  }
}

const questions = [...rawQuestions].sort((first, second) => {
  const firstSectionOrder = sectionOrderByKey.get(
    normalizeString(first.section_key),
  )
  const secondSectionOrder = sectionOrderByKey.get(
    normalizeString(second.section_key),
  )

  if (firstSectionOrder !== secondSectionOrder) {
    return firstSectionOrder - secondSectionOrder
  }

  return Number(first.sort_order) - Number(second.sort_order)
})

const variableNames = questions.map(
  (question) => normalizeString(question.variable_name),
)

const duplicatedVariableNames = duplicateValues(variableNames)

if (duplicatedVariableNames.length > 0) {
  fail(`variable_name duplikat: ${duplicatedVariableNames.join(', ')}`)
}

const questionByVariableName = new Map(
  questions.map((question) => {
    const sectionKey = normalizeString(question.section_key)

    return [
      normalizeString(question.variable_name),
      {
        question,
        sectionSortOrder: sectionOrderByKey.get(sectionKey),
        questionSortOrder: Number(question.sort_order),
      },
    ]
  }),
)

const isParentBeforeChild = (parentEntry, childEntry) => (
  parentEntry.sectionSortOrder < childEntry.sectionSortOrder
  || (
    parentEntry.sectionSortOrder === childEntry.sectionSortOrder
    && parentEntry.questionSortOrder < childEntry.questionSortOrder
  )
)

let optionCount = 0
let conditionCount = 0
let formDataCount = 0
let acknowledgementCount = 0
let consentCount = 0
const structuredPaths = []

for (const question of questions) {
  const variableName = normalizeString(question.variable_name)
  const sectionKey = normalizeString(question.section_key)
  const scope = normalizeString(question.structured_scope)
  const path = normalizeString(question.structured_path)
  const passValue = normalizeString(question.structured_pass_value)

  const options = Array.isArray(question.options)
    ? [...question.options].sort(
      (first, second) => Number(first.sort_order) - Number(second.sort_order),
    )
    : []

  const conditions = Array.isArray(question.conditions)
    ? [...question.conditions].sort(
      (first, second) => Number(first.sort_order) - Number(second.sort_order),
    )
    : []

  if (!sectionKeys.includes(sectionKey)) {
    fail(`section_key tidak ditemukan untuk ${variableName}: ${sectionKey}`)
  }

  if (!STRUCTURED_SCOPES.has(scope)) {
    fail(`structured_scope tidak valid pada ${variableName}: ${scope}`)
  }

  const optionValues = options.map(
    (option) => normalizeString(option.option_value),
  )

  if (optionValues.some((value) => !value)) {
    fail(`option_value kosong pada ${variableName}`)
  }

  const duplicatedOptionValues = duplicateValues(optionValues)

  if (duplicatedOptionValues.length > 0) {
    fail(
      `option_value duplikat pada ${variableName}: `
      + duplicatedOptionValues.join(', '),
    )
  }

  const conditionOrders = conditions.map(
    (condition) => Number(condition.sort_order ?? 0),
  )

  const duplicatedConditionOrders = duplicateValues(conditionOrders)

  if (duplicatedConditionOrders.length > 0) {
    fail(
      `sort_order condition duplikat pada ${variableName}: `
      + duplicatedConditionOrders.join(', '),
    )
  }

  optionCount += options.length
  conditionCount += conditions.length

  if (scope === 'form_data') {
    formDataCount += 1

    if (!path) {
      fail(`form_data tanpa structured_path: ${variableName}`)
    }

    if (passValue) {
      fail(`form_data mempunyai structured_pass_value: ${variableName}`)
    }

    structuredPaths.push(path)
  }

  if (scope === 'acknowledgement' || scope === 'consent') {
    if (scope === 'acknowledgement') acknowledgementCount += 1
    if (scope === 'consent') consentCount += 1

    if (path) {
      fail(`${scope} mempunyai structured_path: ${variableName}`)
    }

    if (!passValue || !optionValues.includes(passValue)) {
      fail(
        `structured_pass_value ${scope} tidak tersedia pada option: `
        + variableName,
      )
    }
  }

  if (scope === 'exclude' && (path || passValue)) {
    fail(`exclude harus tanpa structured_path/pass_value: ${variableName}`)
  }

  const childEntry = questionByVariableName.get(variableName)

  for (const condition of conditions) {
    const parentVariableName = normalizeString(
      condition.parent_variable_name,
    )
    const operator = normalizeString(condition.operator)
    const comparisonValue = normalizeString(condition.comparison_value)
    const parentEntry = questionByVariableName.get(parentVariableName)

    if (!parentEntry) {
      fail(
        `parent_variable_name tidak ditemukan untuk ${variableName}: `
        + parentVariableName,
      )
    }

    if (!isParentBeforeChild(parentEntry, childEntry)) {
      fail(
        `parent tidak muncul sebelum child: child=${variableName}; `
        + `parent=${parentVariableName}; `
        + `parent_section_order=${parentEntry.sectionSortOrder}; `
        + `parent_question_order=${parentEntry.questionSortOrder}; `
        + `child_section_order=${childEntry.sectionSortOrder}; `
        + `child_question_order=${childEntry.questionSortOrder}`,
      )
    }

    if (!CONDITION_OPERATORS.has(operator)) {
      fail(`operator condition tidak valid pada ${variableName}: ${operator}`)
    }

    if (operator === 'not_empty') {
      if (comparisonValue) {
        fail(
          `not_empty harus memakai comparison_value null pada ${variableName}`,
        )
      }

      continue
    }

    if (!comparisonValue) {
      fail(`comparison_value kosong pada ${variableName}`)
    }

    const parentOptionValues = (
      Array.isArray(parentEntry.question.options)
        ? parentEntry.question.options
        : []
    ).map((option) => normalizeString(option.option_value))

    if (!parentOptionValues.includes(comparisonValue)) {
      fail(
        `comparison_value tidak tersedia pada option parent: `
        + `${parentVariableName}.${comparisonValue} -> ${variableName}`,
      )
    }
  }
}

assertCount('Jumlah options', optionCount, EXPECTED.options)
assertCount('Jumlah conditions', conditionCount, EXPECTED.conditions)
assertCount('Jumlah form_data', formDataCount, EXPECTED.formData)

assertCount(
  'Jumlah structured paths',
  structuredPaths.length,
  EXPECTED.structuredPaths,
)

assertCount(
  'Jumlah acknowledgement',
  acknowledgementCount,
  EXPECTED.acknowledgement,
)

assertCount('Jumlah consent', consentCount, EXPECTED.consent)

const duplicatedStructuredPaths = duplicateValues(structuredPaths)

if (duplicatedStructuredPaths.length > 0) {
  fail(`structured_path duplikat: ${duplicatedStructuredPaths.join(', ')}`)
}

const ranking83 = questions.find(
  (question) => normalizeString(question.source_number) === '83',
)

if (
  !ranking83
  || normalizeString(ranking83.question_type) !== 'ranking'
  || Number(ranking83.min_selections) !== 5
  || Number(ranking83.max_selections) !== 5
) {
  fail('Ranking source_number 83 harus tetap min=5 dan max=5.')
}

const seedPayload = {
  tool: {
    title: String(tool.title ?? ''),
    slug: normalizeString(tool.slug),
    description: String(tool.description ?? ''),
    category: String(tool.category ?? ''),
    status: normalizeString(tool.status),
    prompt_template: String(tool.prompt_template ?? ''),
    submit_button_label: String(tool.submit_button_label ?? ''),
    result_title: String(tool.result_title ?? ''),
    copy_button_label: String(tool.copy_button_label ?? ''),
    survey_url: tool.survey_url ?? null,
    survey_cta: tool.survey_cta ?? null,
    meta_title: tool.meta_title ?? null,
    meta_description: tool.meta_description ?? null,
    display_mode: normalizeString(tool.display_mode),
    show_progress: tool.show_progress === true,
    previous_button_label: String(tool.previous_button_label ?? ''),
    next_button_label: String(tool.next_button_label ?? ''),
    structured_output_enabled: tool.structured_output_enabled === true,
    structured_schema_version: String(
      tool.structured_schema_version ?? '',
    ),
    structured_prompt_version: String(
      tool.structured_prompt_version ?? '',
    ),
    structured_validation_rules_version: String(
      tool.structured_validation_rules_version ?? '',
    ),
    structured_pipeline_version: String(
      tool.structured_pipeline_version ?? '',
    ),
    structured_deidentification_policy_version: String(
      tool.structured_deidentification_policy_version ?? '',
    ),
  },

  sections: sections.map((section) => ({
    section_key: normalizeString(section.section_key),
    title: String(section.title ?? ''),
    description: String(section.description ?? ''),
    sort_order: Number(section.sort_order),
  })),

  questions: questions.map((question) => ({
    section_key: normalizeString(question.section_key),
    variable_name: normalizeString(question.variable_name),
    label: String(question.label ?? ''),
    help_text: String(question.help_text ?? ''),
    placeholder: String(question.placeholder ?? ''),
    question_type: normalizeString(question.question_type),
    is_required: question.is_required === true,
    validation_type: question.validation_type ?? null,
    validation_min: question.validation_min ?? null,
    validation_max: question.validation_max ?? null,
    sort_order: Number(question.sort_order),
    min_selections: question.min_selections ?? null,
    max_selections: question.max_selections ?? null,
    conditional_mode: normalizeString(
      question.conditional_mode || 'all',
    ),
    structured_scope: normalizeString(question.structured_scope),
    structured_path: question.structured_path || null,
    structured_pass_value: question.structured_pass_value || null,

    options: [...(question.options || [])]
      .sort(
        (first, second) => (
          Number(first.sort_order) - Number(second.sort_order)
        ),
      )
      .map((option) => ({
        option_label: String(option.option_label ?? ''),
        option_value: String(option.option_value ?? ''),
        sort_order: Number(option.sort_order),
        is_exclusive: option.is_exclusive === true,
        group_label: String(option.group_label ?? ''),
        group_sort_order: Number(option.group_sort_order ?? 0),
      })),

    conditions: [...(question.conditions || [])]
      .sort(
        (first, second) => (
          Number(first.sort_order) - Number(second.sort_order)
        ),
      )
      .map((condition) => ({
        parent_variable_name: normalizeString(
          condition.parent_variable_name,
        ),
        operator: normalizeString(condition.operator),
        comparison_value: (
          normalizeString(condition.operator) === 'not_empty'
            ? null
            : String(condition.comparison_value ?? '')
        ),
        sort_order: Number(condition.sort_order ?? 0),
      })),
  })),
}

const payloadJson = JSON.stringify(seedPayload, null, 2)

if (payloadJson.includes(PAYLOAD_DELIMITER)) {
  fail(
    `Delimiter ${PAYLOAD_DELIMITER} ditemukan di payload. `
    + 'Pilih tag dollar-quote lain.',
  )
}

const sql = `-- =====================================================
-- GreenroomID H41 - Seed Penelusuran Judul Penelitian Mahasiswa v1.6
-- Data seed idempotent untuk satu tool draft.
--
-- Rerun pada tool draft mempertahankan tool_id dan mengganti seluruh
-- konfigurasi child: section, question, option, dan condition.
-- Tool dengan slug sama tetapi status selain draft selalu diblokir.
--
-- Dihasilkan secara deterministik oleh:
-- scripts/generate-research-title-tool-seed-v1.6.mjs
--
-- H41 hanya seed data: tidak membuat/mengubah schema permanen, tidak
-- menjalankan HTTP request, dan tidak memicu publish atau deployment.
-- =====================================================

BEGIN;

DO $seed_research_title_v16$
DECLARE
  v_payload jsonb := ${PAYLOAD_DELIMITER}
${payloadJson}
${PAYLOAD_DELIMITER}::jsonb;

  v_slug text := 'penelusuran-judul-penelitian-mahasiswa';
  v_tool_id uuid;
  v_existing_status text;
  v_spec record;
  v_missing_columns text[];
  v_stats record;
BEGIN
  IF v_payload #>> '{tool,slug}' IS DISTINCT FROM v_slug THEN
    RAISE EXCEPTION 'Seed dibatalkan: slug payload tidak sesuai target.';
  END IF;

  IF v_payload #>> '{tool,status}' IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Seed dibatalkan: status payload harus draft.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('greenroomid:prompt-tool-seed:' || v_slug, 0)
  );

  -- Pre-flight schema H37, H39, dan H40.
  FOR v_spec IN
    SELECT *
    FROM (
      VALUES
        (
          'H37',
          'supabase/h37-prompt-tools.sql',
          'prompt_tools',
          ARRAY[
            'id',
            'title',
            'slug',
            'description',
            'category',
            'status',
            'prompt_template',
            'submit_button_label',
            'result_title',
            'copy_button_label',
            'survey_url',
            'survey_cta',
            'meta_title',
            'meta_description'
          ]::text[]
        ),
        (
          'H37',
          'supabase/h37-prompt-tools.sql',
          'prompt_tool_sections',
          ARRAY[
            'id',
            'tool_id',
            'title',
            'description',
            'sort_order'
          ]::text[]
        ),
        (
          'H37',
          'supabase/h37-prompt-tools.sql',
          'prompt_tool_questions',
          ARRAY[
            'id',
            'tool_id',
            'section_id',
            'variable_name',
            'label',
            'help_text',
            'placeholder',
            'question_type',
            'is_required',
            'validation_type',
            'validation_min',
            'validation_max',
            'sort_order',
            'conditional_parent_question_id',
            'conditional_operator',
            'conditional_value'
          ]::text[]
        ),
        (
          'H37',
          'supabase/h37-prompt-tools.sql',
          'prompt_tool_options',
          ARRAY[
            'id',
            'question_id',
            'option_label',
            'option_value',
            'sort_order'
          ]::text[]
        ),
        (
          'H39',
          'supabase/h39-prompt-tools-advanced-builder.sql',
          'prompt_tools',
          ARRAY[
            'display_mode',
            'show_progress',
            'previous_button_label',
            'next_button_label'
          ]::text[]
        ),
        (
          'H39',
          'supabase/h39-prompt-tools-advanced-builder.sql',
          'prompt_tool_questions',
          ARRAY[
            'min_selections',
            'max_selections',
            'conditional_mode'
          ]::text[]
        ),
        (
          'H39',
          'supabase/h39-prompt-tools-advanced-builder.sql',
          'prompt_tool_options',
          ARRAY[
            'is_exclusive',
            'group_label',
            'group_sort_order'
          ]::text[]
        ),
        (
          'H39',
          'supabase/h39-prompt-tools-advanced-builder.sql',
          'prompt_tool_question_conditions',
          ARRAY[
            'id',
            'question_id',
            'parent_question_id',
            'operator',
            'comparison_value',
            'sort_order'
          ]::text[]
        ),
        (
          'H40',
          'supabase/h40-prompt-tools-structured-output.sql',
          'prompt_tools',
          ARRAY[
            'structured_output_enabled',
            'structured_schema_version',
            'structured_prompt_version',
            'structured_validation_rules_version',
            'structured_pipeline_version',
            'structured_deidentification_policy_version'
          ]::text[]
        ),
        (
          'H40',
          'supabase/h40-prompt-tools-structured-output.sql',
          'prompt_tool_questions',
          ARRAY[
            'structured_scope',
            'structured_path',
            'structured_pass_value'
          ]::text[]
        )
    ) AS required(
      migration_name,
      migration_file,
      table_name,
      column_names
    )
  LOOP
    IF to_regclass('public.' || v_spec.table_name) IS NULL THEN
      RAISE EXCEPTION
        'Pre-flight % gagal: public.% tidak ditemukan. Kemungkinan % belum diterapkan.',
        v_spec.migration_name,
        v_spec.table_name,
        v_spec.migration_file;
    END IF;

    SELECT array_agg(column_name ORDER BY column_name)
    INTO v_missing_columns
    FROM unnest(v_spec.column_names)
      AS required_column(column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns actual
      WHERE actual.table_schema = 'public'
        AND actual.table_name = v_spec.table_name
        AND actual.column_name = required_column.column_name
    );

    IF cardinality(v_missing_columns) > 0 THEN
      RAISE EXCEPTION
        'Pre-flight % gagal: kolom public.% belum lengkap: %. Kemungkinan % belum diterapkan.',
        v_spec.migration_name,
        v_spec.table_name,
        array_to_string(v_missing_columns, ', '),
        v_spec.migration_file;
    END IF;
  END LOOP;

  FOR v_spec IN
    SELECT *
    FROM (
      VALUES
        (
          'H37',
          'supabase/h37-prompt-tools.sql',
          'prompt_tool_questions',
          'validate_prompt_tool_question_refs_trigger'
        ),
        (
          'H39',
          'supabase/h39-prompt-tools-advanced-builder.sql',
          'prompt_tool_question_conditions',
          'validate_prompt_tool_question_condition_trigger'
        ),
        (
          'H40',
          'supabase/h40-prompt-tools-structured-output.sql',
          'prompt_tool_questions',
          'normalize_prompt_tool_question_structured_mapping_trigger'
        ),
        (
          'H40',
          'supabase/h40-prompt-tools-structured-output.sql',
          'prompt_tool_options',
          'protect_prompt_tool_structured_pass_option_delete_trigger'
        ),
        (
          'H40',
          'supabase/h40-prompt-tools-structured-output.sql',
          'prompt_tool_options',
          'protect_prompt_tool_structured_pass_option_update_trigger'
        )
    ) AS required(
      migration_name,
      migration_file,
      table_name,
      trigger_name
    )
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger trigger_row
      JOIN pg_class table_row
        ON table_row.oid = trigger_row.tgrelid
      JOIN pg_namespace schema_row
        ON schema_row.oid = table_row.relnamespace
      WHERE schema_row.nspname = 'public'
        AND table_row.relname = v_spec.table_name
        AND trigger_row.tgname = v_spec.trigger_name
        AND NOT trigger_row.tgisinternal
    ) THEN
      RAISE EXCEPTION
        'Pre-flight % gagal: trigger % pada public.% tidak ditemukan. Kemungkinan % belum diterapkan lengkap.',
        v_spec.migration_name,
        v_spec.trigger_name,
        v_spec.table_name,
        v_spec.migration_file;
    END IF;
  END LOOP;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_row
    JOIN pg_class table_row
      ON table_row.oid = index_row.indrelid
    JOIN pg_namespace schema_row
      ON schema_row.oid = table_row.relnamespace
    JOIN pg_attribute attribute_row
      ON attribute_row.attrelid = table_row.oid
      AND attribute_row.attnum = index_row.indkey[0]
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'prompt_tools'
      AND attribute_row.attname = 'slug'
      AND NOT attribute_row.attisdropped
      AND index_row.indisunique
      AND index_row.indisvalid
      AND index_row.indisready
      AND index_row.indislive
      AND index_row.indnkeyatts = 1
      AND index_row.indpred IS NULL
      AND index_row.indexprs IS NULL
  ) THEN
    RAISE EXCEPTION
      'Pre-flight H37 gagal: unique constraint atau unique index untuk public.prompt_tools.slug tidak ditemukan.';
  END IF;

  SELECT id, status
  INTO v_tool_id, v_existing_status
  FROM public.prompt_tools
  WHERE slug = v_slug
  FOR UPDATE;

  IF FOUND AND v_existing_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION
      'Seed dibatalkan karena tool dengan slug tersebut tidak berstatus draft.';
  END IF;

  IF v_tool_id IS NULL THEN
    INSERT INTO public.prompt_tools (
      title,
      slug,
      description,
      category,
      status,
      prompt_template,
      submit_button_label,
      result_title,
      copy_button_label,
      survey_url,
      survey_cta,
      meta_title,
      meta_description,
      display_mode,
      show_progress,
      previous_button_label,
      next_button_label,
      structured_output_enabled,
      structured_schema_version,
      structured_prompt_version,
      structured_validation_rules_version,
      structured_pipeline_version,
      structured_deidentification_policy_version
    )
    VALUES (
      v_payload #>> '{tool,title}',
      v_slug,
      v_payload #>> '{tool,description}',
      v_payload #>> '{tool,category}',
      'draft',
      v_payload #>> '{tool,prompt_template}',
      v_payload #>> '{tool,submit_button_label}',
      v_payload #>> '{tool,result_title}',
      v_payload #>> '{tool,copy_button_label}',
      NULLIF(v_payload #>> '{tool,survey_url}', ''),
      NULLIF(v_payload #>> '{tool,survey_cta}', ''),
      NULLIF(v_payload #>> '{tool,meta_title}', ''),
      NULLIF(v_payload #>> '{tool,meta_description}', ''),
      v_payload #>> '{tool,display_mode}',
      COALESCE(
        (v_payload #>> '{tool,show_progress}')::boolean,
        false
      ),
      v_payload #>> '{tool,previous_button_label}',
      v_payload #>> '{tool,next_button_label}',
      COALESCE(
        (v_payload #>> '{tool,structured_output_enabled}')::boolean,
        false
      ),
      v_payload #>> '{tool,structured_schema_version}',
      v_payload #>> '{tool,structured_prompt_version}',
      v_payload #>> '{tool,structured_validation_rules_version}',
      v_payload #>> '{tool,structured_pipeline_version}',
      v_payload #>> '{tool,structured_deidentification_policy_version}'
    )
    RETURNING id INTO v_tool_id;
  ELSE
    UPDATE public.prompt_tools
    SET
      title = v_payload #>> '{tool,title}',
      description = v_payload #>> '{tool,description}',
      category = v_payload #>> '{tool,category}',
      status = 'draft',
      prompt_template = v_payload #>> '{tool,prompt_template}',
      submit_button_label = v_payload #>> '{tool,submit_button_label}',
      result_title = v_payload #>> '{tool,result_title}',
      copy_button_label = v_payload #>> '{tool,copy_button_label}',
      survey_url = NULLIF(v_payload #>> '{tool,survey_url}', ''),
      survey_cta = NULLIF(v_payload #>> '{tool,survey_cta}', ''),
      meta_title = NULLIF(v_payload #>> '{tool,meta_title}', ''),
      meta_description = NULLIF(v_payload #>> '{tool,meta_description}', ''),
      display_mode = v_payload #>> '{tool,display_mode}',
      show_progress = COALESCE(
        (v_payload #>> '{tool,show_progress}')::boolean,
        false
      ),
      previous_button_label =
        v_payload #>> '{tool,previous_button_label}',
      next_button_label =
        v_payload #>> '{tool,next_button_label}',
      structured_output_enabled = COALESCE(
        (v_payload #>> '{tool,structured_output_enabled}')::boolean,
        false
      ),
      structured_schema_version =
        v_payload #>> '{tool,structured_schema_version}',
      structured_prompt_version =
        v_payload #>> '{tool,structured_prompt_version}',
      structured_validation_rules_version =
        v_payload #>> '{tool,structured_validation_rules_version}',
      structured_pipeline_version =
        v_payload #>> '{tool,structured_pipeline_version}',
      structured_deidentification_policy_version =
        v_payload #>> '{tool,structured_deidentification_policy_version}'
    WHERE id = v_tool_id;
  END IF;

  -- Netralisasi mapping sebelum option dihapus karena trigger H40.
  UPDATE public.prompt_tool_questions
  SET
    structured_scope = 'exclude',
    structured_path = NULL,
    structured_pass_value = NULL
  WHERE tool_id = v_tool_id;

  DELETE FROM public.prompt_tool_question_conditions condition_row
  USING public.prompt_tool_questions question_row
  WHERE condition_row.question_id = question_row.id
    AND question_row.tool_id = v_tool_id;

  DELETE FROM public.prompt_tool_options option_row
  USING public.prompt_tool_questions question_row
  WHERE option_row.question_id = question_row.id
    AND question_row.tool_id = v_tool_id;

  DELETE FROM public.prompt_tool_questions
  WHERE tool_id = v_tool_id;

  DELETE FROM public.prompt_tool_sections
  WHERE tool_id = v_tool_id;

  CREATE TEMP TABLE tmp_research_title_v16_section_map (
    section_key text PRIMARY KEY,
    section_id uuid NOT NULL DEFAULT gen_random_uuid(),
    section_data jsonb NOT NULL,
    sort_order integer NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_research_title_v16_question_map (
    variable_name text PRIMARY KEY,
    question_id uuid NOT NULL DEFAULT gen_random_uuid(),
    tool_id uuid NOT NULL,
    section_id uuid NOT NULL,
    section_sort_order integer NOT NULL,
    question_sort_order integer NOT NULL,
    question_data jsonb NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_research_title_v16_section_map (
    section_key,
    section_data,
    sort_order
  )
  SELECT
    section_data->>'section_key',
    section_data,
    (section_data->>'sort_order')::integer
  FROM jsonb_array_elements(v_payload->'sections')
    WITH ORDINALITY AS section_row(section_data, position)
  ORDER BY position;

  INSERT INTO public.prompt_tool_sections (
    id,
    tool_id,
    title,
    description,
    sort_order
  )
  SELECT
    section_id,
    v_tool_id,
    section_data->>'title',
    COALESCE(section_data->>'description', ''),
    sort_order
  FROM tmp_research_title_v16_section_map
  ORDER BY sort_order;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_payload->'questions')
      AS question_row(question_data)
    LEFT JOIN tmp_research_title_v16_section_map section_row
      ON section_row.section_key =
        question_row.question_data->>'section_key'
    WHERE section_row.section_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Seed gagal: terdapat section_key pertanyaan yang tidak ditemukan.';
  END IF;

  INSERT INTO tmp_research_title_v16_question_map (
    variable_name,
    tool_id,
    section_id,
    section_sort_order,
    question_sort_order,
    question_data
  )
  SELECT
    question_row.question_data->>'variable_name',
    v_tool_id,
    section_row.section_id,
    section_row.sort_order,
    (question_row.question_data->>'sort_order')::integer,
    question_row.question_data
  FROM jsonb_array_elements(v_payload->'questions')
    WITH ORDINALITY AS question_row(question_data, position)
  JOIN tmp_research_title_v16_section_map section_row
    ON section_row.section_key =
      question_row.question_data->>'section_key'
  ORDER BY
    section_row.sort_order,
    (question_row.question_data->>'sort_order')::integer,
    question_row.position;

  IF EXISTS (
    SELECT 1
    FROM tmp_research_title_v16_question_map child
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(child.question_data->'conditions', '[]'::jsonb)
    ) AS condition_row(condition_data)
    LEFT JOIN tmp_research_title_v16_question_map parent
      ON parent.variable_name =
        condition_row.condition_data->>'parent_variable_name'
    WHERE parent.question_id IS NULL
  ) THEN
    RAISE EXCEPTION
      'Seed gagal: terdapat parent_variable_name yang tidak ditemukan.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_research_title_v16_question_map child
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(child.question_data->'conditions', '[]'::jsonb)
    ) AS condition_row(condition_data)
    JOIN tmp_research_title_v16_question_map parent
      ON parent.variable_name =
        condition_row.condition_data->>'parent_variable_name'
    WHERE child.tool_id IS DISTINCT FROM v_tool_id
      OR parent.tool_id IS DISTINCT FROM child.tool_id
  ) THEN
    RAISE EXCEPTION
      'Seed gagal: parent dan child condition harus berasal dari tool yang sama.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_research_title_v16_question_map child
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(child.question_data->'conditions', '[]'::jsonb)
    ) AS condition_row(condition_data)
    JOIN tmp_research_title_v16_question_map parent
      ON parent.variable_name =
        condition_row.condition_data->>'parent_variable_name'
    WHERE parent.section_sort_order > child.section_sort_order
      OR (
        parent.section_sort_order = child.section_sort_order
        AND parent.question_sort_order >= child.question_sort_order
      )
  ) THEN
    RAISE EXCEPTION
      'Seed gagal: terdapat parent condition yang tidak muncul sebelum child berdasarkan urutan section dan pertanyaan.';
  END IF;

  INSERT INTO public.prompt_tool_questions (
    id,
    tool_id,
    section_id,
    variable_name,
    label,
    help_text,
    placeholder,
    question_type,
    is_required,
    validation_type,
    validation_min,
    validation_max,
    sort_order,
    conditional_parent_question_id,
    conditional_operator,
    conditional_value,
    min_selections,
    max_selections,
    conditional_mode,
    structured_scope,
    structured_path,
    structured_pass_value
  )
  SELECT
    question_row.question_id,
    v_tool_id,
    question_row.section_id,
    question_row.variable_name,
    question_row.question_data->>'label',
    COALESCE(question_row.question_data->>'help_text', ''),
    COALESCE(question_row.question_data->>'placeholder', ''),
    question_row.question_data->>'question_type',
    COALESCE(
      (question_row.question_data->>'is_required')::boolean,
      false
    ),
    NULLIF(question_row.question_data->>'validation_type', ''),
    (question_row.question_data->>'validation_min')::numeric,
    (question_row.question_data->>'validation_max')::numeric,
    question_row.question_sort_order,
    NULL,
    NULL,
    NULL,
    (question_row.question_data->>'min_selections')::integer,
    (question_row.question_data->>'max_selections')::integer,
    COALESCE(
      question_row.question_data->>'conditional_mode',
      'all'
    ),
    question_row.question_data->>'structured_scope',
    NULLIF(question_row.question_data->>'structured_path', ''),
    NULLIF(
      question_row.question_data->>'structured_pass_value',
      ''
    )
  FROM tmp_research_title_v16_question_map question_row
  WHERE question_row.tool_id = v_tool_id
  ORDER BY
    question_row.section_sort_order,
    question_row.question_sort_order,
    question_row.variable_name;

  INSERT INTO public.prompt_tool_options (
    question_id,
    option_label,
    option_value,
    sort_order,
    is_exclusive,
    group_label,
    group_sort_order
  )
  SELECT
    question_row.question_id,
    option_row.option_data->>'option_label',
    option_row.option_data->>'option_value',
    (option_row.option_data->>'sort_order')::integer,
    COALESCE(
      (option_row.option_data->>'is_exclusive')::boolean,
      false
    ),
    COALESCE(option_row.option_data->>'group_label', ''),
    COALESCE(
      (option_row.option_data->>'group_sort_order')::integer,
      0
    )
  FROM tmp_research_title_v16_question_map question_row
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(question_row.question_data->'options', '[]'::jsonb)
  ) WITH ORDINALITY AS option_row(option_data, position)
  ORDER BY
    question_row.section_sort_order,
    question_row.question_sort_order,
    question_row.variable_name,
    option_row.position;

  INSERT INTO public.prompt_tool_question_conditions (
    question_id,
    parent_question_id,
    operator,
    comparison_value,
    sort_order
  )
  SELECT
    child.question_id,
    parent.question_id,
    condition_row.condition_data->>'operator',
    CASE
      WHEN condition_row.condition_data->>'operator' = 'not_empty'
        THEN NULL
      ELSE condition_row.condition_data->>'comparison_value'
    END,
    COALESCE(
      (condition_row.condition_data->>'sort_order')::integer,
      0
    )
  FROM tmp_research_title_v16_question_map child
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(child.question_data->'conditions', '[]'::jsonb)
  ) WITH ORDINALITY AS condition_row(condition_data, position)
  JOIN tmp_research_title_v16_question_map parent
    ON parent.variable_name =
      condition_row.condition_data->>'parent_variable_name'
    AND parent.tool_id = child.tool_id
  WHERE child.tool_id = v_tool_id
    AND (
      parent.section_sort_order < child.section_sort_order
      OR (
        parent.section_sort_order = child.section_sort_order
        AND parent.question_sort_order < child.question_sort_order
      )
    )
  ORDER BY
    child.section_sort_order,
    child.question_sort_order,
    child.variable_name,
    condition_row.position;

  -- Mirror condition pertama ke conditional legacy.
  WITH first_condition AS (
    SELECT DISTINCT ON (child.question_id)
      child.question_id,
      parent.question_id AS parent_question_id,
      condition_row.condition_data->>'operator' AS operator,
      CASE
        WHEN condition_row.condition_data->>'operator' = 'not_empty'
          THEN NULL
        ELSE condition_row.condition_data->>'comparison_value'
      END AS comparison_value
    FROM tmp_research_title_v16_question_map child
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(child.question_data->'conditions', '[]'::jsonb)
    ) WITH ORDINALITY AS condition_row(condition_data, position)
    JOIN tmp_research_title_v16_question_map parent
      ON parent.variable_name =
        condition_row.condition_data->>'parent_variable_name'
      AND parent.tool_id = child.tool_id
    WHERE child.tool_id = v_tool_id
    ORDER BY child.question_id, condition_row.position
  )
  UPDATE public.prompt_tool_questions question_row
  SET
    conditional_parent_question_id =
      first_condition.parent_question_id,
    conditional_operator = first_condition.operator,
    conditional_value = first_condition.comparison_value
  FROM first_condition
  WHERE question_row.id = first_condition.question_id;

  -- Validasi akhir; exception menggagalkan seluruh transaction.
  SELECT
    (
      SELECT count(*)
      FROM public.prompt_tools
      WHERE slug = v_slug
    ) AS tool_count,
    (
      SELECT count(*)
      FROM public.prompt_tools
      WHERE id = v_tool_id
        AND slug = v_slug
        AND status = 'draft'
    ) AS draft_tool_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_sections
      WHERE tool_id = v_tool_id
    ) AS section_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions
      WHERE tool_id = v_tool_id
    ) AS question_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_options option_row
      JOIN public.prompt_tool_questions question_row
        ON question_row.id = option_row.question_id
      WHERE question_row.tool_id = v_tool_id
    ) AS option_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_question_conditions condition_row
      JOIN public.prompt_tool_questions question_row
        ON question_row.id = condition_row.question_id
      WHERE question_row.tool_id = v_tool_id
    ) AS condition_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions
      WHERE tool_id = v_tool_id
        AND structured_scope = 'form_data'
    ) AS form_data_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions
      WHERE tool_id = v_tool_id
        AND structured_scope = 'form_data'
        AND structured_path IS NOT NULL
    ) AS structured_path_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions
      WHERE tool_id = v_tool_id
        AND structured_scope = 'acknowledgement'
    ) AS acknowledgement_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions
      WHERE tool_id = v_tool_id
        AND structured_scope = 'consent'
    ) AS consent_count,
    (
      SELECT count(*)
      FROM (
        SELECT variable_name
        FROM public.prompt_tool_questions
        WHERE tool_id = v_tool_id
        GROUP BY variable_name
        HAVING count(*) > 1
      ) duplicate_variable
    ) AS duplicate_variable_count,
    (
      SELECT count(*)
      FROM (
        SELECT structured_path
        FROM public.prompt_tool_questions
        WHERE tool_id = v_tool_id
          AND structured_scope = 'form_data'
          AND structured_path IS NOT NULL
        GROUP BY structured_path
        HAVING count(*) > 1
      ) duplicate_path
    ) AS duplicate_path_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_question_conditions condition_row
      JOIN public.prompt_tool_questions child
        ON child.id = condition_row.question_id
      LEFT JOIN public.prompt_tool_questions parent
        ON parent.id = condition_row.parent_question_id
      WHERE child.tool_id = v_tool_id
        AND (
          parent.id IS NULL
          OR parent.tool_id IS DISTINCT FROM v_tool_id
        )
    ) AS missing_parent_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_question_conditions condition_row
      JOIN public.prompt_tool_questions child
        ON child.id = condition_row.question_id
      JOIN public.prompt_tool_sections child_section
        ON child_section.id = child.section_id
      JOIN public.prompt_tool_questions parent
        ON parent.id = condition_row.parent_question_id
      JOIN public.prompt_tool_sections parent_section
        ON parent_section.id = parent.section_id
      WHERE child.tool_id = v_tool_id
        AND parent.tool_id = v_tool_id
        AND child_section.tool_id = v_tool_id
        AND parent_section.tool_id = v_tool_id
        AND (
          parent_section.sort_order > child_section.sort_order
          OR (
            parent_section.sort_order = child_section.sort_order
            AND parent.sort_order >= child.sort_order
          )
        )
    ) AS parent_after_child_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions question_row
      WHERE question_row.tool_id = v_tool_id
        AND question_row.structured_scope IN (
          'acknowledgement',
          'consent'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.prompt_tool_options option_row
          WHERE option_row.question_id = question_row.id
            AND option_row.option_value =
              question_row.structured_pass_value
        )
    ) AS missing_pass_option_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_question_conditions condition_row
      JOIN public.prompt_tool_questions child
        ON child.id = condition_row.question_id
      JOIN public.prompt_tool_questions parent
        ON parent.id = condition_row.parent_question_id
      WHERE child.tool_id = v_tool_id
        AND condition_row.operator IN (
          'equals',
          'not_equals',
          'contains'
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.prompt_tool_options parent_option
          WHERE parent_option.question_id = parent.id
            AND parent_option.option_value =
              condition_row.comparison_value
        )
    ) AS invalid_comparison_count,
    (
      WITH first_condition AS (
        SELECT DISTINCT ON (condition_row.question_id)
          condition_row.question_id,
          condition_row.parent_question_id,
          condition_row.operator,
          condition_row.comparison_value
        FROM public.prompt_tool_question_conditions condition_row
        JOIN public.prompt_tool_questions child
          ON child.id = condition_row.question_id
        WHERE child.tool_id = v_tool_id
        ORDER BY
          condition_row.question_id,
          condition_row.sort_order
      )
      SELECT count(*)
      FROM public.prompt_tool_questions question_row
      LEFT JOIN first_condition
        ON first_condition.question_id = question_row.id
      WHERE question_row.tool_id = v_tool_id
        AND (
          (
            first_condition.question_id IS NOT NULL
            AND (
              question_row.conditional_parent_question_id
                IS DISTINCT FROM
                first_condition.parent_question_id
              OR question_row.conditional_operator
                IS DISTINCT FROM first_condition.operator
              OR question_row.conditional_value
                IS DISTINCT FROM first_condition.comparison_value
            )
          )
          OR
          (
            first_condition.question_id IS NULL
            AND (
              question_row.conditional_parent_question_id IS NOT NULL
              OR question_row.conditional_operator IS NOT NULL
              OR question_row.conditional_value IS NOT NULL
            )
          )
        )
    ) AS legacy_mismatch_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions
      WHERE tool_id = v_tool_id
        AND variable_name = 'priority_ranking'
        AND question_type = 'ranking'
        AND min_selections = 5
        AND max_selections = 5
    ) AS ranking_83_valid_count
  INTO v_stats;

  IF v_stats.tool_count <> 1 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: tool_count expected 1, actual %.',
      v_stats.tool_count;
  ELSIF v_stats.draft_tool_count <> 1 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: status tool harus draft.';
  ELSIF v_stats.section_count <> 10 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: section_count expected 10, actual %.',
      v_stats.section_count;
  ELSIF v_stats.question_count <> 120 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: question_count expected 120, actual %.',
      v_stats.question_count;
  ELSIF v_stats.option_count <> 658 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: option_count expected 658, actual %.',
      v_stats.option_count;
  ELSIF v_stats.condition_count <> 330 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: condition_count expected 330, actual %.',
      v_stats.condition_count;
  ELSIF v_stats.form_data_count <> 118 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: form_data_count expected 118, actual %.',
      v_stats.form_data_count;
  ELSIF v_stats.structured_path_count <> 118 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: structured_path_count expected 118, actual %.',
      v_stats.structured_path_count;
  ELSIF v_stats.acknowledgement_count <> 1 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: acknowledgement_count expected 1, actual %.',
      v_stats.acknowledgement_count;
  ELSIF v_stats.consent_count <> 1 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: consent_count expected 1, actual %.',
      v_stats.consent_count;
  ELSIF v_stats.duplicate_variable_count <> 0 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: duplicate variable_name actual %.',
      v_stats.duplicate_variable_count;
  ELSIF v_stats.duplicate_path_count <> 0 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: duplicate structured_path actual %.',
      v_stats.duplicate_path_count;
  ELSIF v_stats.missing_parent_count <> 0 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: parent condition tidak ditemukan actual %.',
      v_stats.missing_parent_count;
  ELSIF v_stats.parent_after_child_count <> 0 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: parent muncul setelah child actual %.',
      v_stats.parent_after_child_count;
  ELSIF v_stats.missing_pass_option_count <> 0 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: structured_pass_value tanpa option actual %.',
      v_stats.missing_pass_option_count;
  ELSIF v_stats.invalid_comparison_count <> 0 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: comparison_value parent invalid actual %.',
      v_stats.invalid_comparison_count;
  ELSIF v_stats.legacy_mismatch_count <> 0 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: legacy condition mirror mismatch actual %.',
      v_stats.legacy_mismatch_count;
  ELSIF v_stats.ranking_83_valid_count <> 1 THEN
    RAISE EXCEPTION
      'Validasi akhir gagal: ranking 83 harus min=5 dan max=5.';
  END IF;
END;
$seed_research_title_v16$;

COMMIT;

SELECT
  tool_row.id AS tool_id,
  tool_row.slug,
  tool_row.status,
  (
    SELECT count(*)
    FROM public.prompt_tool_sections section_row
    WHERE section_row.tool_id = tool_row.id
  ) AS section_count,
  (
    SELECT count(*)
    FROM public.prompt_tool_questions question_row
    WHERE question_row.tool_id = tool_row.id
  ) AS question_count,
  (
    SELECT count(*)
    FROM public.prompt_tool_options option_row
    JOIN public.prompt_tool_questions question_row
      ON question_row.id = option_row.question_id
    WHERE question_row.tool_id = tool_row.id
  ) AS option_count,
  (
    SELECT count(*)
    FROM public.prompt_tool_question_conditions condition_row
    JOIN public.prompt_tool_questions question_row
      ON question_row.id = condition_row.question_id
    WHERE question_row.tool_id = tool_row.id
  ) AS condition_count,
  (
    SELECT count(*)
    FROM public.prompt_tool_questions question_row
    WHERE question_row.tool_id = tool_row.id
      AND question_row.structured_scope = 'form_data'
      AND question_row.structured_path IS NOT NULL
  ) AS structured_path_count,
  (
    SELECT count(*)
    FROM public.prompt_tool_questions question_row
    WHERE question_row.tool_id = tool_row.id
      AND question_row.structured_scope = 'acknowledgement'
  ) AS acknowledgement_count,
  (
    SELECT count(*)
    FROM public.prompt_tool_questions question_row
    WHERE question_row.tool_id = tool_row.id
      AND question_row.structured_scope = 'consent'
  ) AS consent_count
FROM public.prompt_tools tool_row
WHERE tool_row.slug = 'penelusuran-judul-penelitian-mahasiswa';
`

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const outputPath = resolve(scriptDirectory, OUTPUT_FILE)

writeFileSync(outputPath, sql, 'utf8')

console.log('Seed SQL berhasil dibuat.')
console.log('- Output: supabase/h41-seed-research-title-tool-v1.6.sql')
console.log(`- Sections: ${EXPECTED.sections}`)
console.log(`- Questions: ${EXPECTED.questions}`)
console.log(`- Options: ${EXPECTED.options}`)
console.log(`- Conditions: ${EXPECTED.conditions}`)
console.log(`- Structured paths: ${EXPECTED.structuredPaths}`)