(() => {
  const STORAGE_KEY = "ora-notes-v1";

  const els = {
    searchInput: document.getElementById("searchInput"),
    newNoteBtn: document.getElementById("newNoteBtn"),
    emptyNewBtn: document.getElementById("emptyNewBtn"),
    notesList: document.getElementById("notesList"),
    emptyState: document.getElementById("emptyState"),
    noteCount: document.getElementById("noteCount"),
    editorEmpty: document.getElementById("editorEmpty"),
    editorPanel: document.getElementById("editorPanel"),
    titleInput: document.getElementById("titleInput"),
    bodyInput: document.getElementById("bodyInput"),
    pinBtn: document.getElementById("pinBtn"),
    micBtn: document.getElementById("micBtn"),
    micLabel: document.getElementById("micLabel"),
    deleteBtn: document.getElementById("deleteBtn"),
    saveStatus: document.getElementById("saveStatus"),
    voiceHint: document.getElementById("voiceHint"),
  };

  let notes = loadNotes();
  let activeId = notes[0]?.id || null;
  let saveTimer = null;
  let recognition = null;
  let listening = false;

  function uid() {
    return crypto.randomUUID?.() || `n_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }

  function loadNotes() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return seedNotes();
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : seedNotes();
    } catch {
      return seedNotes();
    }
  }

  function seedNotes() {
    const now = Date.now();
    return [
      {
        id: uid(),
        title: "Welcome to Ora",
        body: "This is your calm space for quick thoughts.\n\nType freely, pin what matters, or tap Speak and dictate. Everything stays on this device.",
        pinned: true,
        updatedAt: now,
        createdAt: now,
      },
      {
        id: uid(),
        title: "Ideas for today",
        body: "— Ship a tiny useful tool\n— Keep the UI honest and warm\n— Make voice capture feel effortless",
        pinned: false,
        updatedAt: now - 60_000,
        createdAt: now - 60_000,
      },
    ];
  }

  function persist() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
  }

  function formatWhen(ts) {
    const d = new Date(ts);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  }

  function preview(text) {
    const clean = (text || "").replace(/\s+/g, " ").trim();
    return clean || "Empty note";
  }

  function sortedFiltered() {
    const q = els.searchInput.value.trim().toLowerCase();
    return notes
      .filter((n) => {
        if (!q) return true;
        return (
          (n.title || "").toLowerCase().includes(q) ||
          (n.body || "").toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.updatedAt - a.updatedAt;
      });
  }

  function getActive() {
    return notes.find((n) => n.id === activeId) || null;
  }

  function flashSaved() {
    els.saveStatus.textContent = "Saved";
    els.saveStatus.classList.remove("flash");
    void els.saveStatus.offsetWidth;
    els.saveStatus.classList.add("flash");
  }

  function scheduleSave() {
    clearTimeout(saveTimer);
    els.saveStatus.textContent = "Saving…";
    saveTimer = setTimeout(() => {
      const note = getActive();
      if (!note) return;
      note.title = els.titleInput.value;
      note.body = els.bodyInput.value;
      note.updatedAt = Date.now();
      persist();
      flashSaved();
      renderList();
    }, 280);
  }

  function renderList() {
    const list = sortedFiltered();
    els.noteCount.textContent = String(notes.length);
    els.notesList.innerHTML = "";

    const showEmpty = notes.length === 0;
    els.emptyState.classList.toggle("hidden", !showEmpty);
    els.notesList.classList.toggle("hidden", showEmpty);

    list.forEach((note) => {
      const li = document.createElement("li");
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = `note-item${note.id === activeId ? " active" : ""}`;
      btn.innerHTML = `
        <div class="note-item-title">
          ${note.pinned ? '<span class="pin-dot" aria-hidden="true"></span>' : ""}
          <span>${escapeHtml(note.title || "Untitled")}</span>
        </div>
        <p class="note-item-preview">${escapeHtml(preview(note.body))}</p>
        <p class="note-item-meta">${formatWhen(note.updatedAt)}</p>
      `;
      btn.addEventListener("click", () => selectNote(note.id));
      li.appendChild(btn);
      els.notesList.appendChild(li);
    });
  }

  function escapeHtml(str) {
    return String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function renderEditor() {
    const note = getActive();
    if (!note) {
      els.editorPanel.classList.add("hidden");
      els.editorEmpty.classList.remove("hidden");
      return;
    }

    els.editorEmpty.classList.add("hidden");
    els.editorPanel.classList.remove("hidden");
    els.titleInput.value = note.title || "";
    els.bodyInput.value = note.body || "";
    els.pinBtn.setAttribute("aria-pressed", note.pinned ? "true" : "false");
    els.saveStatus.textContent = "";
    els.voiceHint.textContent = "";
  }

  function selectNote(id) {
    stopListening();
    activeId = id;
    renderList();
    renderEditor();
  }

  function createNote() {
    stopListening();
    const now = Date.now();
    const note = {
      id: uid(),
      title: "",
      body: "",
      pinned: false,
      updatedAt: now,
      createdAt: now,
    };
    notes.unshift(note);
    activeId = note.id;
    persist();
    renderList();
    renderEditor();
    els.titleInput.focus();
  }

  function togglePin() {
    const note = getActive();
    if (!note) return;
    note.pinned = !note.pinned;
    note.updatedAt = Date.now();
    persist();
    els.pinBtn.setAttribute("aria-pressed", note.pinned ? "true" : "false");
    flashSaved();
    renderList();
  }

  function deleteNote() {
    const note = getActive();
    if (!note) return;
    const label = note.title?.trim() || "this note";
    if (!confirm(`Delete “${label}”?`)) return;
    stopListening();
    notes = notes.filter((n) => n.id !== note.id);
    activeId = notes[0]?.id || null;
    persist();
    renderList();
    renderEditor();
  }

  function setupSpeech() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      els.micBtn.disabled = true;
      els.micLabel.textContent = "No mic";
      els.voiceHint.textContent = "Voice capture needs Chrome or Edge.";
      return;
    }

    recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = navigator.language || "en-US";

    recognition.onstart = () => {
      listening = true;
      els.micBtn.classList.add("listening");
      els.micLabel.textContent = "Listening";
      els.voiceHint.textContent = "Listening… speak naturally.";
    };

    recognition.onend = () => {
      listening = false;
      els.micBtn.classList.remove("listening");
      els.micLabel.textContent = "Speak";
      if (!els.voiceHint.textContent.includes("denied")) {
        els.voiceHint.textContent = "";
      }
    };

    recognition.onerror = (event) => {
      listening = false;
      els.micBtn.classList.remove("listening");
      els.micLabel.textContent = "Speak";
      if (event.error === "not-allowed") {
        els.voiceHint.textContent = "Microphone access denied. Allow it in browser settings.";
      } else if (event.error !== "aborted") {
        els.voiceHint.textContent = "Couldn’t capture audio. Try again.";
      }
    };

    recognition.onresult = (event) => {
      const note = getActive();
      if (!note) return;

      let interim = "";
      let finalChunk = "";
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const chunk = event.results[i][0].transcript;
        if (event.results[i].isFinal) finalChunk += chunk;
        else interim += chunk;
      }

      if (finalChunk) {
        const join =
          note.body && !/\s$/.test(note.body) && !/^\s/.test(finalChunk) ? " " : "";
        note.body = `${note.body || ""}${join}${finalChunk}`;
        note.updatedAt = Date.now();
        persist();
        flashSaved();
        renderList();
      }

      const joinInterim = note.body && interim && !/\s$/.test(note.body) ? " " : "";
      els.bodyInput.value = `${note.body || ""}${joinInterim}${interim}`;
    };
  }

  function stopListening() {
    if (recognition && listening) {
      try {
        recognition.stop();
      } catch {
        /* ignore */
      }
    }
    listening = false;
    els.micBtn.classList.remove("listening");
    els.micLabel.textContent = els.micBtn.disabled ? "No mic" : "Speak";
  }

  function toggleMic() {
    if (!recognition || !getActive()) return;
    if (listening) {
      stopListening();
      return;
    }
    try {
      recognition.start();
    } catch {
      els.voiceHint.textContent = "Mic is busy. Tap again in a moment.";
    }
  }

  els.newNoteBtn.addEventListener("click", createNote);
  els.emptyNewBtn.addEventListener("click", createNote);
  els.searchInput.addEventListener("input", renderList);
  els.titleInput.addEventListener("input", scheduleSave);
  els.bodyInput.addEventListener("input", scheduleSave);
  els.pinBtn.addEventListener("click", togglePin);
  els.deleteBtn.addEventListener("click", deleteNote);
  els.micBtn.addEventListener("click", toggleMic);

  setupSpeech();
  renderList();
  renderEditor();
})();
