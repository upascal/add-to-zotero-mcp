const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const os = require("os");

// ---------------------------------------------------------------------------
// Server path — the Node.js MCP server bundled alongside this app
// ---------------------------------------------------------------------------

/**
 * Resolve the path to the bundled server/index.js.
 *
 * In development:  setup-app/../server/index.js
 * When packaged:   the server/ folder is included in extraResources
 *                  and lands at process.resourcesPath + "/server"
 */
function getServerDir() {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, "server");
  }
  // Dev mode — server/ is a sibling folder
  return path.resolve(__dirname, "..", "server");
}

function getServerIndexPath() {
  return path.join(getServerDir(), "index.js");
}

// ---------------------------------------------------------------------------
// Settings persistence — stored in the app's own data directory
// ---------------------------------------------------------------------------

function getSettingsDir() {
  const dir = app.getPath("userData"); // e.g. ~/Library/Application Support/add-to-zotero-setup
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function getSettingsPath() {
  return path.join(getSettingsDir(), "settings.json");
}

function readSettings() {
  const p = getSettingsPath();
  if (!fs.existsSync(p)) return {};
  try {
    return JSON.parse(fs.readFileSync(p, "utf-8"));
  } catch {
    return {};
  }
}

function writeSettings(settings) {
  fs.writeFileSync(getSettingsPath(), JSON.stringify(settings, null, 2), "utf-8");
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getClaudeConfigPath() {
  switch (process.platform) {
    case "darwin":
      return path.join(
        os.homedir(),
        "Library",
        "Application Support",
        "Claude",
        "claude_desktop_config.json"
      );
    case "win32":
      return path.join(
        process.env.APPDATA || "",
        "Claude",
        "claude_desktop_config.json"
      );
    case "linux":
      return path.join(
        process.env.XDG_CONFIG_HOME || path.join(os.homedir(), ".config"),
        "Claude",
        "claude_desktop_config.json"
      );
    default:
      return null;
  }
}

function testZoteroConnection(apiKey, libraryId) {
  return new Promise((resolve) => {
    const options = {
      hostname: "api.zotero.org",
      path: `/users/${libraryId}/collections?limit=1`,
      method: "GET",
      headers: {
        "Zotero-API-Key": apiKey,
        "Zotero-API-Version": "3",
      },
    };

    const req = https.request(options, (res) => {
      let body = "";
      res.on("data", (chunk) => (body += chunk));
      res.on("end", () => {
        if (res.statusCode === 200) {
          resolve({ success: true });
        } else if (res.statusCode === 403) {
          resolve({
            success: false,
            error: "Invalid API key or insufficient permissions.",
          });
        } else if (res.statusCode === 404) {
          resolve({ success: false, error: "Library ID not found." });
        } else {
          resolve({
            success: false,
            error: `Zotero API returned status ${res.statusCode}.`,
          });
        }
      });
    });

    req.on("error", (err) => {
      resolve({
        success: false,
        error: `Connection failed: ${err.message}`,
      });
    });

    req.setTimeout(10000, () => {
      req.destroy();
      resolve({ success: false, error: "Connection timed out." });
    });

    req.end();
  });
}

function configureClaudeDesktop(apiKey, libraryId) {
  const configPath = getClaudeConfigPath();
  if (!configPath) {
    return { success: false, error: "Unsupported platform." };
  }

  const serverIndex = getServerIndexPath();

  const serverConfig = {
    command: "node",
    args: [serverIndex],
    env: {
      ZOTERO_API_KEY: apiKey,
      ZOTERO_LIBRARY_ID: libraryId,
    },
  };

  try {
    let config = {};
    if (fs.existsSync(configPath)) {
      config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
    } else {
      fs.mkdirSync(path.dirname(configPath), { recursive: true });
    }

    if (!config.mcpServers) {
      config.mcpServers = {};
    }

    config.mcpServers["add-to-zotero"] = serverConfig;
    fs.writeFileSync(configPath, JSON.stringify(config, null, 2), "utf-8");

    return { success: true, path: configPath };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Check if Node.js is available on the system.
 */
function checkNodeAvailable() {
  const { execSync } = require("child_process");
  try {
    const version = execSync("node --version", { encoding: "utf-8" }).trim();
    return { available: true, version };
  } catch {
    return { available: false, version: null };
  }
}

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 680,
    resizable: true,
    minWidth: 480,
    minHeight: 560,
    title: "Add to Zotero — Setup",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Open external links in the default browser
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });
}

// ---------------------------------------------------------------------------
// IPC Handlers
// ---------------------------------------------------------------------------

ipcMain.handle("get-status", () => {
  const settings = readSettings();
  const claudePath = getClaudeConfigPath();
  const claudeExists = claudePath ? fs.existsSync(claudePath) : false;
  const nodeCheck = checkNodeAvailable();
  const serverExists = fs.existsSync(getServerIndexPath());

  return {
    apiKey: settings.apiKey || "",
    libraryId: settings.libraryId || "",
    hasExistingConfig: !!(settings.apiKey && settings.libraryId),
    claudeConfigExists: claudeExists,
    claudeConfigPath: claudePath || "",
    nodeAvailable: nodeCheck.available,
    nodeVersion: nodeCheck.version,
    serverBundled: serverExists,
    serverPath: getServerIndexPath(),
  };
});

ipcMain.handle("test-connection", async (_event, { apiKey, libraryId }) => {
  return testZoteroConnection(apiKey, libraryId);
});

ipcMain.handle("save-config", async (_event, { apiKey, libraryId }) => {
  try {
    // Save settings for pre-filling the form next time
    writeSettings({ apiKey, libraryId });

    // Configure Claude Desktop
    const claudeResult = configureClaudeDesktop(apiKey, libraryId);

    return {
      success: claudeResult.success,
      claudeConfigPath: claudeResult.path || "",
      error: claudeResult.error || null,
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
});

ipcMain.handle("open-external", (_event, url) => {
  shell.openExternal(url);
});

// ---------------------------------------------------------------------------
// App Lifecycle
// ---------------------------------------------------------------------------

app.whenReady().then(createWindow);

app.on("window-all-closed", () => {
  app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});
