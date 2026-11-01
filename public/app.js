import Cropper from '/vendor/cropper.js';

const $ = (s) => document.querySelector(s);

/** Cria um elemento. `dataset` e `className` são tratados à parte (dataset não pode ser atribuído direto). */
const el = (tag, { dataset, ...props } = {}, children = []) => {
  const node = Object.assign(document.createElement(tag), props);
  if (dataset) Object.assign(node.dataset, dataset);
  for (const child of [].concat(children)) if (child != null) node.append(child);
  return node;
};

const STORAGE_KEY = 'postai:networks';
const ICON = { ok: '✅', error: '❌', 'dry-run': '🧪' };

const state = { networks: [], selected: new Set(), image: null, imagePreview: null, cropper: null, sourceImageUrl: null, pendingImage: null, imageFilter: 'none', busy: false, history: [] };
const labelOf = (id) => state.networks.find((n) => n.id === id)?.label ?? id;

function remembered(defaults) {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (Array.isArray(saved)) return saved;
  } catch {}
  return defaults;
}

function remember() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.selected])); } catch {}
}

function textFor(id) {
  if ($('#customize').checked) {
    const field = document.querySelector(`[data-override="${id}"]`);
    if (field) return field.value;
  }
  return $('#text').value;
}

function renderNetworks() {
  $('#networks').replaceChildren(
    ...state.networks.map((n) => {
      const input = el('input', { type: 'checkbox', checked: state.selected.has(n.id) });
      input.addEventListener('change', () => {
        input.checked ? state.selected.add(n.id) : state.selected.delete(n.id);
        remember();
        renderOverrides();
        update();
      });
      return el('label', { className: 'chip', dataset: { net: n.id } }, [
        input,
        el('span', { className: 'dot', textContent: '✓', ariaHidden: 'true' }),
        el('span', { className: 'name', textContent: n.label }),
        el('span', { className: 'count', dataset: { count: n.id } }),
      ]);
    }),
  );
}

function renderOverrides() {
  const box = $('#overrides');
  box.hidden = !$('#customize').checked;
  if (box.hidden) return;
  const current = Object.fromEntries([...box.querySelectorAll('textarea')].map((t) => [t.dataset.override, t.value]));
  box.replaceChildren(
    ...state.networks
      .filter((n) => state.selected.has(n.id))
      .map((n) => {
        const id = `override-${n.id}`;
        const area = el('textarea', { id, rows: 3, value: current[n.id] ?? $('#text').value, dataset: { override: n.id } });
        area.addEventListener('input', update);
        return el('div', {}, [el('label', { htmlFor: id, textContent: n.label }), area]);
      }),
  );
}

function update() {
  const warnings = [];
  let blocking = state.selected.size === 0;
  if (blocking) warnings.push(['error', 'Escolha pelo menos uma rede.']);

  for (const n of state.networks) {
    const text = textFor(n.id);
    const count = document.querySelector(`[data-count="${n.id}"]`);
    count.textContent = `${text.length}/${n.limit}`;
    count.classList.toggle('over', text.length > n.limit);
    if (!state.selected.has(n.id)) continue;
    if (text.length > n.limit) {
      blocking = true;
      warnings.push(['error', `${n.label}: ${text.length - n.limit} caracteres acima do limite.`]);
    }
    if (!text.trim() && !state.image) blocking = true;
    if (n.requiresImage && !state.image && text.trim()) {
      warnings.push(['warn', `${n.label} não aceita só texto: vou gerar uma imagem com o texto.`]);
    }
  }

  $('#warnings').replaceChildren(...warnings.map(([kind, text]) => el('li', { className: kind, textContent: text })));
  const button = $('#submit');
  button.disabled = blocking || state.busy;
  button.classList.toggle('busy', state.busy);
  button.textContent = state.busy ? 'Enviando…' : $('#dryRun').checked ? 'Simular' : 'Publicar';
}

function setImage(file) {
  if (state.imagePreview) URL.revokeObjectURL(state.imagePreview);
  state.image = file;
  const preview = $('#preview');
  preview.hidden = !file;
  if (file) {
    state.imagePreview = URL.createObjectURL(file);
    preview.querySelector('img').src = state.imagePreview;
  } else {
    state.imagePreview = null;
    preview.querySelector('img').removeAttribute('src');
  }
  $('#image').value = '';
  update();
}

