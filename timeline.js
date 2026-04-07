'use strict';

// ─── Constants ────────────────────────────────────────────────────────────────

const ROW_H = 56; // px per hour — keep in sync with .timeline-hour-row height in timeline.css

// ─── State ────────────────────────────────────────────────────────────────────

let CATS = {}; // { id: { label, color } } — loaded dynamically

let timelineDate   = null;
let timelineEvents = {}; // { 'YYYY-MM-DD': [{ id, name, startMin, endMin, category }] }

// Grid drag — create new event by dragging empty space
let tlDrag = {
    active: false, anchorMin: 0, startMin: 0, endMin: 0,
    dateKey: null, preview: null,
};

// Event drag — move existing event
let tlEvDrag = {
    active: false, confirmed: false, wasDrag: false,
    ev: null, dateKey: null, el: null,
    offsetMin: 0, startClientY: 0, preview: null,
};

// Saved modal state for round-tripping to/from cat manager
let pendingModalData = null;

// Notes — { eventId: { good: [{id,text,done}], bad: [...], insight: [...] } }
let timelineNotes = {};
let _noteKeyHandler = null;

// ─── Category Persistence ─────────────────────────────────────────────────────

function loadCats() {
    try {
        const raw = localStorage.getItem('cal-cats');
        if (raw) {
            const p = JSON.parse(raw);
            if (Object.keys(p).length) { CATS = p; return; }
        }
    } catch {}
    CATS = {
        work:     { label: '업무',  color: '#007aff' },
        personal: { label: '개인',  color: '#34c759' },
        meeting:  { label: '미팅',  color: '#ff9500' },
        other:    { label: '기타',  color: '#8e8e93' },
    };
}

function saveCats() {
    localStorage.setItem('cal-cats', JSON.stringify(CATS));
}

function newCatId() {
    return `c${Date.now().toString(36)}${Math.random().toString(36).slice(2, 4)}`;
}

function deleteCat(catKey) {
    if (Object.keys(CATS).length <= 1) return;
    delete CATS[catKey];
    saveCats();
    const fallback = Object.keys(CATS)[0];
    for (const day of Object.values(timelineEvents))
        for (const ev of day)
            if (ev.category === catKey) ev.category = fallback;
    saveTimeline();
    renderTimeline();
}

// ─── Timeline Persistence ─────────────────────────────────────────────────────

function loadTimeline() {
    try {
        const raw = localStorage.getItem('cal-timeline');
        if (!raw) return;
        const parsed = JSON.parse(raw);
        const out = {};
        for (const [date, val] of Object.entries(parsed))
            if (Array.isArray(val))
                out[date] = val.filter(e => e.id && e.name && typeof e.startMin === 'number');
        timelineEvents = out;
    } catch { timelineEvents = {}; }
}

function saveTimeline() {
    localStorage.setItem('cal-timeline', JSON.stringify(timelineEvents));
}

// ─── Notes Persistence ────────────────────────────────────────────────────────

function loadNotes() {
    try {
        const raw = localStorage.getItem('cal-notes');
        if (raw) timelineNotes = JSON.parse(raw);
    } catch { timelineNotes = {}; }
}

