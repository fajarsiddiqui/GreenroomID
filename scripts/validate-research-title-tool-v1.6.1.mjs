import manifestV16 from './data/research-title-tool-v1.6.mjs'
import manifest from './data/research-title-tool-v1.6.1.mjs'

const errors = []
const warnings = []
const fail = (message) => errors.push(message)
const warn = (message) => warnings.push(message)
const norm = (value) => String(value ?? '').trim()
const duplicateValues = (values) => values.filter((value, index) => values.indexOf(value) !== index)

const ROUTER_PATHS = {
  may_collect_data_from_people: 'data_access.may_collect_data_from_people',
  may_use_documents_or_content: 'data_access.may_use_documents_or_content',
  may_experiment_or_develop: 'problem_and_goal.may_experiment_or_develop',
  knows_research_method: 'method_and_skills.method_knowledge_status',
}
const ROUTERS = Object.keys(ROUTER_PATHS)
const SUPPORTED_TYPES = new Set([
  'short_text', 'paragraph', 'number', 'email', 'phone', 'date',
  'single_choice', 'dropdown', 'checkbox', 'ranking',
])
const CHOICE_TYPES = new Set(['single_choice', 'dropdown', 'checkbox', 'ranking'])
const OPERATORS = new Set(['equals', 'not_equals', 'contains', 'not_empty'])
const SCOPES = new Set(['form_data', 'acknowledgement', 'consent', 'exclude'])
const PATH_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/
const TECHNICAL_EMPTY_CHILDREN = new Set([
  'analytical_goals', 'available_data_types', 'reachable_survey_respondents',
  'reachable_interview_informants', 'reachable_documents_or_digital_units',
  'reachable_experiment_samples_or_iterations', 'preferred_approach',
  'preferred_research_paths', 'comfortable_activities', 'avoided_activities',
  'statistics_willingness', 'software', 'instrument', 'dataset',
  'tools_or_facilities', 'testing_procedure', 'acceptable_technical_difficulty',
  'method_change_willingness', 'ethics_permission_feasibility_and_willingness',
  'data_publication_status',
])

const sections = [...(manifest.sections || [])].sort(
  (first, second) => Number(first.sort_order) - Number(second.sort_order),
)
const sectionOrder = new Map(
  sections.map((section) => [section.section_key, Number(section.sort_order)]),
)
const questions = [...(manifest.questions || [])].sort((first, second) => {
  const sectionDifference = (sectionOrder.get(first.section_key) ?? 9999)
    - (sectionOrder.get(second.section_key) ?? 9999)
  return sectionDifference || Number(first.sort_order) - Number(second.sort_order)
})
const byName = new Map(questions.map((question) => [question.variable_name, question]))
const orderKey = (question) => [
  sectionOrder.get(question.section_key) ?? 9999,
  Number(question.sort_order),
]
const isBefore = (parent, child) => {
  const parentKey = orderKey(parent)
  const childKey = orderKey(child)
  return parentKey[0] < childKey[0]
    || (parentKey[0] === childKey[0] && parentKey[1] < childKey[1])
}

if (questions.length !== 124) fail(`Rows harus 124, aktual ${questions.length}.`)
if (sections.length !== 10) fail(`Sections harus 10, aktual ${sections.length}.`)

const variableNames = questions.map((question) => norm(question.variable_name))
for (const value of new Set(duplicateValues(variableNames))) {
  fail(`Duplicate variable_name: ${value}`)
}

const oldPaths = new Set(
  (manifestV16.questions || [])
    .filter((question) => question.structured_scope === 'form_data')
    .map((question) => norm(question.structured_path)),
)
const structuredQuestions = questions.filter(
  (question) => question.structured_scope === 'form_data',
)
const paths = structuredQuestions.map((question) => norm(question.structured_path))
if (oldPaths.size !== 118) fail(`Baseline v1.6 harus memiliki 118 paths, aktual ${oldPaths.size}.`)
if (paths.length !== 122) fail(`Structured paths harus 122, aktual ${paths.length}.`)
for (const oldPath of oldPaths) {
  if (!paths.includes(oldPath)) fail(`Path v1.6 hilang: ${oldPath}`)
}
for (const [router, path] of Object.entries(ROUTER_PATHS)) {
  if (paths.filter((item) => item === path).length !== 1) {
    fail(`Router path harus tepat satu kali: ${router} -> ${path}`)
  }
}
for (const path of new Set(duplicateValues(paths))) fail(`Duplicate structured path: ${path}`)

