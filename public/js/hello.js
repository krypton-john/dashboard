const dataEl = document.getElementById("data-status");

const STATE_LABEL = {
  operational: "Operational",
  degraded: "Degraded",
  major: "Major outage",
  unknown: "Unknown",
};

async function probeData() {
  try {
    const res = await fetch("data/status.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const tools = Array.isArray(body.tools) ? body.tools : [];
    const hasPoll = body.generatedAt != null && tools.length > 0;

    if (!hasPoll) {
      dataEl.textContent = "Waiting for first poll";
      dataEl.classList.add("pending");
      return;
    }

    const updated = new Date(body.generatedAt);
    const updatedText = Number.isNaN(updated.getTime())
      ? body.generatedAt
      : updated.toLocaleString();

    const summary = tools
      .map((t) => `${t.name}: ${STATE_LABEL[t.state] ?? t.state}`)
      .join(" · ");

    dataEl.textContent = `${tools.length} tools · updated ${updatedText} · ${summary}`;
    dataEl.classList.remove("pending");
    dataEl.classList.toggle(
      "ok",
      tools.every((t) => t.state === "operational")
    );
  } catch {
    dataEl.textContent = "Not available yet";
    dataEl.classList.add("pending");
  }
}

probeData();
