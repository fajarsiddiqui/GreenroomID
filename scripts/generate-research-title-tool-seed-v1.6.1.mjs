import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import manifest from './data/research-title-tool-v1.6.1.mjs'

const TARGET_SLUG = 'penelusuran-judul-penelitian-mahasiswa'
const OUTPUT_FILE = '../supabase/h42-seed-research-title-tool-beginner-first-v1.6.1.sql'
const VALIDATOR_FILE = 'validate-research-title-tool-v1.6.1.mjs'
const PAYLOAD_TAG = 'research_title_v161'
const PAYLOAD_DELIMITER = `$${PAYLOAD_TAG}$`
const LEGACY_PATH_TAG = 'research_title_v16_paths'
const LEGACY_PATH_DELIMITER = `$${LEGACY_PATH_TAG}$`

const EXPECTED = Object.freeze({
  sections: 10,
  questions: 124,
  options: 676,
  conditions: 131,
  formData: 122,
  structuredPaths: 122,
  acknowledgement: 1,
  consent: 1,
})

const ROUTER_PATHS = Object.freeze({
  may_collect_data_from_people: 'data_access.may_collect_data_from_people',
  may_use_documents_or_content: 'data_access.may_use_documents_or_content',
  may_experiment_or_develop: 'problem_and_goal.may_experiment_or_develop',
  knows_research_method: 'method_and_skills.method_knowledge_status',
})

const ROUTER_OPTION_VALUES = Object.freeze({
  may_collect_data_from_people: ['ya', 'tidak', 'belum_yakin'],
  may_use_documents_or_content: ['ya', 'tidak', 'belum_yakin'],
  may_experiment_or_develop: ['ya', 'tidak', 'belum_yakin'],
  knows_research_method: ['sudah_tahu', 'punya_gambaran', 'belum_tahu'],
})

const SUPPORTED_QUESTION_TYPES = new Set([
  'short_text',
  'paragraph',
  'number',
  'email',
  'phone',
  'date',
  'single_choice',
  'dropdown',
  'checkbox',
  'ranking',
])

const CHOICE_TYPES = new Set([
  'single_choice',
  'dropdown',
  'checkbox',
  'ranking',
])

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

const assertExactValues = (label, actualValues, expectedValues) => {
  const actual = [...actualValues].sort()
  const expected = [...expectedValues].sort()

  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(
      `${label} tidak sesuai. Expected ${expected.join(', ')}; `
      + `actual ${actual.join(', ')}.`,
    )
  }
}

const scriptDirectory = dirname(fileURLToPath(import.meta.url))
const validatorPath = resolve(scriptDirectory, VALIDATOR_FILE)
let validatorOutput = ''

try {
  validatorOutput = execFileSync(
    process.execPath,
    [validatorPath],
    { encoding: 'utf8' },
  )
} catch (error) {
  const output = [error.stdout, error.stderr]
    .filter(Boolean)
    .map(String)
    .join('\n')
  fail(`Validator v1.6.1 gagal.\n${output}`)
}

for (const expectedLine of [
  'JT-4C.4 validator v1.6.1',
  'Rows: 124',
  'Options: 676',
  'Conditions: 131',
  'Structured paths: 122',
  'Empty state: 14',
  'Technical children visible on empty state: 0',
  'Warnings: 11',
  'Errors: 0',
]) {
  if (!validatorOutput.includes(expectedLine)) {
    fail(`Output validator tidak memuat identitas final: ${expectedLine}`)
  }
}

const tool = manifest.tool || {}
const sections = Array.isArray(manifest.sections)
  ? [...manifest.sections].sort(
    (first, second) => Number(first.sort_order) - Number(second.sort_order),
  )
  : []
const rawQuestions = Array.isArray(manifest.questions)
  ? [...manifest.questions]
  : []

if (normalizeString(tool.slug) !== TARGET_SLUG) {
  fail(`Slug manifest harus ${TARGET_SLUG}.`)
}

if (normalizeString(tool.status) !== 'draft') {
  fail('Status tool manifest harus draft.')
}

const expectedVersions = {
  structured_schema_version: '1.6.1',
  structured_prompt_version: '1.6.1',
  structured_validation_rules_version: 'browser-local-1.1',
  structured_pipeline_version: 'browser-prompt-only-1.1',
  structured_deidentification_policy_version: '',
}