for (const routerName of ROUTERS) {
  const router = byName.get(routerName)
  if (!router) {
    fail(`Router tidak ditemukan: ${routerName}`)
    continue
  }
  if (router.question_type !== 'single_choice') fail(`${routerName} harus single_choice.`)
  if (router.structured_scope !== 'form_data') fail(`${routerName} harus scope form_data.`)
  if (router.structured_path !== ROUTER_PATHS[routerName]) fail(`${routerName} path tidak sesuai.`)
  if (router.structured_pass_value !== null) fail(`${routerName} pass value harus null.`)
  if (!norm(router.help_text)) fail(`${routerName} tanpa help text.`)
}

for (const question of questions) {
  if (!SUPPORTED_TYPES.has(question.question_type)) fail(`Question type invalid: ${question.variable_name}`)
  if (!SCOPES.has(question.structured_scope)) fail(`Scope invalid: ${question.variable_name}`)
  if (CHOICE_TYPES.has(question.question_type)) {
    const optionValues = (question.options || []).map((option) => norm(option.option_value))
    if (optionValues.some((value) => !value)) fail(`Option value kosong: ${question.variable_name}`)
    for (const value of new Set(duplicateValues(optionValues))) {
      fail(`Option value duplicate: ${question.variable_name}.${value}`)
    }
  }
  if (question.structured_scope === 'form_data' && !PATH_PATTERN.test(norm(question.structured_path))) {
    fail(`Path invalid: ${question.variable_name}`)
  }
  if (question.structured_scope === 'exclude'
    && (question.structured_path !== null || question.structured_pass_value !== null)) {
    fail(`Exclude invalid: ${question.variable_name}`)
  }
  for (const condition of question.conditions || []) {
    const parent = byName.get(condition.parent_variable_name)
    if (!parent) {
      fail(`Parent tidak ada: ${question.variable_name} <- ${condition.parent_variable_name}`)
      continue
    }
    if (!isBefore(parent, question)) fail(`Parent-after-child: ${parent.variable_name} -> ${question.variable_name}`)
    if (!OPERATORS.has(condition.operator)) fail(`Operator invalid: ${question.variable_name}.${condition.operator}`)
    if (condition.operator !== 'not_empty') {
      const parentValues = (parent.options || []).map((option) => norm(option.option_value))
      if (!parentValues.includes(norm(condition.comparison_value))) {
        fail(`Comparison invalid: ${question.variable_name} <- ${parent.variable_name}.${condition.comparison_value}`)
      }
    }
  }
}

const visitState = new Map()
const dependencyStack = []
const visit = (question) => {
  const state = visitState.get(question.variable_name)
  if (state === 'visiting') {
    fail(`Cycle: ${[...dependencyStack, question.variable_name].join(' -> ')}`)
    return
  }
  if (state === 'visited') return
  visitState.set(question.variable_name, 'visiting')
  dependencyStack.push(question.variable_name)
  for (const condition of question.conditions || []) {
    const parent = byName.get(condition.parent_variable_name)
    if (parent) visit(parent)
  }
  dependencyStack.pop()
  visitState.set(question.variable_name, 'visited')
}
questions.forEach(visit)

const optionMap = (question) => new Map((question?.options || []).map((option) => [option.option_value, option]))
const sourceLanguages = byName.get('source_languages')
const languageOptions = optionMap(sourceLanguages)
if (!languageOptions.has('bahasa_lainnya')) fail('source_languages harus memuat bahasa_lainnya.')
if (languageOptions.has('lainnya')) fail('source_languages tidak boleh memuat option duplikat lainnya.')
const sourceLanguagesOther = byName.get('source_languages_other')
if ((sourceLanguagesOther?.conditions || []).length !== 1
  || sourceLanguagesOther.conditions[0].parent_variable_name !== 'source_languages'
  || sourceLanguagesOther.conditions[0].operator !== 'contains'
  || sourceLanguagesOther.conditions[0].comparison_value !== 'bahasa_lainnya') {
  fail('source_languages_other harus bergantung pada source_languages contains bahasa_lainnya.')
}