function saveNotes() {
    localStorage.setItem('cal-notes', JSON.stringify(timelineNotes));
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function minToTime(min) {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function timeToMin(str) {
    const [h, m] = str.split(':').map(Number);
    return h * 60 + (m || 0);
}

function snapMin(min, step = 5) {
    return Math.round(min / step) * step;
}

function hexToRgba(hex, alpha) {
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    return `rgba(${r},${g},${b},${alpha})`;
}

function mouseToMin(e) {
    const hw = document.getElementById('timeline-hours');
    if (!hw) return 0;
    const y = e.clientY - hw.getBoundingClientRect().top;
    return Math.max(0, Math.min(24 * 60 - 10, snapMin((y / ROW_H) * 60, 10)));
}

function getCat(key) {
    return CATS[key] ?? Object.values(CATS)[0] ?? { label: '기타', color: '#8e8e93' };
}

// ─── Now Line ─────────────────────────────────────────────────────────────────

function updateNowLine() {
    if (activeTab !== 'timeline') return;
    const line = document.getElementById('timeline-now-line');
    if (!line) return;
    if (toKey(timelineDate) !== toKey(today())) { line.style.display = 'none'; return; }
    const now = new Date();
    line.style.top     = ((now.getHours() * 60 + now.getMinutes()) / 60 * ROW_H) + 'px';
    line.style.display = 'flex';
}

setInterval(updateNowLine, 30000);

// ─── Category Manager ─────────────────────────────────────────────────────────

function openCatManager(returnData = null) {
    pendingModalData = returnData;
    closeEventModal();

    const overlay = document.createElement('div');
    overlay.id = 'tl-catmgr-overlay';
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeCatManager(); });

    const card = document.createElement('div');
    card.id = 'tl-catmgr-card';
    card.addEventListener('mousedown', e => e.stopPropagation());

    const render = () => {
        card.innerHTML = '';

        // Header
        const hdr = document.createElement('div');
        hdr.className = 'tl-cm-header';

        if (pendingModalData) {
            const back = document.createElement('button');
            back.className = 'tl-cm-back';
            back.textContent = '←';
            back.title = '일정으로 돌아가기';
            back.addEventListener('click', closeCatManager);
            hdr.appendChild(back);
        }

        const ttl = document.createElement('span');
        ttl.className   = 'tl-cm-title';
        ttl.textContent = '카테고리 관리';
        hdr.appendChild(ttl);

        const xBtn = document.createElement('button');
        xBtn.className   = 'tl-cm-close';
        xBtn.textContent = '×';
        xBtn.addEventListener('click', closeCatManager);
        hdr.appendChild(xBtn);

        card.appendChild(hdr);

        // List
        const list = document.createElement('div');
        list.className = 'tl-cm-list';

        Object.entries(CATS).forEach(([catKey, cat]) => {
            const row = document.createElement('div');
            row.className = 'tl-cm-row';

            const colorIn = document.createElement('input');
            colorIn.type      = 'color';
            colorIn.value     = cat.color;
            colorIn.className = 'tl-cm-color';
            colorIn.addEventListener('input', () => {
                CATS[catKey].color = colorIn.value;
                saveCats();
                renderTimeline();
            });

            const nameIn = document.createElement('input');
            nameIn.type      = 'text';
            nameIn.value     = cat.label;
            nameIn.className = 'tl-cm-name-input';
            nameIn.addEventListener('change', () => {
                const v = nameIn.value.trim();
                if (v) { CATS[catKey].label = v; saveCats(); }
                else nameIn.value = cat.label;
            });
            nameIn.addEventListener('keydown', e => { if (e.key === 'Enter') nameIn.blur(); });

            const del = document.createElement('button');
            del.className   = 'tl-cm-del';
            del.textContent = '×';
            del.disabled    = Object.keys(CATS).length <= 1;
            del.addEventListener('click', () => { deleteCat(catKey); render(); });

            row.appendChild(colorIn);
            row.appendChild(nameIn);
            row.appendChild(del);
            list.appendChild(row);
        });

        card.appendChild(list);

        // Add row
        const addRow = document.createElement('div');
        addRow.className = 'tl-cm-add-row';

        const newColor = document.createElement('input');
        newColor.type      = 'color';
        newColor.value     = '#007aff';
        newColor.className = 'tl-cm-color';

        const newName = document.createElement('input');
        newName.type        = 'text';
        newName.placeholder = '새 카테고리 이름';
        newName.className   = 'tl-cm-name-input';

        const addBtn = document.createElement('button');
        addBtn.className   = 'tl-cm-add-btn';
        addBtn.textContent = '추가';

        const doAdd = () => {
            const label = newName.value.trim();
            if (!label) { newName.focus(); return; }
            CATS[newCatId()] = { label, color: newColor.value };
            saveCats();
            newName.value  = '';
            newColor.value = '#007aff';
            render();
        };
        addBtn.addEventListener('click', doAdd);
        newName.addEventListener('keydown', e => { if (e.key === 'Enter') doAdd(); });

        addRow.appendChild(newColor);
        addRow.appendChild(newName);
        addRow.appendChild(addBtn);
        card.appendChild(addRow);
    };

    render();
    overlay.appendChild(card);
    document.getElementById('app').appendChild(overlay);
}

function closeCatManager() {
    document.getElementById('tl-catmgr-overlay')?.remove();
    const data = pendingModalData;
    pendingModalData = null;
    if (data) openEventModal(data);
}

// ─── Note Modal ───────────────────────────────────────────────────────────────

function minToTimeStr(min) {
    return `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`;
}

