const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
    close:    ()       => ipcRenderer.send('win-close'),
    minimize: ()       => ipcRenderer.send('win-minimize'),
    pin:      (on)     => ipcRenderer.send('win-pin', on),
    resize:   (w, h)   => ipcRenderer.send('win-resize', w, h),
});
