'use strict';

// ─── State ───────────────────────────────────────────────────────────────────

let todos = {};   // { 'YYYY-MM-DD': [{ id, text, done }] }

let drag = {
    todo: null,
    sourceDate: null,
    placeholder: null,
};

let ctxMenu = { todoId: null, dateKey: null };

let pinned      = false;
let compactMode = false;

// Keyboard focus: { type: 'date'|'todo'|null, date: key, todoId: id }
let focused = { type: null, date: null, todoId: null };

// Cut clipboard: { todo: {...}, sourceDate: key } | null
let clipboard = null;

// Active tab ('calendar' | 'timeline')
let activeTab = 'calendar';

// ─── Shortcut Actions ─────────────────────────────────────────────────────────

const ACTIONS = [
    { id: 'add-focused',    label: '선택된 날에 할일 추가' },
    { id: 'cut-todo',       label: '할일 잘라내기'         },
    { id: 'paste-todo',     label: '할일 붙여넣기'         },
    { id: 'toggle-compact', label: '오늘만 보기 전환'       },
    { id: 'switch-tab',     label: '탭 전환 (달력↔타임라인)' },
    { id: 'toggle-pin',     label: '항상 위에 고정'         },
    { id: 'minimize',       label: '최소화'                 },
    { id: 'close',          label: '앱 닫기'               },
];

const DEFAULT_SHORTCUTS = {
    'add-focused':    'Ctrl+N',
    'cut-todo':       'Ctrl+X',
    'paste-todo':     'Ctrl+V',
    'toggle-compact': 'Ctrl+M',
    'switch-tab':     '',
    'toggle-pin':     '',
    'minimize':       '',
    'close':          '',
};

let shortcuts = { ...DEFAULT_SHORTCUTS };
let isCapturing  = false;
let captureHandler = null;

// ─── Persistence ──────────────────────────────────────────────────────────────

function load() {
    try {
        const raw = localStorage.getItem('cal-todos');
        if (raw) todos = JSON.parse(raw);
    } catch { todos = {}; }
}

function save() {
    localStorage.setItem('cal-todos', JSON.stringify(todos));
}

function loadShortcuts() {
    try {
        const raw = localStorage.getItem('cal-shortcuts');
        if (raw) shortcuts = { ...DEFAULT_SHORTCUTS, ...JSON.parse(raw) };
    } catch {}
}

function saveShortcuts() {
    localStorage.setItem('cal-shortcuts', JSON.stringify(shortcuts));
}

// ─── Shortcut Helpers ─────────────────────────────────────────────────────────

function buildCombo(e) {
    const parts = [];
    if (e.ctrlKey)  parts.push('Ctrl');
    if (e.altKey)   parts.push('Alt');
    if (e.shiftKey) parts.push('Shift');
    const skip = ['Control', 'Alt', 'Shift', 'Meta'];
    if (!skip.includes(e.key)) {
        const MAP = {
            'ArrowUp': '↑', 'ArrowDown': '↓', 'ArrowLeft': '←', 'ArrowRight': '→',
            ' ': 'Space', 'Enter': 'Enter', 'Escape': 'Esc', 'Backspace': 'BS',
        };
        parts.push(MAP[e.key] ?? e.key.toUpperCase());
    }
    return parts.length >= 2 ? parts.join('+') : '';
}

