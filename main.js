const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');

const LOG_FILE  = path.join(app.getPath('userData'), 'app.log');
const BOUNDS_FILE = path.join(app.getPath('userData'), 'window-bounds.json');

function log(msg) {
    try { fs.appendFileSync(LOG_FILE, `[${new Date().toISOString()}] ${msg}\n`); } catch {}
    console.log(msg);
}

function loadBounds() {
    try {
        const saved = JSON.parse(fs.readFileSync(BOUNDS_FILE, 'utf8'));
        if (saved.x > -200 && saved.x < 4000 && saved.y > -200 && saved.y < 3000) {
            log(`Loaded bounds: ${JSON.stringify(saved)}`);
            return saved;
        }
    } catch {}
    log('Using default bounds (no saved file)');
    return { width: 340, height: 720 };
}

function saveBounds(win) {
    try { fs.writeFileSync(BOUNDS_FILE, JSON.stringify(win.getBounds())); } catch {}
}

let win;

app.whenReady().then(() => {
    log('App ready, creating window...');

    win = new BrowserWindow({
        ...loadBounds(),
        minWidth: 280,
        maxWidth: 440,
        frame: false,
        backgroundColor: '#f5f5f7',
        hasShadow: true,
        resizable: true,
        webPreferences: {
            preload: path.join(__dirname, 'preload.js'),
            contextIsolation: true,
        },
    });

    win.loadFile('index.html');
    win.center();   // Always center on launch
    win.focus();

    log('Window created and centered');

    win.webContents.on('did-fail-load', (e, code, desc) => {
        log(`Page load failed: ${code} ${desc}`);
    });

    ['moved', 'resized'].forEach(evt => {
        win.on(evt, () => saveBounds(win));
    });
});

process.on('uncaughtException', err => log(`CRASH: ${err.stack}`));

ipcMain.on('win-close',    () => win?.close());
ipcMain.on('win-minimize', () => win?.minimize());
ipcMain.on('win-pin',      (_, on)     => win?.setAlwaysOnTop(on));
ipcMain.on('win-resize',   (_, w, h)   => win?.setSize(w, h));

app.on('window-all-closed', () => {
    log('All windows closed, quitting');
    if (process.platform !== 'darwin') app.quit();
});
