import { createConnection } from "node:net";

const socketPath = process.env.PRIVILEGED_HELPER_SOCKET ?? "/var/lib/materialpbx-helper/privileged.sock";
const operation = process.env.MATERIALPBX_HELPER_PROBE_OPERATION ?? "fwconsole.version";
if (!new Set(["fwconsole.version", "asterisk.version", "system.capabilities"]).has(operation)) throw new Error("Unsupported privileged-helper probe operation.");
const requestId = "00000000-0000-4000-8000-000000000001";
const request = `${JSON.stringify({ requestId, operation, parameters: {} })}\n`;

await new Promise((resolve, reject) => {
  const socket = createConnection(socketPath);
  let response = "";
  const timer = setTimeout(() => socket.destroy(new Error("Privileged helper probe timed out.")), 30_000);
  socket.setEncoding("utf8");
  socket.on("connect", () => socket.end(request));
  socket.on("data", chunk => {
    response += chunk;
    if (response.length > 64 * 1024) socket.destroy(new Error("Privileged helper probe response exceeded 64 KiB."));
  });
  socket.on("error", error => {
    clearTimeout(timer);
    reject(error);
  });
  socket.on("close", () => {
    clearTimeout(timer);
    try {
      const parsed = JSON.parse(response.trim());
      if (parsed.requestId !== requestId || parsed.ok !== true || parsed.exitCode !== 0) throw new Error("Privileged helper probe returned an unsuccessful response.");
      if (operation === "system.capabilities") {
        const registry = JSON.parse(parsed.stdout);
        const states = new Map(registry.capabilities.map(capability => [capability.id, capability.state]));
        if (states.get("platform.freepbx") !== "running" || states.get("platform.asterisk") !== "running") throw new Error("Privileged helper capability evidence did not confirm FreePBX and Asterisk.");
      }
      resolve();
    } catch (error) {
      reject(error);
    }
  });
});