function executeAction(id) {
    switch (id) {
        case 'add-focused': {
            const dateKey = focused.date || toKey(today());
            document.querySelector(`.date-section[data-date="${dateKey}"] .add-btn`)?.click();
            break;
        }
        case 'cut-todo': {
            if (focused.type !== 'todo') break;
            const t = (todos[focused.date] || []).find(t => t.id === focused.todoId);
            if (!t) break;
            clipboard = { todo: { ...t }, sourceDate: focused.date };
            render._scrolled = true;
            render();
            break;
        }

        case 'paste-todo': {
            if (!clipboard || !focused.date) break;
            // Remove from source
            todos[clipboard.sourceDate] = (todos[clipboard.sourceDate] || [])
                .filter(t => t.id !== clipboard.todo.id);
            // Add to target (reset done state)
            if (!todos[focused.date]) todos[focused.date] = [];
            todos[focused.date].push({ ...clipboard.todo, done: false });
            save();
            focused = { type: 'todo', date: focused.date, todoId: clipboard.todo.id };
            clipboard = null;
            render._scrolled = true;
            render();
            break;
        }

        case 'toggle-compact':
            document.getElementById('btn-compact')?.click();
            break;
        case 'switch-tab':
            switchTab(activeTab === 'calendar' ? 'timeline' : 'calendar');
            break;
        case 'toggle-pin':
            document.getElementById('btn-pin')?.click();
            break;
        case 'minimize':
            document.getElementById('btn-minimize')?.click();
            break;
        case 'close':
            document.getElementById('btn-close')?.click();
            break;
    }
}

// ─── Date Helpers ─────────────────────────────────────────────────────────────

function toKey(date) {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
}

function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
}

function getWindowDates() {
    const base = today();
    if (compactMode) return [new Date(base)];
    const dates = [];
    for (let i = -3; i <= 6; i++) {
        const d = new Date(base);
        d.setDate(base.getDate() + i);
        dates.push(d);
    }
    return dates;
}

const DAYS_KO   = ['일', '월', '화', '수', '목', '금', '토'];
const MONTHS_KO = ['1월','2월','3월','4월','5월','6월','7월','8월','9월','10월','11월','12월'];

function diffFromToday(date, todayMs) {
    return Math.round((date - todayMs) / 86400000);
}

function sortedTodos(key) {
    const items = todos[key] || [];
    return [...items.filter(t => !t.done), ...items.filter(t => t.done)];
}

// ─── Keyboard Focus ───────────────────────────────────────────────────────────

function setFocusDate(dateKey) {
    focused = { type: 'date', date: dateKey, todoId: null };
    renderFocus();
}

function setFocusTodo(dateKey, todoId) {
    focused = { type: 'todo', date: dateKey, todoId };
    renderFocus();
}

function setFocusNone() {
    focused = { type: null, date: null, todoId: null };
    renderFocus();
}

function renderFocus() {
    document.querySelectorAll('.kb-selected').forEach(el => el.classList.remove('kb-selected'));
    if (!focused.date) return;

    if (focused.type === 'date') {
        const header = document.querySelector(`.date-section[data-date="${focused.date}"] .date-header`);
        if (header) {
            header.classList.add('kb-selected');
            header.closest('.date-section').scrollIntoView({ block: 'nearest' });
        }
    } else if (focused.type === 'todo') {
        const el = document.querySelector(`.todo-item[data-id="${focused.todoId}"]`);
        if (el) {
            el.classList.add('kb-selected');
            el.scrollIntoView({ block: 'nearest' });
        }
    }
}

// ─── Keyboard Navigation ──────────────────────────────────────────────────────

