import manifest from './data/research-title-tool-v1.6.mjs'

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

const PATH_PATTERN = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)*$/
const VARIABLE_PATTERN = /^[a-z][a-z0-9_]*$/
const PLACEHOLDER_PATTERN = /{{\s*([^{}]+?)\s*}}/g
const SYSTEM_PLACEHOLDERS = new Set([
  'FORM_DATA_JSON',
  'VALIDATION_NOTES',
  'PROCESSING_METADATA',
])
const DANGEROUS_PATH_SEGMENTS = new Set([
  '__proto__',
  'prototype',
  'constructor',
])

const errors = []
const warnings = []

const fail = (message) => {
  errors.push(message)
}

const warn = (message) => {
  warnings.push(message)
}

const normalizeString = (value) => String(value ?? '').trim()

const duplicateValues = (values) => {
  const seen = new Set()
  const duplicates = new Set()

  values.forEach((value) => {
    if (seen.has(value)) {
      duplicates.add(value)
    }
    seen.add(value)
  })

  return [...duplicates]
}

const questions = Array.isArray(manifest.questions)
  ? [...manifest.questions].sort(
    (first, second) => Number(first.sort_order) - Number(second.sort_order),
  )
  : []
const sections = Array.isArray(manifest.sections)
  ? [...manifest.sections].sort(
    (first, second) => Number(first.sort_order) - Number(second.sort_order),
  )
  : []
const tool = manifest.tool || {}
const audit = manifest.audit || {}

if (questions.length === 0) {
  fail('Manifest tidak memiliki pertanyaan.')
}

if (sections.length === 0) {
  fail('Manifest tidak memiliki section.')
}

const sectionKeys = sections.map((section) => normalizeString(section.section_key))
const sectionOrders = sections.map((section) => Number(section.sort_order))

duplicateValues(sectionKeys).forEach((key) => {
  fail(`Section key duplikat: ${key}`)
})
duplicateValues(sectionOrders).forEach((order) => {
  fail(`sort_order section duplikat: ${order}`)
})

const expectedSectionKeys = 'ABCDEFGHIJ'.split('')
const missingSectionKeys = expectedSectionKeys.filter(
  (key) => !sectionKeys.includes(key),
)
const unexpectedSectionKeys = sectionKeys.filter(
  (key) => !expectedSectionKeys.includes(key),
)

if (missingSectionKeys.length > 0 || unexpectedSectionKeys.length > 0) {
  fail(
    `Section A–J tidak lengkap. Missing: ${missingSectionKeys.join(', ') || '-'}; `
    + `unexpected: ${unexpectedSectionKeys.join(', ') || '-'}`,
  )
}

const variableNames = questions.map(
  (question) => normalizeString(question.variable_name),
)
duplicateValues(variableNames).forEach((variableName) => {
  fail(`variable_name duplikat: ${variableName}`)
})

const questionOrders = questions.map((question) => Number(question.sort_order))
duplicateValues(questionOrders).forEach((order) => {
  fail(`sort_order pertanyaan duplikat: ${order}`)
})

const questionsByVariableName = new Map(
  questions.map((question) => [
    normalizeString(question.variable_name),
    question,
  ]),
)
const questionOrderByVariableName = new Map(
  questions.map((question, index) => [
    normalizeString(question.variable_name),
    index,
  ]),
)

const structuredPaths = []
let consentCount = 0

for (const question of questions) {
  const sourceNumber = normalizeString(question.source_number)
  const variableName = normalizeString(question.variable_name)
  const questionType = normalizeString(question.question_type)
  const scope = normalizeString(question.structured_scope)
  const path = normalizeString(question.structured_path)
  const passValue = normalizeString(question.structured_pass_value)
  const options = Array.isArray(question.options) ? question.options : []
  const conditions = Array.isArray(question.conditions) ? question.conditions : []

  if (!sourceNumber) {
    fail(`source_number kosong pada ${variableName || '(variable kosong)'}.`)
  }

  if (!VARIABLE_PATTERN.test(variableName)) {
    fail(`variable_name tidak valid: ${variableName || '(kosong)'}`)
  }

  if (!SUPPORTED_QUESTION_TYPES.has(questionType)) {
    fail(`question_type tidak didukung pada ${variableName}: ${questionType}`)
  }

  if (!STRUCTURED_SCOPES.has(scope)) {
    fail(`structured_scope tidak valid pada ${variableName}: ${scope}`)
  }

  if (CHOICE_TYPES.has(questionType)) {
    if (options.length < 2) {
      fail(`Choice question mempunyai kurang dari dua options: ${variableName}`)
    }

    const optionValues = options.map(
      (option) => normalizeString(option.option_value),
    )

    if (optionValues.some((value) => !value)) {
      fail(`option value kosong pada ${variableName}`)
    }

    duplicateValues(optionValues).forEach((value) => {
      fail(`option value duplikat pada ${variableName}: ${value}`)
    })
  } else if (options.length > 0) {
    fail(`Pertanyaan non-choice memiliki options: ${variableName}`)
  }

  const expectedEnumValues = audit.research_core_enums?.[path]
  if (scope === 'form_data' && Array.isArray(expectedEnumValues)) {
    if (!CHOICE_TYPES.has(questionType)) {
      fail(`Field enum schema tidak dimodelkan sebagai choice: ${path}`)
    } else {
      const actualOptionValues = options.map(
        (option) => normalizeString(option.option_value),
      )
      const missingEnumValues = expectedEnumValues.filter(
        (value) => !actualOptionValues.includes(value),
      )
      const unexpectedEnumValues = actualOptionValues.filter(
        (value) => !expectedEnumValues.includes(value),
      )

      if (missingEnumValues.length > 0 || unexpectedEnumValues.length > 0) {
        fail(
          `Option value tidak sesuai enum schema pada ${path}. `
          + `Missing: ${missingEnumValues.join(', ') || '-'}; `
          + `unexpected: ${unexpectedEnumValues.join(', ') || '-'}`,
        )
      }
    }
  }

  if (question.is_additional_other === true) {
    if (!path.endsWith('_other')) {
      fail(`Field Lainnya tidak memakai path *_other: ${variableName}`)
    }
    if (questionType !== 'short_text') {
      fail(`Field Lainnya harus short_text: ${variableName}`)
    }
    if (question.is_required !== true) {
      fail(`Field Lainnya harus required ketika tampil: ${variableName}`)
    }
    if (conditions.length !== 1) {
      fail(`Field Lainnya harus mempunyai tepat satu kondisi: ${variableName}`)
    }
  }

  const minSelections = question.min_selections
  const maxSelections = question.max_selections
  const minIsSet = minSelections !== null && minSelections !== undefined
  const maxIsSet = maxSelections !== null && maxSelections !== undefined
  const normalizedMin = minIsSet ? Number(minSelections) : null
  const normalizedMax = maxIsSet ? Number(maxSelections) : null

  if (minIsSet && (!Number.isInteger(normalizedMin) || normalizedMin < 0)) {
    fail(`min_selections tidak valid pada ${variableName}`)
  }

  if (maxIsSet && (!Number.isInteger(normalizedMax) || normalizedMax < 0)) {
    fail(`max_selections tidak valid pada ${variableName}`)
  }

  if (
    normalizedMin !== null
    && normalizedMax !== null
    && normalizedMin > normalizedMax
  ) {
    fail(`min selection lebih besar dari max pada ${variableName}`)
  }

  if (normalizedMax !== null && normalizedMax > options.length) {
    fail(`max selection lebih besar dari jumlah options pada ${variableName}`)
  }

  const effectiveMinimum = normalizedMin !== null
    ? normalizedMin
    : question.is_required === true && ['checkbox', 'ranking'].includes(questionType)
      ? 1
      : 0
  const exclusiveCount = options.filter(
    (option) => option.is_exclusive === true,
  ).length
  const regularOptionCount = options.length - exclusiveCount

  if (
    exclusiveCount > 0
    && effectiveMinimum > 1
    && regularOptionCount < effectiveMinimum
  ) {
    fail(`exclusive option membuat minimum mustahil dipenuhi pada ${variableName}`)
  }

  if (scope === 'form_data') {
    if (!path) {
      fail(`form_data tanpa structured_path: ${variableName}`)
    } else {
      if (!PATH_PATTERN.test(path)) {
        fail(`path invalid: ${path}`)
      }

      const pathSegments = path.split('.')
      if (
        pathSegments.some((segment) => (
          DANGEROUS_PATH_SEGMENTS.has(segment.toLowerCase())
        ))
      ) {
        fail(`path berbahaya: ${path}`)
      }

      structuredPaths.push(path)
    }

    if (passValue) {
      fail(`form_data tidak boleh mempunyai structured_pass_value: ${variableName}`)
    }
  }

  if (['acknowledgement', 'consent'].includes(scope)) {
    if (path) {
      fail(`${scope} mempunyai structured_path: ${variableName}`)
    }

    if (!passValue) {
      fail(`${scope} tanpa pass value: ${variableName}`)
    }

    const optionValues = options.map(
      (option) => normalizeString(option.option_value),
    )
    if (passValue && !optionValues.includes(passValue)) {
      fail(`pass value tidak terdapat pada options: ${variableName}`)
    }

    if (scope === 'consent') {
      consentCount += 1
    }
  }

  if (scope === 'exclude' && (path || passValue)) {
    fail(`exclude harus memiliki path dan pass value null: ${variableName}`)
  }

  if (!['all', 'any'].includes(normalizeString(question.conditional_mode))) {
    fail(`conditional_mode tidak valid pada ${variableName}`)
  }

  for (const condition of conditions) {
    const parentVariableName = normalizeString(
      condition.parent_variable_name,
    )
    const operator = normalizeString(condition.operator)
    const comparisonValue = normalizeString(condition.comparison_value)
    const parent = questionsByVariableName.get(parentVariableName)

    if (!parent) {
      fail(
        `parent condition tidak ditemukan untuk ${variableName}: `
        + parentVariableName,
      )
      continue
    }

    const parentOrder = questionOrderByVariableName.get(parentVariableName)
    const childOrder = questionOrderByVariableName.get(variableName)

    if (parentOrder >= childOrder) {
      fail(
        `parent muncul setelah child: ${parentVariableName} -> ${variableName}`,
      )
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
      fail(`comparison value kosong pada ${variableName}`)
      continue
    }

    const parentOptions = Array.isArray(parent.options)
      ? parent.options
      : []
    const parentOptionValues = parentOptions.map(
      (option) => normalizeString(option.option_value),
    )

    if (!parentOptionValues.includes(comparisonValue)) {
      fail(
        `comparison value tidak tersedia pada option parent: `
        + `${parentVariableName}.${comparisonValue} -> ${variableName}`,
      )
    }
  }
}

