const { execSync } = require("child_process");
const path = require("path");
const fs = require("fs");

function findFiles(dir, pattern) {
  const results = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      results.push(...findFiles(fullPath, pattern));
    } else if (pattern.test(entry.name)) {
      results.push(fullPath);
    }
  }
  return results;
}

function stripAndSign(filePath) {
  execSync(`xattr -cr "${filePath}"`, { stdio: "inherit" });
  execSync(`codesign --force --sign - "${filePath}"`, { stdio: "inherit" });
}

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== "darwin") {
    return;
  }

  const appPath = path.join(
    context.appOutDir,
    `${context.packager.appInfo.productFilename}.app`
  );

  console.log(`Ad-hoc signing: ${appPath}`);

  // Strip extended attributes from the entire bundle first
  execSync(`xattr -cr "${appPath}"`, { stdio: "inherit" });

  const frameworksPath = path.join(appPath, "Contents", "Frameworks");

  // 1. Sign all .dylib files
  const dylibs = findFiles(frameworksPath, /\.dylib$/);
  for (const dylib of dylibs) {
    console.log(`  Signing dylib: ${path.basename(dylib)}`);
    stripAndSign(dylib);
  }

  // 2. Sign all .so files
  const soFiles = findFiles(frameworksPath, /\.so$/);
  for (const so of soFiles) {
    console.log(`  Signing so: ${path.basename(so)}`);
    stripAndSign(so);
  }

  // 3. Sign helper apps (inside .app bundles within Frameworks)
  const helpers = fs
    .readdirSync(frameworksPath)
    .filter((f) => f.endsWith(".app"))
    .map((f) => path.join(frameworksPath, f));

  for (const helper of helpers) {
    console.log(`  Signing helper: ${path.basename(helper)}`);
    stripAndSign(helper);
  }

  // 4. Sign the main Electron framework
  const frameworks = fs
    .readdirSync(frameworksPath)
    .filter((f) => f.endsWith(".framework"))
    .map((f) => path.join(frameworksPath, f));

  for (const framework of frameworks) {
    console.log(`  Signing framework: ${path.basename(framework)}`);
    stripAndSign(framework);
  }

  // 5. Sign the main app bundle last
  console.log(`  Signing app bundle`);
  stripAndSign(appPath);

  console.log("Ad-hoc signing complete");
};
