const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("api", {
  getStatus: () => ipcRenderer.invoke("get-status"),
  testConnection: (apiKey, libraryId) =>
    ipcRenderer.invoke("test-connection", { apiKey, libraryId }),
  saveConfig: (apiKey, libraryId, configureClaude) =>
    ipcRenderer.invoke("save-config", { apiKey, libraryId, configureClaude }),
  openExternal: (url) => ipcRenderer.invoke("open-external", url),
});