function sanitizeFileName(str) {
    return str.replace(/[\\/:*?"<>|]/g, '').trim();
}

function openNoteModal(evId, evName, dateKey, ev) {
    closeNoteModal();
    closeEventModal();

    // Load or migrate note data (old format: string values → new: arrays)
    const raw = timelineNotes[evId];
    let note;
    if (!raw) {
        note = { meta: {}, good: [], bad: [], insight: [] };
    } else if (typeof raw.good === 'string' || typeof raw.bad === 'string' || typeof raw.insight === 'string') {
        const ts = Date.now().toString(36);
        note = {
            meta: {},
            good:    raw.good?.trim()    ? [{ id: `n${ts}a`, text: raw.good.trim(),    done: false }] : [],
            bad:     raw.bad?.trim()     ? [{ id: `n${ts}b`, text: raw.bad.trim(),     done: false }] : [],
            insight: raw.insight?.trim() ? [{ id: `n${ts}c`, text: raw.insight.trim(), done: false }] : [],
        };
        timelineNotes[evId] = note;
        saveNotes();
    } else {
        if (!raw.meta) raw.meta = {};
        note = raw;
    }

    // Snapshot event metadata (stays even if event is later deleted)
    if (dateKey && ev) {
        const catLabel = CATS[ev.category]?.label || ev.category || '';
        note.meta.date      = dateKey;
        note.meta.eventName = ev.name;
        note.meta.timeRange = `${minToTimeStr(ev.startMin)}–${minToTimeStr(ev.endMin)}`;
        note.meta.category  = catLabel;
    }

    const SECTIONS = [
        { key: 'good',    label: '잘한 점',   color: '#34c759' },
        { key: 'bad',     label: '아쉬운 점', color: '#ff9500' },
        { key: 'insight', label: '깨달은 점', color: '#007aff' },
    ];

    // Virtual focus: { type:'section'|'item', key, id? }
    let vFocus = { type: 'section', key: 'good' };
    let isEditing = false;  // true while an input is active

    const hdrEls  = {};  // key → label-row div
    const listEls = {};  // key → list div

    const overlay = document.createElement('div');
    overlay.id = 'tl-note-overlay';
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeNoteModal(); });

    const card = document.createElement('div');
    card.id = 'tl-note-card';
    card.addEventListener('mousedown', e => e.stopPropagation());

    // Header
    const hdr = document.createElement('div');
    hdr.className = 'tl-note-header';
    const ttl = document.createElement('div');
    ttl.className = 'tl-note-title';
    ttl.textContent = evName;
    const xBtn = document.createElement('button');
    xBtn.className = 'tl-note-close';
    xBtn.textContent = '×';
    xBtn.addEventListener('click', closeNoteModal);
    hdr.appendChild(ttl);
    hdr.appendChild(xBtn);
    card.appendChild(hdr);

    // Project autocomplete helpers
    function loadProjects() {
        try { return JSON.parse(localStorage.getItem('cal-note-projects') || '[]'); } catch { return []; }
    }
    function saveProjectToList(name) {
        if (!name) return;
        const list = loadProjects().filter(p => p !== name);
        list.unshift(name);
        localStorage.setItem('cal-note-projects', JSON.stringify(list.slice(0, 50)));
    }

    // Project input row
    const projRow = document.createElement('div');
    projRow.className = 'tl-note-proj-row';
    const projLabel = document.createElement('span');
    projLabel.className = 'tl-note-proj-label';
    projLabel.textContent = '프로젝트';
    const projInput = document.createElement('input');
    projInput.className = 'tl-note-proj-input';
    projInput.placeholder = '프로젝트 이름 (Obsidian 폴더)';
    projInput.value = note.meta.project || '';
    projInput.setAttribute('list', 'tl-note-projects-list');

    const datalist = document.createElement('datalist');
    datalist.id = 'tl-note-projects-list';
    loadProjects().forEach(p => {
        const opt = document.createElement('option');
        opt.value = p;
        datalist.appendChild(opt);
    });
    document.body.appendChild(datalist);

    projInput.addEventListener('change', () => {
        const val = projInput.value.trim();
        note.meta.project = val;
        saveProjectToList(val);
        saveData();
    });
    projInput.addEventListener('keydown', e => { if (e.key === 'Escape') closeNoteModal(); });
    projRow.appendChild(projLabel);
    projRow.appendChild(projInput);
    card.appendChild(projRow);

    function makeNoteId() {
        return `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
    }

    function makeTag(str) {
        // Keep Korean/alphanumeric, convert spaces to hyphens, strip Obsidian-unsafe chars
        return str.trim().replace(/\s+/g, '-').replace(/[#[\]|^\\]/g, '');
    }

    function buildMarkdown() {
        const m = note.meta;
        const tags = [];
        if (m.eventName || evName) tags.push(makeTag(m.eventName || evName));
        if (m.project)  tags.push(makeTag(m.project));
        if (m.category) tags.push(makeTag(m.category));

        const lines = [];
        lines.push('---');
        lines.push(`title: "${m.eventName || evName}"`);
        lines.push(`date: ${m.date || ''}`);
        lines.push(`time: "${m.timeRange || ''}"`);
        lines.push(`category: ${m.category || ''}`);
        lines.push(`project: ${m.project || ''}`);
        lines.push('tags:');
        tags.forEach(t => lines.push(`  - ${t}`));
        lines.push('---');
        lines.push('');
        const LABELS = { good: '잘한 점', bad: '아쉬운 점', insight: '깨달은 점' };
        ['good', 'bad', 'insight'].forEach(key => {
            lines.push(`## ${LABELS[key]}`);
            const items = note[key] || [];
            if (items.length === 0) {
                lines.push('');
            } else {
                items.forEach(item => lines.push(`- ${item.text}`));
            }
            lines.push('');
        });
        return lines.join('\n');
    }

    function writeToObsidian() {
        const project = (note.meta.project || '').trim();
        if (!project || !window.electronAPI?.writeObsidianNote) return;
        const date = note.meta.date || '';
        const name = sanitizeFileName(note.meta.eventName || evName);
        const fileName = `${date} ${name}.md`;
        window.electronAPI.writeObsidianNote(project, fileName, buildMarkdown());
    }

    function saveData() {
        timelineNotes[evId] = note;
        saveNotes();
        writeToObsidian();
    }

    // Flat navigation list: [section, items..., section, items..., ...]
    function getNavList() {
        const list = [];
        SECTIONS.forEach(({ key }) => {
            list.push({ type: 'section', key });
            [...note[key]].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0))
                .forEach(item => list.push({ type: 'item', key, id: item.id }));
        });
        return list;
    }

    function applyFocus() {
        SECTIONS.forEach(({ key }) => {
            hdrEls[key]?.classList.toggle('focused', vFocus.type === 'section' && vFocus.key === key);
            listEls[key]?.querySelectorAll('.tl-note-item').forEach(row => {
                row.classList.toggle('focused', vFocus.type === 'item' && row.dataset.id === vFocus.id);
            });
        });
    }

    function setFocus(node) {
        vFocus = node;
        applyFocus();
    }

    function moveFocus(delta) {
        const nav = getNavList();
        let idx = vFocus.type === 'section'
            ? nav.findIndex(n => n.type === 'section' && n.key === vFocus.key)
            : nav.findIndex(n => n.type === 'item' && n.id === vFocus.id);
        if (idx === -1) idx = 0;
        const next = nav[Math.max(0, Math.min(nav.length - 1, idx + delta))];
        if (next) setFocus(next);
    }

    function renderSection(key) {
        const list = listEls[key];
        list.innerHTML = '';
        const sorted = [...note[key]].sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));

        if (sorted.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'tl-note-empty';
            empty.textContent = 'Enter로 추가';
            list.appendChild(empty);
        }

        sorted.forEach(item => {
            const row = document.createElement('div');
            row.className = 'tl-note-item' + (item.done ? ' done' : '');
            row.dataset.id = item.id;

            const cb = document.createElement('button');
            cb.className = 'tl-note-cb' + (item.done ? ' checked' : '');
            cb.setAttribute('tabindex', '-1');
            cb.addEventListener('mousedown', e => e.preventDefault());
            cb.addEventListener('click', () => {
                item.done = !item.done;
                saveData();
                setFocus({ type: 'item', key, id: item.id });
                renderSection(key);
                applyFocus();
            });

            const txt = document.createElement('span');
            txt.className = 'tl-note-item-text';
            txt.textContent = item.text;

            const del = document.createElement('button');
            del.className = 'tl-note-del';
            del.textContent = '×';
            del.setAttribute('tabindex', '-1');
            del.addEventListener('mousedown', e => e.preventDefault());
            del.addEventListener('click', () => {
                const nav = getNavList();
                const ni = nav.findIndex(n => n.type === 'item' && n.id === item.id);
                const fallback = nav[ni + 1] || nav[ni - 1] || { type: 'section', key };
                note[key].splice(note[key].findIndex(i => i.id === item.id), 1);
                saveData();
                setFocus(fallback);
                renderSection(key);
                applyFocus();
            });

            row.addEventListener('mousedown', () => setFocus({ type: 'item', key, id: item.id }));
            row.addEventListener('dblclick', () => startEdit(key, item));

            row.appendChild(cb);
            row.appendChild(txt);
            row.appendChild(del);
            list.appendChild(row);
        });

        applyFocus();
    }

    function startAdd(key) {
        if (isEditing) return;
        if (listEls[key].querySelector('.tl-note-add-input')) return;
        isEditing = true;
        setFocus({ type: 'section', key });

        const inp = document.createElement('input');
        inp.className = 'tl-note-add-input';
        inp.placeholder = '항목 추가...';

        let committed = false;
        function commit() {
            if (committed) return;
            committed = true;
            isEditing = false;
            const val = inp.value.trim();
            if (val) {
                note[key].push({ id: makeNoteId(), text: val, done: false });
                saveData();
            }
            renderSection(key);
            // Return focus to section header (no continuous input)
        }
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { committed = true; isEditing = false; inp.remove(); }
        });
        inp.addEventListener('blur', commit);

        listEls[key].querySelector('.tl-note-empty')?.remove();
        listEls[key].appendChild(inp);
        inp.focus();
    }

    function startEdit(key, item) {
        if (isEditing) return;
        const row = listEls[key]?.querySelector(`[data-id="${item.id}"]`);
        if (!row) return;
        isEditing = true;
        setFocus({ type: 'item', key, id: item.id });

        const txt = row.querySelector('.tl-note-item-text');
        const inp = document.createElement('input');
        inp.className = 'tl-note-edit-input';
        inp.value = item.text;
        txt.replaceWith(inp);
        inp.focus();
        inp.select();

        let committed = false;
        function commit() {
            if (committed) return;
            committed = true;
            isEditing = false;
            const val = inp.value.trim();
            if (val) item.text = val;
            saveData();
            renderSection(key);
            applyFocus();
        }
        inp.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); commit(); }
            if (e.key === 'Escape') { committed = true; isEditing = false; renderSection(key); applyFocus(); }
        });
        inp.addEventListener('blur', commit);
    }

    // Build sections
    SECTIONS.forEach(({ key, label, color }) => {
        const sec = document.createElement('div');
        sec.className = 'tl-note-section';

        const labelRow = document.createElement('div');
        labelRow.className = 'tl-note-label-row';
        hdrEls[key] = labelRow;

        const dot = document.createElement('span');
        dot.className = 'tl-note-dot';
        dot.style.background = color;

        const lbl = document.createElement('span');
        lbl.className = 'tl-note-label';
        lbl.textContent = label;

        const addBtn = document.createElement('button');
        addBtn.className = 'tl-note-add-btn';
        addBtn.textContent = '+ 추가';
        addBtn.setAttribute('tabindex', '-1');
        addBtn.addEventListener('mousedown', e => e.preventDefault());
        addBtn.addEventListener('click', () => startAdd(key));

        labelRow.appendChild(dot);
        labelRow.appendChild(lbl);
        labelRow.appendChild(addBtn);
        labelRow.addEventListener('mousedown', () => setFocus({ type: 'section', key }));

        const list = document.createElement('div');
        list.className = 'tl-note-list';
        listEls[key] = list;

        sec.appendChild(labelRow);
        sec.appendChild(list);
        card.appendChild(sec);

        renderSection(key);
    });

    applyFocus();

    _noteKeyHandler = e => {
        if (isEditing || document.activeElement === projInput) return;

        if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveFocus(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveFocus(-1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (vFocus.type === 'section') {
                startAdd(vFocus.key);
            } else {
                const item = note[vFocus.key]?.find(i => i.id === vFocus.id);
                if (item) {
                    item.done = !item.done;
                    saveData();
                    renderSection(vFocus.key);
                    applyFocus();
                }
            }
        } else if (e.key === ' ' && vFocus.type === 'item') {
            e.preventDefault();
            const item = note[vFocus.key]?.find(i => i.id === vFocus.id);
            if (item) {
                item.done = !item.done;
                saveData();
                renderSection(vFocus.key);
                applyFocus();
            }
        } else if (e.key === 'F2' && vFocus.type === 'item') {
            const item = note[vFocus.key]?.find(i => i.id === vFocus.id);
            if (item) startEdit(vFocus.key, item);
        } else if ((e.key === 'Delete' || e.key === 'Backspace') && vFocus.type === 'item') {
            e.preventDefault();
            const { key, id } = vFocus;
            const nav = getNavList();
            const ni = nav.findIndex(n => n.type === 'item' && n.id === id);
            const fallback = nav[ni + 1] || nav[ni - 1] || { type: 'section', key };
            note[key].splice(note[key].findIndex(i => i.id === id), 1);
            saveData();
            setFocus(fallback);
            renderSection(key);
            applyFocus();
        } else if (e.key === 'n' && e.ctrlKey && !e.shiftKey && !e.altKey) {
            e.preventDefault();
            startAdd(vFocus.key);
        } else if (e.key === 'Escape') {
            closeNoteModal();
        }
    };
    document.addEventListener('keydown', _noteKeyHandler);

    overlay.appendChild(card);
    document.getElementById('app').appendChild(overlay);
}