const softwareOptions = optionMap(byName.get('software'))
for (const value of [
  'belum_menguasai_perangkat_lunak_penelitian',
  'belum_pernah_menggunakan_aplikasi_penelitian',
  'belum_yakin',
]) {
  if (!softwareOptions.has(value)) fail(`Software option wajib tidak ditemukan: ${value}`)
  else if (softwareOptions.get(value).is_exclusive !== true) fail(`Software option harus eksklusif: ${value}`)
}

const facilitiesOptions = optionMap(byName.get('facilities'))
if (!facilitiesOptions.has('tidak_memiliki_fasilitas_khusus')) {
  fail('Facilities harus memuat tidak_memiliki_fasilitas_khusus.')
} else if (facilitiesOptions.get('tidak_memiliki_fasilitas_khusus').is_exclusive !== true) {
  fail('tidak_memiliki_fasilitas_khusus harus eksklusif.')
}
if (facilitiesOptions.has('tidak_memerlukan_fasilitas_khusus')) {
  fail('Facilities tidak boleh memuat tidak_memerlukan_fasilitas_khusus.')
}
if (!facilitiesOptions.has('belum_yakin') || facilitiesOptions.get('belum_yakin').is_exclusive !== true) {
  fail('Facilities belum_yakin harus tersedia dan eksklusif.')
}
if ((byName.get('facilities')?.conditions || []).length !== 0) {
  fail('Facilities harus visible sebagai pertanyaan resources biasa.')
}

for (const variableName of ['allowed_approaches', 'allowed_research_paths']) {
  const question = byName.get(variableName)
  if ((question?.conditions || []).some((condition) => condition.parent_variable_name === 'knows_research_method')) {
    fail(`${variableName} tidak boleh bergantung pada knows_research_method.`)
  }
  const unknown = (question?.options || []).find((option) => option.option_value === 'belum_mengetahui')
  if (!unknown || unknown.is_exclusive !== true) fail(`${variableName} harus memiliki belum_mengetahui yang eksklusif.`)
}

const surveyQuestion = byName.get('reachable_survey_respondents')
const interviewQuestion = byName.get('reachable_interview_informants')
const conditionSignature = (question) => (question.conditions || []).map((condition) => (
  `${condition.parent_variable_name}:${condition.operator}:${condition.comparison_value}`
)).sort()
const expectedSurveyConditions = [
  'available_data_types:contains:jawaban_angket',
  'may_collect_data_from_people:equals:ya',
].sort()
const expectedInterviewConditions = [
  'available_data_types:contains:hasil_wawancara',
  'may_collect_data_from_people:equals:ya',
].sort()
if (surveyQuestion?.conditional_mode !== 'all'
  || JSON.stringify(conditionSignature(surveyQuestion)) !== JSON.stringify(expectedSurveyConditions)) {
  fail('reachable_survey_respondents conditions tidak sesuai.')
}
if (interviewQuestion?.conditional_mode !== 'all'
  || JSON.stringify(conditionSignature(interviewQuestion)) !== JSON.stringify(expectedInterviewConditions)) {
  fail('reachable_interview_informants conditions tidak sesuai.')
}

const dataset = byName.get('dataset')
const expectedDatasetConditions = [
  'may_collect_data_from_people:equals:ya',
  'may_use_documents_or_content:equals:ya',
  'may_experiment_or_develop:equals:ya',
].sort()
if (dataset?.conditional_mode !== 'any'
  || JSON.stringify(conditionSignature(dataset)) !== JSON.stringify(expectedDatasetConditions)) {
  fail('Dataset harus visible bila minimal satu router sumber data bernilai ya.')
}

