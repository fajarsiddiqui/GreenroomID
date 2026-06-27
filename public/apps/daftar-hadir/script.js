const DEFAULT_COLUMNS = ["Nama", "Unit kerja", "TTD"];
const DEFAULT_WIDTHS = [45, 35, 20];
const PAPER_SIZES = {
  A4: { width: 210, height: 297 },
  F4: { width: 210, height: 330 }
};

const PAGE_PADDING_X_MM = 14;
const PAGE_PADDING_Y_MM = 12;
const PAGE_SAFETY_MM = 5;
const TABLE_NO_WIDTH_PERCENT = 6;
const TABLE_HEADER_HEIGHT_MM = 10;
const SIGNATURE_ESTIMATE_MM = 36;
const SITE_WATERMARK_TEXT = "https://greenroomid.com";
const storageKey = "daftar_hadir_greenroomid_v24";

const defaultData = {
  paperSize: "A4",
  docTitle: "Daftar Hadir\nRapat sosialisasi tim pengerjaan\nGreenroomID bulan Agustus tahun 2026",
  columnCount: 3,
  columnNames: [...DEFAULT_COLUMNS],
  columnWidths: [...DEFAULT_WIDTHS],
  rowCount: 20,
  rowHeight: 10,
  signatureColumnIndex: 2,
  ttdPattern: "alternate",
  columnData: ["", "", ""],
  enableSignatureRight: true,
  enableSignatureLeft: false,
  rightPlaceDate: "...",
  rightPosition: "...",
  rightName: "...",
  rightIdentityLabel: "...",
  rightIdentity: "...",
  leftPlaceDate: "...",
  leftPosition: "...",
  leftName: "...",
  leftIdentityLabel: "...",
  leftIdentity: "..."
};

const fieldIds = [
  "paperSize",
  "docTitle",
  "columnCount",
  "rowCount",
  "rowHeight",
  "signatureColumnIndex",
  "ttdPattern",
  "rightPlaceDate",
  "rightPosition",
  "rightName",
  "rightIdentityLabel",
  "rightIdentity",
  "leftPlaceDate",
  "leftPosition",
  "leftName",
  "leftIdentityLabel",
  "leftIdentity"
];

const checkboxIds = ["enableSignatureRight", "enableSignatureLeft"];