function closeNoteModal() {
    document.getElementById('tl-note-overlay')?.remove();
    document.getElementById('tl-note-projects-list')?.remove();
    if (_noteKeyHandler) {
        document.removeEventListener('keydown', _noteKeyHandler);
        _noteKeyHandler = null;
    }
}

// ─── Event Modal ──────────────────────────────────────────────────────────────

function openEventModal({ dateKey, startMin, endMin, editId = null, _name = null, _cat = null }) {
    closeEventModal();

    const existing    = editId ? (timelineEvents[dateKey] || []).find(e => e.id === editId) : null;
    let   selectedCat = _cat ?? existing?.category ?? Object.keys(CATS)[0];
    if (!CATS[selectedCat]) selectedCat = Object.keys(CATS)[0];

    const overlay = document.createElement('div');
    overlay.id = 'tl-modal-overlay';
    overlay.addEventListener('mousedown', e => { if (e.target === overlay) closeEventModal(); });

    const card = document.createElement('div');
    card.id = 'tl-modal-card';
    card.addEventListener('mousedown', e => e.stopPropagation());

    // Name
    const nameInput = document.createElement('input');
    nameInput.type        = 'text';
    nameInput.className   = 'tl-modal-name';
    nameInput.placeholder = '일정 이름';
    nameInput.value       = _name ?? existing?.name ?? '';

    // Time row
    const timeRow = document.createElement('div');
    timeRow.className = 'tl-modal-time-row';

    const startInput = document.createElement('input');
    startInput.type      = 'time';
    startInput.className = 'tl-modal-time';
    startInput.step      = '600'; // 5-minute steps
    startInput.value     = minToTime(existing?.startMin ?? startMin);

    const sep = document.createElement('span');
    sep.className   = 'tl-modal-sep';
    sep.textContent = '–';

    const endInput = document.createElement('input');
    endInput.type      = 'time';
    endInput.className = 'tl-modal-time';
    endInput.step      = '600';
    endInput.value     = minToTime(existing?.endMin ?? endMin);

    timeRow.appendChild(startInput);
    timeRow.appendChild(sep);
    timeRow.appendChild(endInput);

    // Category section
    const catSection = document.createElement('div');
    catSection.className = 'tl-modal-cat-section';

    const catHeader = document.createElement('div');
    catHeader.className = 'tl-modal-cat-header';

    const catHeaderLabel = document.createElement('span');
    catHeaderLabel.textContent = '카테고리';
    catHeaderLabel.className   = 'tl-modal-cat-header-label';

    const mgrBtn = document.createElement('button');
    mgrBtn.className   = 'tl-modal-mgr-btn';
    mgrBtn.textContent = '관리';
    mgrBtn.addEventListener('click', () => {
        openCatManager({
            dateKey,
            startMin: timeToMin(startInput.value),
            endMin:   timeToMin(endInput.value),
            editId,
            _name: nameInput.value,
            _cat:  selectedCat,
        });
    });

    catHeader.appendChild(catHeaderLabel);
    catHeader.appendChild(mgrBtn);

    const catRow = document.createElement('div');
    catRow.className = 'tl-modal-cat-row';

    const refreshCats = () => {
        catRow.innerHTML = '';
        Object.entries(CATS).forEach(([catKey, cat]) => {
            const btn = document.createElement('button');
            btn.className   = 'tl-modal-cat-btn';
            btn.dataset.cat = catKey;
            btn.textContent = cat.label;
            const on = catKey === selectedCat;
            btn.style.background  = on ? hexToRgba(cat.color, 0.14) : '';
            btn.style.borderColor = on ? cat.color : '';
            btn.style.color       = on ? cat.color : '';
            btn.classList.toggle('selected', on);
            btn.addEventListener('click', () => { selectedCat = catKey; refreshCats(); });
            catRow.appendChild(btn);
        });
    };
    refreshCats();

    catSection.appendChild(catHeader);
    catSection.appendChild(catRow);

    // Actions
    const actions = document.createElement('div');
    actions.className = 'tl-modal-actions';

    if (editId) {
        const delBtn = document.createElement('button');
        delBtn.className   = 'tl-modal-del';
        delBtn.textContent = '삭제';
        delBtn.addEventListener('click', () => {
            timelineEvents[dateKey] = (timelineEvents[dateKey] || []).filter(e => e.id !== editId);
            saveTimeline();
            closeEventModal();
            renderTimeline();
        });
        const sp = document.createElement('div');
        sp.style.flex = '1';
        actions.appendChild(delBtn);
        actions.appendChild(sp);
    }

    const cancelBtn = document.createElement('button');
    cancelBtn.className   = 'tl-modal-btn';
    cancelBtn.textContent = '취소';
    cancelBtn.addEventListener('click', closeEventModal);

    const saveBtn = document.createElement('button');
    saveBtn.className   = 'tl-modal-btn primary';
    saveBtn.textContent = editId ? '수정' : '저장';

    const doSave = () => {
        const name = nameInput.value.trim();
        if (!name) { nameInput.focus(); nameInput.style.outline = '2px solid #ff3b30'; return; }
        const sMin = timeToMin(startInput.value);
        const eMin = timeToMin(endInput.value);
        if (eMin <= sMin) { endInput.style.outline = '2px solid #ff3b30'; endInput.focus(); return; }

        if (!timelineEvents[dateKey]) timelineEvents[dateKey] = [];

        if (editId) {
            const ev = timelineEvents[dateKey].find(e => e.id === editId);
            if (ev) Object.assign(ev, { name, startMin: sMin, endMin: eMin, category: selectedCat });
        } else {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            timelineEvents[dateKey].push({ id, name, startMin: sMin, endMin: eMin, category: selectedCat });
        }
        saveTimeline();
        closeEventModal();
        renderTimeline();
    };

    saveBtn.addEventListener('click', doSave);
    nameInput.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.stopPropagation(); doSave(); }
        if (e.key === 'Escape') { e.stopPropagation(); closeEventModal(); }
    });

    actions.appendChild(cancelBtn);
    actions.appendChild(saveBtn);

    card.appendChild(nameInput);
    card.appendChild(timeRow);
    card.appendChild(catSection);
    card.appendChild(actions);
    overlay.appendChild(card);
    document.getElementById('app').appendChild(overlay);

    nameInput.focus();
    if (nameInput.value) nameInput.select();
}