function handleNavKey(e) {
    const dates = getWindowDates().map(d => toKey(d));

    // Nothing focused → start at today
    if (!focused.date) {
        if (['ArrowDown', 'ArrowUp', 'Tab'].includes(e.key)) {
            e.preventDefault();
            setFocusDate(toKey(today()));
        }
        return;
    }

    const dateIdx  = dates.indexOf(focused.date);
    const items    = sortedTodos(focused.date);

    switch (e.key) {

        case 'Tab':
            e.preventDefault();
            if (e.shiftKey) {
                if (dateIdx > 0) setFocusDate(dates[dateIdx - 1]);
            } else {
                if (dateIdx < dates.length - 1) setFocusDate(dates[dateIdx + 1]);
            }
            break;

        case 'ArrowDown':
            e.preventDefault();
            if (focused.type === 'date') {
                if (items.length > 0) setFocusTodo(focused.date, items[0].id);
                else if (dateIdx < dates.length - 1) setFocusDate(dates[dateIdx + 1]);
            } else {
                const i = items.findIndex(t => t.id === focused.todoId);
                if (i < items.length - 1) setFocusTodo(focused.date, items[i + 1].id);
                else if (dateIdx < dates.length - 1) setFocusDate(dates[dateIdx + 1]);
            }
            break;

        case 'ArrowUp':
            e.preventDefault();
            if (focused.type === 'date') {
                if (dateIdx > 0) {
                    const prev = dates[dateIdx - 1];
                    const prevItems = sortedTodos(prev);
                    if (prevItems.length > 0) setFocusTodo(prev, prevItems[prevItems.length - 1].id);
                    else setFocusDate(prev);
                }
            } else {
                const i = items.findIndex(t => t.id === focused.todoId);
                if (i > 0) setFocusTodo(focused.date, items[i - 1].id);
                else setFocusDate(focused.date);
            }
            break;

        case 'Enter':
            e.preventDefault();
            if (focused.type === 'date') {
                document.querySelector(`.date-section[data-date="${focused.date}"] .add-btn`)?.click();
            } else {
                toggleFocusedTodo();
            }
            break;

        case ' ':
            if (focused.type === 'todo') {
                e.preventDefault();
                toggleFocusedTodo();
            }
            break;

        case 'F2':
            e.preventDefault();
            if (focused.type === 'todo') editFocusedTodo();
            break;

        case 'Delete':
        case 'Backspace':
            if (focused.type === 'todo') {
                e.preventDefault();
                const idx = items.findIndex(t => t.id === focused.todoId);
                todos[focused.date] = (todos[focused.date] || []).filter(t => t.id !== focused.todoId);
                save();
                const rest = sortedTodos(focused.date);
                if (rest.length > 0) {
                    focused = { type: 'todo', date: focused.date, todoId: rest[Math.min(idx, rest.length - 1)].id };
                } else {
                    focused = { type: 'date', date: focused.date, todoId: null };
                }
                render._scrolled = true;
                render();
            }
            break;

        case 'Escape':
            if (clipboard) {
                clipboard = null;
                render._scrolled = true;
                render();
            } else if (focused.type === 'todo') {
                setFocusDate(focused.date);
            } else {
                setFocusNone();
            }
            break;
    }
}

function toggleFocusedTodo() {
    if (focused.type !== 'todo') return;
    const todo = (todos[focused.date] || []).find(t => t.id === focused.todoId);
    if (!todo) return;
    todo.done = !todo.done;
    todos[focused.date] = sortedTodos(focused.date);
    save();
    render._scrolled = true;
    render();
}

function editFocusedTodo() {
    if (focused.type !== 'todo') return;
    const todo = (todos[focused.date] || []).find(t => t.id === focused.todoId);
    if (!todo) return;
    const el = document.querySelector(`.todo-item[data-id="${todo.id}"]`);
    if (!el) return;

    const txt = el.querySelector('.todo-text');
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-input';
    input.style.flex = '1';
    input.value = todo.text;
    txt.replaceWith(input);
    el.draggable = false;
    input.focus();
    input.select();

    let committed = false;
    const commit = () => {
        if (committed) return;
        committed = true;
        const newText = input.value.trim();
        if (newText) todo.text = newText;
        save();
        render._scrolled = true;
        render();
    };
    input.addEventListener('keydown', ev => {
        if (ev.key === 'Enter')  { ev.preventDefault(); commit(); }
        if (ev.key === 'Escape') { committed = true; render._scrolled = true; render(); }
    });
    input.addEventListener('blur', commit);
}

// ─── Render ───────────────────────────────────────────────────────────────────

