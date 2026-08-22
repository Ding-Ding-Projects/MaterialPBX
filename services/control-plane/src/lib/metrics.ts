export class Metrics {
  #startedAt = Date.now();
  #counters = new Map<string, number>();

  increment(name: string, amount = 1) { this.#counters.set(name, (this.#counters.get(name) ?? 0) + amount); }

  render(): string {
    const lines = [
      "# HELP materialpbx_uptime_seconds Control-plane process uptime.",
      "# TYPE materialpbx_uptime_seconds gauge",
      `materialpbx_uptime_seconds ${Math.floor((Date.now() - this.#startedAt) / 1000)}`
    ];
    for (const [name, value] of [...this.#counters].sort(([a], [b]) => a.localeCompare(b))) {
      lines.push(`# TYPE materialpbx_${name} counter`, `materialpbx_${name} ${value}`);
    }
    return `${lines.join("\n")}\n`;
  }
}