function clearImageEditor() {
  state.cropper?.destroy();
  state.cropper = null;
  $('#cropperContainer').replaceChildren();
  if (state.sourceImageUrl) URL.revokeObjectURL(state.sourceImageUrl);
  state.sourceImageUrl = null;
  state.pendingImage = null;
  state.imageFilter = 'none';
  $('#imageEditorError').hidden = true;
  for (const button of document.querySelectorAll('[data-image-filter]')) button.setAttribute('aria-pressed', String(button.dataset.imageFilter === 'none'));
}

async function openImageEditor(file) {
  if (!file?.type.startsWith('image/')) return;
  clearImageEditor();
  state.pendingImage = file;
  const image = new Image();
  state.sourceImageUrl = URL.createObjectURL(file);
  image.src = state.sourceImageUrl;
  image.alt = file.name || 'Imagem enviada';
  $('#imageEditor').showModal();
  try {
    await image.decode();
    state.cropper = new Cropper(image, { container: '#cropperContainer' });
    state.sourceWidth = image.naturalWidth;
    // O corte começa na imagem inteira: quem só clica em "Usar imagem" não perde nada.
    const cropperImage = state.cropper.getCropperImage();
    await cropperImage.$ready();
    const area = state.cropper.getCropperCanvas().getBoundingClientRect();
    const box = cropperImage.getBoundingClientRect();
    state.cropper.getCropperSelection().$change(box.left - area.left, box.top - area.top, box.width, box.height);
  } catch {
    $('#imageEditorError').textContent = 'Não consegui abrir essa imagem. Tente JPEG, PNG ou WebP.';
    $('#imageEditorError').hidden = false;
  }
}

async function applyImageEdit() {
  const selection = state.cropper?.getCropperSelection();
  if (!selection) return;
  const button = $('#applyImageEdit');
  button.disabled = true;
  try {
    // A seleção é medida na tela: converte para os pixels da foto, para não reduzir a resolução.
    const scale = state.sourceWidth / state.cropper.getCropperImage().getBoundingClientRect().width;
    const canvas = await selection.$toCanvas({ width: Math.round(selection.width * scale), height: Math.round(selection.height * scale), beforeDraw: (context) => { context.filter = state.imageFilter; } });
    const mime = ['image/png', 'image/webp'].includes(state.pendingImage?.type) ? state.pendingImage.type : 'image/jpeg';
    const blob = await new Promise((resolve, reject) => canvas.toBlob((result) => result ? resolve(result) : reject(new Error('falha ao processar a imagem')), mime, 0.92));
    const extension = blob.type === 'image/png' ? 'png' : blob.type === 'image/webp' ? 'webp' : 'jpg';
    const base = (state.pendingImage?.name || 'imagem').replace(/\.[^.]+$/, '');
    setImage(new File([blob], `${base}-editada.${extension}`, { type: blob.type }));
    $('#imageEditor').close();
  } catch (error) {
    $('#imageEditorError').textContent = `Não consegui processar a imagem: ${error.message}`;
    $('#imageEditorError').hidden = false;
  } finally {
    button.disabled = false;
  }
}

function resultRow(id) {
  return el('li', { dataset: { result: id } }, [
    el('span', { className: 'icon' }, el('span', { className: 'spinner' })),
    el('span', { className: 'name', textContent: labelOf(id) }),
    el('span', { className: 'detail', textContent: 'na fila' }),
  ]);
}

function showResult(result) {
  const row = document.querySelector(`[data-result="${result.network}"]`);
  row.querySelector('.icon').textContent = ICON[result.status];
  const detail = row.querySelector('.detail');
  detail.replaceChildren();
  if (result.url) detail.append(el('a', { href: result.url, target: '_blank', rel: 'noopener', textContent: result.url }));
  if (result.note) detail.append(` ${result.note}`);
  if (result.error) {
    detail.append(el('span', { className: 'error', textContent: result.error }));
    if (result.screenshot) detail.append(el('div', { className: 'small', textContent: `print: ${result.screenshot}` }));
  }
}

/** Último post publicado de verdade (não simulação) com o mesmo texto, em alguma das redes escolhidas. */
function sameAsLast() {
  const norm = (t) => t.replace(/\r\n/g, '\n').trim();
  const texts = new Set([...state.selected].map(textFor).map(norm));
  return state.history.find(
    (r) => !r.dryRun && r.results.some((x) => x.status === 'ok' && state.selected.has(x.network) && texts.has(norm(r.overrides?.[x.network] ?? r.text))),
  );
}