function closeEventModal() {
    document.getElementById('tl-modal-overlay')?.remove();
}

// ─── Drag Handlers ────────────────────────────────────────────────────────────

// Registered once at init; handles both grid-drag (create) and event-drag (move)
function setupDragHandlers() {

    document.addEventListener('mousemove', e => {

        // ── Event move drag ──
        if (tlEvDrag.active) {
            if (!tlEvDrag.confirmed) {
                if (Math.abs(e.clientY - tlEvDrag.startClientY) > 5) {
                    tlEvDrag.confirmed = true;
                    tlEvDrag.el.classList.add('dragging');

                    const cat = getCat(tlEvDrag.ev.category);
                    const preview = document.createElement('div');
                    preview.className   = 'tl-ev-move-preview';
                    preview.style.background = hexToRgba(cat.color, 0.3);
                    preview.style.borderLeft = `3px solid ${cat.color}`;
                    const dur = tlEvDrag.ev.endMin - tlEvDrag.ev.startMin;
                    preview.style.height = (dur / 60 * ROW_H) + 'px';
                    document.getElementById('timeline-hours')?.appendChild(preview);
                    tlEvDrag.preview = preview;
                }
            }
            if (tlEvDrag.confirmed && tlEvDrag.preview) {
                const cur     = mouseToMin(e);
                const newStart = snapMin(Math.max(0, cur - tlEvDrag.offsetMin), 10);
                const dur      = tlEvDrag.ev.endMin - tlEvDrag.ev.startMin;
                const newEnd   = Math.min(24 * 60, newStart + dur);
                tlEvDrag.preview.style.top = (newStart / 60 * ROW_H) + 'px';
                // keep height in case clamped at bottom
                tlEvDrag.preview.style.height = ((newEnd - newStart) / 60 * ROW_H) + 'px';
            }
            return; // don't also process grid drag
        }

        // ── Grid drag (create) ──
        if (!tlDrag.active || !tlDrag.preview) return;
        const cur       = mouseToMin(e);
        tlDrag.startMin = snapMin(Math.min(tlDrag.anchorMin, cur), 10);
        tlDrag.endMin   = Math.max(tlDrag.startMin + 10, snapMin(Math.max(tlDrag.anchorMin, cur), 10));
        tlDrag.preview.style.top    = (tlDrag.startMin / 60 * ROW_H) + 'px';
        tlDrag.preview.style.height = Math.max((tlDrag.endMin - tlDrag.startMin) / 60 * ROW_H, 14) + 'px';
    });

    document.addEventListener('mouseup', () => {

        // ── Event move drag end ──
        if (tlEvDrag.active) {
            tlEvDrag.active = false;
            tlEvDrag.el.classList.remove('dragging');
            tlEvDrag.preview?.remove();
            tlEvDrag.preview = null;

            if (tlEvDrag.confirmed) {
                tlEvDrag.wasDrag = true;
                const hw  = document.getElementById('timeline-hours');
                // read final preview position from last mousemove (use stored state)
                const cur = tlEvDrag._lastMin ?? tlEvDrag.ev.startMin;
                const newStart = snapMin(Math.max(0, cur - tlEvDrag.offsetMin), 10);
                const dur      = tlEvDrag.ev.endMin - tlEvDrag.ev.startMin;
                const newEnd   = Math.min(24 * 60, newStart + dur);

                const ev = (timelineEvents[tlEvDrag.dateKey] || []).find(e => e.id === tlEvDrag.ev.id);
                if (ev) { ev.startMin = newStart; ev.endMin = newEnd; }
                saveTimeline();
                renderTimeline();
            }
            tlEvDrag.confirmed = false;
            tlEvDrag._lastMin  = null;
            return;
        }

        // ── Grid drag end ──
        if (!tlDrag.active) return;
        tlDrag.active = false;
        tlDrag.preview?.remove();
        tlDrag.preview = null;
        if (tlDrag.endMin - tlDrag.startMin >= 15)
            openEventModal({ dateKey: tlDrag.dateKey, startMin: tlDrag.startMin, endMin: tlDrag.endMin });
    });

    // Track current mouse minute for event drag end calculation
    document.addEventListener('mousemove', e => {
        if (tlEvDrag.active) tlEvDrag._lastMin = mouseToMin(e);
    });
}