function render() {
    const cal = document.getElementById('calendar');
    cal.innerHTML = '';

    const t = today();
    const todayMs = t.getTime();
    document.getElementById('header-date').textContent =
        `${t.getFullYear()}년 ${MONTHS_KO[t.getMonth()]} ${t.getDate()}일`;

    // Clipboard banner
    const existingBanner = document.getElementById('clipboard-banner');
    if (existingBanner) existingBanner.remove();
    if (clipboard) {
        const banner = document.createElement('div');
        banner.id = 'clipboard-banner';
        banner.textContent = `"${clipboard.todo.text}" 잘라냄 · 날짜 선택 후 Ctrl+V로 붙여넣기  (Esc: 취소)`;
        cal.before(banner);
    }

    const dates = getWindowDates();

    dates.forEach(date => {
        const key  = toKey(date);
        const diff = diffFromToday(date, todayMs);
        const dow  = date.getDay();

        const section = document.createElement('div');
        section.className = 'date-section';
        if (diff === 0) section.classList.add('today');
        if (diff < 0)  section.classList.add('past');
        section.dataset.date = key;

        // Drop zone
        section.addEventListener('dragover', e => {
            e.preventDefault();
            e.dataTransfer.dropEffect = 'move';
            if (drag.todo) section.classList.add('drop-target');
        });
        section.addEventListener('dragleave', e => {
            if (!section.contains(e.relatedTarget)) section.classList.remove('drop-target');
        });
        section.addEventListener('drop', e => {
            e.preventDefault();
            section.classList.remove('drop-target');
            if (!drag.todo || drag.sourceDate === key) return;
            todos[drag.sourceDate] = (todos[drag.sourceDate] || []).filter(t => t.id !== drag.todo.id);
            if (!todos[key]) todos[key] = [];
            todos[key].push({ ...drag.todo, done: false });
            save();
            render._scrolled = true;
            render();
        });

        // Date header
        const header = document.createElement('div');
        header.className = 'date-header';
        header.addEventListener('click', () => setFocusDate(key));

        if (diff >= -1 && diff <= 1) {
            const lbl = document.createElement('span');
            lbl.className = 'date-label';
            lbl.textContent = diff === 0 ? '오늘' : diff === 1 ? '내일' : '어제';
            header.appendChild(lbl);
        }

        const num = document.createElement('span');
        num.className = 'date-num';
        num.textContent = `${date.getMonth() + 1}/${date.getDate()}`;
        header.appendChild(num);

        const day = document.createElement('span');
        day.className = 'date-day' + (dow === 0 ? ' sun' : dow === 6 ? ' sat' : '');
        day.textContent = DAYS_KO[dow];
        header.appendChild(day);

        section.appendChild(header);

        // Todo list
        const list = document.createElement('div');
        list.className = 'todo-list';
        sortedTodos(key).forEach(todo => list.appendChild(buildTodoEl(todo, key)));
        section.appendChild(list);

        // Add button
        const addBtn = document.createElement('button');
        addBtn.className = 'add-btn';
        addBtn.textContent = '+ 추가';
        addBtn.addEventListener('click', () => showInlineInput(key, list, addBtn));
        section.appendChild(addBtn);

        cal.appendChild(section);
    });

    // Scroll to today once
    if (!render._scrolled) {
        render._scrolled = true;
        const todayEl = cal.querySelector('.today');
        if (todayEl) {
            requestAnimationFrame(() => {
                todayEl.scrollIntoView({ block: 'start' });
                document.getElementById('calendar').scrollTop -= 6;
            });
        }
    }

    renderFocus();
}

// ─── Todo Element ─────────────────────────────────────────────────────────────

function buildTodoEl(todo, key) {
    const el = document.createElement('div');
    el.className = 'todo-item';
    if (clipboard?.todo.id === todo.id) el.classList.add('cut-pending');
    el.draggable = true;
    el.dataset.id = todo.id;

    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = !!todo.done;
    cb.addEventListener('click', e => e.stopPropagation());
    cb.addEventListener('change', e => {
        e.stopPropagation();
        todo.done = cb.checked;
        todos[key] = sortedTodos(key);
        save();
        render._scrolled = true;
        render();
    });

    const txt = document.createElement('span');
    txt.className = 'todo-text' + (todo.done ? ' done' : '');
    txt.textContent = todo.text;

    el.appendChild(cb);
    el.appendChild(txt);

    // Left-click: toggle done + set focus
    el.addEventListener('click', () => {
        focused = { type: 'todo', date: key, todoId: todo.id };
        todo.done = !todo.done;
        todos[key] = sortedTodos(key);
        save();
        render._scrolled = true;
        render();
    });

    // Drag
    el.addEventListener('dragstart', e => {
        drag.todo = todo;
        drag.sourceDate = key;
        el.classList.add('dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', todo.id);
        drag.placeholder = document.createElement('div');
        drag.placeholder.className = 'drag-placeholder';
        requestAnimationFrame(() => el.after(drag.placeholder));
    });
    el.addEventListener('dragend', () => {
        el.classList.remove('dragging');
        drag.placeholder?.remove();
        drag.todo = null;
        drag.sourceDate = null;
        drag.placeholder = null;
        document.querySelectorAll('.drop-target').forEach(s => s.classList.remove('drop-target'));
    });

    // Right-click
    el.addEventListener('contextmenu', e => {
        e.preventDefault();
        e.stopPropagation();
        showContextMenu(e.clientX, e.clientY, todo.id, key);
    });

    return el;
}