async function submit(event) {
  event.preventDefault();
  if (state.busy || $('#submit').disabled) return;
  const dryRun = $('#dryRun').checked;
  const twin = !dryRun && sameAsLast();
  if (twin) {
    const when = new Date(twin.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
    if (!confirm(`Esse texto já foi publicado em ${when}. Publicar de novo?`)) return;
  }

  const form = new FormData();
  form.append('text', $('#text').value);
  for (const id of state.selected) form.append('networks', id);
  if (state.image) form.append('image', state.image);
  if ($('#customize').checked) {
    const overrides = {};
    for (const id of state.selected) overrides[id] = textFor(id);
    form.append('overrides', JSON.stringify(overrides));
  }
  form.append('dryRun', String(dryRun));

  state.busy = true;
  update();
  const response = await fetch('/api/posts', { method: 'POST', body: form });
  const data = await response.json();
  if (!response.ok) {
    state.busy = false;
    update();
    $('#warnings').replaceChildren(...data.problems.map((p) => el('li', { className: 'error', textContent: p })));
    return;
  }

  // Aceito: limpa já, para um segundo clique não publicar de novo. O texto fica no histórico.
  if (!dryRun) {
    $('#text').value = '';
    setImage(null);
    renderOverrides();
  }
  track(data.id, [...state.selected]);
}

/** Mostra o andamento de um envio (novo ou "tentar de novo") até terminar. */
function track(jobId, ids) {
  state.busy = true;
  update();
  $('#progress').hidden = false;
  $('#results').replaceChildren(...ids.map(resultRow));
  $('#progress').scrollIntoView({ behavior: 'smooth', block: 'nearest' });

  const events = new EventSource(`/api/posts/${jobId}/events`);
  events.onmessage = (message) => {
    const ev = JSON.parse(message.data);
    const detail = ev.network && document.querySelector(`[data-result="${ev.network}"] .detail`);
    if (ev.type === 'start' && detail) detail.textContent = 'publicando…';
    if (ev.type === 'log' && detail) detail.textContent = `${ev.message}…`;
    if (ev.type === 'result') showResult(ev.result);
    if (ev.type === 'finish') {
      events.close();
      state.busy = false;
      update();
      loadHistory();
    }
  };
  events.onerror = () => {
    events.close();
    state.busy = false;
    update();
  };
}

/** Traz um post do histórico de volta para o editor (texto, redes, texto por rede e imagem). */
async function repost(record) {
  const used = record.results.map((r) => r.network).filter((id) => state.networks.some((n) => n.id === id));
  state.selected = new Set(used);
  remember();
  renderNetworks();
  $('#text').value = record.text;
  $('#customize').checked = !!record.overrides && Object.keys(record.overrides).length > 0;
  renderOverrides();
  for (const [id, text] of Object.entries(record.overrides ?? {})) {
    const field = document.querySelector(`[data-override="${id}"]`);
    if (field) field.value = text;
  }
  setImage(null);
  if (record.image) {
    const response = await fetch(`/api/history/${record.id}/image`);
    if (response.ok) {
      const blob = await response.blob();
      await openImageEditor(new File([blob], record.image.split('/').pop(), { type: blob.type }));
    }
  }
  update();
  $('#composer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#text').focus();
}

async function retry(record) {
  const failed = record.results.filter((r) => r.status === 'error').map((r) => labelOf(r.network));
  const question = `Publicar de novo só em: ${failed.join(', ')}?\n\nAntes, confira na rede se o post não saiu mesmo (às vezes ele sai e só o link falha).`;
  if (state.busy || !confirm(question)) return;
  const response = await fetch(`/api/history/${record.id}/retry`, { method: 'POST' });
  const data = await response.json();
  if (!response.ok) {
    $('#warnings').replaceChildren(...data.problems.map((p) => el('li', { className: 'error', textContent: p })));
    return;
  }
  track(data.id, data.networks);
}

async function loadHistory() {
  const history = await fetch('/api/history').then((r) => r.json());
  state.history = history;
  $('#history').replaceChildren(
    ...(history.length
      ? history.map((record) =>
          el('li', {}, [
            el('div', {
              className: 'meta',
              textContent: `${new Date(record.createdAt).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}${record.dryRun ? ' · simulação' : ''}`,
            }),
            el('div', { className: 'text', textContent: record.text }),
            el(
              'div',
              { className: 'links' },
              record.results.map((r) =>
                r.url
                  ? el('a', { href: r.url, target: '_blank', rel: 'noopener', textContent: `${ICON[r.status]} ${labelOf(r.network)}` })
                  : el('span', { textContent: `${ICON[r.status]} ${labelOf(r.network)}`, title: r.error ?? r.note ?? '' }),
              ),
            ),
            historyActions(record),
          ]),
        )
      : [el('li', { className: 'muted', textContent: 'Nada publicado ainda.' })]),
  );
}

function historyActions(record) {
  const repostButton = el('button', { type: 'button', className: 'link', textContent: '↺ Repostar' });
  repostButton.addEventListener('click', () => repost(record));
  const buttons = [repostButton];
  const failed = record.results.filter((r) => r.status === 'error').length;
  if (failed) {
    const retryButton = el('button', { type: 'button', className: 'link', textContent: `⟳ Tentar de novo nas que falharam (${failed})` });
    retryButton.addEventListener('click', () => retry(record));
    buttons.push(retryButton);
  }
  return el('div', { className: 'history-actions' }, buttons);
}

function setupImageInputs() {
  $('#image').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (file) openImageEditor(file);
    e.target.value = '';
  });
  $('#removeImage').addEventListener('click', () => setImage(null));
  document.addEventListener('paste', (e) => {
    if ($('#imageEditor').open) return;
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (file) openImageEditor(file);
  });
  const zone = $('#dropzone');
  zone.addEventListener('dragover', (e) => {
    e.preventDefault();
    zone.classList.add('dragging');
  });
  zone.addEventListener('dragleave', () => zone.classList.remove('dragging'));
  zone.addEventListener('drop', (e) => {
    e.preventDefault();
    zone.classList.remove('dragging');
    const file = [...e.dataTransfer.files].find((f) => f.type.startsWith('image/'));
    if (file) openImageEditor(file);
  });
  $('#cancelImageEdit').addEventListener('click', () => $('#imageEditor').close());
  $('#closeImageEditor').addEventListener('click', () => $('#imageEditor').close());
  // O evento "close" chega depois: se outra imagem já abriu o editor, não apaga a imagem nova.
  $('#imageEditor').addEventListener('close', () => {
    if (!$('#imageEditor').open) clearImageEditor();
  });
  $('#applyImageEdit').addEventListener('click', applyImageEdit);
  for (const button of document.querySelectorAll('[data-image-filter]')) button.addEventListener('click', () => {
    state.imageFilter = button.dataset.imageFilter;
    state.cropper?.getCropperImage()?.style.setProperty('filter', state.imageFilter);
    for (const other of document.querySelectorAll('[data-image-filter]')) other.setAttribute('aria-pressed', String(other === button));
  });
}

