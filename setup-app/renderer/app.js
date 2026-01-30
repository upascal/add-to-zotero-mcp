// DOM elements
const libraryIdInput = document.getElementById("library-id");
const apiKeyInput = document.getElementById("api-key");
const libraryIdError = document.getElementById("library-id-error");
const apiKeyError = document.getElementById("api-key-error");
const btnTest = document.getElementById("btn-test");
const testLabel = document.getElementById("test-label");
const testSpinner = document.getElementById("test-spinner");
const testResult = document.getElementById("test-result");
const btnSave = document.getElementById("btn-save");
const saveLabel = document.getElementById("save-label");
const saveSpinner = document.getElementById("save-spinner");
const saveError = document.getElementById("save-error");
const updateBadge = document.getElementById("update-badge");
const formView = document.getElementById("form-view");
const successView = document.getElementById("success-view");
const successDetails = document.getElementById("success-details");
const btnEdit = document.getElementById("btn-edit");
const linkKeys = document.getElementById("link-keys");
const nodeWarning = document.getElementById("node-warning");
const linkNode = document.getElementById("link-node");

// ---------------------------------------------------------------------------
// Init — load existing config + system checks
// ---------------------------------------------------------------------------

async function init() {
  const status = await window.api.getStatus();

  // Check Node.js availability
  if (!status.nodeAvailable) {
    nodeWarning.style.display = "block";
  }

  // Pre-fill if existing config
  if (status.hasExistingConfig) {
    libraryIdInput.value = status.libraryId;
    apiKeyInput.value = status.apiKey;
    updateBadge.style.display = "inline-block";
    saveLabel.textContent = "Update Configuration";
  }

  updateButtons();
}

init();

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

function validateLibraryId() {
  const val = libraryIdInput.value.trim();
  if (!val) {
    libraryIdError.textContent = "";
    return false;
  }
  if (!/^\d+$/.test(val)) {
    libraryIdError.textContent = "Library ID should be a number.";
    libraryIdInput.classList.add("error");
    return false;
  }
  libraryIdError.textContent = "";
  libraryIdInput.classList.remove("error");
  return true;
}

function validateApiKey() {
  const val = apiKeyInput.value.trim();
  if (!val) {
    apiKeyError.textContent = "";
    return false;
  }
  apiKeyError.textContent = "";
  apiKeyInput.classList.remove("error");
  return true;
}

function isFormValid() {
  const libOk =
    libraryIdInput.value.trim() &&
    /^\d+$/.test(libraryIdInput.value.trim());
  const keyOk = apiKeyInput.value.trim().length > 0;
  return libOk && keyOk;
}

function updateButtons() {
  const valid = isFormValid();
  btnTest.disabled = !valid;
  btnSave.disabled = !valid;
}

// Input listeners
libraryIdInput.addEventListener("input", () => {
  validateLibraryId();
  updateButtons();
  clearTestResult();
});

apiKeyInput.addEventListener("input", () => {
  validateApiKey();
  updateButtons();
  clearTestResult();
});

function clearTestResult() {
  testResult.style.display = "none";
  testResult.textContent = "";
  testResult.className = "test-result";
}

// ---------------------------------------------------------------------------
// Test Connection
// ---------------------------------------------------------------------------

btnTest.addEventListener("click", async () => {
  if (!isFormValid()) return;

  validateLibraryId();
  validateApiKey();

  // Show loading
  testLabel.textContent = "Testing...";
  testSpinner.style.display = "inline-block";
  btnTest.disabled = true;
  clearTestResult();

  const result = await window.api.testConnection(
    apiKeyInput.value.trim(),
    libraryIdInput.value.trim()
  );

  // Reset button
  testLabel.textContent = "Test Connection";
  testSpinner.style.display = "none";
  updateButtons();

  // Show result
  testResult.style.display = "block";
  if (result.success) {
    testResult.className = "test-result success";
    testResult.textContent =
      "Connected successfully! Your credentials are valid.";
  } else {
    testResult.className = "test-result failure";
    testResult.textContent = result.error || "Connection failed.";
  }
});

// ---------------------------------------------------------------------------
// Save
// ---------------------------------------------------------------------------

btnSave.addEventListener("click", async () => {
  if (!isFormValid()) return;

  validateLibraryId();
  validateApiKey();

  // Show loading
  saveLabel.textContent = "Saving...";
  saveSpinner.style.display = "inline-block";
  btnSave.disabled = true;
  saveError.textContent = "";

  const result = await window.api.saveConfig(
    apiKeyInput.value.trim(),
    libraryIdInput.value.trim()
  );

  // Reset button
  saveLabel.textContent =
    updateBadge.style.display !== "none"
      ? "Update Configuration"
      : "Save & Configure Claude Desktop";
  saveSpinner.style.display = "none";
  updateButtons();

  if (result.success) {
    showSuccess(result);
  } else {
    saveError.textContent = result.error || "Failed to save configuration.";
  }
});

// ---------------------------------------------------------------------------
// Success View
// ---------------------------------------------------------------------------

function showSuccess(result) {
  formView.style.display = "none";
  successView.style.display = "block";

  let details = "";
  if (result.claudeConfigPath) {
    details += `<p>Claude Desktop config updated at:</p>`;
    details += `<p><strong>${result.claudeConfigPath}</strong></p>`;
  }
  successDetails.innerHTML = details;
}

btnEdit.addEventListener("click", () => {
  successView.style.display = "none";
  formView.style.display = "block";
  updateBadge.style.display = "inline-block";
  saveLabel.textContent = "Update Configuration";
});

// ---------------------------------------------------------------------------
// External links
// ---------------------------------------------------------------------------

linkKeys.addEventListener("click", (e) => {
  e.preventDefault();
  window.api.openExternal("https://www.zotero.org/settings/keys");
});

linkNode.addEventListener("click", (e) => {
  e.preventDefault();
  window.api.openExternal("https://nodejs.org/");
});