duplicateValues(structuredPaths).forEach((path) => {
  fail(`structured_path duplikat: ${path}`)
})

for (let firstIndex = 0; firstIndex < structuredPaths.length; firstIndex += 1) {
  for (
    let secondIndex = firstIndex + 1;
    secondIndex < structuredPaths.length;
    secondIndex += 1
  ) {
    const firstPath = structuredPaths[firstIndex]
    const secondPath = structuredPaths[secondIndex]

    if (
      firstPath.startsWith(`${secondPath}.`)
      || secondPath.startsWith(`${firstPath}.`)
    ) {
      fail(`konflik parent/child path: ${firstPath} <-> ${secondPath}`)
    }
  }
}

if (consentCount > 1) {
  fail(`lebih dari satu consent: ${consentCount}`)
}
if (consentCount === 0) {
  fail('Consent local-only tidak ditemukan.')
}

const consentQuestion = questions.find(
  (question) => question.structured_scope === 'consent',
)
if (consentQuestion) {
  const combinedConsentText = [
    consentQuestion.label,
    consentQuestion.help_text,
    ...(consentQuestion.options || []).map((option) => option.option_label),
  ].join(' ')

  const requiredConsentFragments = [
    'menyusun prompt',
    'salin',
    'GreenroomID hanya menyusun prompt di browser',
    'GreenroomID tidak mengirim jawaban ke AI',
    'hapus data pribadi',
  ]

  requiredConsentFragments.forEach((fragment) => {
    if (!combinedConsentText.includes(fragment)) {
      fail(`consent tidak menggunakan wording local-only: kehilangan "${fragment}"`)
    }
  })

  if (consentQuestion.question_type !== 'single_choice') {
    fail('Consent harus menggunakan single_choice.')
  }

  if (consentQuestion.structured_pass_value !== 'setuju_menyusun_prompt') {
    fail('Consent pass value harus setuju_menyusun_prompt.')
  }
}

const acknowledgementQuestion = questions.find(
  (question) => question.source_number === '88',
)
if (!acknowledgementQuestion) {
  fail('Acknowledgement nomor 88 tidak ditemukan.')
} else {
  if ((acknowledgementQuestion.options || []).length !== 5) {
    fail('Acknowledgement harus mempunyai tepat lima option.')
  }
  if (
    acknowledgementQuestion.min_selections !== 5
    || acknowledgementQuestion.max_selections !== 5
  ) {
    fail('Acknowledgement harus memakai min_selections = 5 dan max_selections = 5.')
  }
  const passValue = normalizeString(
    acknowledgementQuestion.structured_pass_value,
  )
  const optionValues = (acknowledgementQuestion.options || []).map(
    (option) => normalizeString(option.option_value),
  )
  if (!optionValues.includes(passValue)) {
    fail('Acknowledgement pass value tidak tersedia pada options.')
  }
}

const rankingQuestion = questions.find(
  (question) => question.source_number === '83',
)
if (!rankingQuestion) {
  fail('Pertanyaan ranking nomor 83 tidak ditemukan.')
} else if (
  rankingQuestion.question_type !== 'ranking'
  || rankingQuestion.min_selections !== 5
  || rankingQuestion.max_selections !== 5
  || (rankingQuestion.options || []).length < 5
) {
  fail('Ranking pertanyaan 83 harus memilih tepat lima dari options tersedia.')
}

const template = String(tool.prompt_template || '')
const placeholders = []
PLACEHOLDER_PATTERN.lastIndex = 0
let placeholderMatch
while ((placeholderMatch = PLACEHOLDER_PATTERN.exec(template)) !== null) {
  placeholders.push(normalizeString(placeholderMatch[1]))
}
PLACEHOLDER_PATTERN.lastIndex = 0

SYSTEM_PLACEHOLDERS.forEach((placeholder) => {
  if (!placeholders.includes(placeholder)) {
    fail(`template tidak mempunyai placeholder sistem: ${placeholder}`)
  }
})

const unknownPlaceholders = [...new Set(placeholders)].filter(
  (placeholder) => !SYSTEM_PLACEHOLDERS.has(placeholder),
)
if (unknownPlaceholders.length > 0) {
  fail(`template memakai placeholder tidak dikenal: ${unknownPlaceholders.join(', ')}`)
}

if (
  normalizeString(tool.structured_deidentification_policy_version) !== ''
) {
  fail('versi deidentifikasi tidak kosong.')
}

const sourceBaseNumbers = new Set(
  questions
    .map((question) => {
      const match = normalizeString(question.source_parent_number).match(/^\d+$/)
      return match ? Number(match[0]) : null
    })
    .filter((value) => value !== null),
)
const requiredMainNumbers = Array.isArray(audit.required_main_numbers)
  ? audit.required_main_numbers
  : Array.from({ length: 89 }, (_value, index) => index + 1)