function clampNumber(value, min, max, fallback) {
  const number = Number.parseInt(value, 10);
  if (Number.isNaN(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function clampFloat(value, min, max, fallback) {
  const number = Number.parseFloat(value);
  if (Number.isNaN(number)) return fallback;
  return Math.min(Math.max(number, min), max);
}

function singleLine(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function multilineToHtml(value) {
  return escapeHtml(value).replace(/\r?\n/g, "<br>");
}

function normalizeArray(source, fallback, count, emptyValue = null) {
  const result = [];
  for (let index = 0; index < count; index += 1) {
    const sourceValue = Array.isArray(source) ? source[index] : undefined;
    const fallbackValue = Array.isArray(fallback) ? fallback[index] : undefined;

    if (sourceValue !== undefined && sourceValue !== null) {
      result.push(String(sourceValue));
    } else if (fallbackValue !== undefined && fallbackValue !== null) {
      result.push(String(fallbackValue));
    } else if (emptyValue !== null) {
      result.push(emptyValue);
    } else {
      result.push(`Kolom ${index + 1}`);
    }
  }
  return result;
}

function normalizeWidths(source, count) {
  let widths;
  if (Array.isArray(source) && source.length >= count) {
    widths = source.slice(0, count).map((value) => clampFloat(value, 4, 92, 100 / count));
  } else if (count === 3) {
    widths = [...DEFAULT_WIDTHS];
  } else {
    widths = Array.from({ length: count }, () => 100 / count);
  }

  const total = widths.reduce((sum, value) => sum + value, 0);
  if (!total || Math.abs(total - 100) > 0.2) {
    widths = widths.map((value) => (value / total) * 100);
  }

  return widths.map((value) => Math.round(value * 10) / 10);
}

function mergeWithDefaults(saved = {}) {
  const count = clampNumber(saved.columnCount, 1, 8, defaultData.columnCount);
  const merged = { ...defaultData, ...saved, columnCount: count };

  merged.paperSize = PAPER_SIZES[merged.paperSize] ? merged.paperSize : defaultData.paperSize;
  merged.rowCount = clampNumber(merged.rowCount, 0, 300, defaultData.rowCount);
  merged.rowHeight = clampFloat(merged.rowHeight, 5, 30, defaultData.rowHeight);
  merged.columnNames = normalizeArray(saved.columnNames, DEFAULT_COLUMNS, count);
  merged.columnData = normalizeArray(saved.columnData, [], count, "");
  merged.columnWidths = normalizeWidths(saved.columnWidths, count);
  merged.signatureColumnIndex = clampNumber(saved.signatureColumnIndex, -1, count - 1, Math.min(2, count - 1));
  merged.ttdPattern = ["alternate", "left", "center"].includes(saved.ttdPattern) ? saved.ttdPattern : defaultData.ttdPattern;
  merged.enableSignatureRight = Boolean(merged.enableSignatureRight);
  merged.enableSignatureLeft = Boolean(merged.enableSignatureLeft);

  return merged;
}

function getSavedData() {
  try {
    const saved = localStorage.getItem(storageKey);
    return saved ? mergeWithDefaults(JSON.parse(saved)) : mergeWithDefaults(defaultData);
  } catch {
    return mergeWithDefaults(defaultData);
  }
}

function saveData(data) {
  localStorage.setItem(storageKey, JSON.stringify(data));
}

function getElement(id) {
  return document.getElementById(id);
}

function setInitialValues() {
  const data = getSavedData();

  fieldIds.forEach((id) => {
    const element = getElement(id);
    if (!element) return;
    element.value = data[id] ?? "";
  });

  checkboxIds.forEach((id) => {
    const element = getElement(id);
    if (!element) return;
    element.checked = Boolean(data[id]);
  });

  renderDynamicInputs(data);
  syncSignatureFields(data);
}

function collectData() {
  const partial = {};

  fieldIds.forEach((id) => {
    const element = getElement(id);
    if (!element) return;
    if (id === "columnCount") {
      partial[id] = clampNumber(element.value, 1, 8, defaultData.columnCount);
    } else if (id === "rowCount") {
      partial[id] = clampNumber(element.value, 0, 300, defaultData.rowCount);
    } else if (id === "rowHeight") {
      partial[id] = clampFloat(element.value, 5, 30, defaultData.rowHeight);
    } else if (id === "signatureColumnIndex") {
      partial[id] = clampNumber(element.value, -1, 7, defaultData.signatureColumnIndex);
    } else {
      partial[id] = element.value;
    }
  });

  checkboxIds.forEach((id) => {
    const element = getElement(id);
    partial[id] = element ? element.checked : defaultData[id];
  });

  const count = clampNumber(partial.columnCount, 1, 8, defaultData.columnCount);
  partial.columnCount = count;
  partial.columnNames = Array.from(document.querySelectorAll(".column-name-input")).slice(0, count).map((input, index) => {
    return input.value.trim() || DEFAULT_COLUMNS[index] || `Kolom ${index + 1}`;
  });
  partial.columnData = Array.from(document.querySelectorAll(".data-column-input")).slice(0, count).map((input) => input.value);
  partial.columnWidths = normalizeWidths(Array.from(document.querySelectorAll(".column-width-input")).slice(0, count).map((input) => input.value), count);

  return mergeWithDefaults(partial);
}

function renderDynamicInputs(data) {
  renderColumnNameInputs(data);
  renderColumnWidthInputs(data);
  renderSignatureColumnOptions(data);
  renderDataInputs(data);
}

function renderColumnNameInputs(data) {
  const wrapper = getElement("columnNameFields");
  if (!wrapper) return;

  const names = normalizeArray(data.columnNames, DEFAULT_COLUMNS, data.columnCount);
  wrapper.innerHTML = "";

  names.forEach((name, index) => {
    const label = document.createElement("label");
    label.className = "compact-label";
    label.textContent = `Nama Kolom ${index + 1}`;

    const textarea = document.createElement("textarea");
    textarea.className = "column-name-input";
    textarea.rows = 2;
    textarea.wrap = "soft";
    textarea.dataset.index = String(index);
    textarea.value = name;
    textarea.placeholder = `Contoh: ${DEFAULT_COLUMNS[index] || `Kolom ${index + 1}`}`;

    label.appendChild(textarea);
    wrapper.appendChild(label);
  });
}

function renderColumnWidthInputs(data) {
  const wrapper = getElement("columnWidthFields");
  if (!wrapper) return;

  const names = normalizeArray(data.columnNames, DEFAULT_COLUMNS, data.columnCount);
  const widths = normalizeWidths(data.columnWidths, data.columnCount);
  wrapper.innerHTML = "";

  names.forEach((name, index) => {
    const label = document.createElement("label");
    label.className = "compact-label width-label";
    label.textContent = `Lebar ${singleLine(name) || `Kolom ${index + 1}`} (%)`;

    const input = document.createElement("input");
    input.className = "column-width-input";
    input.type = "number";
    input.min = "4";
    input.max = "92";
    input.step = "0.5";
    input.dataset.index = String(index);
    input.dataset.lastValue = String(widths[index]);
    input.value = String(widths[index]);

    label.appendChild(input);
    wrapper.appendChild(label);
  });
}

function renderSignatureColumnOptions(data) {
  const select = getElement("signatureColumnIndex");
  if (!select) return;

  const current = clampNumber(data.signatureColumnIndex, -1, data.columnCount - 1, Math.min(2, data.columnCount - 1));
  const names = normalizeArray(data.columnNames, DEFAULT_COLUMNS, data.columnCount);

  select.innerHTML = "";
  const noneOption = document.createElement("option");
  noneOption.value = "-1";
  noneOption.textContent = "Tidak ada kolom tanda tangan";
  select.appendChild(noneOption);

  names.forEach((name, index) => {
    const option = document.createElement("option");
    option.value = String(index);
    option.textContent = `Kolom ${index + 1}: ${singleLine(name) || `Kolom ${index + 1}`}`;
    select.appendChild(option);
  });

  select.value = String(current);
}

function renderDataInputs(data) {
  const wrapper = getElement("dataInputFields");
  if (!wrapper) return;

  const names = normalizeArray(data.columnNames, DEFAULT_COLUMNS, data.columnCount);
  const values = normalizeArray(data.columnData, [], data.columnCount, "");
  wrapper.innerHTML = "";

  names.forEach((name, index) => {
    const label = document.createElement("label");
    label.className = "compact-label data-label";
    label.dataset.index = String(index);

    const title = document.createElement("span");
    title.className = "data-input-title";
    title.textContent = `Data ${singleLine(name) || `Kolom ${index + 1}`}`;

    const textarea = document.createElement("textarea");
    textarea.className = "data-column-input";
    textarea.rows = 6;
    textarea.wrap = "soft";
    textarea.dataset.index = String(index);
    textarea.value = values[index] || "";
    textarea.placeholder = `Satu baris = satu baris tabel untuk ${singleLine(name) || `Kolom ${index + 1}`}`;

    label.appendChild(title);
    label.appendChild(textarea);
    wrapper.appendChild(label);
  });
}

function updateDynamicLabelsOnly(data) {
  const names = normalizeArray(data.columnNames, DEFAULT_COLUMNS, data.columnCount);

  document.querySelectorAll(".data-label").forEach((label) => {
    const index = Number.parseInt(label.dataset.index, 10);
    const name = names[index] || `Kolom ${index + 1}`;
    const title = label.querySelector(".data-input-title");
    const textarea = label.querySelector("textarea");
    if (title) title.textContent = `Data ${singleLine(name)}`;
    if (textarea) textarea.placeholder = `Satu baris = satu baris tabel untuk ${singleLine(name)}`;
  });

  document.querySelectorAll(".width-label").forEach((label) => {
    const input = label.querySelector("input");
    const index = input ? Number.parseInt(input.dataset.index, 10) : 0;
    const name = names[index] || `Kolom ${index + 1}`;
    label.childNodes[0].nodeValue = `Lebar ${singleLine(name)} (%)`;
  });

  renderSignatureColumnOptions(data);
}

function rebalanceWidthInput(changedInput) {
  const inputs = Array.from(document.querySelectorAll(".column-width-input"));
  const index = inputs.indexOf(changedInput);
  if (index < 0 || inputs.length < 2) return;

  const oldValue = clampFloat(changedInput.dataset.lastValue, 4, 92, 100 / inputs.length);
  let newValue = clampFloat(changedInput.value, 4, 92, oldValue);
  const neighborIndex = index < inputs.length - 1 ? index + 1 : index - 1;
  const neighborInput = inputs[neighborIndex];
  const neighborOldValue = clampFloat(neighborInput.value, 4, 92, 100 / inputs.length);
  let delta = newValue - oldValue;
  let neighborNewValue = neighborOldValue - delta;

  if (neighborNewValue < 4) {
    neighborNewValue = 4;
    newValue = oldValue + (neighborOldValue - neighborNewValue);
  } else if (neighborNewValue > 92) {
    neighborNewValue = 92;
    newValue = oldValue - (neighborNewValue - neighborOldValue);
  }

  changedInput.value = String(Math.round(newValue * 10) / 10);
  neighborInput.value = String(Math.round(neighborNewValue * 10) / 10);

  inputs.forEach((input) => {
    input.dataset.lastValue = String(clampFloat(input.value, 4, 92, 100 / inputs.length));
  });
}

function getColumnDataRows(columnText) {
  if (!columnText || String(columnText).trim() === "") return [];
  return String(columnText).split(/\r?\n/);
}

function getCellValue(columnText, rowIndex) {
  const lines = getColumnDataRows(columnText);
  return lines[rowIndex] ?? "";
}

function getRowCount(data) {
  const manualRows = clampNumber(data.rowCount, 0, 300, defaultData.rowCount);
  const dataRows = Math.max(...data.columnData.map((column) => getColumnDataRows(column).length), 0);
  return Math.max(manualRows, dataRows);
}

function getTitleLines(data) {
  return String(data.docTitle || "").split(/\r?\n/).filter((line) => line.trim().length > 0);
}

function estimateTitleHeightMm(data) {
  const lines = getTitleLines(data);
  if (lines.length === 0) return 0;
  const longestLine = lines.reduce((max, line) => Math.max(max, line.length), 0);
  const wrapBonus = Math.max(0, Math.ceil(longestLine / 72) - 1) * 4;
  return Math.max(14, (lines.length * 5) + 7 + wrapBonus);
}

function hasAnySignature(data) {
  return Boolean(data.enableSignatureLeft || data.enableSignatureRight);
}

function getPaperSize(data) {
  return PAPER_SIZES[data.paperSize] || PAPER_SIZES.A4;
}

function getRowsCapacity(data, includeSignature) {
  const paper = getPaperSize(data);
  const rowHeight = clampFloat(data.rowHeight, 5, 30, defaultData.rowHeight);
  const contentHeight = paper.height - (PAGE_PADDING_Y_MM * 2);
  const signatureHeight = includeSignature && hasAnySignature(data) ? SIGNATURE_ESTIMATE_MM : 0;
  const available = contentHeight - estimateTitleHeightMm(data) - TABLE_HEADER_HEIGHT_MM - signatureHeight - PAGE_SAFETY_MM;
  return Math.max(1, Math.floor(available / rowHeight));
}

function splitRowsIntoPages(data, rowCount) {
  const signature = hasAnySignature(data);
  const fullCapacity = Math.max(1, getRowsCapacity(data, false));
  const lastCapacity = Math.max(1, signature ? getRowsCapacity(data, true) : fullCapacity);

  if (rowCount <= 0) return [{ start: 0, end: 0, includeSignature: signature }];

  const pages = [];
  let start = 0;
  let remaining = rowCount;

  if (!signature) {
    while (remaining > 0) {
      const count = Math.min(fullCapacity, remaining);
      pages.push({ start, end: start + count, includeSignature: false });
      start += count;
      remaining -= count;
    }
    return pages;
  }

  // Greedy pagination: fill every non-final page first. Do not rebalance
  // earlier pages to match the shorter final page that contains signatures.
  while (remaining > lastCapacity) {
    // If the remaining rows are fewer than one full non-final page but still
    // too many for the signed final page, put only the overflow on this page.
    // Example: full=20, signedFinal=16, remaining=18 -> 2 rows then 16 rows + signature.
    const overflowBeforeFinal = remaining > fullCapacity ? fullCapacity : remaining - lastCapacity;
    const count = Math.max(1, Math.min(fullCapacity, overflowBeforeFinal));
    pages.push({ start, end: start + count, includeSignature: false });
    start += count;
    remaining -= count;
  }

  pages.push({ start, end: start + remaining, includeSignature: true });
  return pages;
}

function applyPaperSettings(data) {
  const paper = getPaperSize(data);
  document.documentElement.style.setProperty("--paper-width", `${paper.width}mm`);
  document.documentElement.style.setProperty("--paper-height", `${paper.height}mm`);
  document.documentElement.style.setProperty("--paper-padding-x", `${PAGE_PADDING_X_MM}mm`);
  document.documentElement.style.setProperty("--paper-padding-y", `${PAGE_PADDING_Y_MM}mm`);

  const style = getElement("printPageStyle");
  if (style) style.textContent = `@page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }`;
}

function createTitleElement(data) {
  const header = document.createElement("header");
  header.className = "doc-header";
  getTitleLines(data).forEach((line, index) => {
    const heading = document.createElement(index === 0 ? "h1" : index === 1 ? "h2" : "h3");
    heading.textContent = line;
    header.appendChild(heading);
  });
  return header;
}

function appendColgroup(colgroup, data) {
  const noCol = document.createElement("col");
  noCol.style.width = `${TABLE_NO_WIDTH_PERCENT}%`;
  colgroup.appendChild(noCol);

  const remaining = 100 - TABLE_NO_WIDTH_PERCENT;
  const widths = normalizeWidths(data.columnWidths, data.columnCount);
  widths.forEach((width) => {
    const col = document.createElement("col");
    col.style.width = `${(width / 100) * remaining}%`;
    colgroup.appendChild(col);
  });
}

function createTableElement(data, startRow, endRow, rowCount) {
  const table = document.createElement("table");
  table.className = "checklist-table";
  table.setAttribute("aria-label", "Tabel daftar hadir");

  const colgroup = document.createElement("colgroup");
  appendColgroup(colgroup, data);
  table.appendChild(colgroup);

  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  const noTh = document.createElement("th");
  noTh.textContent = "No";
  headRow.appendChild(noTh);

  data.columnNames.forEach((name) => {
    const th = document.createElement("th");
    th.innerHTML = multilineToHtml(name);
    headRow.appendChild(th);
  });

  thead.appendChild(headRow);
  table.appendChild(thead);

  const tbody = document.createElement("tbody");
  if (rowCount === 0) {
    const row = document.createElement("tr");
    row.className = "empty-state";
    const cell = document.createElement("td");
    cell.colSpan = data.columnCount + 1;
    cell.textContent = "Belum ada baris. Tambahkan jumlah baris atau isi data pada panel kiri.";
    row.appendChild(cell);
    tbody.appendChild(row);
  } else {
    for (let rowIndex = startRow; rowIndex < endRow; rowIndex += 1) {
      const row = document.createElement("tr");
      row.style.height = `${data.rowHeight}mm`;

      const noTd = document.createElement("td");
      noTd.textContent = rowIndex + 1;
      row.appendChild(noTd);

      data.columnNames.forEach((_, columnIndex) => {
        const cell = document.createElement("td");
        const typedValue = getCellValue(data.columnData[columnIndex], rowIndex);
        const isSignatureColumn = Number(data.signatureColumnIndex) === columnIndex;

        if (columnIndex === 0 && !isSignatureColumn) cell.classList.add("first-data-cell");
        if (isSignatureColumn) {
          applyTtdAlignment(cell, rowIndex, data.ttdPattern);
          cell.textContent = `${rowIndex + 1} ...`;
        } else {
          cell.textContent = typedValue;
        }

        row.appendChild(cell);
      });
      tbody.appendChild(row);
    }
  }

  table.appendChild(tbody);
  return table;
}

function applyTtdAlignment(cell, rowIndex, pattern) {
  const resolved = ["alternate", "left", "center"].includes(pattern) ? pattern : "alternate";
  const centered = resolved === "center" || (resolved === "alternate" && rowIndex % 2 === 1);
  cell.classList.toggle("ttd-cell-center", centered);
  cell.classList.toggle("ttd-cell-left", !centered);
}

function createWatermarkElement() {
  const link = document.createElement("a");
  link.className = "greenroom-corner-text";
  link.href = SITE_WATERMARK_TEXT;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = SITE_WATERMARK_TEXT;
  return link;
}

function createSignatureElement(data) {
  if (!hasAnySignature(data)) return null;

  const section = document.createElement("footer");
  section.className = "signature-section";
  section.classList.toggle("single-signature", data.enableSignatureLeft !== data.enableSignatureRight);

  if (data.enableSignatureLeft) section.appendChild(createSignatureBlock(data, "left"));
  if (data.enableSignatureRight) section.appendChild(createSignatureBlock(data, "right"));

  return section;
}

function createSignatureBlock(data, side) {
  const block = document.createElement("div");
  block.className = `signature-block ${side}`;
  const prefix = side === "left" ? "left" : "right";

  const lines = [
    data[`${prefix}PlaceDate`],
    data[`${prefix}Position`]
  ];

  lines.forEach((line) => {
    const p = document.createElement("p");
    p.textContent = line || "";
    block.appendChild(p);
  });

  const space = document.createElement("div");
  space.className = "signature-space";
  block.appendChild(space);

  const name = document.createElement("p");
  name.className = "name";
  name.textContent = data[`${prefix}Name`] || "";
  block.appendChild(name);

  const identity = document.createElement("p");
  const label = data[`${prefix}IdentityLabel`] || "";
  const value = data[`${prefix}Identity`] || "";
  identity.textContent = `${label}${label && value ? " " : ""}${value}`;
  block.appendChild(identity);

  return block;
}

function createPaperPage(data, page, index, totalPages, rowCount) {
  const paper = document.createElement("section");
  paper.className = "paper";
  paper.dataset.page = String(index + 1);
  paper.dataset.totalPages = String(totalPages);

  paper.appendChild(createWatermarkElement());
  paper.appendChild(createTitleElement(data));

  const tableFrame = document.createElement("div");
  tableFrame.className = "table-frame";
  tableFrame.appendChild(createTableElement(data, page.start, page.end, rowCount));
  paper.appendChild(tableFrame);

  if (page.includeSignature) {
    const signature = createSignatureElement(data);
    if (signature) paper.appendChild(signature);
  }

  return paper;
}

function renderPreviewPages(data) {
  const wrapper = getElement("paperPages");
  if (!wrapper) return;

  applyPaperSettings(data);
  syncSignatureFields(data);

  const rowCount = getRowCount(data);
  const pages = splitRowsIntoPages(data, rowCount);
  wrapper.innerHTML = "";

  pages.forEach((page, index) => {
    wrapper.appendChild(createPaperPage(data, page, index, pages.length, rowCount));
  });

  const jumlahData = getElement("jumlahData");
  if (jumlahData) jumlahData.textContent = rowCount;
}

function syncSignatureFields(data) {
  const rightFields = document.querySelector('[data-signature-fields="right"]');
  const leftFields = document.querySelector('[data-signature-fields="left"]');
  if (rightFields) rightFields.classList.toggle("is-disabled", !data.enableSignatureRight);
  if (leftFields) leftFields.classList.toggle("is-disabled", !data.enableSignatureLeft);
}

function updatePreview() {
  const data = collectData();
  renderPreviewPages(data);
  saveData(data);
}

function rebuildForColumnCount() {
  const data = collectData();
  const count = data.columnCount;
  data.columnNames = normalizeArray(data.columnNames, DEFAULT_COLUMNS, count);
  data.columnData = normalizeArray(data.columnData, [], count, "");
  data.columnWidths = normalizeWidths(count === 3 ? data.columnWidths : data.columnWidths, count);
  data.signatureColumnIndex = clampNumber(data.signatureColumnIndex, -1, count - 1, Math.min(2, count - 1));

  renderDynamicInputs(data);
  saveData(data);
  renderPreviewPages(data);
}

function refreshAfterColumnNames() {
  const data = collectData();
  updateDynamicLabelsOnly(data);
  renderPreviewPages(data);
  saveData(data);
}

function clearDataInputs() {
  document.querySelectorAll(".data-column-input").forEach((input) => {
    input.value = "";
  });
  updatePreview();
}

function resetAll() {
  localStorage.removeItem(storageKey);
  setInitialValues();
  updatePreview();
}

function setupAccordion() {
  const items = Array.from(document.querySelectorAll(".accordion-item"));
  items.forEach((item) => {
    const toggle = item.querySelector(".accordion-toggle");
    if (!toggle) return;

    toggle.addEventListener("click", () => {
      const willOpen = !item.classList.contains("is-open");
      items.forEach((other) => {
        other.classList.remove("is-open");
        other.querySelector(".accordion-toggle")?.setAttribute("aria-expanded", "false");
      });
      if (willOpen) {
        item.classList.add("is-open");
        toggle.setAttribute("aria-expanded", "true");
      }
    });
  });
}

function notifyUsage(action) {
  if (window.parent && window.parent !== window) {
    window.parent.postMessage({
      type: "greenroomid-free-service-event",
      service: "daftar_hadir",
      action
    }, window.location.origin);
  }
}

function printCurrentDocument(action) {
  updatePreview();
  notifyUsage(action);

  const iframe = document.createElement("iframe");
  iframe.title = "GreenroomID Print Frame";
  iframe.style.position = "fixed";
  iframe.style.right = "0";
  iframe.style.bottom = "0";
  iframe.style.width = "0";
  iframe.style.height = "0";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const printWindow = iframe.contentWindow;
  const printDocument = iframe.contentDocument || printWindow.document;
  printDocument.open();
  printDocument.write(buildPrintHtml());
  printDocument.close();

  let hasPrinted = false;
  const runPrint = () => {
    if (hasPrinted || !document.body.contains(iframe)) return;
    hasPrinted = true;
    try {
      printWindow.focus();
      printWindow.print();
    } finally {
      setTimeout(() => iframe.remove(), 700);
    }
  };

  iframe.onload = () => setTimeout(runPrint, 120);
  setTimeout(runPrint, 650);
}

function buildPrintHtml() {
  const data = collectData();
  const paper = getPaperSize(data);
  const pages = getElement("paperPages")?.cloneNode(true) || document.createElement("div");

  return `<!DOCTYPE html>
<html lang="id">
<head>
  <meta charset="UTF-8">
  <title>Daftar Hadir GreenroomID</title>
  <style>
    @page { size: ${paper.width}mm ${paper.height}mm; margin: 0; }
    * { box-sizing: border-box; }
    html, body { width: ${paper.width}mm; margin: 0; padding: 0; background: #fff; color: #000; font-family: "Times New Roman", Times, serif; }
    body { overflow: visible; }
    .paper-pages { display: block; margin: 0; padding: 0; }
    .paper { width: ${paper.width}mm; height: ${paper.height}mm; min-height: ${paper.height}mm; margin: 0; padding: ${PAGE_PADDING_Y_MM}mm ${PAGE_PADDING_X_MM}mm; position: relative; overflow: hidden; background: #fff; page-break-after: always; break-after: page; box-shadow: none; }
    .paper:last-child { page-break-after: auto; break-after: auto; }
    .greenroom-corner-text { position: absolute; top: 6mm; left: 7mm; z-index: 2; color: #111; opacity: .14; font-family: Arial, Helvetica, sans-serif; font-size: 8pt; font-weight: 700; letter-spacing: .04em; text-decoration: none; }
    .doc-header { text-align: center; margin-bottom: 6mm; }
    .doc-header h1, .doc-header h2, .doc-header h3 { margin: 0; line-height: 1.15; font-weight: 700; overflow-wrap: anywhere; }
    .doc-header h1 { font-size: 12pt; }
    .doc-header h2, .doc-header h3 { font-size: 11pt; }
    .table-frame { width: 100%; }
    table { width: 100%; border-collapse: collapse; table-layout: fixed; font-size: 10.5pt; }
    th, td { border: 1px solid #111; padding: 3px 4px; text-align: center; vertical-align: middle; overflow-wrap: anywhere; white-space: normal; }
    th { height: ${TABLE_HEADER_HEIGHT_MM}mm; font-weight: 700; }
    tr { height: ${data.rowHeight}mm; }
    td.first-data-cell, td.ttd-cell-left { text-align: left; padding-left: 8px; }
    td.ttd-cell-center { text-align: center; }
    .signature-section { display: grid; grid-template-columns: 1fr 1fr; gap: 34mm; margin-top: 5mm; font-size: 10.5pt; page-break-inside: avoid; break-inside: avoid; }
    .signature-section.single-signature .signature-block.right { grid-column: 2; }
    .signature-section.single-signature .signature-block.left { grid-column: 1; }
    .signature-block p { margin: 0 0 2px; line-height: 1.2; min-height: 1.2em; }
    .signature-space { height: 14mm; }
    .signature-block .name { font-weight: 700; }
  </style>
</head>
<body>${pages.innerHTML}</body>
</html>`;
}

function closeExportMenu() {
  const toggle = getElement("btnExportMenu");
  const menu = getElement("exportMenuList");
  if (!toggle || !menu) return;
  menu.hidden = true;
  toggle.setAttribute("aria-expanded", "false");
}

function toggleExportMenu() {
  const toggle = getElement("btnExportMenu");
  const menu = getElement("exportMenuList");
  if (!toggle || !menu) return;
  const willOpen = menu.hidden;
  menu.hidden = !willOpen;
  toggle.setAttribute("aria-expanded", String(willOpen));
}

function setupEvents() {
  const sidebar = getElement("sidebar");

  sidebar.addEventListener("input", (event) => {
    if (event.target.id === "columnCount") {
      rebuildForColumnCount();
      return;
    }

    if (event.target.classList.contains("column-name-input")) {
      refreshAfterColumnNames();
      return;
    }

    if (event.target.classList.contains("column-width-input")) {
      rebalanceWidthInput(event.target);
      updatePreview();
      return;
    }

    updatePreview();
  });

  sidebar.addEventListener("change", (event) => {
    if (event.target.id === "signatureColumnIndex") {
      updatePreview();
      return;
    }
    updatePreview();
  });

  getElement("btnExportMenu")?.addEventListener("click", (event) => {
    event.stopPropagation();
    toggleExportMenu();
  });
  getElement("btnExportPdf")?.addEventListener("click", () => { closeExportMenu(); printCurrentDocument("download_pdf"); });
  getElement("btnPrint")?.addEventListener("click", () => { closeExportMenu(); printCurrentDocument("print"); });
  getElement("btnClearData")?.addEventListener("click", clearDataInputs);
  getElement("btnReset")?.addEventListener("click", resetAll);

  document.addEventListener("click", (event) => {
    if (!getElement("exportMenu")?.contains(event.target)) closeExportMenu();
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeExportMenu();
  });
}

window.addEventListener("message", (event) => {
  if (event.origin !== window.location.origin) return;
  const payload = event.data || {};
  if (payload.type !== "greenroomid-branding") return;
  document.querySelectorAll(".greenroom-corner-text").forEach((element) => {
    element.textContent = SITE_WATERMARK_TEXT;
  });
});

if (window.parent && window.parent !== window) {
  window.parent.postMessage({
    type: "greenroomid-tool-ready",
    service: "daftar_hadir"
  }, window.location.origin);
}

setInitialValues();
setupAccordion();
setupEvents();
updatePreview();
