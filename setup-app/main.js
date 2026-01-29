const { app, BrowserWindow, ipcMain, shell } = require("electron");
const path = require("path");
const fs = require("fs");
const https = require("https");
const os = require("os");

// The MCP project root is one level up from this app
const PROJECT_ROOT = path.resolve(__dirname, "..");
const ENV_FILE = path.join(PROJECT_ROOT, ".env");

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

function readEnvFile() {
  if (!fs.existsSync(ENV_FILE)) return {};
  const content = fs.readFileSync(ENV_FILE, "utf-8");
  const result = {};
  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIndex = trimmed.indexOf("=");
    if (eqIndex === -1) continue;
    const key = trimmed.slice(0, eqIndex).trim();
    const value = trimmed.slice(eqIndex + 1).trim();
    result[key] = value;
  }
  return result;
}

function writeEnvFile(apiKey, libraryId) {
  const content = `ZOTERO_API_KEY=${apiKey}\nZOTERO_LIBRARY_ID=${libraryId}\n`;
  fs.writeFileSync(ENV_FILE, content, "utf-8");
}

function testZoteroConnection(apiKey, libraryId) {
  return new Promise((resolve, reject) => {
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

function configureClaude(apiKey, libraryId) {
  const configPath = getClaudeConfigPath();
  if (!configPath) {
    return { success: false, error: "Unsupported platform." };
  }

  // Determine the Python executable path
  let pythonCmd;
  if (process.platform === "win32") {
    pythonCmd = path.join(PROJECT_ROOT, ".venv", "Scripts", "python.exe");
  } else {
    pythonCmd = path.join(PROJECT_ROOT, ".venv", "bin", "python");
  }

  const serverConfig = {
    command: pythonCmd,
    args: [path.join(PROJECT_ROOT, "server.py")],
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
      // Create parent directory if it doesn't exist
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

// ---------------------------------------------------------------------------
// Window
// ---------------------------------------------------------------------------

function createWindow() {
  const win = new BrowserWindow({
    width: 600,
    height: 720,
    resizable: true,
    minWidth: 480,
    minHeight: 600,
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
  const env = readEnvFile();
  const claudePath = getClaudeConfigPath();
  const claudeExists = claudePath ? fs.existsSync(claudePath) : false;

  return {
    apiKey: env.ZOTERO_API_KEY || "",
    libraryId: env.ZOTERO_LIBRARY_ID || "",
    hasExistingConfig: !!(env.ZOTERO_API_KEY && env.ZOTERO_LIBRARY_ID),
    claudeConfigExists: claudeExists,
    claudeConfigPath: claudePath || "",
  };
});

ipcMain.handle("test-connection", async (_event, { apiKey, libraryId }) => {
  return testZoteroConnection(apiKey, libraryId);
});

ipcMain.handle(
  "save-config",
  async (_event, { apiKey, libraryId, configureClaude: shouldConfigClaude }) => {
    try {
      // Write .env
      writeEnvFile(apiKey, libraryId);
      const result = { success: true, envWritten: true };

      // Optionally configure Claude Desktop
      if (shouldConfigClaude) {
        const claudeResult = configureClaude(apiKey, libraryId);
        result.claudeConfigured = claudeResult.success;
        result.claudeConfigPath = claudeResult.path || "";
        if (!claudeResult.success) {
          result.claudeError = claudeResult.error;
        }
      }

      return result;
    } catch (err) {
      return { success: false, error: err.message };
    }
  }
);

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