const missingMainNumbers = requiredMainNumbers.filter(
  (number) => !sourceBaseNumbers.has(Number(number)),
)
if (missingMainNumbers.length > 0) {
  fail(`Audit coverage nomor utama 1–89 tidak lengkap: ${missingMainNumbers.join(', ')}`)
}

for (const requiredSubnumber of audit.required_subnumbers || []) {
  if (!questions.some(
    (question) => question.source_number === requiredSubnumber,
  )) {
    fail(`Subnomor wajib tidak ditemukan: ${requiredSubnumber}`)
  }
}

for (const requiredComponent of audit.required_65_components || []) {
  if (!questions.some(
    (question) => question.source_number === requiredComponent,
  )) {
    fail(`Komponen nomor 65 tidak ditemukan: ${requiredComponent}`)
  }
}

const expectedResearchCorePaths = new Set(
  Array.isArray(audit.research_core_paths)
    ? audit.research_core_paths
    : [],
)
const mappedResearchCorePaths = new Set(structuredPaths)
const missingResearchCorePaths = [...expectedResearchCorePaths].filter(
  (path) => !mappedResearchCorePaths.has(path),
)
const unexpectedResearchCorePaths = [...mappedResearchCorePaths].filter(
  (path) => !expectedResearchCorePaths.has(path),
)

if (missingResearchCorePaths.length > 0) {
  fail(
    `Research core field tanpa mapping/alasan: `
    + missingResearchCorePaths.join(', '),
  )
}
if (unexpectedResearchCorePaths.length > 0) {
  fail(
    `Structured path tidak terdapat pada #/$defs/research_core: `
    + unexpectedResearchCorePaths.join(', '),
  )
}

const explicitExclusiveMap = audit.exclusive_option_map || {}
for (const [path, expectedExclusiveValues] of Object.entries(explicitExclusiveMap)) {
  const question = questions.find(
    (item) => item.structured_path === path,
  )

  if (!question) {
    fail(`Pertanyaan untuk peta exclusive tidak ditemukan: ${path}`)
    continue
  }

  const actualExclusiveValues = (question.options || [])
    .filter((option) => option.is_exclusive === true)
    .map((option) => normalizeString(option.option_value))
    .sort()
  const normalizedExpectedValues = [...expectedExclusiveValues].sort()

  if (
    JSON.stringify(actualExclusiveValues)
    !== JSON.stringify(normalizedExpectedValues)
  ) {
    fail(
      `Peta exclusive tidak sesuai spesifikasi pada ${path}. `
      + `Expected: ${normalizedExpectedValues.join(', ')}; `
      + `actual: ${actualExclusiveValues.join(', ')}`,
    )
  }
}

for (const question of questions) {
  const path = normalizeString(question.structured_path)
  if (
    question.structured_scope === 'form_data'
    && !explicitExclusiveMap[path]
    && (question.options || []).some((option) => option.is_exclusive === true)
  ) {
    fail(`Option ditandai exclusive di luar peta eksplisit: ${path}`)
  }
}

const requiredOptionGroups = new Set(audit.required_option_groups || [])
const questions8And59 = questions.filter(
  (question) => ['8', '59'].includes(question.source_number),
)
for (const question of questions8And59) {
  const actualGroups = new Set(
    (question.options || [])
      .map((option) => normalizeString(option.group_label))
      .filter(Boolean),
  )
  const missingGroups = [...requiredOptionGroups].filter(
    (groupLabel) => !actualGroups.has(groupLabel),
  )

  if (missingGroups.length > 0) {
    fail(
      `Option group pertanyaan ${question.source_number} tidak lengkap: `
      + missingGroups.join(', '),
    )
  }
}


const EXPECTED_ROW_COUNT = 120
const EXPECTED_PRIMARY_COUNT = 96
const EXPECTED_OTHER_COUNT = 24
const EXPECTED_STRUCTURED_PATH_COUNT = 118
const EXPECTED_SECTION_COUNT = 10
const BEFORE_CONDITION_COUNT = 75
const BEFORE_UNCONDITIONAL_COUNT = 81

const visibilityPolicy = manifest.visibility_policy || {}
const branchingDecisions = Array.isArray(manifest.branching_decisions)
  ? manifest.branching_decisions
  : []
const allowedDecisionClassifications = new Set([
  'explicit_specification',
  'implementation_inference',
  'product_decision_heuristic',
])

if (sections.length !== EXPECTED_SECTION_COUNT) {
  fail(
    `Jumlah section berubah. Expected ${EXPECTED_SECTION_COUNT}, `
    + `actual ${sections.length}.`,
  )
}
if (questions.length !== EXPECTED_ROW_COUNT) {
  fail(
    `Jumlah row pertanyaan berubah. Expected ${EXPECTED_ROW_COUNT}, `
    + `actual ${questions.length}.`,
  )
}

const currentPrimaryCount = questions.filter(
  (question) => question.is_primary_question === true,
).length
const currentOtherCount = questions.filter(
  (question) => question.is_additional_other === true,
).length

if (currentPrimaryCount !== EXPECTED_PRIMARY_COUNT) {
  fail(
    `Jumlah pertanyaan utama berubah. Expected ${EXPECTED_PRIMARY_COUNT}, `
    + `actual ${currentPrimaryCount}.`,
  )
}
if (currentOtherCount !== EXPECTED_OTHER_COUNT) {
  fail(
    `Jumlah field Lainnya berubah. Expected ${EXPECTED_OTHER_COUNT}, `
    + `actual ${currentOtherCount}.`,
  )
}
if (structuredPaths.length !== EXPECTED_STRUCTURED_PATH_COUNT) {
  fail(
    `Jumlah structured path berubah. Expected ${EXPECTED_STRUCTURED_PATH_COUNT}, `
    + `actual ${structuredPaths.length}.`,
  )
}

const expectedVisibilityPolicy = {
  canonical_min_visible: 35,
  canonical_max_visible: 50,
  below_min_behavior: 'warning',
  above_max_behavior: 'error',
  stress_scenario_behavior: 'warning',
  geographic_scope_always_visible: true,
  data_period_always_visible: true,
  hidden_form_data_value: 'null',
  heuristic_classification: 'product_decision_heuristic',
}

for (const [key, expectedValue] of Object.entries(expectedVisibilityPolicy)) {
  if (visibilityPolicy[key] !== expectedValue) {
    fail(
      `visibility_policy.${key} tidak sesuai. `
      + `Expected ${JSON.stringify(expectedValue)}, `
      + `actual ${JSON.stringify(visibilityPolicy[key])}.`,
    )
  }
}

const expectedVisibleDefinition = [
  'primary_visible',
  'active_other_visible',
  'acknowledgement_visible',
  'consent_visible',
]
if (
  JSON.stringify(visibilityPolicy.total_visible_definition)
  !== JSON.stringify(expectedVisibleDefinition)
) {
  fail(
    'visibility_policy.total_visible_definition harus menghitung '
    + 'pertanyaan utama, field Lainnya aktif, acknowledgement, dan consent.',
  )
}

const conditionKey = ({
  childSourceNumber,
  parentVariableName,
  operator,
  comparisonValue,
}) => [
  normalizeString(childSourceNumber),
  normalizeString(parentVariableName),
  normalizeString(operator),
  operator === 'not_empty' ? '' : normalizeString(comparisonValue),
].join('::')

const manifestConditionKeys = []
for (const question of questions) {
  if (question.is_additional_other === true) continue

  for (const condition of question.conditions || []) {
    manifestConditionKeys.push(conditionKey({
      childSourceNumber: question.source_number,
      parentVariableName: condition.parent_variable_name,
      operator: condition.operator,
      comparisonValue: condition.comparison_value,
    }))
  }
}

