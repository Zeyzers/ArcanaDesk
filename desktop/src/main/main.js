const path = require("path");
const { app, BrowserWindow, nativeTheme, ipcMain } = require("electron");
const Store = require("electron-store");

const store = new Store({
  name: "arcanadesk-prefs",
  defaults: {
    window: { width: 1280, height: 840 },
    appState: {},
  },
});

const createWindow = () => {
  const { width, height } = store.get("window");
  nativeTheme.themeSource = "dark";

  const win = new BrowserWindow({
    width,
    height,
    minWidth: 1100,
    minHeight: 720,
    backgroundColor: "#0d1017",
    autoHideMenuBar: true,
    title: "ArcanaDesk - DM Toolkit",
    webPreferences: {
      preload: path.join(__dirname, "..", "..", "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.loadFile(path.join(__dirname, "..", "renderer", "index.html"));

  win.on("resize", () => {
    const [newWidth, newHeight] = win.getSize();
    store.set("window", { width: newWidth, height: newHeight });
  });
};

ipcMain.handle("state:get", () => {
  return store.get("appState") || {};
});

ipcMain.handle("state:set", (_, data) => {
  store.set("appState", data || {});
  return true;
});

app.whenReady().then(() => {
  if (process.platform === "win32") {
    app.setAppUserModelId("com.arcanadesk.dmtools");
  }

  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