const isEmpty = (value) => Array.isArray(value) ? value.length === 0 : norm(value) === ''
const evaluateCondition = (condition, parentValue) => {
  if (condition.operator === 'not_empty') return !isEmpty(parentValue)
  const expected = norm(condition.comparison_value)
  const matches = Array.isArray(parentValue)
    ? parentValue.map(norm).includes(expected)
    : norm(parentValue) === expected
  if (condition.operator === 'equals') return matches
  if (condition.operator === 'not_equals') return !matches
  if (condition.operator === 'contains') return Array.isArray(parentValue)
    ? matches
    : norm(parentValue).includes(expected)
  return false
}
const visibleFor = (answers = {}) => {
  const cache = new Map()
  const visiting = new Set()
  const visible = (question) => {
    if (cache.has(question.variable_name)) return cache.get(question.variable_name)
    if (visiting.has(question.variable_name)) {
      fail(`Visibility cycle: ${question.variable_name}`)
      return false
    }
    const conditions = question.conditions || []
    if (conditions.length === 0) {
      cache.set(question.variable_name, true)
      return true
    }
    visiting.add(question.variable_name)
    const results = conditions.map((condition) => {
      const parent = byName.get(condition.parent_variable_name)
      return Boolean(parent)
        && visible(parent)
        && evaluateCondition(condition, answers[parent.variable_name])
    })
    visiting.delete(question.variable_name)
    const result = question.conditional_mode === 'any'
      ? results.some(Boolean)
      : results.every(Boolean)
    cache.set(question.variable_name, result)
    return result
  }
  return questions.filter(visible)
}
const sectionCounts = (visibleQuestions) => Object.fromEntries(
  sections.map((section) => [
    section.section_key,
    visibleQuestions.filter((question) => question.section_key === section.section_key).length,
  ]),
)

const emptyVisible = visibleFor({})
if (emptyVisible.length > 15) fail(`Empty state >15: ${emptyVisible.length}`)
const emptyTechnical = emptyVisible.filter((question) => TECHNICAL_EMPTY_CHILDREN.has(question.variable_name))
if (emptyTechnical.length > 0) {
  fail(`Technical child visible pada empty state: ${emptyTechnical.map((question) => question.variable_name).join(', ')}`)
}