const decisionKeys = []
for (const decision of branchingDecisions) {
  const childSourceNumber = normalizeString(decision.child_source_number)
  const parentVariableName = normalizeString(decision.parent_variable_name)
  const operator = normalizeString(decision.operator)
  const comparisonValue = normalizeString(decision.comparison_value)
  const classification = normalizeString(decision.classification)
  const reason = normalizeString(decision.reason)
  const risk = normalizeString(decision.risk)
  const child = questions.find(
    (question) => normalizeString(question.source_number) === childSourceNumber,
  )
  const parent = questionsByVariableName.get(parentVariableName)

  if (!child || child.is_additional_other === true) {
    fail(`branching_decisions menunjuk child nonvalid: ${childSourceNumber}`)
  }
  if (!parent) {
    fail(
      `branching_decisions menunjuk parent nonvalid: `
      + `${childSourceNumber} <- ${parentVariableName}`,
    )
  }
  if (!CONDITION_OPERATORS.has(operator)) {
    fail(
      `branching_decisions memakai operator nonvalid: `
      + `${childSourceNumber}.${operator}`,
    )
  }
  if (!allowedDecisionClassifications.has(classification)) {
    fail(
      `branching_decisions classification tidak valid: `
      + `${childSourceNumber}.${classification}`,
    )
  }
  if (!reason) {
    fail(`branching_decisions tanpa reason: ${childSourceNumber}`)
  }
  if (!risk) {
    fail(`branching_decisions tanpa risk: ${childSourceNumber}`)
  }
  if (operator === 'not_empty' && comparisonValue) {
    fail(
      `branching_decisions not_empty harus memakai comparison_value null: `
      + childSourceNumber,
    )
  }

  decisionKeys.push(conditionKey({
    childSourceNumber,
    parentVariableName,
    operator,
    comparisonValue,
  }))
}

duplicateValues(decisionKeys).forEach((key) => {
  fail(`branching_decisions duplikat: ${key}`)
})

for (const key of manifestConditionKeys) {
  if (!decisionKeys.includes(key)) {
    fail(`Condition non-Lainnya belum memiliki provenance: ${key}`)
  }
}
for (const key of decisionKeys) {
  if (!manifestConditionKeys.includes(key)) {
    fail(`branching_decisions tidak cocok dengan condition manifest: ${key}`)
  }
}

const dependencyState = new Map()
const dependencyStack = []
const visitDependency = (question) => {
  const variableName = normalizeString(question.variable_name)
  const state = dependencyState.get(variableName)

  if (state === 'visiting') {
    const cycleStart = dependencyStack.indexOf(variableName)
    const cycle = [
      ...dependencyStack.slice(Math.max(0, cycleStart)),
      variableName,
    ]
    fail(`Dependency cycle terdeteksi: ${cycle.join(' -> ')}`)
    return
  }
  if (state === 'visited') return

  dependencyState.set(variableName, 'visiting')
  dependencyStack.push(variableName)

  for (const condition of question.conditions || []) {
    const parent = questionsByVariableName.get(
      normalizeString(condition.parent_variable_name),
    )
    if (parent) visitDependency(parent)
  }

  dependencyStack.pop()
  dependencyState.set(variableName, 'visited')
}
questions.forEach(visitDependency)

const question13A = questions.find(
  (question) => normalizeString(question.source_number) === '13A',
)
const question13B = questions.find(
  (question) => normalizeString(question.source_number) === '13B',
)
if (!question13A || !question13B) {
  fail('Pertanyaan 13A atau 13B tidak ditemukan.')
} else {
  const yesOption = (question13A.options || []).find(
    (option) => normalizeString(option.option_label) === 'Ya',
  )
  if (!yesOption || normalizeString(yesOption.option_value) !== 'required') {
    fail('Option Ya pada 13A harus memakai option_value required.')
  }

  const conditions13B = question13B.conditions || []
  if (
    normalizeString(question13B.conditional_mode) !== 'all'
    || conditions13B.length !== 1
    || normalizeString(conditions13B[0].parent_variable_name)
      !== 'required_output_status'
    || normalizeString(conditions13B[0].operator) !== 'equals'
    || normalizeString(conditions13B[0].comparison_value) !== 'required'
  ) {
    fail('13B harus hanya tampil jika 13A = required.')
  }
}

const evaluateCondition = (condition, parentValue) => {
  const operator = normalizeString(condition.operator)
  const expectedValue = normalizeString(condition.comparison_value)

  if (operator === 'not_empty') {
    return Array.isArray(parentValue)
      ? parentValue.length > 0
      : normalizeString(parentValue) !== ''
  }

  const matches = Array.isArray(parentValue)
    ? parentValue.some((value) => normalizeString(value) === expectedValue)
    : normalizeString(parentValue) === expectedValue

  if (operator === 'equals') return matches
  if (operator === 'not_equals') return !matches
  if (operator === 'contains') {
    return Array.isArray(parentValue)
      ? matches
      : normalizeString(parentValue).includes(expectedValue)
  }

  return false
}

const visibleQuestionsForAnswers = (answers) => {
  const cache = new Map()
  const visiting = new Set()

  const isVisible = (question) => {
    const variableName = normalizeString(question.variable_name)

    if (cache.has(variableName)) {
      return cache.get(variableName)
    }

    if (visiting.has(variableName)) {
      fail(`Cycle visibility terdeteksi saat evaluasi: ${variableName}`)
      cache.set(variableName, false)
      return false
    }

    const conditions = Array.isArray(question.conditions)
      ? question.conditions
      : []

    if (conditions.length === 0) {
      cache.set(variableName, true)
      return true
    }

    visiting.add(variableName)
    const results = conditions.map((condition) => {
      const parent = questionsByVariableName.get(
        normalizeString(condition.parent_variable_name),
      )
      if (!parent || !isVisible(parent)) {
        return false
      }

      return evaluateCondition(
        condition,
        answers[normalizeString(parent.variable_name)],
      )
    })
    visiting.delete(variableName)

    const visible = question.conditional_mode === 'any'
      ? results.some(Boolean)
      : results.every(Boolean)
    cache.set(variableName, visible)
    return visible
  }

  return questions.filter(isVisible)
}

const commonAnswers = {
  degree_level: 'sarjana_s1',
  faculty: 'Fakultas',
  study_program: 'Program Studi',
  concentration: 'Umum',
  study_stage: 'semester_7',
  research_assignment: 'skripsi',
  title_deadline: 'tiga_empat_minggu',
  research_completion_target: 'tiga_empat_bulan',
  interest_fields: ['teknologi'],
  main_curiosity: 'Topik penelitian',
  preferred_objects: ['dataset'],
  actually_accessible_sources: 'Sumber yang dapat diakses',
  access_level: 'sangat_mudah_tanpa_izin',
  available_data_types: ['belum_mengetahui'],
  research_settings: ['dokumen_atau_dataset'],
  geographic_scope: 'tidak_relevan',
  data_period: 'satu_tahun',
  skills: ['menulis'],
  devices: ['laptop_pribadi'],
  budget: 'rp100000_500000',
  daily_time: 'satu_dua_jam',
  main_barriers: ['waktu_terbatas'],
  sensitive_data_or_groups: ['tidak_melibatkan_data_sensitif'],
  novelty_importance: 'tidak_terlalu_penting',
  title_risk_level: 'aman_dan_konvensional',
  priority_ranking: [
    'aturan_kampus_dan_etika',
    'kesesuaian_program_studi',
    'kesesuaian_minat',
    'kemudahan_memperoleh_data',
    'kecepatan_pengerjaan',
  ],
}