function attachDragToGrid(hw, dateKey) {
    hw.addEventListener('mousedown', e => {
        if (e.target.closest('.tl-event-block, #timeline-now-line')) return;
        if (e.button !== 0) return;
        e.preventDefault();

        tlDrag.dateKey   = dateKey;
        tlDrag.anchorMin = mouseToMin(e);
        tlDrag.startMin  = tlDrag.anchorMin;
        tlDrag.endMin    = Math.min(tlDrag.anchorMin + 60, 24 * 60);
        tlDrag.active    = true;

        const preview = document.createElement('div');
        preview.className   = 'tl-drag-preview';
        preview.style.top    = (tlDrag.startMin / 60 * ROW_H) + 'px';
        preview.style.height = ROW_H + 'px';
        hw.appendChild(preview);
        tlDrag.preview = preview;
    });
}

// ─── Render ───────────────────────────────────────────────────────────────────

function renderTimeline() {
    const tl = document.getElementById('timeline');
    tl.innerHTML = '';

    const key     = toKey(timelineDate);
    const isToday = key === toKey(today());
    const events  = timelineEvents[key] || [];

    // ── Date nav ──
    const nav = document.createElement('div');
    nav.className = 'timeline-date-nav';

    const prevBtn = document.createElement('button');
    prevBtn.className = 'timeline-nav-btn';
    prevBtn.innerHTML = '&#8249;';
    prevBtn.title = '이전 날';
    prevBtn.addEventListener('click', () => {
        timelineDate = new Date(timelineDate);
        timelineDate.setDate(timelineDate.getDate() - 1);
        renderTimeline();
    });

    const dateLbl = document.createElement('span');
    dateLbl.className = 'timeline-date-label';
    const diff     = diffFromToday(timelineDate, today().getTime());
    const dow      = timelineDate.getDay();
    const relLabel = diff === 0 ? '오늘' : diff === 1 ? '내일' : diff === -1 ? '어제' : null;
    dateLbl.textContent = relLabel
        ? `${timelineDate.getMonth() + 1}/${timelineDate.getDate()} ${relLabel}`
        : `${timelineDate.getMonth() + 1}/${timelineDate.getDate()} (${DAYS_KO[dow]})`;

    const nextBtn = document.createElement('button');
    nextBtn.className = 'timeline-nav-btn';
    nextBtn.innerHTML = '&#8250;';
    nextBtn.title = '다음 날';
    nextBtn.addEventListener('click', () => {
        timelineDate = new Date(timelineDate);
        timelineDate.setDate(timelineDate.getDate() + 1);
        renderTimeline();
    });

    const todayBtn = document.createElement('button');
    todayBtn.className   = 'timeline-today-btn';
    todayBtn.textContent = '오늘';
    todayBtn.style.display = isToday ? 'none' : '';
    todayBtn.addEventListener('click', () => { timelineDate = today(); renderTimeline(); });

    nav.appendChild(prevBtn);
    nav.appendChild(dateLbl);
    nav.appendChild(nextBtn);
    nav.appendChild(todayBtn);
    tl.appendChild(nav);

    // ── Hours grid ──
    const hw = document.createElement('div');
    hw.id = 'timeline-hours';

    for (let h = 0; h < 24; h++) {
        const row = document.createElement('div');
        row.className    = 'timeline-hour-row';
        row.dataset.hour = h;

        const timeCol = document.createElement('div');
        timeCol.className   = 'timeline-time-col';
        timeCol.textContent = `${String(h).padStart(2, '0')}:00`;

        row.appendChild(timeCol);
        row.appendChild(document.createElement('div'));
        hw.appendChild(row);
    }

    // ── Event blocks ──
    events.forEach(ev => hw.appendChild(buildEventBlock(ev, key)));

    // ── Now line ──
    const nowLine = document.createElement('div');
    nowLine.id = 'timeline-now-line';
    nowLine.style.display = 'none';
    nowLine.innerHTML = '<div class="now-dot"></div><div class="now-bar"></div>';
    hw.appendChild(nowLine);

    tl.appendChild(hw);

    attachDragToGrid(hw, key);

    requestAnimationFrame(() => {
        updateNowLine();
        const goTo = isToday ? Math.max(0, new Date().getHours() - 1) : 8;
        tl.scrollTop = goTo * ROW_H;
    });
}

