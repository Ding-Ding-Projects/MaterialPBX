import { execFile } from "node:child_process";
import { realpath } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";

const runFile = promisify(execFile);

export default async function afterPack(context) {
  if (context.electronPlatformName !== "win32") return;

  const projectDirectory = context.packager.projectDir;
  const squirrelPackage = await realpath(path.join(projectDirectory, "node_modules", "electron-builder-squirrel-windows"));
  const rcedit = path.join(path.dirname(squirrelPackage), "electron-winstaller", "vendor", "rcedit.exe");
  const executable = path.join(context.appOutDir, "MaterialPBX.exe");
  const icon = path.resolve(projectDirectory, "../../assets/generated/materialpbx.ico");
  const version = context.packager.appInfo.version;

  await runFile(rcedit, [
    executable,
    "--set-icon", icon,
    "--set-version-string", "ProductName", "MaterialPBX",
    "--set-version-string", "FileDescription", "MaterialPBX desktop lab",
    "--set-version-string", "CompanyName", "Ding Ding Projects",
    "--set-version-string", "LegalCopyright", "Copyright 2026 Ding Ding Projects",
    "--set-file-version", version,
    "--set-product-version", version,
  ], { windowsHide: true });
}