const canonicalScenarios = [
  {
    id: 'unknown_problem_method',
    name: 'Belum menemukan masalah, belum mengetahui metode, tanpa data sensitif',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['belum_mengetahui'],
      allowed_research_paths: ['belum_mengetahui'],
      data_source_requirement: 'belum_mengetahui',
      supervisor_status: 'belum_memiliki_pembimbing',
      relevant_experience_types: ['belum_memiliki_pengalaman_relevan'],
      problem_status: 'belum_menemukan_masalah',
      analytical_goals: ['belum_mengetahui'],
      preferred_objects: ['belum_mengetahui'],
      access_level: 'belum_memiliki_akses',
      available_data_types: ['belum_mengetahui'],
      research_settings: ['belum_mengetahui'],
      geographic_scope: 'belum_mengetahui',
      data_period: 'belum_mengetahui',
      preferred_approach: 'belum_mengetahui',
      preferred_research_paths: ['belum_mengetahui'],
      skills: ['belum_memiliki_kemampuan_khusus'],
    },
  },
  {
    id: 'quantitative_survey',
    name: 'Survei kuantitatif',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['kuantitatif'],
      allowed_research_paths: ['survei'],
      data_source_requirement: 'wajib_data_primer',
      supervisor_status: 'belum_memiliki_pembimbing',
      relevant_experience_types: ['penggunaan_teknologi'],
      problem_status: 'masalah_jelas',
      analytical_goals: ['menggambarkan_fenomena'],
      preferred_objects: ['mahasiswa'],
      available_data_types: ['jawaban_angket'],
      research_settings: ['satu_kelas_atau_kelompok'],
      geographic_scope: 'tidak_relevan',
      preferred_approach: 'kuantitatif',
      preferred_research_paths: ['survei'],
      skills: ['statistik'],
    },
  },
  {
    id: 'qualitative_interview',
    name: 'Wawancara kualitatif',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['kualitatif'],
      allowed_research_paths: ['studi_kasus'],
      data_source_requirement: 'wajib_data_primer',
      supervisor_status: 'belum_memiliki_pembimbing',
      relevant_experience_types: ['penggunaan_teknologi'],
      problem_status: 'masalah_jelas',
      analytical_goals: ['memahami_pengalaman_atau_makna'],
      preferred_objects: ['mahasiswa'],
      available_data_types: ['hasil_wawancara'],
      research_settings: ['satu_kelas_atau_kelompok'],
      geographic_scope: 'tidak_relevan',
      preferred_approach: 'kualitatif',
      preferred_research_paths: ['studi_kasus'],
      skills: ['wawancara'],
    },
  },
  {
    id: 'document_analysis',
    name: 'Analisis dokumen atau konten digital',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['kualitatif'],
      allowed_research_paths: ['analisis_dokumen'],
      data_source_requirement: 'wajib_data_sekunder',
      supervisor_status: 'belum_memiliki_pembimbing',
      problem_status: 'masalah_jelas',
      analytical_goals: ['menafsirkan_teks_dokumen_karya_atau_praktik'],
      preferred_objects: ['dokumen'],
      available_data_types: ['dokumen'],
      research_settings: ['dokumen_atau_dataset'],
      geographic_scope: 'tidak_relevan',
      preferred_approach: 'kualitatif',
      preferred_research_paths: ['analisis_dokumen'],
      skills: ['analisis_bahasa'],
    },
  },
  {
    id: 'experiment',
    name: 'Eksperimen',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['kuantitatif'],
      allowed_research_paths: ['eksperimen'],
      data_source_requirement: 'wajib_data_primer',
      supervisor_status: 'belum_memiliki_pembimbing',
      problem_status: 'masalah_jelas',
      analytical_goals: ['menguji_efek_intervensi_atau_dugaan_sebab_akibat'],
      preferred_objects: ['mesin_atau_alat'],
      available_data_types: ['hasil_laboratorium'],
      research_settings: ['laboratorium'],
      geographic_scope: 'tidak_relevan',
      preferred_approach: 'kuantitatif',
      preferred_research_paths: ['eksperimen'],
      skills: ['pengujian_laboratorium'],
    },
  },
  {
    id: 'product_development',
    name: 'Pengembangan produk',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['metode_campuran'],
      allowed_research_paths: ['research_and_development'],
      data_source_requirement: 'wajib_data_primer',
      required_output_status: 'required',
      required_output_types: ['aplikasi_atau_sistem'],
      supervisor_status: 'belum_memiliki_pembimbing',
      problem_status: 'belum_menemukan_masalah',
      analytical_goals: ['memecahkan_masalah_teknis'],
      expected_outputs: ['aplikasi_atau_sistem'],
      preferred_objects: ['aplikasi'],
      available_data_types: ['belum_mengetahui'],
      research_settings: ['sistem_alat_atau_produk'],
      geographic_scope: 'tidak_relevan',
      preferred_approach: 'kualitatif',
      preferred_research_paths: ['research_and_development'],
      skills: ['pemrograman'],
    },
  },
  {
    id: 'law_or_literature',
    name: 'Penelitian hukum atau studi pustaka tanpa responden',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['kualitatif'],
      allowed_research_paths: ['penelitian_hukum_normatif'],
      data_source_requirement: 'wajib_data_sekunder',
      supervisor_status: 'belum_memiliki_pembimbing',
      problem_status: 'masalah_jelas',
      analytical_goals: ['menafsirkan_teks_dokumen_karya_atau_praktik'],
      preferred_objects: ['peraturan_atau_putusan_hukum'],
      available_data_types: ['dokumen'],
      research_settings: ['dokumen_atau_dataset'],
      geographic_scope: 'tidak_relevan',
      preferred_approach: 'kualitatif',
      preferred_research_paths: ['penelitian_hukum_normatif'],
      skills: ['analisis_hukum'],
    },
  },
  {
    id: 'without_supervisor',
    name: 'Pengguna belum memiliki dosen pembimbing',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['kuantitatif'],
      allowed_research_paths: ['survei'],
      data_source_requirement: 'wajib_data_primer',
      supervisor_status: 'belum_memiliki_pembimbing',
      relevant_experience_types: ['penggunaan_teknologi'],
      problem_status: 'gambaran_belum_jelas',
      analytical_goals: ['menggambarkan_fenomena'],
      preferred_objects: ['mahasiswa'],
      available_data_types: ['jawaban_angket'],
      research_settings: ['satu_kelas_atau_kelompok'],
      geographic_scope: 'tidak_relevan',
      preferred_approach: 'kuantitatif',
      preferred_research_paths: ['survei'],
      skills: ['statistik'],
    },
  },
]

const stressScenario = {
  id: 'multi_path_stress',
  name: 'Multi-path stress test',
  answers: {
    ...commonAnswers,
    allowed_approaches: ['metode_campuran'],
    allowed_research_paths: [
      'survei',
      'eksperimen',
      'analisis_dokumen',
      'research_and_development',
    ],
    data_source_requirement: 'boleh_primer_dan_atau_sekunder',
    required_output_status: 'required',
    required_output_types: ['aplikasi_atau_sistem'],
    supervisor_status: 'sudah_aktif_berkomunikasi',
    relevant_experience_types: ['perkuliahan', 'pengalaman_pribadi'],
    problem_status: 'masalah_jelas',
    analytical_goals: [
      'menguji_hubungan_atau_kemampuan_prediksi',
      'memecahkan_masalah_teknis',
    ],
    analysis_aspects: ['sistem_atau_aplikasi'],
    expected_outputs: ['aplikasi_atau_sistem'],
    preferred_objects: ['mahasiswa', 'dokumen', 'aplikasi'],
    access_level: 'membutuhkan_izin_resmi',
    available_data_types: [
      'jawaban_angket',
      'hasil_wawancara',
      'dokumen',
      'dataset_digital',
      'hasil_laboratorium',
    ],
    research_settings: [
      'satu_kelas_atau_kelompok',
      'dokumen_atau_dataset',
      'sistem_alat_atau_produk',
    ],
    geographic_scope: 'satu_kota_atau_kabupaten',
    preferred_approach: 'metode_campuran',
    preferred_research_paths: [
      'survei',
      'eksperimen',
      'research_and_development',
    ],
    skills: ['statistik', 'pemrograman', 'pengujian_laboratorium'],
    sensitive_data_or_groups: ['data_pribadi'],
    novelty_importance: 'harus_jelas',
    title_risk_level: 'eksperimental_dan_berani',
  },
}