// ─── Inline Input ─────────────────────────────────────────────────────────────

function showInlineInput(key, list, addBtn) {
    if (list.querySelector('.todo-input-row')) return;
    addBtn.style.display = 'none';

    const row = document.createElement('div');
    row.className = 'todo-input-row';
    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'todo-input';
    input.placeholder = '할 일 입력…';
    row.appendChild(input);
    list.appendChild(row);
    input.focus();

    let committed = false;
    const commit = () => {
        if (committed) return;
        committed = true;
        const text = input.value.trim();
        if (text) {
            const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
            if (!todos[key]) todos[key] = [];
            todos[key].push({ id, text, done: false });
            save();
            focused = { type: 'todo', date: key, todoId: id };
        }
        render._scrolled = true;
        render();
    };

    input.addEventListener('keydown', e => {
        if (e.key === 'Enter')  { e.preventDefault(); commit(); }
        if (e.key === 'Escape') { committed = true; addBtn.style.display = ''; row.remove(); }
    });
    input.addEventListener('blur', commit);
}

// ─── Settings Panel ───────────────────────────────────────────────────────────

function openSettings() {
    hideContextMenu();
    setFocusNone();
    renderSettings();
    document.getElementById('calendar').style.display = 'none';
    document.getElementById('timeline').style.display = 'none';
    document.getElementById('settings-panel').classList.remove('hidden');
    document.getElementById('btn-settings').classList.add('active');
}

function closeSettings() {
    stopCapture();
    document.getElementById('settings-panel').classList.add('hidden');
    document.getElementById('btn-settings').classList.remove('active');
    if (activeTab === 'calendar') {
        document.getElementById('calendar').style.display = '';
    } else {
        document.getElementById('timeline').style.display = '';
        renderTimeline();
    }
}