for (const [key, expectedValue] of Object.entries(expectedVersions)) {
  if (String(tool[key] ?? '') !== expectedValue) {
    fail(`${key} harus ${JSON.stringify(expectedValue)}.`)
  }
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

const sectionOrders = sections.map((section) => Number(section.sort_order))
const duplicatedSectionOrders = duplicateValues(sectionOrders)
if (duplicatedSectionOrders.length > 0) {
  fail(`sort_order section duplikat: ${duplicatedSectionOrders.join(', ')}`)
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
const dependencyState = new Map()
const dependencyStack = []

for (const question of questions) {
  const variableName = normalizeString(question.variable_name)
  const scope = normalizeString(question.structured_scope)
  const path = normalizeString(question.structured_path)
  const passValue = normalizeString(question.structured_pass_value)
  const questionType = normalizeString(question.question_type)
  const conditionalMode = normalizeString(question.conditional_mode)
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

  if (!SUPPORTED_QUESTION_TYPES.has(questionType)) {
    fail(`question_type tidak valid pada ${variableName}: ${questionType}`)
  }

  if (!STRUCTURED_SCOPES.has(scope)) {
    fail(`structured_scope tidak valid pada ${variableName}: ${scope}`)
  }

  if (!['all', 'any'].includes(conditionalMode)) {
    fail(`conditional_mode tidak valid pada ${variableName}: ${conditionalMode}`)
  }

  const optionValues = options.map(
    (option) => normalizeString(option.option_value),
  )
  const duplicatedOptionValues = duplicateValues(optionValues)
  if (duplicatedOptionValues.length > 0) {
    fail(
      `option_value duplikat pada ${variableName}: `
      + duplicatedOptionValues.join(', '),
    )
  }

  if (CHOICE_TYPES.has(questionType)) {
    if (options.length < 2) {
      fail(`Choice question mempunyai kurang dari dua options: ${variableName}`)
    }
    if (optionValues.some((value) => !value)) {
      fail(`option_value kosong pada ${variableName}`)
    }
  } else if (options.length > 0) {
    fail(`Pertanyaan non-choice memiliki options: ${variableName}`)
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

  const conditionSignatures = conditions.map((condition) => [
    normalizeString(condition.parent_variable_name),
    normalizeString(condition.operator),
    normalizeString(condition.operator) === 'not_empty'
      ? ''
      : normalizeString(condition.comparison_value),
  ].join('::'))
  const duplicatedConditions = duplicateValues(conditionSignatures)
  if (duplicatedConditions.length > 0) {
    fail(`Condition duplikat pada ${variableName}: ${duplicatedConditions.join(', ')}`)
  }

  optionCount += options.length
  conditionCount += conditions.length

  if (scope === 'form_data') {
    formDataCount += 1
    if (!path) fail(`form_data tanpa structured_path: ${variableName}`)
    if (passValue) fail(`form_data mempunyai structured_pass_value: ${variableName}`)
    structuredPaths.push(path)
  }

  if (scope === 'acknowledgement' || scope === 'consent') {
    if (scope === 'acknowledgement') acknowledgementCount += 1
    if (scope === 'consent') consentCount += 1
    if (path) fail(`${scope} mempunyai structured_path: ${variableName}`)
    if (!passValue || !optionValues.includes(passValue)) {
      fail(`structured_pass_value ${scope} tidak tersedia pada option: ${variableName}`)
    }
  }

  if (scope === 'exclude' && (path || passValue)) {
    fail(`exclude harus tanpa structured_path/pass_value: ${variableName}`)
  }

  const childEntry = questionByVariableName.get(variableName)
  for (const condition of conditions) {
    const parentVariableName = normalizeString(condition.parent_variable_name)
    const operator = normalizeString(condition.operator)
    const comparisonValue = normalizeString(condition.comparison_value)
    const parentEntry = questionByVariableName.get(parentVariableName)

    if (!parentEntry) {
      fail(`parent_variable_name tidak ditemukan untuk ${variableName}: ${parentVariableName}`)
    }

    if (!isParentBeforeChild(parentEntry, childEntry)) {
      fail(`parent tidak muncul sebelum child: ${parentVariableName} -> ${variableName}`)
    }

    if (!CONDITION_OPERATORS.has(operator)) {
      fail(`operator condition tidak valid pada ${variableName}: ${operator}`)
    }

    if (operator === 'not_empty') {
      if (comparisonValue) {
        fail(`not_empty harus memakai comparison_value null pada ${variableName}`)
      }
      continue
    }

    if (!comparisonValue) {
      fail(`comparison_value kosong pada ${variableName}`)
    }

    const parentOptionValues = (parentEntry.question.options || []).map(
      (option) => normalizeString(option.option_value),
    )
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
assertCount('Jumlah structured paths', structuredPaths.length, EXPECTED.structuredPaths)
assertCount('Jumlah acknowledgement', acknowledgementCount, EXPECTED.acknowledgement)
assertCount('Jumlah consent', consentCount, EXPECTED.consent)

const duplicatedStructuredPaths = duplicateValues(structuredPaths)
if (duplicatedStructuredPaths.length > 0) {
  fail(`structured_path duplikat: ${duplicatedStructuredPaths.join(', ')}`)
}

const visitDependency = (variableName) => {
  const state = dependencyState.get(variableName)
  if (state === 'visiting') {
    const cycleStart = dependencyStack.indexOf(variableName)
    const cycle = [
      ...dependencyStack.slice(Math.max(0, cycleStart)),
      variableName,
    ]
    fail(`Dependency cycle terdeteksi: ${cycle.join(' -> ')}`)
  }
  if (state === 'visited') return

  dependencyState.set(variableName, 'visiting')
  dependencyStack.push(variableName)
  const entry = questionByVariableName.get(variableName)
  for (const condition of entry.question.conditions || []) {
    visitDependency(normalizeString(condition.parent_variable_name))
  }
  dependencyStack.pop()
  dependencyState.set(variableName, 'visited')
}

for (const variableName of variableNames) visitDependency(variableName)

const optionMap = (variableName) => new Map(
  (questionByVariableName.get(variableName)?.question.options || []).map(
    (option) => [normalizeString(option.option_value), option],
  ),
)

for (const [variableName, expectedPath] of Object.entries(ROUTER_PATHS)) {
  const routerEntry = questionByVariableName.get(variableName)
  if (!routerEntry) fail(`Router tidak ditemukan: ${variableName}`)
  const router = routerEntry.question
  if (normalizeString(router.question_type) !== 'single_choice') {
    fail(`${variableName} harus single_choice.`)
  }
  if (normalizeString(router.structured_scope) !== 'form_data') {
    fail(`${variableName} harus structured_scope form_data.`)
  }
  if (normalizeString(router.structured_path) !== expectedPath) {
    fail(`${variableName} structured_path tidak sesuai.`)
  }
  if (router.structured_pass_value !== null) {
    fail(`${variableName} structured_pass_value harus null.`)
  }
  assertExactValues(
    `${variableName} options`,
    (router.options || []).map((option) => normalizeString(option.option_value)),
    ROUTER_OPTION_VALUES[variableName],
  )
}

const routerPaths = new Set(Object.values(ROUTER_PATHS))
const legacyStructuredPaths = structuredPaths.filter(
  (path) => !routerPaths.has(path),
)
assertCount('Jumlah path lama v1.6', legacyStructuredPaths.length, 118)

const softwareOptions = optionMap('software')
for (const value of [
  'belum_menguasai_perangkat_lunak_penelitian',
  'belum_pernah_menggunakan_aplikasi_penelitian',
  'belum_yakin',
]) {
  const option = softwareOptions.get(value)
  if (!option) fail(`Software option wajib tidak ditemukan: ${value}`)
  if (option.is_exclusive !== true) fail(`Software option harus eksklusif: ${value}`)
}

const facilitiesOptions = optionMap('facilities')
for (const value of ['tidak_memiliki_fasilitas_khusus', 'belum_yakin']) {
  const option = facilitiesOptions.get(value)
  if (!option) fail(`Facilities option wajib tidak ditemukan: ${value}`)
  if (option.is_exclusive !== true) fail(`Facilities option harus eksklusif: ${value}`)
}
if (facilitiesOptions.has('tidak_memerlukan_fasilitas_khusus')) {
  fail('Facilities tidak boleh memuat tidak_memerlukan_fasilitas_khusus.')
}

const sourceLanguageOptions = optionMap('source_languages')
if (!sourceLanguageOptions.has('bahasa_lainnya')) {
  fail('source_languages harus memuat bahasa_lainnya.')
}
if (sourceLanguageOptions.has('lainnya')) {
  fail('source_languages tidak boleh memuat option duplikat lainnya.')
}

const sourceLanguagesOther = questionByVariableName.get(
  'source_languages_other',
)?.question
const sourceLanguagesOtherConditions = sourceLanguagesOther?.conditions || []
if (
  sourceLanguagesOtherConditions.length !== 1
  || normalizeString(sourceLanguagesOtherConditions[0].parent_variable_name)
    !== 'source_languages'
  || normalizeString(sourceLanguagesOtherConditions[0].operator) !== 'contains'
  || normalizeString(sourceLanguagesOtherConditions[0].comparison_value)
    !== 'bahasa_lainnya'
) {
  fail('source_languages_other harus bergantung pada source_languages contains bahasa_lainnya.')
}

const deviceOptions = optionMap('devices')
for (const value of [
  'tidak_memiliki_laptop_atau_komputer',
  'tidak_memiliki_perangkat_digital',
  'belum_yakin',
]) {
  if (!deviceOptions.has(value)) fail(`Devices option wajib tidak ditemukan: ${value}`)
}

const conditionSignature = (question) => (question.conditions || [])
  .map((condition) => [
    normalizeString(condition.parent_variable_name),
    normalizeString(condition.operator),
    normalizeString(condition.comparison_value),
  ].join(':'))
  .sort()

const surveyQuestion = questionByVariableName.get(
  'reachable_survey_respondents',
)?.question
const interviewQuestion = questionByVariableName.get(
  'reachable_interview_informants',
)?.question
const datasetQuestion = questionByVariableName.get('dataset')?.question

if (
  normalizeString(surveyQuestion?.conditional_mode) !== 'all'
  || JSON.stringify(conditionSignature(surveyQuestion)) !== JSON.stringify([
    'available_data_types:contains:jawaban_angket',
    'may_collect_data_from_people:equals:ya',
  ].sort())
) {
  fail('Branching survei tidak sesuai JT-4C.4.')
}

if (
  normalizeString(interviewQuestion?.conditional_mode) !== 'all'
  || JSON.stringify(conditionSignature(interviewQuestion)) !== JSON.stringify([
    'available_data_types:contains:hasil_wawancara',
    'may_collect_data_from_people:equals:ya',
  ].sort())
) {
  fail('Branching wawancara tidak sesuai JT-4C.4.')
}

if (
  normalizeString(datasetQuestion?.conditional_mode) !== 'any'
  || JSON.stringify(conditionSignature(datasetQuestion)) !== JSON.stringify([
    'may_collect_data_from_people:equals:ya',
    'may_experiment_or_develop:equals:ya',
    'may_use_documents_or_content:equals:ya',
  ].sort())
) {
  fail('Branching dataset tidak sesuai JT-4C.4.')
}

for (const variableName of ['allowed_approaches', 'allowed_research_paths']) {
  const question = questionByVariableName.get(variableName)?.question
  if ((question?.conditions || []).some(
    (condition) => normalizeString(condition.parent_variable_name)
      === 'knows_research_method',
  )) {
    fail(`${variableName} tidak boleh bergantung pada knows_research_method.`)
  }
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
    structured_schema_version: String(tool.structured_schema_version ?? ''),
    structured_prompt_version: String(tool.structured_prompt_version ?? ''),
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
    conditional_mode: normalizeString(question.conditional_mode || 'all'),
    structured_scope: normalizeString(question.structured_scope),
    structured_path: question.structured_path || null,
    structured_pass_value: question.structured_pass_value || null,

    options: [...(question.options || [])]
      .sort(
        (first, second) => Number(first.sort_order) - Number(second.sort_order),
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
        (first, second) => Number(first.sort_order) - Number(second.sort_order),
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
const legacyPathsJson = JSON.stringify(legacyStructuredPaths, null, 2)
const payloadSha256 = createHash('sha256')
  .update(payloadJson, 'utf8')
  .digest('hex')

if (payloadJson.includes(PAYLOAD_DELIMITER)) {
  fail(`Delimiter ${PAYLOAD_DELIMITER} ditemukan di payload.`)
}
if (legacyPathsJson.includes(LEGACY_PATH_DELIMITER)) {
  fail(`Delimiter ${LEGACY_PATH_DELIMITER} ditemukan di daftar path lama.`)
}

const sql = `-- =====================================================
-- GreenroomID H42 - Upgrade Penelusuran Judul Penelitian v1.6.1
-- Upgrade beginner-first untuk satu tool existing berstatus draft.
--
-- Target slug: ${TARGET_SLUG}
-- Source version diterima: 1.6 atau 1.6.1
-- Payload SHA-256: ${payloadSha256}
--
-- H42 tidak membuat tool baru, tidak mengganti tool UUID, tidak publish,
-- tidak menjalankan network/deployment, dan tidak menyimpan jawaban pengguna.
-- Seluruh preflight, rebuild, insert, serta assertion berada dalam satu
-- transaksi. Kegagalan apa pun membatalkan seluruh perubahan.
--
-- Dihasilkan secara deterministik oleh:
-- scripts/generate-research-title-tool-seed-v1.6.1.mjs
-- =====================================================

BEGIN;

DO $upgrade_research_title_v161$
DECLARE
  v_payload jsonb := ${PAYLOAD_DELIMITER}
${payloadJson}
${PAYLOAD_DELIMITER}::jsonb;

  v_legacy_paths jsonb := ${LEGACY_PATH_DELIMITER}
${legacyPathsJson}
${LEGACY_PATH_DELIMITER}::jsonb;

  v_payload_sha256 text := '${payloadSha256}';
  v_slug text := '${TARGET_SLUG}';
  v_tool_id uuid;
  v_original_tool_id uuid;
  v_existing_status text;
  v_source_schema_version text;
  v_source_prompt_version text;
  v_source_validation_version text;
  v_source_pipeline_version text;
  v_source_deidentification_version text;
  v_tool_count bigint;
  v_spec record;
  v_missing_columns text[];
  v_preflight record;
  v_stats record;
BEGIN
  IF v_payload #>> '{tool,slug}' IS DISTINCT FROM v_slug THEN
    RAISE EXCEPTION 'Upgrade dibatalkan: slug payload tidak sesuai target.';
  END IF;

  IF v_payload #>> '{tool,status}' IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION 'Upgrade dibatalkan: status payload harus draft.';
  END IF;

  IF v_payload_sha256 IS DISTINCT FROM '${payloadSha256}' THEN
    RAISE EXCEPTION 'Upgrade dibatalkan: payload hash internal tidak sesuai.';
  END IF;

  PERFORM pg_advisory_xact_lock(
    hashtextextended('greenroomid:prompt-tool-upgrade:' || v_slug, 0)
  );

  -- Preflight tabel dan kolom H37, H39, dan H40 yang benar-benar dipakai.
  FOR v_spec IN
    SELECT *
    FROM (
      VALUES
        (
          'H37',
          'supabase/h37-prompt-tools.sql',
          'prompt_tools',
          ARRAY[
            'id', 'title', 'slug', 'description', 'category', 'status',
            'prompt_template', 'submit_button_label', 'result_title',
            'copy_button_label', 'survey_url', 'survey_cta', 'meta_title',
            'meta_description', 'created_at', 'updated_at',
            'published_at', 'last_deploy_triggered_at', 'last_deploy_status'
          ]::text[]
        ),
        (
          'H37',
          'supabase/h37-prompt-tools.sql',
          'prompt_tool_sections',
          ARRAY['id', 'tool_id', 'title', 'description', 'sort_order']::text[]
        ),
        (
          'H37',
          'supabase/h37-prompt-tools.sql',
          'prompt_tool_questions',
          ARRAY[
            'id', 'tool_id', 'section_id', 'variable_name', 'label',
            'help_text', 'placeholder', 'question_type', 'is_required',
            'validation_type', 'validation_min', 'validation_max',
            'sort_order', 'conditional_parent_question_id',
            'conditional_operator', 'conditional_value'
          ]::text[]
        ),
        (
          'H37',
          'supabase/h37-prompt-tools.sql',
          'prompt_tool_options',
          ARRAY[
            'id', 'question_id', 'option_label', 'option_value', 'sort_order'
          ]::text[]
        ),
        (
          'H39',
          'supabase/h39-prompt-tools-advanced-builder.sql',
          'prompt_tools',
          ARRAY[
            'display_mode', 'show_progress', 'previous_button_label',
            'next_button_label'
          ]::text[]
        ),
        (
          'H39',
          'supabase/h39-prompt-tools-advanced-builder.sql',
          'prompt_tool_questions',
          ARRAY['min_selections', 'max_selections', 'conditional_mode']::text[]
        ),
        (
          'H39',
          'supabase/h39-prompt-tools-advanced-builder.sql',
          'prompt_tool_options',
          ARRAY['is_exclusive', 'group_label', 'group_sort_order']::text[]
        ),
        (
          'H39',
          'supabase/h39-prompt-tools-advanced-builder.sql',
          'prompt_tool_question_conditions',
          ARRAY[
            'id', 'question_id', 'parent_question_id', 'operator',
            'comparison_value', 'sort_order'
          ]::text[]
        ),
        (
          'H40',
          'supabase/h40-prompt-tools-structured-output.sql',
          'prompt_tools',
          ARRAY[
            'structured_output_enabled', 'structured_schema_version',
            'structured_prompt_version', 'structured_validation_rules_version',
            'structured_pipeline_version',
            'structured_deidentification_policy_version'
          ]::text[]
        ),
        (
          'H40',
          'supabase/h40-prompt-tools-structured-output.sql',
          'prompt_tool_questions',
          ARRAY[
            'structured_scope', 'structured_path', 'structured_pass_value'
          ]::text[]
        )
    ) AS required(migration_name, migration_file, table_name, column_names)
  LOOP
    IF to_regclass('public.' || v_spec.table_name) IS NULL THEN
      RAISE EXCEPTION
        'Preflight % gagal: public.% tidak ditemukan. Kemungkinan % belum diterapkan.',
        v_spec.migration_name,
        v_spec.table_name,
        v_spec.migration_file;
    END IF;

    SELECT array_agg(column_name ORDER BY column_name)
    INTO v_missing_columns
    FROM unnest(v_spec.column_names) AS required_column(column_name)
    WHERE NOT EXISTS (
      SELECT 1
      FROM information_schema.columns actual
      WHERE actual.table_schema = 'public'
        AND actual.table_name = v_spec.table_name
        AND actual.column_name = required_column.column_name
    );

    IF cardinality(v_missing_columns) > 0 THEN
      RAISE EXCEPTION
        'Preflight % gagal: kolom public.% belum lengkap: %. Kemungkinan % belum diterapkan.',
        v_spec.migration_name,
        v_spec.table_name,
        array_to_string(v_missing_columns, ', '),
        v_spec.migration_file;
    END IF;
  END LOOP;

  -- Trigger lintas tabel dan proteksi structured pass value.
  FOR v_spec IN
    SELECT *
    FROM (
      VALUES
        ('H37', 'prompt_tool_questions', 'validate_prompt_tool_question_refs_trigger'),
        ('H39', 'prompt_tool_question_conditions', 'validate_prompt_tool_question_condition_trigger'),
        ('H40', 'prompt_tool_questions', 'normalize_prompt_tool_question_structured_mapping_trigger'),
        ('H40', 'prompt_tool_options', 'protect_prompt_tool_structured_pass_option_delete_trigger'),
        ('H40', 'prompt_tool_options', 'protect_prompt_tool_structured_pass_option_update_trigger')
    ) AS required(migration_name, table_name, trigger_name)
  LOOP
    IF NOT EXISTS (
      SELECT 1
      FROM pg_trigger trigger_row
      JOIN pg_class table_row ON table_row.oid = trigger_row.tgrelid
      JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
      WHERE schema_row.nspname = 'public'
        AND table_row.relname = v_spec.table_name
        AND trigger_row.tgname = v_spec.trigger_name
        AND NOT trigger_row.tgisinternal
    ) THEN
      RAISE EXCEPTION
        'Preflight % gagal: trigger % pada public.% tidak ditemukan.',
        v_spec.migration_name,
        v_spec.trigger_name,
        v_spec.table_name;
    END IF;
  END LOOP;

  IF to_regprocedure('gen_random_uuid()') IS NULL THEN
    RAISE EXCEPTION 'Preflight H37 gagal: fungsi gen_random_uuid() tidak tersedia.';
  END IF;

  -- Unique slug yang dipakai aplikasi harus tersedia dan valid.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_index index_row
    JOIN pg_class table_row ON table_row.oid = index_row.indrelid
    JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
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
      'Preflight H37 gagal: unique constraint/index tunggal untuk prompt_tools.slug tidak ditemukan.';
  END IF;

  -- Validasi kemampuan schema tanpa bergantung pada nama constraint tertentu.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
    JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'prompt_tool_questions'
      AND constraint_row.contype = 'c'
      AND lower(pg_get_constraintdef(constraint_row.oid)) LIKE '%ranking%'
  ) THEN
    RAISE EXCEPTION 'Preflight H39 gagal: question_type ranking belum didukung.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
    JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'prompt_tool_questions'
      AND constraint_row.contype = 'c'
      AND lower(pg_get_constraintdef(constraint_row.oid)) LIKE '%conditional_mode%'
      AND lower(pg_get_constraintdef(constraint_row.oid)) LIKE '%all%'
      AND lower(pg_get_constraintdef(constraint_row.oid)) LIKE '%any%'
  ) THEN
    RAISE EXCEPTION 'Preflight H39 gagal: conditional_mode all/any belum tersedia.';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint constraint_row
    JOIN pg_class table_row ON table_row.oid = constraint_row.conrelid
    JOIN pg_namespace schema_row ON schema_row.oid = table_row.relnamespace
    WHERE schema_row.nspname = 'public'
      AND table_row.relname = 'prompt_tool_questions'
      AND constraint_row.contype = 'c'
      AND lower(pg_get_constraintdef(constraint_row.oid)) LIKE '%form_data%'
      AND lower(pg_get_constraintdef(constraint_row.oid)) LIKE '%acknowledgement%'
      AND lower(pg_get_constraintdef(constraint_row.oid)) LIKE '%consent%'
      AND lower(pg_get_constraintdef(constraint_row.oid)) LIKE '%exclude%'
  ) THEN
    RAISE EXCEPTION
      'Preflight H40 gagal: structured_scope form_data/acknowledgement/consent/exclude belum lengkap.';
  END IF;

  SELECT count(*)
  INTO v_tool_count
  FROM public.prompt_tools
  WHERE slug = v_slug;

  IF v_tool_count = 0 THEN
    RAISE EXCEPTION
      'Upgrade dibatalkan: tool dengan slug % tidak ditemukan. H42 tidak membuat tool baru.',
      v_slug;
  ELSIF v_tool_count > 1 THEN
    RAISE EXCEPTION
      'Upgrade dibatalkan: ditemukan % tool dengan slug %. Perbaiki duplikasi sebelum upgrade.',
      v_tool_count,
      v_slug;
  END IF;

  SELECT
    id,
    status,
    structured_schema_version,
    structured_prompt_version,
    structured_validation_rules_version,
    structured_pipeline_version,
    structured_deidentification_policy_version
  INTO
    v_tool_id,
    v_existing_status,
    v_source_schema_version,
    v_source_prompt_version,
    v_source_validation_version,
    v_source_pipeline_version,
    v_source_deidentification_version
  FROM public.prompt_tools
  WHERE slug = v_slug
  FOR UPDATE;

  v_original_tool_id := v_tool_id;

  IF v_existing_status IS DISTINCT FROM 'draft' THEN
    RAISE EXCEPTION
      'Upgrade dibatalkan: tool % berstatus %. Kembalikan tool ke draft secara eksplisit sebelum menjalankan H42.',
      v_slug,
      coalesce(v_existing_status, '<null>');
  END IF;

  IF v_source_schema_version IS DISTINCT FROM v_source_prompt_version THEN
    RAISE EXCEPTION
      'Upgrade dibatalkan: structured schema/prompt version tidak konsisten (% / %).',
      v_source_schema_version,
      v_source_prompt_version;
  END IF;

  IF v_source_schema_version = '1.6' THEN
    IF v_source_validation_version IS DISTINCT FROM 'browser-local-1.0'
      OR v_source_pipeline_version IS DISTINCT FROM 'browser-prompt-only-1.0'
      OR v_source_deidentification_version IS DISTINCT FROM '' THEN
      RAISE EXCEPTION
        'Upgrade dibatalkan: tuple version v1.6 tidak dikenal (% / % / %).',
        v_source_validation_version,
        v_source_pipeline_version,
        v_source_deidentification_version;
    END IF;
  ELSIF v_source_schema_version = '1.6.1' THEN
    IF v_source_validation_version IS DISTINCT FROM 'browser-local-1.1'
      OR v_source_pipeline_version IS DISTINCT FROM 'browser-prompt-only-1.1'
      OR v_source_deidentification_version IS DISTINCT FROM '' THEN
      RAISE EXCEPTION
        'Upgrade dibatalkan: tuple version v1.6.1 tidak dikenal (% / % / %).',
        v_source_validation_version,
        v_source_pipeline_version,
        v_source_deidentification_version;
    END IF;
  ELSE
    RAISE EXCEPTION
      'Upgrade dibatalkan: source version % tidak didukung. H42 hanya menerima 1.6 atau 1.6.1.',
      coalesce(v_source_schema_version, '<null>');
  END IF;

  SELECT
    (SELECT count(*) FROM public.prompt_tool_sections WHERE tool_id = v_tool_id)
      AS section_count,
    (SELECT count(*) FROM public.prompt_tool_questions WHERE tool_id = v_tool_id)
      AS question_count,
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
    ) AS consent_count
  INTO v_preflight;

  IF v_source_schema_version = '1.6' THEN
    IF v_preflight.section_count <> 10
      OR v_preflight.question_count <> 120
      OR v_preflight.option_count <> 658
      OR v_preflight.condition_count <> 330
      OR v_preflight.structured_path_count <> 118
      OR v_preflight.acknowledgement_count <> 1
      OR v_preflight.consent_count <> 1 THEN
      RAISE EXCEPTION
        'Upgrade dibatalkan: count source v1.6 tidak dikenal. sections=%, questions=%, options=%, conditions=%, paths=%, acknowledgement=%, consent=%.',
        v_preflight.section_count,
        v_preflight.question_count,
        v_preflight.option_count,
        v_preflight.condition_count,
        v_preflight.structured_path_count,
        v_preflight.acknowledgement_count,
        v_preflight.consent_count;
    END IF;
  ELSE
    IF v_preflight.section_count <> 10
      OR v_preflight.question_count <> 124
      OR v_preflight.option_count <> 676
      OR v_preflight.condition_count <> 131
      OR v_preflight.structured_path_count <> 122
      OR v_preflight.acknowledgement_count <> 1
      OR v_preflight.consent_count <> 1 THEN
      RAISE EXCEPTION
        'Upgrade dibatalkan: count source v1.6.1 tidak dikenal. sections=%, questions=%, options=%, conditions=%, paths=%, acknowledgement=%, consent=%.',
        v_preflight.section_count,
        v_preflight.question_count,
        v_preflight.option_count,
        v_preflight.condition_count,
        v_preflight.structured_path_count,
        v_preflight.acknowledgement_count,
        v_preflight.consent_count;
    END IF;
  END IF;

  -- Netralisasi mapping sebelum penghapusan options karena proteksi H40.
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

  -- Update hanya konten/configuration yang dikelola manifest.
  -- id, slug, status, created_at, author, published_at, dan field deployment
  -- tidak diubah. Trigger H38 boleh memperbarui updated_at karena konten berubah.
  UPDATE public.prompt_tools
  SET
    title = v_payload #>> '{tool,title}',
    description = v_payload #>> '{tool,description}',
    category = v_payload #>> '{tool,category}',
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
    previous_button_label = v_payload #>> '{tool,previous_button_label}',
    next_button_label = v_payload #>> '{tool,next_button_label}',
    structured_output_enabled = COALESCE(
      (v_payload #>> '{tool,structured_output_enabled}')::boolean,
      false
    ),
    structured_schema_version = v_payload #>> '{tool,structured_schema_version}',
    structured_prompt_version = v_payload #>> '{tool,structured_prompt_version}',
    structured_validation_rules_version =
      v_payload #>> '{tool,structured_validation_rules_version}',
    structured_pipeline_version =
      v_payload #>> '{tool,structured_pipeline_version}',
    structured_deidentification_policy_version =
      v_payload #>> '{tool,structured_deidentification_policy_version}'
  WHERE id = v_tool_id
    AND slug = v_slug
    AND status = 'draft';

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Upgrade gagal: row tool target tidak dapat diperbarui.';
  END IF;

  CREATE TEMP TABLE tmp_research_title_v161_section_map (
    section_key text PRIMARY KEY,
    section_id uuid NOT NULL DEFAULT gen_random_uuid(),
    section_data jsonb NOT NULL,
    sort_order integer NOT NULL
  ) ON COMMIT DROP;

  CREATE TEMP TABLE tmp_research_title_v161_question_map (
    variable_name text PRIMARY KEY,
    question_id uuid NOT NULL DEFAULT gen_random_uuid(),
    tool_id uuid NOT NULL,
    section_id uuid NOT NULL,
    section_sort_order integer NOT NULL,
    question_sort_order integer NOT NULL,
    question_data jsonb NOT NULL
  ) ON COMMIT DROP;

  INSERT INTO tmp_research_title_v161_section_map (
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
  FROM tmp_research_title_v161_section_map
  ORDER BY sort_order;

  IF EXISTS (
    SELECT 1
    FROM jsonb_array_elements(v_payload->'questions') AS question_row(question_data)
    LEFT JOIN tmp_research_title_v161_section_map section_row
      ON section_row.section_key = question_row.question_data->>'section_key'
    WHERE section_row.section_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Upgrade gagal: terdapat section_key pertanyaan yang tidak ditemukan.';
  END IF;

  INSERT INTO tmp_research_title_v161_question_map (
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
  JOIN tmp_research_title_v161_section_map section_row
    ON section_row.section_key = question_row.question_data->>'section_key'
  ORDER BY
    section_row.sort_order,
    (question_row.question_data->>'sort_order')::integer,
    question_row.position;

  IF EXISTS (
    SELECT 1
    FROM tmp_research_title_v161_question_map child
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(child.question_data->'conditions', '[]'::jsonb)
    ) AS condition_row(condition_data)
    LEFT JOIN tmp_research_title_v161_question_map parent
      ON parent.variable_name =
        condition_row.condition_data->>'parent_variable_name'
    WHERE parent.question_id IS NULL
  ) THEN
    RAISE EXCEPTION 'Upgrade gagal: terdapat parent_variable_name yang tidak ditemukan.';
  END IF;

  IF EXISTS (
    SELECT 1
    FROM tmp_research_title_v161_question_map child
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(child.question_data->'conditions', '[]'::jsonb)
    ) AS condition_row(condition_data)
    JOIN tmp_research_title_v161_question_map parent
      ON parent.variable_name =
        condition_row.condition_data->>'parent_variable_name'
    WHERE parent.section_sort_order > child.section_sort_order
      OR (
        parent.section_sort_order = child.section_sort_order
        AND parent.question_sort_order >= child.question_sort_order
      )
  ) THEN
    RAISE EXCEPTION
      'Upgrade gagal: terdapat parent condition yang tidak muncul sebelum child.';
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
    COALESCE((question_row.question_data->>'is_required')::boolean, false),
    NULLIF(question_row.question_data->>'validation_type', ''),
    (question_row.question_data->>'validation_min')::numeric,
    (question_row.question_data->>'validation_max')::numeric,
    question_row.question_sort_order,
    NULL,
    NULL,
    NULL,
    (question_row.question_data->>'min_selections')::integer,
    (question_row.question_data->>'max_selections')::integer,
    COALESCE(question_row.question_data->>'conditional_mode', 'all'),
    question_row.question_data->>'structured_scope',
    NULLIF(question_row.question_data->>'structured_path', ''),
    NULLIF(question_row.question_data->>'structured_pass_value', '')
  FROM tmp_research_title_v161_question_map question_row
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
    COALESCE((option_row.option_data->>'is_exclusive')::boolean, false),
    COALESCE(option_row.option_data->>'group_label', ''),
    COALESCE((option_row.option_data->>'group_sort_order')::integer, 0)
  FROM tmp_research_title_v161_question_map question_row
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
      WHEN condition_row.condition_data->>'operator' = 'not_empty' THEN NULL
      ELSE condition_row.condition_data->>'comparison_value'
    END,
    COALESCE((condition_row.condition_data->>'sort_order')::integer, 0)
  FROM tmp_research_title_v161_question_map child
  CROSS JOIN LATERAL jsonb_array_elements(
    COALESCE(child.question_data->'conditions', '[]'::jsonb)
  ) WITH ORDINALITY AS condition_row(condition_data, position)
  JOIN tmp_research_title_v161_question_map parent
    ON parent.variable_name =
      condition_row.condition_data->>'parent_variable_name'
    AND parent.tool_id = child.tool_id
  WHERE child.tool_id = v_tool_id
  ORDER BY
    child.section_sort_order,
    child.question_sort_order,
    child.variable_name,
    condition_row.position;

  -- Mirror advanced condition pertama ke kolom legacy seperti H41.
  WITH first_condition AS (
    SELECT DISTINCT ON (child.question_id)
      child.question_id,
      parent.question_id AS parent_question_id,
      condition_row.condition_data->>'operator' AS operator,
      CASE
        WHEN condition_row.condition_data->>'operator' = 'not_empty' THEN NULL
        ELSE condition_row.condition_data->>'comparison_value'
      END AS comparison_value
    FROM tmp_research_title_v161_question_map child
    CROSS JOIN LATERAL jsonb_array_elements(
      COALESCE(child.question_data->'conditions', '[]'::jsonb)
    ) WITH ORDINALITY AS condition_row(condition_data, position)
    JOIN tmp_research_title_v161_question_map parent
      ON parent.variable_name =
        condition_row.condition_data->>'parent_variable_name'
      AND parent.tool_id = child.tool_id
    WHERE child.tool_id = v_tool_id
    ORDER BY child.question_id, condition_row.position
  )
  UPDATE public.prompt_tool_questions question_row
  SET
    conditional_parent_question_id = first_condition.parent_question_id,
    conditional_operator = first_condition.operator,
    conditional_value = first_condition.comparison_value
  FROM first_condition
  WHERE question_row.id = first_condition.question_id;

  -- Final assertions. Exception menggagalkan seluruh transaction.
  SELECT
    (SELECT count(*) FROM public.prompt_tools WHERE slug = v_slug)
      AS tool_count,
    (
      SELECT count(*)
      FROM public.prompt_tools
      WHERE id = v_original_tool_id
        AND id = v_tool_id
        AND slug = v_slug
        AND status = 'draft'
    ) AS unchanged_draft_tool_count,
    (SELECT count(*) FROM public.prompt_tool_sections WHERE tool_id = v_tool_id)
      AS section_count,
    (SELECT count(*) FROM public.prompt_tool_questions WHERE tool_id = v_tool_id)
      AS question_count,
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
        SELECT section_data->>'section_key' AS section_key
        FROM jsonb_array_elements(v_payload->'sections') AS section_row(section_data)
        GROUP BY section_data->>'section_key'
        HAVING count(*) > 1
      ) duplicate_section
    ) AS duplicate_section_key_count,
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
      FROM (
        SELECT
          condition_row.question_id,
          condition_row.parent_question_id,
          condition_row.operator,
          condition_row.comparison_value
        FROM public.prompt_tool_question_conditions condition_row
        JOIN public.prompt_tool_questions child
          ON child.id = condition_row.question_id
        WHERE child.tool_id = v_tool_id
        GROUP BY
          condition_row.question_id,
          condition_row.parent_question_id,
          condition_row.operator,
          condition_row.comparison_value
        HAVING count(*) > 1
      ) duplicate_condition
    ) AS duplicate_condition_count,
    (
      SELECT count(*)
      FROM (
        SELECT condition_row.question_id, condition_row.sort_order
        FROM public.prompt_tool_question_conditions condition_row
        JOIN public.prompt_tool_questions child
          ON child.id = condition_row.question_id
        WHERE child.tool_id = v_tool_id
        GROUP BY condition_row.question_id, condition_row.sort_order
        HAVING count(*) > 1
      ) duplicate_condition_order
    ) AS duplicate_condition_order_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_options option_row
      LEFT JOIN public.prompt_tool_questions question_row
        ON question_row.id = option_row.question_id
      WHERE option_row.question_id IN (
        SELECT question_id FROM tmp_research_title_v161_question_map
      )
        AND question_row.id IS NULL
    ) AS orphan_option_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_question_conditions condition_row
      LEFT JOIN public.prompt_tool_questions child
        ON child.id = condition_row.question_id
      LEFT JOIN public.prompt_tool_questions parent
        ON parent.id = condition_row.parent_question_id
      WHERE condition_row.question_id IN (
        SELECT question_id FROM tmp_research_title_v161_question_map
      )
        AND (child.id IS NULL OR parent.id IS NULL)
    ) AS orphan_condition_count,
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
      FROM public.prompt_tool_question_conditions condition_row
      JOIN public.prompt_tool_questions child
        ON child.id = condition_row.question_id
      JOIN public.prompt_tool_questions parent
        ON parent.id = condition_row.parent_question_id
      WHERE child.tool_id = v_tool_id
        AND condition_row.operator IN ('equals', 'not_equals', 'contains')
        AND NOT EXISTS (
          SELECT 1
          FROM public.prompt_tool_options parent_option
          WHERE parent_option.question_id = parent.id
            AND parent_option.option_value = condition_row.comparison_value
        )
    ) AS invalid_comparison_count,
    (
      WITH RECURSIVE edges AS (
        SELECT
          condition_row.parent_question_id AS parent_id,
          condition_row.question_id AS child_id
        FROM public.prompt_tool_question_conditions condition_row
        JOIN public.prompt_tool_questions child
          ON child.id = condition_row.question_id
        WHERE child.tool_id = v_tool_id
      ),
      walk AS (
        SELECT
          parent_id AS start_id,
          child_id AS current_id,
          ARRAY[parent_id, child_id]::uuid[] AS path,
          child_id = parent_id AS has_cycle
        FROM edges
        UNION ALL
        SELECT
          walk.start_id,
          edges.child_id,
          walk.path || edges.child_id,
          edges.child_id = ANY(walk.path)
        FROM walk
        JOIN edges ON edges.parent_id = walk.current_id
        WHERE NOT walk.has_cycle
      )
      SELECT count(*) FROM walk WHERE has_cycle
    ) AS cycle_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions question_row
      WHERE question_row.tool_id = v_tool_id
        AND (
          (
            question_row.structured_scope = 'form_data'
            AND (
              question_row.structured_path IS NULL
              OR question_row.structured_pass_value IS NOT NULL
            )
          )
          OR (
            question_row.structured_scope IN ('acknowledgement', 'consent')
            AND (
              question_row.structured_path IS NOT NULL
              OR question_row.structured_pass_value IS NULL
            )
          )
          OR (
            question_row.structured_scope = 'exclude'
            AND (
              question_row.structured_path IS NOT NULL
              OR question_row.structured_pass_value IS NOT NULL
            )
          )
        )
    ) AS invalid_structured_mapping_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions question_row
      WHERE question_row.tool_id = v_tool_id
        AND question_row.structured_scope IN ('acknowledgement', 'consent')
        AND NOT EXISTS (
          SELECT 1
          FROM public.prompt_tool_options option_row
          WHERE option_row.question_id = question_row.id
            AND option_row.option_value = question_row.structured_pass_value
        )
    ) AS missing_pass_option_count,
    (
      SELECT count(*)
      FROM jsonb_array_elements_text(v_legacy_paths) AS legacy_path(path)
      WHERE NOT EXISTS (
        SELECT 1
        FROM public.prompt_tool_questions question_row
        WHERE question_row.tool_id = v_tool_id
          AND question_row.structured_scope = 'form_data'
          AND question_row.structured_path = legacy_path.path
      )
    ) AS missing_legacy_path_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions question_row
      WHERE question_row.tool_id = v_tool_id
        AND (
          question_row.variable_name,
          question_row.structured_path
        ) IN (
          ('may_collect_data_from_people', 'data_access.may_collect_data_from_people'),
          ('may_use_documents_or_content', 'data_access.may_use_documents_or_content'),
          ('may_experiment_or_develop', 'problem_and_goal.may_experiment_or_develop'),
          ('knows_research_method', 'method_and_skills.method_knowledge_status')
        )
        AND question_row.question_type = 'single_choice'
        AND question_row.structured_scope = 'form_data'
        AND question_row.structured_pass_value IS NULL
    ) AS valid_router_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions question_row
      WHERE question_row.tool_id = v_tool_id
        AND question_row.variable_name IN (
          'may_collect_data_from_people',
          'may_use_documents_or_content',
          'may_experiment_or_develop',
          'knows_research_method'
        )
        AND (
          SELECT array_agg(option_row.option_value ORDER BY option_row.option_value)
          FROM public.prompt_tool_options option_row
          WHERE option_row.question_id = question_row.id
        ) = CASE
          WHEN question_row.variable_name = 'knows_research_method' THEN
            ARRAY['belum_tahu', 'punya_gambaran', 'sudah_tahu']::text[]
          ELSE
            ARRAY['belum_yakin', 'tidak', 'ya']::text[]
        END
    ) AS valid_router_option_set_count,
    (
      SELECT count(*)
      FROM (
        SELECT 1
        WHERE (
          SELECT count(*)
          FROM public.prompt_tool_options option_row
          JOIN public.prompt_tool_questions question_row
            ON question_row.id = option_row.question_id
          WHERE question_row.tool_id = v_tool_id
            AND question_row.variable_name = 'software'
            AND option_row.option_value IN (
              'belum_menguasai_perangkat_lunak_penelitian',
              'belum_pernah_menggunakan_aplikasi_penelitian',
              'belum_yakin'
            )
            AND option_row.is_exclusive = true
        ) = 3
          AND (
            SELECT count(*)
            FROM public.prompt_tool_options option_row
            JOIN public.prompt_tool_questions question_row
              ON question_row.id = option_row.question_id
            WHERE question_row.tool_id = v_tool_id
              AND question_row.variable_name = 'facilities'
              AND option_row.option_value IN (
                'tidak_memiliki_fasilitas_khusus',
                'belum_yakin'
              )
              AND option_row.is_exclusive = true
          ) = 2
          AND NOT EXISTS (
            SELECT 1
            FROM public.prompt_tool_options option_row
            JOIN public.prompt_tool_questions question_row
              ON question_row.id = option_row.question_id
            WHERE question_row.tool_id = v_tool_id
              AND question_row.variable_name = 'facilities'
              AND option_row.option_value = 'tidak_memerlukan_fasilitas_khusus'
          )
          AND EXISTS (
            SELECT 1
            FROM public.prompt_tool_options option_row
            JOIN public.prompt_tool_questions question_row
              ON question_row.id = option_row.question_id
            WHERE question_row.tool_id = v_tool_id
              AND question_row.variable_name = 'source_languages'
              AND option_row.option_value = 'bahasa_lainnya'
          )
          AND NOT EXISTS (
            SELECT 1
            FROM public.prompt_tool_options option_row
            JOIN public.prompt_tool_questions question_row
              ON question_row.id = option_row.question_id
            WHERE question_row.tool_id = v_tool_id
              AND question_row.variable_name = 'source_languages'
              AND option_row.option_value = 'lainnya'
          )
          AND (
            SELECT count(*)
            FROM public.prompt_tool_options option_row
            JOIN public.prompt_tool_questions question_row
              ON question_row.id = option_row.question_id
            WHERE question_row.tool_id = v_tool_id
              AND question_row.variable_name = 'devices'
              AND option_row.option_value IN (
                'tidak_memiliki_laptop_atau_komputer',
                'tidak_memiliki_perangkat_digital',
                'belum_yakin'
              )
          ) = 3
          AND EXISTS (
            SELECT 1
            FROM public.prompt_tool_question_conditions condition_row
            JOIN public.prompt_tool_questions child
              ON child.id = condition_row.question_id
            JOIN public.prompt_tool_questions parent
              ON parent.id = condition_row.parent_question_id
            WHERE child.tool_id = v_tool_id
              AND child.variable_name = 'source_languages_other'
              AND parent.variable_name = 'source_languages'
              AND condition_row.operator = 'contains'
              AND condition_row.comparison_value = 'bahasa_lainnya'
          )
      ) semantic_enum_assertion
    ) AS semantic_enum_valid_count,
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
          condition_row.sort_order,
          condition_row.id
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
                IS DISTINCT FROM first_condition.parent_question_id
              OR question_row.conditional_operator
                IS DISTINCT FROM first_condition.operator
              OR question_row.conditional_value
                IS DISTINCT FROM first_condition.comparison_value
            )
          )
          OR (
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
    ) AS ranking_83_valid_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions child
      WHERE child.tool_id = v_tool_id
        AND child.variable_name = 'reachable_survey_respondents'
        AND child.conditional_mode = 'all'
        AND (
          SELECT count(*)
          FROM public.prompt_tool_question_conditions condition_row
          WHERE condition_row.question_id = child.id
        ) = 2
        AND EXISTS (
          SELECT 1
          FROM public.prompt_tool_question_conditions condition_row
          JOIN public.prompt_tool_questions parent
            ON parent.id = condition_row.parent_question_id
          WHERE condition_row.question_id = child.id
            AND parent.variable_name = 'may_collect_data_from_people'
            AND condition_row.operator = 'equals'
            AND condition_row.comparison_value = 'ya'
        )
        AND EXISTS (
          SELECT 1
          FROM public.prompt_tool_question_conditions condition_row
          JOIN public.prompt_tool_questions parent
            ON parent.id = condition_row.parent_question_id
          WHERE condition_row.question_id = child.id
            AND parent.variable_name = 'available_data_types'
            AND condition_row.operator = 'contains'
            AND condition_row.comparison_value = 'jawaban_angket'
        )
    ) AS survey_branching_valid_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions child
      WHERE child.tool_id = v_tool_id
        AND child.variable_name = 'reachable_interview_informants'
        AND child.conditional_mode = 'all'
        AND (
          SELECT count(*)
          FROM public.prompt_tool_question_conditions condition_row
          WHERE condition_row.question_id = child.id
        ) = 2
        AND EXISTS (
          SELECT 1
          FROM public.prompt_tool_question_conditions condition_row
          JOIN public.prompt_tool_questions parent
            ON parent.id = condition_row.parent_question_id
          WHERE condition_row.question_id = child.id
            AND parent.variable_name = 'may_collect_data_from_people'
            AND condition_row.operator = 'equals'
            AND condition_row.comparison_value = 'ya'
        )
        AND EXISTS (
          SELECT 1
          FROM public.prompt_tool_question_conditions condition_row
          JOIN public.prompt_tool_questions parent
            ON parent.id = condition_row.parent_question_id
          WHERE condition_row.question_id = child.id
            AND parent.variable_name = 'available_data_types'
            AND condition_row.operator = 'contains'
            AND condition_row.comparison_value = 'hasil_wawancara'
        )
    ) AS interview_branching_valid_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_questions child
      WHERE child.tool_id = v_tool_id
        AND child.variable_name = 'dataset'
        AND child.conditional_mode = 'any'
        AND (
          SELECT count(*)
          FROM public.prompt_tool_question_conditions condition_row
          WHERE condition_row.question_id = child.id
        ) = 3
        AND NOT EXISTS (
          SELECT 1
          FROM public.prompt_tool_question_conditions condition_row
          JOIN public.prompt_tool_questions parent
            ON parent.id = condition_row.parent_question_id
          WHERE condition_row.question_id = child.id
            AND (
              parent.variable_name NOT IN (
                'may_collect_data_from_people',
                'may_use_documents_or_content',
                'may_experiment_or_develop'
              )
              OR condition_row.operator IS DISTINCT FROM 'equals'
              OR condition_row.comparison_value IS DISTINCT FROM 'ya'
            )
        )
    ) AS dataset_branching_valid_count,
    (
      SELECT count(*)
      FROM public.prompt_tool_question_conditions condition_row
      JOIN public.prompt_tool_questions child
        ON child.id = condition_row.question_id
      JOIN public.prompt_tool_questions parent
        ON parent.id = condition_row.parent_question_id
      WHERE child.tool_id = v_tool_id
        AND child.variable_name IN ('allowed_approaches', 'allowed_research_paths')
        AND parent.variable_name = 'knows_research_method'
    ) AS forbidden_method_dependency_count,
    (
      SELECT count(*)
      FROM public.prompt_tools
      WHERE id = v_tool_id
        AND structured_schema_version = '1.6.1'
        AND structured_prompt_version = '1.6.1'
        AND structured_validation_rules_version = 'browser-local-1.1'
        AND structured_pipeline_version = 'browser-prompt-only-1.1'
        AND structured_deidentification_policy_version = ''
    ) AS version_valid_count
  INTO v_stats;

  IF v_stats.tool_count <> 1 THEN
    RAISE EXCEPTION 'Final assertion gagal: tool_count expected 1, actual %.', v_stats.tool_count;
  ELSIF v_stats.unchanged_draft_tool_count <> 1 THEN
    RAISE EXCEPTION 'Final assertion gagal: tool UUID/slug/status draft berubah.';
  ELSIF v_stats.section_count <> 10 THEN
    RAISE EXCEPTION 'Final assertion gagal: section_count expected 10, actual %.', v_stats.section_count;
  ELSIF v_stats.question_count <> 124 THEN
    RAISE EXCEPTION 'Final assertion gagal: question_count expected 124, actual %.', v_stats.question_count;
  ELSIF v_stats.option_count <> 676 THEN
    RAISE EXCEPTION 'Final assertion gagal: option_count expected 676, actual %.', v_stats.option_count;
  ELSIF v_stats.condition_count <> 131 THEN
    RAISE EXCEPTION 'Final assertion gagal: condition_count expected 131, actual %.', v_stats.condition_count;
  ELSIF v_stats.structured_path_count <> 122 THEN
    RAISE EXCEPTION 'Final assertion gagal: structured_path_count expected 122, actual %.', v_stats.structured_path_count;
  ELSIF v_stats.acknowledgement_count <> 1 THEN
    RAISE EXCEPTION 'Final assertion gagal: acknowledgement_count expected 1, actual %.', v_stats.acknowledgement_count;
  ELSIF v_stats.consent_count <> 1 THEN
    RAISE EXCEPTION 'Final assertion gagal: consent_count expected 1, actual %.', v_stats.consent_count;
  ELSIF v_stats.duplicate_section_key_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: duplicate section_key actual %.', v_stats.duplicate_section_key_count;
  ELSIF v_stats.duplicate_variable_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: duplicate variable_name actual %.', v_stats.duplicate_variable_count;
  ELSIF v_stats.duplicate_path_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: duplicate structured_path actual %.', v_stats.duplicate_path_count;
  ELSIF v_stats.duplicate_condition_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: duplicate condition actual %.', v_stats.duplicate_condition_count;
  ELSIF v_stats.duplicate_condition_order_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: duplicate condition sort_order actual %.', v_stats.duplicate_condition_order_count;
  ELSIF v_stats.orphan_option_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: orphan option actual %.', v_stats.orphan_option_count;
  ELSIF v_stats.orphan_condition_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: orphan condition actual %.', v_stats.orphan_condition_count;
  ELSIF v_stats.parent_after_child_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: parent-after-child actual %.', v_stats.parent_after_child_count;
  ELSIF v_stats.invalid_comparison_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: invalid comparison_value actual %.', v_stats.invalid_comparison_count;
  ELSIF v_stats.cycle_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: dependency cycle actual %.', v_stats.cycle_count;
  ELSIF v_stats.invalid_structured_mapping_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: invalid structured mapping actual %.', v_stats.invalid_structured_mapping_count;
  ELSIF v_stats.missing_pass_option_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: acknowledgement/consent pass option hilang actual %.', v_stats.missing_pass_option_count;
  ELSIF v_stats.missing_legacy_path_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: path v1.6 hilang actual %.', v_stats.missing_legacy_path_count;
  ELSIF v_stats.valid_router_count <> 4 THEN
    RAISE EXCEPTION 'Final assertion gagal: router valid expected 4, actual %.', v_stats.valid_router_count;
  ELSIF v_stats.valid_router_option_set_count <> 4 THEN
    RAISE EXCEPTION 'Final assertion gagal: option set empat router tidak sesuai.';
  ELSIF v_stats.semantic_enum_valid_count <> 1 THEN
    RAISE EXCEPTION 'Final assertion gagal: enum software/facilities/language/devices tidak sesuai.';
  ELSIF v_stats.legacy_mismatch_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: legacy condition mirror mismatch actual %.', v_stats.legacy_mismatch_count;
  ELSIF v_stats.ranking_83_valid_count <> 1 THEN
    RAISE EXCEPTION 'Final assertion gagal: ranking 83 harus min=5 dan max=5.';
  ELSIF v_stats.survey_branching_valid_count <> 1 THEN
    RAISE EXCEPTION 'Final assertion gagal: branching survei tidak sesuai.';
  ELSIF v_stats.interview_branching_valid_count <> 1 THEN
    RAISE EXCEPTION 'Final assertion gagal: branching wawancara tidak sesuai.';
  ELSIF v_stats.dataset_branching_valid_count <> 1 THEN
    RAISE EXCEPTION 'Final assertion gagal: dataset tidak memakai tiga router = ya dengan mode any.';
  ELSIF v_stats.forbidden_method_dependency_count <> 0 THEN
    RAISE EXCEPTION 'Final assertion gagal: aturan kampus bergantung pada knows_research_method.';
  ELSIF v_stats.version_valid_count <> 1 THEN
    RAISE EXCEPTION 'Final assertion gagal: tuple version akhir bukan v1.6.1.';
  END IF;
END;
$upgrade_research_title_v161$;

COMMIT;

-- Summary hanya membaca tabel permanen; tidak bergantung pada temporary table.
SELECT
  tool_row.id AS tool_id,
  tool_row.slug,
  tool_row.status,
  tool_row.structured_schema_version,
  tool_row.structured_prompt_version,
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
  ) AS consent_count,
  '${payloadSha256}'::text AS payload_sha256
FROM public.prompt_tools tool_row
WHERE tool_row.slug = '${TARGET_SLUG}';
`

const outputPath = resolve(scriptDirectory, OUTPUT_FILE)
writeFileSync(outputPath, sql, 'utf8')

const sqlSha256 = createHash('sha256')
  .update(sql, 'utf8')
  .digest('hex')

console.log('JT-4C.5 generator v1.6.1')
console.log('- Validator: passed (Warnings 11, Errors 0)')
console.log(`- Output: supabase/h42-seed-research-title-tool-beginner-first-v1.6.1.sql`)
console.log(`- Sections: ${EXPECTED.sections}`)
console.log(`- Questions: ${EXPECTED.questions}`)
console.log(`- Options: ${EXPECTED.options}`)
console.log(`- Conditions: ${EXPECTED.conditions}`)
console.log(`- Structured paths: ${EXPECTED.structuredPaths}`)
console.log(`- Legacy v1.6 paths retained: ${legacyStructuredPaths.length}`)
console.log(`- Acknowledgement: ${EXPECTED.acknowledgement}`)
console.log(`- Consent: ${EXPECTED.consent}`)
console.log(`- Payload SHA-256: ${payloadSha256}`)
console.log(`- H42 SHA-256: ${sqlSha256}`)