const variationScenarios = [
  {
    id: 'survey_document',
    name: 'Survei + dokumen',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['metode_campuran'],
      allowed_research_paths: ['survei', 'analisis_dokumen'],
      data_source_requirement: 'boleh_primer_dan_atau_sekunder',
      supervisor_status: 'belum_memiliki_pembimbing',
      relevant_experience_types: ['penggunaan_teknologi'],
      problem_status: 'masalah_jelas',
      analytical_goals: ['menggambarkan_fenomena'],
      preferred_objects: ['mahasiswa', 'dokumen'],
      available_data_types: ['jawaban_angket', 'dokumen'],
      research_settings: ['satu_kelas_atau_kelompok', 'dokumen_atau_dataset'],
      geographic_scope: 'tidak_relevan',
      preferred_approach: 'metode_campuran',
      preferred_research_paths: ['survei', 'analisis_dokumen'],
      skills: ['statistik', 'analisis_bahasa'],
    },
  },
  {
    id: 'interview_document',
    name: 'Wawancara + dokumen',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['kualitatif'],
      allowed_research_paths: ['studi_kasus', 'analisis_dokumen'],
      data_source_requirement: 'boleh_primer_dan_atau_sekunder',
      supervisor_status: 'belum_memiliki_pembimbing',
      relevant_experience_types: ['pengalaman_pribadi'],
      problem_status: 'masalah_jelas',
      analytical_goals: ['memahami_pengalaman_atau_makna'],
      preferred_objects: ['mahasiswa', 'dokumen'],
      available_data_types: ['hasil_wawancara', 'dokumen'],
      research_settings: ['satu_kelas_atau_kelompok', 'dokumen_atau_dataset'],
      geographic_scope: 'tidak_relevan',
      preferred_approach: 'kualitatif',
      preferred_research_paths: ['studi_kasus', 'analisis_dokumen'],
      skills: ['wawancara', 'analisis_bahasa'],
    },
  },
  {
    id: 'mixed_method',
    name: 'Metode campuran',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['metode_campuran'],
      allowed_research_paths: ['survei', 'studi_kasus'],
      data_source_requirement: 'wajib_data_primer',
      supervisor_status: 'belum_memiliki_pembimbing',
      relevant_experience_types: ['pengalaman_pribadi'],
      problem_status: 'masalah_jelas',
      analytical_goals: ['menguji_hubungan_atau_kemampuan_prediksi'],
      analysis_aspects: ['persepsi'],
      preferred_objects: ['mahasiswa'],
      available_data_types: ['jawaban_angket', 'hasil_wawancara'],
      research_settings: ['satu_kelas_atau_kelompok'],
      geographic_scope: 'tidak_relevan',
      preferred_approach: 'metode_campuran',
      preferred_research_paths: ['survei', 'studi_kasus'],
      skills: ['statistik', 'wawancara'],
    },
  },
  {
    id: 'development_sensitive',
    name: 'Pengembangan + data sensitif',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['metode_campuran'],
      allowed_research_paths: ['research_and_development'],
      data_source_requirement: 'wajib_data_primer',
      required_output_status: 'required',
      required_output_types: ['aplikasi_atau_sistem'],
      supervisor_status: 'belum_memiliki_pembimbing',
      problem_status: 'belum_menemukan_masalah',
      analytical_goals: ['memecahkan_masalah_teknis'],
      expected_outputs: ['aplikasi_atau_sistem'],
      preferred_objects: ['aplikasi'],
      access_level: 'membutuhkan_izin_resmi',
      available_data_types: ['hasil_pemeriksaan_kesehatan'],
      research_settings: ['sistem_alat_atau_produk'],
      geographic_scope: 'tidak_relevan',
      preferred_approach: 'metode_campuran',
      preferred_research_paths: ['research_and_development'],
      skills: ['pemrograman'],
      sensitive_data_or_groups: ['data_pribadi'],
    },
  },
  {
    id: 'unknown_method_with_problem',
    name: 'Belum mengetahui metode + memiliki masalah',
    answers: {
      ...commonAnswers,
      allowed_approaches: ['belum_mengetahui'],
      allowed_research_paths: ['belum_mengetahui'],
      data_source_requirement: 'belum_mengetahui',
      supervisor_status: 'belum_memiliki_pembimbing',
      relevant_experience_types: ['penggunaan_teknologi'],
      problem_status: 'masalah_jelas',
      analytical_goals: ['belum_mengetahui'],
      preferred_objects: ['belum_mengetahui'],
      access_level: 'belum_memiliki_akses',
      available_data_types: ['belum_mengetahui'],
      research_settings: ['belum_mengetahui'],
      geographic_scope: 'belum_mengetahui',
      data_period: 'belum_mengetahui',
      preferred_approach: 'belum_mengetahui',
      preferred_research_paths: ['belum_mengetahui'],
      skills: ['belum_memiliki_kemampuan_khusus'],
    },
  },
]

const allScenarios = [
  ...canonicalScenarios,
  stressScenario,
  ...variationScenarios,
]

let fixtureHiddenAnswerCount = 0

const validateScenarioAnswers = (scenario) => {
  const visibleQuestions = visibleQuestionsForAnswers(scenario.answers)
  const visibleVariableNames = new Set(
    visibleQuestions.map((question) => normalizeString(question.variable_name)),
  )

  for (const [variableName, value] of Object.entries(scenario.answers)) {
    const question = questionsByVariableName.get(variableName)
    if (!question) {
      fail(
        `Skenario "${scenario.name}" memakai variable yang tidak ada: `
        + variableName,
      )
      continue
    }

    if (!visibleVariableNames.has(variableName)) {
      fixtureHiddenAnswerCount += 1
      fail(
        `Skenario "${scenario.name}" memberikan jawaban pada `
        + `pertanyaan tersembunyi ${question.source_number}.`,
      )
    }

    if (!CHOICE_TYPES.has(question.question_type)) continue

    const optionValues = new Set(
      (question.options || []).map(
        (option) => normalizeString(option.option_value),
      ),
    )
    const scenarioValues = Array.isArray(value) ? value : [value]

    for (const scenarioValue of scenarioValues) {
      if (!optionValues.has(normalizeString(scenarioValue))) {
        fail(
          `Skenario "${scenario.name}" memakai option_value nonvalid: `
          + `${variableName}.${scenarioValue}`,
        )
      }
    }
  }
}

allScenarios.forEach(validateScenarioAnswers)

const emptyStateVisible = visibleQuestionsForAnswers({})
const emptyStateVisibleSources = emptyStateVisible.map(
  (question) => normalizeString(question.source_number),
)
const emptyStateMustBeHidden = ['17', '34', '35', '36', '37', '38', '55']
const emptyStateUnexpectedSources = emptyStateMustBeHidden.filter(
  (sourceNumber) => emptyStateVisibleSources.includes(sourceNumber),
)

if (emptyStateUnexpectedSources.length > 0) {
  fail(
    `Empty state masih menampilkan source yang wajib hidden: `
    + emptyStateUnexpectedSources.join(', '),
  )
}