function renderSettings() {
    const panel = document.getElementById('settings-panel');
    panel.innerHTML = '';

    const sec = document.createElement('div');
    sec.className = 'settings-section';
    sec.textContent = '단축키';
    panel.appendChild(sec);

    const hint = document.createElement('div');
    hint.style.cssText = 'padding:0 16px 8px;font-size:11px;color:#aeaeb2;line-height:1.5;';
    hint.textContent = '배지를 클릭한 뒤 원하는 키 조합을 눌러주세요.';
    panel.appendChild(hint);

    ACTIONS.forEach(action => {
        const row = document.createElement('div');
        row.className = 'shortcut-row';

        const label = document.createElement('div');
        label.className = 'shortcut-label';
        label.textContent = action.label;

        const badge = document.createElement('div');
        badge.className = 'shortcut-badge';
        badge.dataset.action = action.id;
        badge.textContent = shortcuts[action.id] || '없음';
        badge.title = '클릭 후 키 조합 입력';
        badge.addEventListener('click', () => startCapture(action.id, badge));

        const clr = document.createElement('button');
        clr.className = 'shortcut-clear';
        clr.textContent = '×';
        clr.title = '단축키 제거';
        clr.addEventListener('click', e => {
            e.stopPropagation();
            stopCapture();
            shortcuts[action.id] = '';
            saveShortcuts();
            badge.textContent = '없음';
        });

        row.appendChild(label);
        row.appendChild(badge);
        row.appendChild(clr);
        panel.appendChild(row);
    });

    // Keyboard nav section
    const navSec = document.createElement('div');
    navSec.className = 'settings-section';
    navSec.style.marginTop = '8px';
    navSec.textContent = '키보드 탐색';
    panel.appendChild(navSec);

    const navGuide = [
        ['↑ / ↓',          '항목 이동'],
        ['Tab / Shift+Tab', '날짜 이동'],
        ['Enter',           '날짜: 추가 / 항목: 완료 토글'],
        ['Space',           '항목 완료 토글'],
        ['F2',              '항목 편집'],
        ['Delete',          '항목 삭제'],
        ['Ctrl+X',          '항목 잘라내기'],
        ['Ctrl+V',          '잘라낸 항목 붙여넣기'],
        ['Esc',             '선택 해제 / 잘라내기 취소'],
    ];
    navGuide.forEach(([keys, desc]) => {
        const row = document.createElement('div');
        row.className = 'shortcut-row';

        const d = document.createElement('div');
        d.className = 'shortcut-label';
        d.style.color = '#8e8e93';
        d.textContent = desc;

        const b = document.createElement('div');
        b.className = 'shortcut-badge';
        b.style.cursor = 'default';
        b.style.background = 'rgba(0,0,0,0.04)';
        b.textContent = keys;

        row.appendChild(d);
        row.appendChild(b);
        panel.appendChild(row);
    });
}

function startCapture(actionId, badgeEl) {
    stopCapture();
    document.querySelectorAll('.shortcut-badge.capturing').forEach(el => {
        el.classList.remove('capturing');
        el.textContent = shortcuts[el.dataset.action] || '없음';
    });
    isCapturing = true;
    badgeEl.classList.add('capturing');
    badgeEl.textContent = '눌러주세요…';

    captureHandler = (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.key === 'Escape') { stopCapture(); renderSettings(); return; }
        const combo = buildCombo(e);
        if (!combo) return;
        shortcuts[actionId] = combo;
        saveShortcuts();
        stopCapture();
        renderSettings();
    };
    document.addEventListener('keydown', captureHandler, true);
}

function stopCapture() {
    if (captureHandler) {
        document.removeEventListener('keydown', captureHandler, true);
        captureHandler = null;
    }
    isCapturing = false;
}

// ─── Context Menu ─────────────────────────────────────────────────────────────

function showContextMenu(x, y, todoId, dateKey) {
    ctxMenu.todoId  = todoId;
    ctxMenu.dateKey = dateKey;
    const menu = document.getElementById('context-menu');
    menu.classList.remove('hidden');
    const mw = 130, mh = 76;
    menu.style.left = Math.min(x, window.innerWidth  - mw - 8) + 'px';
    menu.style.top  = Math.min(y, window.innerHeight - mh - 8) + 'px';
}

function hideContextMenu() {
    document.getElementById('context-menu').classList.add('hidden');
    ctxMenu.todoId = null;
    ctxMenu.dateKey = null;
}

// ─── Context Menu Actions ─────────────────────────────────────────────────────

document.getElementById('ctx-delete').addEventListener('click', () => {
    if (!ctxMenu.todoId) return;
    todos[ctxMenu.dateKey] = (todos[ctxMenu.dateKey] || []).filter(t => t.id !== ctxMenu.todoId);
    save();
    hideContextMenu();
    render._scrolled = true;
    render();
});

document.getElementById('ctx-edit').addEventListener('click', () => {
    if (!ctxMenu.todoId) return;
    const { todoId, dateKey } = ctxMenu;
    const todo = (todos[dateKey] || []).find(t => t.id === todoId);
    hideContextMenu();
    if (!todo) return;
    focused = { type: 'todo', date: dateKey, todoId: todo.id };
    editFocusedTodo();
});

// ─── Window Controls ─────────────────────────────────────────────────────────