const commonAnswers = {
  degree_level: 'sarjana_s1',
  faculty: 'Fakultas',
  study_program: 'Program Studi',
  concentration: 'Belum memilih',
  study_stage: 'semester_7',
  research_assignment: 'skripsi',
  supervisor_status: 'belum_memiliki_pembimbing',
  interest_fields: ['teknologi'],
  problem_status: 'belum_menemukan_masalah',
  may_collect_data_from_people: 'tidak',
  may_use_documents_or_content: 'tidak',
  may_experiment_or_develop: 'tidak',
  knows_research_method: 'belum_tahu',
  devices: ['laptop_pribadi'],
  budget: 'rp100000_500000',
  daily_time: 'satu_dua_jam',
  novelty_importance: 'tidak_terlalu_penting',
  priority_ranking: [
    'aturan_kampus_dan_etika',
    'kesesuaian_program_studi',
    'kesesuaian_minat',
    'kemudahan_memperoleh_data',
    'kecepatan_pengerjaan',
  ],
}
const scenarios = [
  ['pemula_belum_punya_masalah', {}],
  ['survei_sederhana', {
    problem_status: 'masalah_jelas',
    may_collect_data_from_people: 'ya',
    knows_research_method: 'sudah_tahu',
    available_data_types: ['jawaban_angket'],
    preferred_approach: 'kuantitatif',
    preferred_research_paths: ['survei'],
    sensitive_data_or_groups: ['tidak_melibatkan_data_sensitif'],
  }],
  ['wawancara_sederhana', {
    problem_status: 'masalah_jelas',
    may_collect_data_from_people: 'ya',
    knows_research_method: 'punya_gambaran',
    available_data_types: ['hasil_wawancara'],
    preferred_approach: 'kualitatif',
    preferred_research_paths: ['studi_kasus'],
    sensitive_data_or_groups: ['tidak_melibatkan_data_sensitif'],
  }],
  ['dokumen_konten', {
    problem_status: 'masalah_jelas',
    may_use_documents_or_content: 'ya',
    knows_research_method: 'punya_gambaran',
    available_data_types: ['dokumen'],
    preferred_research_paths: ['analisis_dokumen'],
    sensitive_data_or_groups: ['tidak_melibatkan_data_sensitif'],
  }],
  ['eksperimen', {
    problem_status: 'masalah_jelas',
    may_experiment_or_develop: 'ya',
    knows_research_method: 'sudah_tahu',
    available_data_types: ['hasil_laboratorium'],
    preferred_research_paths: ['eksperimen'],
    required_output_status: 'not_required',
    sensitive_data_or_groups: ['tidak_melibatkan_data_sensitif'],
  }],
  ['pengembangan_produk', {
    problem_status: 'masalah_jelas',
    may_experiment_or_develop: 'ya',
    knows_research_method: 'sudah_tahu',
    available_data_types: ['kode_program'],
    preferred_research_paths: ['research_and_development'],
    required_output_status: 'required',
    required_output_types: ['aplikasi_atau_sistem'],
    sensitive_data_or_groups: ['tidak_melibatkan_data_sensitif'],
  }],
  ['studi_pustaka_hukum', {
    problem_status: 'masalah_jelas',
    may_use_documents_or_content: 'ya',
    knows_research_method: 'sudah_tahu',
    available_data_types: ['buku_atau_jurnal', 'dokumen'],
    preferred_research_paths: ['studi_pustaka', 'penelitian_hukum_normatif'],
    sensitive_data_or_groups: ['tidak_melibatkan_data_sensitif'],
  }],
  ['belum_memiliki_pembimbing', { supervisor_status: 'belum_memiliki_pembimbing' }],
  ['tidak_punya_perangkat', { devices: ['tidak_memiliki_perangkat_digital'] }],
  ['belum_pernah_software', {
    knows_research_method: 'punya_gambaran',
    software: ['belum_pernah_menggunakan_aplikasi_penelitian'],
  }],
  ['data_sensitif', {
    problem_status: 'masalah_jelas',
    may_collect_data_from_people: 'ya',
    available_data_types: ['hasil_wawancara'],
    sensitive_data_or_groups: ['data_kesehatan', 'pasien'],
  }],
  ['stress_multi_path', {
    problem_status: 'masalah_jelas',
    may_collect_data_from_people: 'ya',
    may_use_documents_or_content: 'ya',
    may_experiment_or_develop: 'ya',
    knows_research_method: 'sudah_tahu',
    available_data_types: ['jawaban_angket', 'hasil_wawancara', 'dokumen', 'dataset_digital', 'hasil_laboratorium'],
    preferred_approach: 'metode_campuran',
    preferred_research_paths: ['survei', 'studi_kasus', 'analisis_dokumen', 'eksperimen', 'research_and_development'],
    required_output_status: 'required',
    required_output_types: ['aplikasi_atau_sistem'],
    sensitive_data_or_groups: ['data_pribadi'],
  }],
]
const matrix = []
for (const [id, extraAnswers] of scenarios) {
  const answers = { ...commonAnswers, ...extraAnswers }
  const visibleQuestions = visibleFor(answers)
  const counts = sectionCounts(visibleQuestions)
  const maximumSection = Math.max(...Object.values(counts))
  matrix.push({ id, visible: visibleQuestions.length, max_section: maximumSection, sections: counts })
  if (id !== 'stress_multi_path') {
    if (visibleQuestions.length > 50) fail(`Canonical ${id} >50: ${visibleQuestions.length}`)
    else if (visibleQuestions.length > 45) warn(`Canonical ${id} di atas ideal 45: ${visibleQuestions.length}`)
    if (visibleQuestions.length < 25) warn(`Canonical ${id} <25: ${visibleQuestions.length}`)
    if (maximumSection > 9) fail(`Canonical ${id} section load >9: ${maximumSection}`)
    else if (maximumSection >= 8) warn(`Canonical ${id} section load ${maximumSection}`)
  } else if (visibleQuestions.length > 50) {
    warn(`Stress multi-path >50: ${visibleQuestions.length}`)
  }
}

const surveyOnlyVisible = new Set(visibleFor({
  ...commonAnswers,
  may_collect_data_from_people: 'ya',
  available_data_types: ['jawaban_angket'],
}).map((question) => question.variable_name))
if (!surveyOnlyVisible.has('reachable_survey_respondents')) fail('Survei murni harus menampilkan jumlah responden.')
if (surveyOnlyVisible.has('reachable_interview_informants')) fail('Survei murni tidak boleh menampilkan jumlah informan.')
const interviewOnlyVisible = new Set(visibleFor({
  ...commonAnswers,
  may_collect_data_from_people: 'ya',
  available_data_types: ['hasil_wawancara'],
}).map((question) => question.variable_name))
if (!interviewOnlyVisible.has('reachable_interview_informants')) fail('Wawancara murni harus menampilkan jumlah informan.')
if (interviewOnlyVisible.has('reachable_survey_respondents')) fail('Wawancara murni tidak boleh menampilkan jumlah responden.')
const bothVisible = new Set(visibleFor({
  ...commonAnswers,
  may_collect_data_from_people: 'ya',
  available_data_types: ['jawaban_angket', 'hasil_wawancara'],
}).map((question) => question.variable_name))
if (!bothVisible.has('reachable_survey_respondents') || !bothVisible.has('reachable_interview_informants')) {
  fail('Skenario survei+wawancara harus menampilkan responden dan informan.')
}