const summarizeVisibility = (
  scenario,
  targetMode = 'canonical',
) => {
  const visible = visibleQuestionsForAnswers(scenario.answers)
  const visibleVariables = new Set(
    visible.map((question) => normalizeString(question.variable_name)),
  )
  const researchPrimary = visible.filter((question) => (
    question.is_primary_question === true
    && question.is_additional_other !== true
    && question.structured_scope === 'form_data'
  ))
  const activeOther = visible.filter(
    (question) => question.is_additional_other === true,
  )
  const acknowledgements = visible.filter(
    (question) => question.structured_scope === 'acknowledgement',
  )
  const consents = visible.filter(
    (question) => question.structured_scope === 'consent',
  )
  const totalVisible = (
    researchPrimary.length
    + activeOther.length
    + acknowledgements.length
    + consents.length
  )
  const sectionCounts = Object.fromEntries(
    expectedSectionKeys.map((sectionKey) => [
      sectionKey,
      visible.filter(
        (question) => question.section_key === sectionKey,
      ).length,
    ]),
  )
  const visibleSourceNumbers = visible.map(
    (question) => normalizeString(question.source_number),
  )
  const hiddenSourceNumbers = questions
    .filter(
      (question) => !visibleVariables.has(
        normalizeString(question.variable_name),
      ),
    )
    .map((question) => normalizeString(question.source_number))

  let targetStatus = 'IDEAL'
  if (totalVisible > visibilityPolicy.canonical_max_visible) {
    const warningOnly = targetMode !== 'canonical'
    targetStatus = warningOnly ? 'WARNING_ABOVE_MAX' : 'ERROR_ABOVE_MAX'
    const message = (
      `${scenario.name}: total visible ${totalVisible} melebihi `
      + `maksimum ${visibilityPolicy.canonical_max_visible}.`
    )
    if (warningOnly) warn(message)
    else fail(message)
  } else if (totalVisible < visibilityPolicy.canonical_min_visible) {
    targetStatus = 'WARNING_BELOW_MIN'
    warn(
      `${scenario.name}: total visible ${totalVisible} di bawah `
      + `minimum ${visibilityPolicy.canonical_min_visible}.`,
    )
  }

  return {
    ...scenario,
    targetMode,
    visible,
    totalVisible,
    researchPrimaryCount: researchPrimary.length,
    activeOtherCount: activeOther.length,
    acknowledgementCount: acknowledgements.length,
    consentCount: consents.length,
    sectionCounts,
    visibleSourceNumbers,
    hiddenSourceNumbers,
    targetStatus,
  }
}

const canonicalResults = canonicalScenarios.map(
  (scenario) => summarizeVisibility(scenario, 'canonical'),
)
const stressResult = summarizeVisibility(stressScenario, 'stress')
const variationResults = variationScenarios.map(
  (scenario) => summarizeVisibility(scenario, 'variation'),
)
const allScenarioResults = [
  ...canonicalResults,
  stressResult,
  ...variationResults,
]

const sourceIsVisible = (result, sourceNumber) => (
  result.visibleSourceNumbers.includes(sourceNumber)
)

const surveyResult = canonicalResults.find(
  (result) => result.id === 'quantitative_survey',
)
const interviewResult = canonicalResults.find(
  (result) => result.id === 'qualitative_interview',
)

if (
  !surveyResult
  || !sourceIsVisible(surveyResult, '49')
  || sourceIsVisible(surveyResult, '50')
) {
  fail('Assertion routing 49/50 gagal: survei harus menampilkan 49 dan menyembunyikan 50.')
}
if (
  !interviewResult
  || !sourceIsVisible(interviewResult, '50')
  || sourceIsVisible(interviewResult, '49')
) {
  fail('Assertion routing 49/50 gagal: wawancara harus menampilkan 50 dan menyembunyikan 49.')
}

for (const result of allScenarioResults) {
  for (const requiredVisibleSource of ['54', '56', '88', '89']) {
    if (!sourceIsVisible(result, requiredVisibleSource)) {
      fail(
        `${result.name}: pertanyaan ${requiredVisibleSource} wajib tetap terlihat.`,
      )
    }
  }
}

const conditions49And50 = questions
  .filter((question) => ['49', '50'].includes(question.source_number))
  .flatMap((question) => question.conditions || [])
if (conditions49And50.some(
  (condition) => normalizeString(condition.comparison_value)
    === 'responden_atau_informan',
)) {
  fail('49/50 masih memakai trigger umum responden_atau_informan.')
}

const scenarioVisibleVariables = new Map(
  allScenarioResults.map((result) => [
    result.id,
    new Set(result.visible.map(
      (question) => normalizeString(question.variable_name),
    )),
  ]),
)
const decisionByConditionKey = new Map(
  branchingDecisions.map((decision) => [
    conditionKey({
      childSourceNumber: decision.child_source_number,
      parentVariableName: decision.parent_variable_name,
      operator: decision.operator,
      comparisonValue: decision.comparison_value,
    }),
    decision,
  ]),
)
const coverageRows = []

for (const question of questions) {
  for (const condition of question.conditions || []) {
    const key = conditionKey({
      childSourceNumber: question.source_number,
      parentVariableName: condition.parent_variable_name,
      operator: condition.operator,
      comparisonValue: condition.comparison_value,
    })
    const trueScenarioIds = []

    for (const scenario of allScenarios) {
      const visibleVariables = scenarioVisibleVariables.get(scenario.id)
      const parentVariableName = normalizeString(
        condition.parent_variable_name,
      )
      if (!visibleVariables?.has(parentVariableName)) continue

      if (evaluateCondition(condition, scenario.answers[parentVariableName])) {
        trueScenarioIds.push(scenario.id)
      }
    }

    const decision = decisionByConditionKey.get(key)
    coverageRows.push({
      key,
      childSourceNumber: normalizeString(question.source_number),
      classification: question.is_additional_other === true
        ? 'additional_other'
        : normalizeString(decision?.classification),
      trueScenarioIds,
    })
  }
}

const uncoveredCoverageRows = coverageRows.filter(
  (row) => row.trueScenarioIds.length === 0,
)
const uncoveredClassifications = [
  'explicit_specification',
  'implementation_inference',
  'product_decision_heuristic',
]

for (const classification of uncoveredClassifications) {
  const uncovered = uncoveredCoverageRows.filter(
    (row) => row.classification === classification,
  )
  if (uncovered.length === 0) continue

  const sources = [...new Set(
    uncovered.map((row) => row.childSourceNumber),
  )]
  warn(
    `${classification} belum pernah true pada seluruh skenario: `
    + `${uncovered.length} condition; source ${sources.join(', ')}.`,
  )
}

const optionsCount = questions.reduce(
  (total, question) => total + (question.options || []).length,
  0,
)
const conditionsCount = questions.reduce(
  (total, question) => total + (question.conditions || []).length,
  0,
)
const unconditionalQuestionCount = questions.filter(
  (question) => (question.conditions || []).length === 0,
).length
const scopeCount = (scope) => questions.filter(
  (question) => question.structured_scope === scope,
).length
const exclusiveOptionCount = questions.reduce(
  (total, question) => (
    total + (question.options || []).filter(
      (option) => option.is_exclusive === true,
    ).length
  ),
  0,
)
const boundedQuestions = questions.filter(
  (question) => (
    question.min_selections !== null
    || question.max_selections !== null
  ),
)
const decisionClassificationCounts = Object.fromEntries(
  [...allowedDecisionClassifications].map((classification) => [
    classification,
    branchingDecisions.filter(
      (decision) => decision.classification === classification,
    ).length,
  ]),
)

if (optionsCount !== 658) {
  fail(`Jumlah options berubah. Expected 658, actual ${optionsCount}.`)
}
if (scopeCount('acknowledgement') !== 1) {
  fail('Jumlah acknowledgement harus tetap 1.')
}
if (scopeCount('consent') !== 1) {
  fail('Jumlah consent harus tetap 1.')
}

