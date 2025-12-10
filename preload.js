const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('arcanaDesk', {
  versions: process.versions
});
