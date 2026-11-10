// macOS notarization (afterSign hook). The family-standard custom hook: reads
// NOTARIZE_APPLE_* (NOT APPLE_*, to avoid electron-builder's buggy auto-notarize
// firing alongside this), notarizes via notarytool, staples the ticket. Staple
// failure is non-fatal (online fallback). No-op off macOS or without creds.
const { execFileSync } = require("node:child_process");

exports.default = async function notarizing(context) {
  if (context.electronPlatformName !== "darwin") return;
  const { notarize } = require("@electron/notarize");
  const appName = context.packager.appInfo.productFilename;
  const appPath = `${context.appOutDir}/${appName}.app`;

  const apiKeyPath = process.env.APPLE_API_KEY_PATH;
  const apiKeyId = process.env.APPLE_API_KEY;
  const apiIssuer = process.env.APPLE_API_ISSUER;
  const appleId = process.env.NOTARIZE_APPLE_ID;
  const appleIdPassword = process.env.NOTARIZE_APPLE_PASSWORD;
  const teamId = process.env.NOTARIZE_APPLE_TEAM_ID;

  console.log(`[notarize] ${appPath}`);

  if (apiKeyPath && apiKeyId && apiIssuer) {
    console.log("[notarize] using App Store Connect API key");
    await notarize({
      tool: "notarytool",
      appPath,
      appleApiKey: apiKeyPath,
      appleApiKeyId: apiKeyId,
      appleApiIssuer: apiIssuer,
    });
  } else if (appleId && appleIdPassword && teamId) {
    console.log("[notarize] using Apple ID");
    await notarize({ tool: "notarytool", appPath, appleId, appleIdPassword, teamId });
  } else {
    console.log("[notarize] skipped (no API key or Apple ID credentials)");
    return;
  }

  try {
    execFileSync("xcrun", ["stapler", "staple", appPath]);
  } catch (e) {
    console.warn("[notarize] staple failed (non-fatal):", e.message);
  }
};