const formDataQuestions = questions.filter(
  (question) => question.structured_scope === 'form_data',
)
let hiddenFormDataFieldCount = 0
let hiddenFormDataNonNullCount = 0

for (const result of allScenarioResults) {
  const visibleVariables = new Set(
    result.visible.map((question) => normalizeString(question.variable_name)),
  )
  const simulatedFormDataByPath = new Map()

  for (const question of formDataQuestions) {
    const variableName = normalizeString(question.variable_name)
    const path = normalizeString(question.structured_path)
    const isVisible = visibleVariables.has(variableName)
    const value = isVisible
      ? (result.answers[variableName] ?? null)
      : null

    simulatedFormDataByPath.set(path, value)
    if (!isVisible) {
      hiddenFormDataFieldCount += 1
      if (value !== null) hiddenFormDataNonNullCount += 1
    }
  }

  if (simulatedFormDataByPath.size !== EXPECTED_STRUCTURED_PATH_COUNT) {
    fail(
      `${result.name}: structured output simulasi tidak membentuk `
      + `${EXPECTED_STRUCTURED_PATH_COUNT} path.`,
    )
  }
}

if (hiddenFormDataNonNullCount > 0) {
  fail(
    `Audit hidden form_data -> null gagal: `
    + `${hiddenFormDataNonNullCount} field hidden bernilai non-null.`,
  )
}

const canonicalTotals = canonicalResults.map(
  (result) => result.totalVisible,
)
const canonicalMinimum = Math.min(...canonicalTotals)
const canonicalMaximum = Math.max(...canonicalTotals)
const canonicalAverage = (
  canonicalTotals.reduce((total, value) => total + value, 0)
  / canonicalTotals.length
)
const canonicalInRange = canonicalTotals.filter(
  (value) => (
    value >= visibilityPolicy.canonical_min_visible
    && value <= visibilityPolicy.canonical_max_visible
  ),
).length
const canonicalBelowRange = canonicalTotals.filter(
  (value) => value < visibilityPolicy.canonical_min_visible,
).length
const canonicalAboveRange = canonicalTotals.filter(
  (value) => value > visibilityPolicy.canonical_max_visible,
).length

if (warnings.length > 0) {
  console.log('\nPERINGATAN')
  warnings.forEach((message) => console.log(`- ${message}`))
}

if (errors.length > 0) {
  console.error('\nVALIDASI GAGAL')
  errors.forEach((message) => console.error(`- ${message}`))
  process.exitCode = 1
} else {
  console.log('\nVALIDASI BERHASIL')
}

console.log('\nRINGKASAN MANIFEST')
console.log(`- Jumlah section: ${sections.length}`)
console.log(`- Jumlah row pertanyaan: ${questions.length}`)
console.log(`- Jumlah pertanyaan utama: ${currentPrimaryCount}`)
console.log(`- Jumlah field "Lainnya" tambahan: ${currentOtherCount}`)
console.log(`- Jumlah options: ${optionsCount}`)
console.log(`- Jumlah conditions sebelum JT-4A.4: 324`)
console.log(`- Jumlah conditions sesudah JT-4A.4: ${conditionsCount}`)
console.log(`- Pertanyaan tanpa condition: ${unconditionalQuestionCount}`)
console.log(`- Jumlah form_data: ${scopeCount('form_data')}`)
console.log(`- Jumlah acknowledgement: ${scopeCount('acknowledgement')}`)
console.log(`- Jumlah consent: ${scopeCount('consent')}`)
console.log(`- Jumlah exclude: ${scopeCount('exclude')}`)
console.log(`- Jumlah structured paths: ${structuredPaths.length}`)
console.log(`- Jumlah exclusive options: ${exclusiveOptionCount}`)

console.log('\nPROVENANCE CONDITION')
console.log(
  `- explicit_specification: `
  + decisionClassificationCounts.explicit_specification,
)
console.log(
  `- implementation_inference: `
  + decisionClassificationCounts.implementation_inference,
)
console.log(
  `- product_decision_heuristic: `
  + decisionClassificationCounts.product_decision_heuristic,
)

console.log('\nEMPTY STATE')
console.log(`- Total visible: ${emptyStateVisible.length}`)
console.log(`- source_number visible: ${emptyStateVisibleSources.join(', ')}`)
console.log(`- Fixture hidden answers sesudah koreksi: ${fixtureHiddenAnswerCount}`)
console.log(
  `- Source wajib hidden yang masih muncul: `
  + `${emptyStateUnexpectedSources.join(', ') || '-'}`,
)

console.log('\nPERTANYAAN DENGAN MIN/MAX')
boundedQuestions.forEach((question) => {
  console.log(
    `- ${question.source_number} ${question.variable_name}: `
    + `min=${question.min_selections ?? 'null'}, `
    + `max=${question.max_selections ?? 'null'}`,
  )
})

const printScenario = (result) => {
  console.log(`\nSKENARIO: ${result.name}`)
  console.log(`- Total visible: ${result.totalVisible}`)
  console.log(
    `- Pertanyaan utama visible: ${result.researchPrimaryCount}`,
  )
  console.log(`- Field Lainnya visible: ${result.activeOtherCount}`)
  console.log(
    `- Acknowledgement visible: ${result.acknowledgementCount}`,
  )
  console.log(`- Consent visible: ${result.consentCount}`)
  console.log(
    `- Visible per section A–J: `
    + expectedSectionKeys.map(
      (sectionKey) => `${sectionKey}=${result.sectionCounts[sectionKey]}`,
    ).join(', '),
  )
  console.log(
    `- source_number visible: `
    + result.visibleSourceNumbers.join(', '),
  )
  console.log(
    `- source_number hidden: `
    + result.hiddenSourceNumbers.join(', '),
  )
  console.log(`- Target: ${result.targetStatus}`)
}

console.log('\nEVALUASI VISIBILITY CANONICAL')
canonicalResults.forEach(printScenario)

console.log('\nEVALUASI STRESS TEST')
printScenario(stressResult)

console.log('\nEVALUASI VARIASI TAMBAHAN')
variationResults.forEach(printScenario)

console.log('\nRINGKASAN CANONICAL')
console.log(`- Minimum canonical: ${canonicalMinimum}`)
console.log(`- Maksimum canonical: ${canonicalMaximum}`)
console.log(`- Rata-rata canonical: ${canonicalAverage.toFixed(2)}`)
console.log(`- Skenario dalam rentang 35–50: ${canonicalInRange}`)
console.log(`- Skenario di bawah 35: ${canonicalBelowRange}`)
console.log(`- Skenario di atas 50: ${canonicalAboveRange}`)

console.log('\nCONDITION COVERAGE 14 SKENARIO')
console.log(`- Total conditions: ${coverageRows.length}`)
console.log(`- Pernah true: ${coverageRows.length - uncoveredCoverageRows.length}`)
console.log(`- Belum pernah true: ${uncoveredCoverageRows.length}`)
for (const classification of [
  'explicit_specification',
  'implementation_inference',
  'product_decision_heuristic',
  'additional_other',
]) {
  const total = coverageRows.filter(
    (row) => row.classification === classification,
  ).length
  const uncovered = uncoveredCoverageRows.filter(
    (row) => row.classification === classification,
  ).length
  console.log(`- ${classification}: total=${total}, belum_true=${uncovered}`)
}

console.log('\nCATATAN AUDIT')
console.log('- Empty-parent assertion memeriksa source 17, 34–38, dan 55.')
console.log('- Seluruh fixture wajib hanya menjawab pertanyaan yang visible pada final state.')
console.log(`- Hidden form_data diaudit: ${hiddenFormDataFieldCount} field; non-null=${hiddenFormDataNonNullCount}.`)