const PROVIDER_LABEL = { gemini: 'Gemini', claude: 'Claude' };
const HINTS = {
  all: 'Gera X, Threads e LinkedIn de uma vez e preenche o "Texto por rede".',
  x: 'Curto, direto, com hashtags, no limite do X.',
  threads: 'Tom de conversa, com hashtags.',
  linkedin: 'Expande como um artigo curto: contexto, palavras-chave e hashtags.',
};
const writer = { network: 'all', networks: [], busy: false };

const limitOf = (id) => state.networks.find((n) => n.id === id)?.limit ?? Infinity;

function draftCount(id) {
  const area = document.querySelector(`[data-draft="${id}"]`);
  const count = document.querySelector(`[data-draft-count="${id}"]`);
  count.textContent = `${area.value.length}/${limitOf(id)}`;
  count.classList.toggle('count-over', area.value.length > limitOf(id));
}

function draftBlock(id, text) {
  const area = el('textarea', { id: `draft-${id}`, rows: id === 'linkedin' ? 12 : 5, value: text, dataset: { draft: id } });
  area.addEventListener('input', () => draftCount(id));
  const copy = el('button', { type: 'button', className: 'ghost small-btn', textContent: 'Copiar' });
  copy.addEventListener('click', async () => {
    await navigator.clipboard.writeText(area.value);
    copy.textContent = 'Copiado ✓';
    setTimeout(() => (copy.textContent = 'Copiar'), 1500);
  });
  return el('div', { className: 'draft' }, [
    el('div', { className: 'draft-head' }, [
      el('label', { htmlFor: area.id, textContent: labelOf(id) }),
      el('span', { className: 'muted small', dataset: { draftCount: id } }),
      copy,
    ]),
    area,
  ]);
}

