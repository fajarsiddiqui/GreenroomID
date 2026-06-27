(() => {
  'use strict';

  const PAPER_SIZES = {
    A4: { w: 210, h: 297 },
    F4: { w: 210, h: 330 },
  };

  const state = {
    images: [],
    zoom: 0.72,
    dragIndex: null,
    exporting: false,
  };

  const $ = (id) => document.getElementById(id);

  const dom = {
    imageInput: $('imageInput'),
    dropzone: $('dropzone'),
    imageList: $('imageList'),
    preview: $('preview'),
    pageSummary: $('pageSummary'),
    zoomValue: $('zoomValue'),
    toast: $('toast'),
    printPageStyle: $('printPageStyle'),
    customPaperBox: $('customPaperBox'),
  };

  const inputs = [
    'titleInput', 'paperSize', 'orientation', 'customWidth', 'customHeight',
    'columns', 'rows', 'marginTop', 'marginRight', 'marginBottom', 'marginLeft',
    'fitMode', 'imageShape', 'cellPadding', 'borderWidth', 'titleSize',
    'showCaption', 'captionPrefix', 'captionStart', 'captionSize', 'fileName'
  ].reduce((acc, id) => ({ ...acc, [id]: $(id) }), {});

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function asNumber(el, fallback = 0) {
    const value = Number(el.value);
    return Number.isFinite(value) ? value : fallback;
  }

  function mmToPx(mm) {
    return Math.ceil(mm * 96 / 25.4);
  }

  function safeFileName(name) {
    return (name || 'hasil-tabel-gambar')
      .toString()
      .trim()
      .replace(/[\\/:*?"<>|]+/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-') || 'hasil-tabel-gambar';
  }

  function getSettings() {
    const columns = clamp(Math.round(asNumber(inputs.columns, 3)), 1, 8);
    const rows = clamp(Math.round(asNumber(inputs.rows, 1)), 1, 8);
    inputs.columns.value = columns;
    inputs.rows.value = rows;

    let paper = PAPER_SIZES[inputs.paperSize.value] || PAPER_SIZES.A4;
    if (inputs.paperSize.value === 'Custom') {
      paper = {
        w: clamp(asNumber(inputs.customWidth, 210), 50, 1000),
        h: clamp(asNumber(inputs.customHeight, 297), 50, 1000),
      };
      inputs.customWidth.value = paper.w;
      inputs.customHeight.value = paper.h;
    }

    const orientation = inputs.orientation.value;
    let width = paper.w;
    let height = paper.h;
    if (orientation === 'landscape' && height > width) [width, height] = [height, width];
    if (orientation === 'portrait' && width > height) [width, height] = [height, width];

    return {
      title: inputs.titleInput.value.trim(),
      paperSize: inputs.paperSize.value,
      orientation,
      width,
      height,
      columns,
      rows,
      marginTop: clamp(asNumber(inputs.marginTop, 8), 0, 80),
      marginRight: clamp(asNumber(inputs.marginRight, 8), 0, 80),
      marginBottom: clamp(asNumber(inputs.marginBottom, 8), 0, 80),
      marginLeft: clamp(asNumber(inputs.marginLeft, 8), 0, 80),
      fitMode: inputs.fitMode.value,
      imageShape: inputs.imageShape.value,
      cellPadding: clamp(asNumber(inputs.cellPadding, 3), 0, 20),
      borderWidth: clamp(asNumber(inputs.borderWidth, .35), 0, 3),
      titleSize: clamp(asNumber(inputs.titleSize, 18), 10, 36),
      showCaption: inputs.showCaption.checked,
      captionPrefix: inputs.captionPrefix.value.trim() || 'Gambar',
      captionStart: Math.max(0, Math.round(asNumber(inputs.captionStart, 1))),
      captionSize: clamp(asNumber(inputs.captionSize, 9), 6, 18),
      fileName: safeFileName(inputs.fileName.value),
    };
  }

  function applyCssVars(settings) {
    document.documentElement.style.setProperty('--paper-w', `${settings.width}mm`);
    document.documentElement.style.setProperty('--paper-h', `${settings.height}mm`);
    document.documentElement.style.setProperty('--page-margin-top', `${settings.marginTop}mm`);
    document.documentElement.style.setProperty('--page-margin-right', `${settings.marginRight}mm`);
    document.documentElement.style.setProperty('--page-margin-bottom', `${settings.marginBottom}mm`);
    document.documentElement.style.setProperty('--page-margin-left', `${settings.marginLeft}mm`);
    document.documentElement.style.setProperty('--cell-padding', `${settings.cellPadding}mm`);
    document.documentElement.style.setProperty('--border-width', `${settings.borderWidth}pt`);
    document.documentElement.style.setProperty('--title-size', `${settings.titleSize}pt`);
    document.documentElement.style.setProperty('--caption-size', `${settings.captionSize}pt`);
    document.documentElement.style.setProperty('--preview-zoom', state.zoom);
    dom.preview.style.transform = `scale(${state.zoom})`;
    dom.zoomValue.textContent = `${Math.round(state.zoom * 100)}%`;
    dom.printPageStyle.textContent = `@page { size: ${settings.width}mm ${settings.height}mm; margin: 0; }`;

    $('paddingValue').textContent = settings.cellPadding;
    $('borderValue').textContent = settings.borderWidth;
    $('titleSizeValue').textContent = settings.titleSize;
    $('captionSizeValue').textContent = settings.captionSize;
    if (dom.customPaperBox) dom.customPaperBox.classList.toggle('hidden', inputs.paperSize.value !== 'Custom');
  }

  function chunkImages(settings) {
    const perPage = Math.max(1, settings.rows * settings.columns);
    const pages = [];
    for (let i = 0; i < state.images.length; i += perPage) {
      pages.push(state.images.slice(i, i + perPage));
    }
    if (!pages.length) pages.push([]);
    return pages;
  }

  function defaultCaption(index, settings = getSettings()) {
    return `${settings.captionPrefix} ${settings.captionStart + index}`;
  }

  function renderPreview() {
    const settings = getSettings();
    applyCssVars(settings);
    dom.preview.innerHTML = '';

    if (!state.images.length) {
      const tpl = $('emptyPageTemplate').content.cloneNode(true);
      dom.preview.appendChild(tpl);
      dom.pageSummary.textContent = '0 gambar · 0 halaman';
      return;
    }

    const pages = chunkImages(settings);
    pages.forEach((pageImages, pageIndex) => {
      dom.preview.appendChild(createPageElement(pageImages, pageIndex, settings));
    });

    dom.pageSummary.textContent = `${state.images.length} gambar · ${pages.length} halaman`;
  }

  function createPageElement(pageImages, pageIndex, settings) {
    const totalSlots = settings.rows * settings.columns;
    const page = document.createElement('section');
    page.className = 'page';
    page.dataset.page = String(pageIndex + 1);

    const inner = document.createElement('div');
    inner.className = 'page-inner';

    if (settings.title) {
      const title = document.createElement('h2');
      title.className = 'doc-title';
      title.textContent = settings.title;
      inner.appendChild(title);
    }

    const grid = document.createElement('div');
    grid.className = 'image-grid';
    grid.style.gridTemplateColumns = `repeat(${settings.columns}, minmax(0, 1fr))`;
    grid.style.gridTemplateRows = `repeat(${settings.rows}, minmax(0, 1fr))`;

    for (let slot = 0; slot < totalSlots; slot++) {
      const image = pageImages[slot];
      const cell = document.createElement('div');
      cell.className = 'table-cell';

      if (image) {
        const imgWrap = document.createElement('div');
        imgWrap.className = 'img-wrap';

        const img = document.createElement('img');
        img.className = `table-img fit-${settings.fitMode} shape-${settings.imageShape}`;
        img.alt = image.caption || image.name;
        img.src = image.dataUrl;
        imgWrap.appendChild(img);
        cell.appendChild(imgWrap);

        if (settings.showCaption) {
          const caption = document.createElement('div');
          caption.className = 'caption';
          caption.textContent = image.caption || defaultCaption(state.images.indexOf(image), settings);
          cell.appendChild(caption);
        }
      } else {
        const blank = document.createElement('div');
        blank.className = 'blank-cell';
        cell.appendChild(blank);
      }
      grid.appendChild(cell);
    }

    inner.appendChild(grid);
    page.appendChild(inner);
    return page;
  }

  function renderImageList() {
    dom.imageList.innerHTML = '';
    state.images.forEach((image, index) => {
      const item = document.createElement('div');
      item.className = 'image-item';
      item.draggable = true;
      item.dataset.index = String(index);

      const thumb = document.createElement('img');
      thumb.className = 'thumb';
      thumb.src = image.dataUrl;
      thumb.alt = image.name;

      const meta = document.createElement('div');
      meta.className = 'image-meta';
      const name = document.createElement('strong');
      name.textContent = `${index + 1}. ${image.name}`;
      const cap = document.createElement('input');
      cap.type = 'text';
      cap.value = image.caption || '';
      cap.placeholder = 'Caption';
      cap.addEventListener('input', () => {
        image.caption = cap.value;
        renderPreview();
      });
      meta.append(name, cap);

      const remove = document.createElement('button');
      remove.className = 'icon-btn';
      remove.type = 'button';
      remove.title = 'Hapus gambar';
      remove.textContent = '×';
      remove.addEventListener('click', () => {
        state.images.splice(index, 1);
        renderImageList();
        renderPreview();
      });

      item.addEventListener('dragstart', () => {
        state.dragIndex = index;
        item.classList.add('dragging');
      });
      item.addEventListener('dragend', () => item.classList.remove('dragging'));
      item.addEventListener('dragover', (event) => event.preventDefault());
      item.addEventListener('drop', (event) => {
        event.preventDefault();
        const from = state.dragIndex;
        const to = index;
        if (from === null || from === to) return;
        const [moved] = state.images.splice(from, 1);
        state.images.splice(to, 0, moved);
        state.dragIndex = null;
        renderImageList();
        renderPreview();
      });

      item.append(thumb, meta, remove);
      dom.imageList.appendChild(item);
    });
  }

  async function handleFiles(fileList) {
    const files = Array.from(fileList || []).filter(file => file.type.startsWith('image/'));
    if (!files.length) {
      showToast('Tidak ada file gambar yang dipilih.');
      return;
    }

    const baseIndex = state.images.length;
    const settings = getSettings();
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const dataUrl = await readAsDataUrl(file);
      state.images.push({
        id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
        name: file.name,
        dataUrl,
        caption: `${settings.captionPrefix} ${settings.captionStart + baseIndex + i}`,
        size: file.size,
      });
    }
    renderImageList();
    renderPreview();
    showToast(`${files.length} gambar berhasil dimasukkan.`);
    dom.imageInput.value = '';
  }

  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function renumberCaptions() {
    const settings = getSettings();
    state.images.forEach((image, index) => {
      image.caption = defaultCaption(index, settings);
    });
    renderImageList();
    renderPreview();
  }

  function buildExportClone() {
    const clone = dom.preview.cloneNode(true);
    clone.removeAttribute('id');
    clone.classList.add('export-stage');
    clone.style.transform = 'none';
    clone.style.gap = '0';
    clone.querySelectorAll('.page').forEach(page => {
      page.style.boxShadow = 'none';
      page.style.margin = '0';
      page.style.transform = 'none';
    });
    return clone;
  }

  async function waitForImages(root) {
    const images = Array.from(root.querySelectorAll('img'));
    await Promise.all(images.map(img => {
      if (img.complete && img.naturalWidth > 0) return Promise.resolve();
      return new Promise(resolve => {
        img.onload = resolve;
        img.onerror = resolve;
      });
    }));
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  }

  function makeExportHost(settings) {
    const host = document.createElement('div');
    host.className = 'pdf-render-host';
    host.innerHTML = '<div class="pdf-render-message">Sedang membuat PDF. Tunggu sebentar...</div>';

    const stage = buildExportClone();
    stage.style.width = `${settings.width}mm`;
    stage.style.alignItems = 'stretch';
    host.appendChild(stage);
    document.body.appendChild(host);
    return { host, stage };
  }

  async function exportPdf() {
    if (state.exporting) return;
    if (!state.images.length) {
      showToast('Upload gambar terlebih dahulu.');
      return;
    }

    const settings = getSettings();
    const jsPDFCtor = window.jspdf && window.jspdf.jsPDF;
    if (typeof window.html2canvas === 'undefined' || !jsPDFCtor) {
      showToast('Library PDF belum termuat. Gunakan tombol Print / Save PDF.');
      return;
    }

    state.exporting = true;
    const button = $('btnExportPdf');
    const originalLabel = button.textContent;
    button.disabled = true;
    button.textContent = 'Membuat PDF...';
    showToast('PDF sedang dibuat. Jangan tutup halaman dulu.');

    const { host, stage } = makeExportHost(settings);

    try {
      await waitForImages(stage);
      const pages = Array.from(stage.querySelectorAll('.page'));
      const pdf = new jsPDFCtor({
        orientation: settings.orientation,
        unit: 'mm',
        format: [settings.width, settings.height],
        compress: true,
      });

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (i > 0) pdf.addPage([settings.width, settings.height], settings.orientation);

        const canvas = await window.html2canvas(page, {
          backgroundColor: '#ffffff',
          scale: Math.max(2, Math.min(3, window.devicePixelRatio || 2)),
          useCORS: false,
          allowTaint: true,
          logging: false,
          scrollX: 0,
          scrollY: 0,
          windowWidth: mmToPx(settings.width),
          windowHeight: mmToPx(settings.height),
        });

        const imageData = canvas.toDataURL('image/jpeg', 0.98);
        pdf.addImage(imageData, 'JPEG', 0, 0, settings.width, settings.height, undefined, 'FAST');
      }

      pdf.save(`${settings.fileName}.pdf`);
      notifyUsage('download_pdf');
      showToast('PDF selesai dibuat.');
    } catch (err) {
      console.error(err);
      showToast('PDF gagal dibuat. Coba tombol Print / Save PDF sebagai cadangan.');
    } finally {
      host.remove();
      button.disabled = false;
      button.textContent = originalLabel;
      state.exporting = false;
    }
  }

  function resetLayout() {
    inputs.titleInput.value = 'Bukti Pembayaran Semester 1';
    inputs.paperSize.value = 'A4';
    inputs.orientation.value = 'landscape';
    inputs.columns.value = 3;
    inputs.rows.value = 1;
    inputs.marginTop.value = 8;
    inputs.marginRight.value = 8;
    inputs.marginBottom.value = 8;
    inputs.marginLeft.value = 8;
    inputs.fitMode.value = 'contain';
    inputs.imageShape.value = 'square';
    inputs.cellPadding.value = 3;
    inputs.borderWidth.value = .35;
    inputs.titleSize.value = 18;
    inputs.showCaption.checked = true;
    inputs.captionPrefix.value = 'Gambar';
    inputs.captionStart.value = 1;
    inputs.captionSize.value = 9;
    inputs.fileName.value = 'hasil-tabel-gambar';
    renumberCaptions();
    renderPreview();
    showToast('Layout kembali ke template awal.');
  }

  function notifyUsage(action) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage({
        type: 'greenroomid-free-service-event',
        service: 'image_to_table',
        action,
      }, window.location.origin);
    }
  }

  function showToast(message) {
    dom.toast.textContent = message;
    dom.toast.classList.add('show');
    clearTimeout(showToast.timer);
    showToast.timer = setTimeout(() => dom.toast.classList.remove('show'), 3200);
  }

  function bindEvents() {
    dom.imageInput.addEventListener('change', e => handleFiles(e.target.files));
    dom.dropzone.addEventListener('dragenter', e => { e.preventDefault(); dom.dropzone.classList.add('dragover'); });
    dom.dropzone.addEventListener('dragover', e => { e.preventDefault(); dom.dropzone.classList.add('dragover'); });
    dom.dropzone.addEventListener('dragleave', () => dom.dropzone.classList.remove('dragover'));
    dom.dropzone.addEventListener('drop', e => {
      e.preventDefault();
      dom.dropzone.classList.remove('dragover');
      handleFiles(e.dataTransfer.files);
    });

    Object.values(inputs).forEach(el => {
      const eventName = el.type === 'checkbox' || el.tagName === 'SELECT' ? 'change' : 'input';
      el.addEventListener(eventName, renderPreview);
    });

    $('btnRenumber').addEventListener('click', renumberCaptions);
    $('btnSortName').addEventListener('click', () => {
      state.images.sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
      renderImageList();
      renderPreview();
    });
    $('btnClearImages').addEventListener('click', () => {
      state.images = [];
      renderImageList();
      renderPreview();
      showToast('Daftar gambar dikosongkan.');
    });
    $('btnAddCol').addEventListener('click', () => { inputs.columns.value = clamp(asNumber(inputs.columns, 3) + 1, 1, 8); renderPreview(); });
    $('btnRemoveCol').addEventListener('click', () => { inputs.columns.value = clamp(asNumber(inputs.columns, 3) - 1, 1, 8); renderPreview(); });
    $('btnAddRow').addEventListener('click', () => { inputs.rows.value = clamp(asNumber(inputs.rows, 1) + 1, 1, 8); renderPreview(); });
    $('btnRemoveRow').addEventListener('click', () => { inputs.rows.value = clamp(asNumber(inputs.rows, 1) - 1, 1, 8); renderPreview(); });

    $('btnZoomOut').addEventListener('click', () => { state.zoom = clamp(state.zoom - .08, .25, 1.5); renderPreview(); });
    $('btnZoomIn').addEventListener('click', () => { state.zoom = clamp(state.zoom + .08, .25, 1.5); renderPreview(); });
    $('btnExportPdf').addEventListener('click', exportPdf);
    $('btnPrint').addEventListener('click', () => {
      notifyUsage('print');
      window.print();
    });
    $('btnReset').addEventListener('click', resetLayout);
  }

  bindEvents();
  renderPreview();
})();
