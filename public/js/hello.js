const dataEl = document.getElementById("data-status");

async function probeData() {
  try {
    const res = await fetch("data/status.json", { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = await res.json();
    const hasPoll =
      body.generatedAt != null && Array.isArray(body.tools) && body.tools.length > 0;
    dataEl.textContent = hasPoll
      ? `Live (${body.tools.length} tools)`
      : "Waiting for first poll";
    dataEl.classList.toggle("ok", hasPoll);
    dataEl.classList.toggle("pending", !hasPoll);
  } catch {
    dataEl.textContent = "Not available yet";
    dataEl.classList.add("pending");
  }
}

probeData();