function buildEventBlock(ev, dateKey) {
    const cat    = getCat(ev.category);
    const top    = (ev.startMin / 60) * ROW_H;
    const height = Math.max(((ev.endMin - ev.startMin) / 60) * ROW_H, 18);

    const el = document.createElement('div');
    el.className        = 'tl-event-block';
    el.dataset.id       = ev.id;
    el.style.top        = top + 'px';
    el.style.height     = height + 'px';
    el.style.background = hexToRgba(cat.color, 0.14);
    el.style.borderLeft = `3px solid ${cat.color}`;

    const name = document.createElement('div');
    name.className   = 'tl-event-name';
    name.textContent = ev.name;
    name.style.color = cat.color;
    el.appendChild(name);

    if (height > 34) {
        const time = document.createElement('div');
        time.className   = 'tl-event-time';
        time.textContent = `${minToTime(ev.startMin)} – ${minToTime(ev.endMin)}`;
        time.style.color = cat.color;
        el.appendChild(time);
    }

    // Drag to move
    el.addEventListener('mousedown', e => {
        if (e.button !== 0) return;
        e.stopPropagation();
        e.preventDefault();

        const evTopPx = (ev.startMin / 60) * ROW_H;
        const cursorY = e.clientY - document.getElementById('timeline-hours').getBoundingClientRect().top;
        tlEvDrag.offsetMin    = snapMin(Math.max(0, ((cursorY - evTopPx) / ROW_H) * 60), 10);
        tlEvDrag.active       = true;
        tlEvDrag.confirmed    = false;
        tlEvDrag.wasDrag      = false;
        tlEvDrag.ev           = ev;
        tlEvDrag.dateKey      = dateKey;
        tlEvDrag.el           = el;
        tlEvDrag.startClientY = e.clientY;
        tlEvDrag._lastMin     = null;
    });

    // Left-click → note modal (suppressed if drag occurred)
    el.addEventListener('click', e => {
        e.stopPropagation();
        if (tlEvDrag.wasDrag) { tlEvDrag.wasDrag = false; return; }
        openNoteModal(ev.id, ev.name, dateKey, ev);
    });

    // Right-click → edit/settings modal
    el.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        openEventModal({ dateKey, startMin: ev.startMin, endMin: ev.endMin, editId: ev.id });
    });

    return el;
}

// ─── Init ─────────────────────────────────────────────────────────────────────

setupDragHandlers();
loadCats();
loadTimeline();
loadNotes();
timelineDate = today();
document.getElementById('timeline').style.display = 'none';