document.getElementById('btn-settings').addEventListener('click', () => {
    const isOpen = !document.getElementById('settings-panel').classList.contains('hidden');
    isOpen ? closeSettings() : openSettings();
});

document.getElementById('btn-close').addEventListener('click', () => {
    window.electronAPI?.close();
});

document.getElementById('btn-minimize').addEventListener('click', () => {
    window.electronAPI?.minimize();
});

document.getElementById('btn-pin').addEventListener('click', () => {
    pinned = !pinned;
    window.electronAPI?.pin(pinned);
    document.getElementById('btn-pin').classList.toggle('pinned', pinned);
    document.getElementById('btn-pin').title = pinned ? '고정 해제' : '항상 위에 고정';
});

document.getElementById('btn-compact').addEventListener('click', () => {
    compactMode = !compactMode;
    const btn = document.getElementById('btn-compact');
    btn.classList.toggle('active', compactMode);
    btn.title   = compactMode ? '전체 보기' : '오늘만 보기';
    btn.innerHTML = compactMode ? '&#9713;' : '&#9723;';

    if (compactMode) {
        const todayCount = (todos[toKey(today())] || []).length;
        const h = Math.max(150, Math.min(400, 60 + 42 + todayCount * 30 + 32 + 20));
        window.electronAPI?.resize(340, h);
    } else {
        window.electronAPI?.resize(340, 720);
    }

    render._scrolled = true;
    render();
});

// ─── Global Events ────────────────────────────────────────────────────────────

document.addEventListener('click', e => {
    if (!e.target.closest('#context-menu')) hideContextMenu();
});

// Navigation keys (no Ctrl/Alt/Meta modifier)
const NAV_KEYS = new Set(['ArrowUp', 'ArrowDown', 'Tab', 'Enter', ' ', 'Delete', 'Backspace', 'F2', 'Escape']);

document.addEventListener('keydown', e => {
    // Escape always closes context menu
    if (e.key === 'Escape') {
        hideContextMenu();
        // fall through to nav handler for focus
    }

    if (isCapturing) return;
    if (e.target.tagName === 'INPUT') return;

    // Settings panel open → only Escape closes it
    const settingsOpen = !document.getElementById('settings-panel').classList.contains('hidden');
    if (settingsOpen) {
        if (e.key === 'Escape') { e.preventDefault(); closeSettings(); }
        return;
    }

    const hasModifier = e.ctrlKey || e.altKey || e.metaKey;

    // Navigation keys (without modifier) take direct path
    if (NAV_KEYS.has(e.key) && !hasModifier) {
        handleNavKey(e);
        return;
    }

    // Shortcut combos (require modifier)
    const combo = buildCombo(e);
    if (combo) {
        for (const [actionId, sc] of Object.entries(shortcuts)) {
            if (sc && sc === combo) {
                e.preventDefault();
                executeAction(actionId);
                return;
            }
        }
    }
});

document.addEventListener('contextmenu', e => {
    if (!e.target.closest('.todo-item')) e.preventDefault();
});

// ─── Tab Switching ────────────────────────────────────────────────────────────

function switchTab(tab) {
    activeTab = tab;
    const settingsOpen = !document.getElementById('settings-panel').classList.contains('hidden');
    if (settingsOpen) closeSettings();

    document.getElementById('tab-calendar').classList.toggle('active', tab === 'calendar');
    document.getElementById('tab-timeline').classList.toggle('active', tab === 'timeline');

    if (tab === 'calendar') {
        document.getElementById('calendar').style.display = '';
        document.getElementById('timeline').style.display = 'none';
    } else {
        document.getElementById('calendar').style.display = 'none';
        document.getElementById('timeline').style.display = '';
        renderTimeline();
    }
}

// ─── Init ─────────────────────────────────────────────────────────────────────

if (window.electronAPI) {
    document.body.classList.add('electron-mode');
}

document.getElementById('tab-calendar').addEventListener('click', () => switchTab('calendar'));
document.getElementById('tab-timeline').addEventListener('click', () => switchTab('timeline'));

load();
loadShortcuts();
render();
