const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("arcanaDesk", {
  versions: process.versions,
  loadState: () => ipcRenderer.invoke("state:get"),
  saveState: (data) => ipcRenderer.invoke("state:set", data),
});