// Static reachability: reject impossible combinations inside one question.
for (const question of questions.filter((item) => (item.conditions || []).length > 0)) {
  if (question.conditional_mode !== 'all') continue
  const equalsByParent = new Map()
  for (const condition of question.conditions) {
    if (condition.operator !== 'equals') continue
    const values = equalsByParent.get(condition.parent_variable_name) || new Set()
    values.add(norm(condition.comparison_value))
    equalsByParent.set(condition.parent_variable_name, values)
  }
  for (const [parentName, values] of equalsByParent) {
    const parent = byName.get(parentName)
    if (!parent) continue
    if (!['checkbox', 'ranking'].includes(parent.question_type) && values.size > 1) {
      fail(`Unreachable child: ${question.variable_name} meminta beberapa nilai equals pada parent tunggal ${parentName}.`)
    }
  }
}
const buildFormData = (answers) => {
  const visible = new Set(visibleFor(answers).map((question) => question.variable_name))
  const output = {}
  const setNested = (path, value) => {
    const segments = path.split('.')
    let current = output
    for (const segment of segments.slice(0, -1)) current = current[segment] ??= {}
    current[segments.at(-1)] = value
  }
  for (const question of structuredQuestions) {
    let value = null
    if (visible.has(question.variable_name) && answers[question.variable_name] !== undefined) {
      const raw = answers[question.variable_name]
      if (Array.isArray(raw)) value = raw.length > 0 ? raw : null
      else if (question.question_type === 'number') value = norm(raw) === '' ? null : Number(raw)
      else value = norm(raw) || null
    }
    setNested(question.structured_path, value)
  }
  return output
}
const getNested = (object, path) => path.split('.').reduce((value, segment) => value?.[segment], object)
const outputFixtures = [
  ['semua_router_tidak', {
    ...commonAnswers,
    may_collect_data_from_people: 'tidak',
    may_use_documents_or_content: 'tidak',
    may_experiment_or_develop: 'tidak',
    knows_research_method: 'belum_tahu',
  }],
  ['semua_router_belum_yakin', {
    ...commonAnswers,
    may_collect_data_from_people: 'belum_yakin',
    may_use_documents_or_content: 'belum_yakin',
    may_experiment_or_develop: 'belum_yakin',
    knows_research_method: 'punya_gambaran',
  }],
  ['metode_belum_tahu', { ...commonAnswers, knows_research_method: 'belum_tahu' }],
  ['orang_tidak_dokumen_ya', {
    ...commonAnswers,
    may_collect_data_from_people: 'tidak',
    may_use_documents_or_content: 'ya',
    available_data_types: ['dokumen'],
  }],
  ['eksperimen_ya_metode_belum_tahu', {
    ...commonAnswers,
    may_experiment_or_develop: 'ya',
    knows_research_method: 'belum_tahu',
    available_data_types: ['hasil_laboratorium'],
  }],
  ['survei_murni', {
    ...commonAnswers,
    may_collect_data_from_people: 'ya',
    available_data_types: ['jawaban_angket'],
  }],
  ['wawancara_murni', {
    ...commonAnswers,
    may_collect_data_from_people: 'ya',
    available_data_types: ['hasil_wawancara'],
  }],
]
const fixtureResults = outputFixtures.map(([id, answers]) => ({
  id,
  data: buildFormData(answers),
}))
const fixtureById = new Map(fixtureResults.map((fixture) => [fixture.id, fixture]))
const allNo = fixtureById.get('semua_router_tidak').data
const allUnsure = fixtureById.get('semua_router_belum_yakin').data
for (const [path, expected] of [
  ['data_access.may_collect_data_from_people', 'tidak'],
  ['data_access.may_use_documents_or_content', 'tidak'],
  ['problem_and_goal.may_experiment_or_develop', 'tidak'],
  ['method_and_skills.method_knowledge_status', 'belum_tahu'],
]) {
  if (getNested(allNo, path) !== expected) fail(`Fixture semua_router_tidak salah pada ${path}.`)
}
for (const [path, expected] of [
  ['data_access.may_collect_data_from_people', 'belum_yakin'],
  ['data_access.may_use_documents_or_content', 'belum_yakin'],
  ['problem_and_goal.may_experiment_or_develop', 'belum_yakin'],
  ['method_and_skills.method_knowledge_status', 'punya_gambaran'],
]) {
  if (getNested(allUnsure, path) !== expected) fail(`Fixture semua_router_belum_yakin salah pada ${path}.`)
}
if (JSON.stringify({
  people: getNested(allNo, ROUTER_PATHS.may_collect_data_from_people),
  docs: getNested(allNo, ROUTER_PATHS.may_use_documents_or_content),
  experiment: getNested(allNo, ROUTER_PATHS.may_experiment_or_develop),
}) === JSON.stringify({
  people: getNested(allUnsure, ROUTER_PATHS.may_collect_data_from_people),
  docs: getNested(allUnsure, ROUTER_PATHS.may_use_documents_or_content),
  experiment: getNested(allUnsure, ROUTER_PATHS.may_experiment_or_develop),
})) {
  fail('Fixture semua-router-tidak dan semua-router-belum-yakin tidak boleh mempunyai data router yang sama.')
}
for (const fixture of fixtureResults.slice(0, 5)) {
  const answers = outputFixtures.find(([id]) => id === fixture.id)[1]
  const visibleNames = new Set(visibleFor(answers).map((question) => question.variable_name))
  for (const question of structuredQuestions) {
    if (!visibleNames.has(question.variable_name)
      && getNested(fixture.data, question.structured_path) !== null) {
      fail(`Hidden child harus null pada fixture ${fixture.id}: ${question.variable_name}`)
    }
  }
}