function renderWriterNetworks() {
  $('#writerHint').textContent = HINTS[writer.network];
  for (const button of $('#writerNetworks').children) button.setAttribute('aria-checked', String(button.dataset.net === writer.network));
}

async function writeOne(idea, network, provider) {
  const response = await fetch('/api/write', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ idea, network, provider }),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`${labelOf(network)}: ${data.error}`);
  return [network, data.text];
}

async function generate() {
  const idea = $('#idea').value.trim();
  if (!idea || writer.busy) return;
  writer.busy = true;
  const button = $('#generate');
  button.disabled = true;
  button.textContent = 'Gerando…';
  $('#writerError').hidden = true;
  const ids = writer.network === 'all' ? writer.networks : [writer.network];
  const provider = $('#writerProvider').value;
  const results = await Promise.allSettled(ids.map((id) => writeOne(idea, id, provider)));
  const drafts = results.filter((r) => r.status === 'fulfilled').map((r) => r.value);
  const errors = results.filter((r) => r.status === 'rejected').map((r) => r.reason.message || 'Não consegui gerar o texto.');
  if (errors.length) {
    $('#writerError').textContent = errors.join(' · ');
    $('#writerError').hidden = false;
  }
  if (drafts.length) {
    $('#drafts').replaceChildren(...drafts.map(([id, text]) => draftBlock(id, text)));
    drafts.forEach(([id]) => draftCount(id));
    $('#useDraft').textContent = drafts.length > 1 ? 'Usar no post (texto por rede)' : 'Usar no post';
    $('#draftBox').hidden = false;
  }
  writer.busy = false;
  button.disabled = false;
  button.textContent = 'Gerar';
}

/** Leva os textos gerados para o editor. Vários: liga "Texto por rede" e preenche cada rede. */
function useDrafts() {
  const drafts = [...document.querySelectorAll('[data-draft]')].map((a) => [a.dataset.draft, a.value]);
  if (drafts.length === 1) {
    $('#text').value = drafts[0][1];
  } else {
    for (const [id] of drafts) state.selected.add(id);
    remember();
    renderNetworks();
    // O texto principal vale para as redes sem texto próprio (Facebook, card do Instagram): usa o do Threads.
    $('#text').value = (drafts.find(([id]) => id === 'threads') ?? drafts[0])[1];
    $('#customize').checked = true;
    renderOverrides();
    for (const [id, text] of drafts) {
      const field = document.querySelector(`[data-override="${id}"]`);
      if (field) field.value = text;
    }
  }
  update();
  $('#composer').scrollIntoView({ behavior: 'smooth', block: 'start' });
  $('#text').focus();
}

async function setupWriter() {
  const data = await fetch('/api/writer').then((r) => r.json());
  writer.networks = data.networks;
  $('#writerNetworks').replaceChildren(
    ...['all', ...data.networks].map((id) => {
      const button = el('button', { type: 'button', textContent: id === 'all' ? 'Todas' : labelOf(id), role: 'radio', dataset: { net: id } });
      button.addEventListener('click', () => {
        writer.network = id;
        renderWriterNetworks();
      });
      return button;
    }),
  );
  $('#writerProvider').replaceChildren(
    ...data.providers.map((id) => el('option', { value: id, textContent: PROVIDER_LABEL[id], selected: id === data.provider })),
  );
  renderWriterNetworks();
  $('#generate').addEventListener('click', generate);
  $('#idea').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) generate();
  });
  $('#useDraft').addEventListener('click', useDrafts);
}

async function init() {
  const data = await fetch('/api/networks').then((r) => r.json());
  state.networks = data.networks;
  const ids = new Set(state.networks.map((n) => n.id));
  state.selected = new Set(remembered(data.defaults).filter((id) => ids.has(id)));
  renderNetworks();
  setupImageInputs();

  $('#text').addEventListener('input', update);
  $('#dryRun').addEventListener('change', update);
  $('#customize').addEventListener('change', () => { renderOverrides(); update(); });
  $('#composer').addEventListener('submit', submit);
  $('#composer').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && e.target.tagName === 'TEXTAREA') {
      e.preventDefault();
      $('#composer').requestSubmit();
    }
  });

  update();
  loadHistory();
  setupWriter();
}

init();
