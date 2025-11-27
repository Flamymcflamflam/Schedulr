const filesInput = document.getElementById("files");
const uploadBtn = document.getElementById("uploadBtn");
const statusEl = document.getElementById("status");
const resultsCard = document.getElementById("resultsCard");
const tbody = document.querySelector("#eventsTable tbody");
const downloadIcsBtn = document.getElementById("downloadIcsBtn");

let latestEvents = [];

uploadBtn.addEventListener("click", async () => {
  const files = filesInput.files;
  if (!files.length) {
    statusEl.textContent = "Please choose at least one course outline.";
    return;
  }

  statusEl.textContent = "Uploading & reading outlines…";
  uploadBtn.disabled = true;

  try {
    const form = new FormData();
    for (const f of files) form.append("files", f);

    const res = await fetch("/api/upload", { method: "POST", body: form });
    const data = await res.json();

    if (!res.ok) throw new Error(data.error || "Upload failed.");

    latestEvents = data.events;
    renderTable(latestEvents);

    resultsCard.classList.remove("hidden");
    statusEl.textContent = `Done! Extracted ${latestEvents.length} schedule items.`;
  } catch (e) {
    statusEl.textContent = "Error: " + e.message;
  } finally {
    uploadBtn.disabled = false;
  }
});

downloadIcsBtn.addEventListener("click", async () => {
  if (!latestEvents.length) return;

  const res = await fetch("/api/ics", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ events: latestEvents })
  });

  const blob = await res.blob();
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "schedule.ics";
  a.click();

  URL.revokeObjectURL(url);
});

function renderTable(events) {
  tbody.innerHTML = "";
  for (const e of events) {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${e.date}</td>
      <td>${escapeHtml(e.course)}</td>
      <td>${escapeHtml(e.title)}</td>
      <td>${e.type}</td>
      <td>${e.weight ?? ""}</td>
      <td>${escapeHtml(e.notes ?? "")}</td>
    `;
    tbody.appendChild(tr);
  }
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, m => ({
    "&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#39;"
  }[m]));
}