if (questions.filter((question) => question.structured_scope === 'acknowledgement').length !== 1) fail('Acknowledgement harus 1.')
if (questions.filter((question) => question.structured_scope === 'consent').length !== 1) fail('Consent harus 1.')
if (manifest.tool.structured_schema_version !== '1.6.1'
  || manifest.tool.structured_prompt_version !== '1.6.1'
  || manifest.tool.structured_validation_rules_version !== 'browser-local-1.1'
  || manifest.tool.structured_pipeline_version !== 'browser-prompt-only-1.1'
  || manifest.tool.structured_deidentification_policy_version !== '') {
  fail('Versi structured tidak sesuai v1.6.1.')
}

const optionCount = questions.reduce((total, question) => total + (question.options || []).length, 0)
const conditionCount = questions.reduce((total, question) => total + (question.conditions || []).length, 0)
console.log('JT-4C.4 validator v1.6.1')
console.log(`Rows: ${questions.length}`)
console.log(`Options: ${optionCount}`)
console.log(`Conditions: ${conditionCount}`)
console.log(`Structured paths: ${paths.length}`)
console.log(`Empty state: ${emptyVisible.length}`)
console.log(`Technical children visible on empty state: ${emptyTechnical.length}`)
console.log('\nCanonical matrix:')
for (const row of matrix) {
  console.log(`${row.id}: total=${row.visible}; max_section=${row.max_section}; sections=${Object.entries(row.sections).map(([key, value]) => `${key}:${value}`).join(' ')}`)
}
console.log('\nRouter output fixtures:')
for (const fixture of fixtureResults) {
  console.log(`${fixture.id}: people=${JSON.stringify(getNested(fixture.data, ROUTER_PATHS.may_collect_data_from_people))}; documents=${JSON.stringify(getNested(fixture.data, ROUTER_PATHS.may_use_documents_or_content))}; experiment=${JSON.stringify(getNested(fixture.data, ROUTER_PATHS.may_experiment_or_develop))}; method=${JSON.stringify(getNested(fixture.data, ROUTER_PATHS.knows_research_method))}`)
}
console.log(`\nWarnings: ${warnings.length}`)
warnings.forEach((message) => console.log(`WARN: ${message}`))
console.log(`Errors: ${errors.length}`)
errors.forEach((message) => console.error(`ERROR: ${message}`))
if (errors.length > 0) process.exit(1)
