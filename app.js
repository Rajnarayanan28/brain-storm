const canvas = document.getElementById('canvas');
const addNoteBtn = document.getElementById('addNoteBtn');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const toggleGraphBtn = document.getElementById('toggleGraphBtn');
const sidebar = document.getElementById('sidebar');

let graphWindow = null;
toggleGraphBtn.addEventListener('click', () => {
  if (!graphWindow || graphWindow.closed) {
    graphWindow = window.open('graph.html', 'NotesGraph', 'width=900,height=700');
    setTimeout(sendGraphData, 500);
  } else {
    graphWindow.focus();
    sendGraphData();
  }
});

function sendGraphData() {
  const allNotes = Array.from(document.querySelectorAll('.note'));
  const nodes = allNotes.map(note => ({
    id: note.querySelector('.filename').textContent,
    content: note.querySelector('textarea').value
  }));
  const links = [];
  allNotes.forEach(sourceNote => {
    const sourceId = sourceNote.querySelector('.filename').textContent;
    const mentions = sourceNote.querySelector('textarea').value.match(/\[@([^\]]+)\]/g);
    if (mentions) {
      mentions.forEach(tag => {
        const targetId = tag.replace(/^\[@|\]$/g, '');
        if (nodes.some(n => n.id === targetId)) {
          links.push({ source: sourceId, target: targetId });
        }
      });
    }
  });
  if (graphWindow && !graphWindow.closed) {
    graphWindow.postMessage({ type: 'graph-data', nodes, links }, '*');
  }
}

let dragNote = null, offsetX = 0, offsetY = 0;
let directoryHandle = null;
const currentFolderDisplay = document.getElementById('currentFolderDisplay');
const clearFolderBtn = document.getElementById('clearFolderBtn');

clearFolderBtn.addEventListener('click', async () => {
  if (!confirm('Clear saved folder and close open notes?')) return;
  try {
    // remove from IndexedDB
    const req = indexedDB.open('notes-app-handles', 1);
    req.onsuccess = () => {
      const db = req.result;
      const tx = db.transaction('handles', 'readwrite');
      tx.objectStore('handles').delete('directory');
      tx.oncomplete = () => db.close();
      tx.onerror = () => db.close();
    };
    req.onerror = () => {};
  } catch (e) {
    console.warn('Could not clear saved handle', e);
  }
  directoryHandle = null;
  currentFolderDisplay.textContent = '(none)';
  // remove loaded notes and sidebar entries
  Array.from(document.querySelectorAll('.note')).forEach(n => n.remove());
  openNotesContent.innerHTML = '';
});

function formatDate(date) {
  return date.toLocaleString();
}

async function promptFileName(existingNames) {
  while (true) {
    let fileName = prompt('Enter a file name for your note (without extension):');
    if (fileName === null) return null;
    fileName = fileName.trim();
    if (!fileName) {
      alert('File name cannot be empty.');
      continue;
    }
    if (!fileName.endsWith('.txt')) fileName += '.txt';
    if (existingNames.includes(fileName)) {
      alert(`File "${fileName}" already exists.`);
      continue;
    }
    return fileName;
  }
}

async function getExistingFileNames(handleParam) {
  // Use provided handle or fall back to the currently selected directoryHandle
  const handle = handleParam || directoryHandle;
  if (!handle) return [];
  const names = [];
  for await (const [name, entryHandle] of handle.entries()) {
    if (entryHandle.kind === 'file' && name.endsWith('.txt')) names.push(name);
  }
  return names;
}

// Persist the directory handle in IndexedDB so the app can remember the chosen folder
function saveDirectoryHandle(handle) {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('notes-app-handles', 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
      };
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('handles', 'readwrite');
        const store = tx.objectStore('handles');
        store.put(handle, 'directory');
        tx.oncomplete = () => { db.close(); resolve(); };
        tx.onerror = (e) => { db.close(); reject(e); };
      };
      req.onerror = (e) => reject(e);
    } catch (e) {
      reject(e);
    }
  });
}

function loadSavedDirectoryHandle() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open('notes-app-handles', 1);
      req.onupgradeneeded = () => {
        req.result.createObjectStore('handles');
      };
      req.onsuccess = async () => {
        const db = req.result;
        const tx = db.transaction('handles', 'readonly');
        const store = tx.objectStore('handles');
        const getReq = store.get('directory');
        getReq.onsuccess = async () => {
          db.close();
          const handle = getReq.result;
          if (handle) {
            // Check permission
            const perm = await handle.queryPermission({ mode: 'readwrite' });
            if (perm === 'granted' || await handle.requestPermission({ mode: 'readwrite' }) === 'granted') {
              directoryHandle = handle;
              resolve(handle);
              return;
            }
          }
          resolve(null);
        };
        getReq.onerror = (e) => { db.close(); resolve(null); };
      };
      req.onerror = (e) => reject(e);
    } catch (e) {
      reject(e);
    }
  });
}

function getBaseName(filename) {
  return filename.replace(/\.txt$/, '');
}

function setCurrentFolderName(name) {
  if (currentFolderDisplay) currentFolderDisplay.textContent = name || '(none)';
}

function updateSendReceiveCounts() {
  const allNotes = Array.from(document.querySelectorAll('.note'));
  const noteMap = {};
  allNotes.forEach(note => {
    const filenameDiv = note.querySelector('.filename');
    if (filenameDiv) {
      noteMap[getBaseName(filenameDiv.textContent)] = note;
    }
  });

  allNotes.forEach(note => {
    const sendNumber = note.querySelector('.send-number');
    const receiveNumber = note.querySelector('.receive-number');
    if (sendNumber) sendNumber.textContent = ' s - 0';
    if (receiveNumber) receiveNumber.textContent = ' r - 0';
    note.dataset.sendCount = 0;
    note.dataset.receiveCount = 0;
  });

  allNotes.forEach(note => {
    const textarea = note.querySelector('textarea');
    const filenameDiv = note.querySelector('.filename');
    if (!textarea || !filenameDiv) return;
    const thisBase = getBaseName(filenameDiv.textContent);
    const text = textarea.value;

    const mentionRegex = /\[@([^\]]+)\]/g;
    let match;
    while ((match = mentionRegex.exec(text)) !== null) {
      const mentioned = match[1];
      note.dataset.sendCount = (parseInt(note.dataset.sendCount) || 0) + 1;
      note.querySelector('.send-number').textContent = ` s - ${note.dataset.sendCount}`;
      if (noteMap[mentioned]) {
        noteMap[mentioned].dataset.receiveCount = (parseInt(noteMap[mentioned].dataset.receiveCount) || 0) + 1;
        noteMap[mentioned].querySelector('.receive-number').textContent = ` r - ${noteMap[mentioned].dataset.receiveCount}`;
      }
    }
  });
}

function createNote(x, y, text = "New note", existingFileHandle = null) {
  const baseName = existingFileHandle ? getBaseName(existingFileHandle.name) : null;
  if (baseName && Array.from(document.querySelectorAll('.note .filename')).some(div => div.textContent === baseName)) {
    // Note already open, don't create duplicate
    return;
  }
  // Set default position if not specified
  x = x || 100; // Default X position
  y = y || 100; // Default Y position
  let noteFileHandle = existingFileHandle;
  let noteId = existingFileHandle ? existingFileHandle.name : `note-${Date.now()}`;
  let noteKey = `note-history-${noteId}`;
  let logs = JSON.parse(localStorage.getItem(noteKey)) || [];
  let currentLogIndex = logs.length ? logs.length - 1 : null;

  const note = document.createElement('div');
  note.className = 'note';
  note.style.left = x + 'px';
  note.style.top = y + 'px';

  const colorPicker = document.createElement('div');
  colorPicker.className = 'color-picker';
  colorPicker.style.background = '#fff8a6';
  const colorOptions = document.createElement('div');
  colorOptions.className = 'color-options';

  const colors = [
    { name: 'default', value: '#fff8a6' },
    { name: 'green', value: '#d4edda' },
    { name: 'pink', value: '#f8d7da' },
    { name: 'orange', value: '#ffe8cc' },
    { name: 'purple', value: '#e2d4f0' },
    { name: 'brown', value: '#efd9c1' }
  ];

  colors.forEach(color => {
    const colorOption = document.createElement('div');
    colorOption.className = 'color-option';
    colorOption.style.background = color.value;
    colorOption.addEventListener('click', (e) => {
      e.stopPropagation();
      note.className = 'note';
      if (color.name !== 'default') note.classList.add(color.name);
      colorPicker.style.background = color.value;
      colorPicker.classList.remove('expanded');
    });
    colorOptions.appendChild(colorOption);
  });

  colorPicker.appendChild(colorOptions);
  colorPicker.addEventListener('click', (e) => {
    e.stopPropagation();
    colorPicker.classList.toggle('expanded');
  });

  let isEditing = false;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('spellcheck', 'false');
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.background = '#f9f9f9';
  textarea.addEventListener('input', () => {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  });
  textarea.dispatchEvent(new Event('input'));

  // --- Mention / autofill suggestions for [@ trigger ---
  const suggestionBox = document.createElement('div');
  suggestionBox.className = 'mention-suggestions';
  Object.assign(suggestionBox.style, {
    position: 'absolute',
    display: 'none',
    minWidth: '160px',
    maxHeight: '220px',
    overflowY: 'auto',
    background: 'white',
    border: '1px solid #ddd',
    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
    zIndex: 9999,
    padding: '4px',
    borderRadius: '6px'
  });

  let suggestionItems = [];
  let selectedSuggestion = -1;

  async function updateSuggestionsForTerm(term) {
    suggestionBox.innerHTML = '';
    selectedSuggestion = -1;
    if (!term) {
      suggestionBox.style.display = 'none';
      return;
    }
    const names = (await getExistingFileNames()).map(n => getBaseName(n));
    const filtered = names.filter(n => n.toLowerCase().startsWith(term.toLowerCase()));
    if (!filtered.length) {
      suggestionBox.style.display = 'none';
      return;
    }
    filtered.forEach((name, i) => {
      const it = document.createElement('div');
      it.textContent = name;
      it.tabIndex = 0;
      Object.assign(it.style, { padding: '6px 8px', cursor: 'pointer', borderRadius: '4px' });
      it.addEventListener('click', () => applySuggestion(name));
      it.addEventListener('mouseenter', () => {
        setSelected(i);
      });
      suggestionBox.appendChild(it);
    });
    suggestionItems = Array.from(suggestionBox.children);
    suggestionBox.style.display = '';
    positionSuggestionBox();
  }

  function setSelected(idx) {
    if (selectedSuggestion >= 0 && suggestionItems[selectedSuggestion]) {
      suggestionItems[selectedSuggestion].style.background = '';
    }
    selectedSuggestion = idx;
    if (selectedSuggestion >= 0 && suggestionItems[selectedSuggestion]) {
      suggestionItems[selectedSuggestion].style.background = '#eef2ff';
      suggestionItems[selectedSuggestion].scrollIntoView({ block: 'nearest' });
    }
  }

  function applySuggestion(name) {
    const pos = textarea.selectionStart;
    const before = textarea.value.slice(0, pos);
    const after = textarea.value.slice(pos);
    const lastTrigger = before.lastIndexOf('[@');
    if (lastTrigger === -1) return;
    const newBefore = before.slice(0, lastTrigger) + '[@' + name + ']';
    textarea.value = newBefore + after;
    textarea.dispatchEvent(new Event('input'));
    const newPos = newBefore.length;
    textarea.selectionStart = textarea.selectionEnd = newPos;
    hideSuggestions();
    textarea.focus();
    updateSendReceiveCounts();
  }

  function hideSuggestions() {
    suggestionBox.style.display = 'none';
    suggestionItems = [];
    selectedSuggestion = -1;
  }

  function positionSuggestionBox() {
    const taRect = textarea.getBoundingClientRect();
    const canvasRect = canvas.getBoundingClientRect();
    suggestionBox.style.left = (taRect.left - canvasRect.left) + 'px';
    suggestionBox.style.top = (taRect.bottom - canvasRect.top + 6) + 'px';
    const sbRect = suggestionBox.getBoundingClientRect();
    if (sbRect.right > canvasRect.right) {
      suggestionBox.style.left = (canvasRect.right - sbRect.width - canvasRect.left - 8) + 'px';
    }
  }

  textarea.addEventListener('keydown', (ev) => {
    if (suggestionBox.style.display === '' && (ev.key === 'ArrowDown' || ev.key === 'ArrowUp' || ev.key === 'Enter' || ev.key === 'Escape')) {
      ev.preventDefault();
      if (ev.key === 'ArrowDown') setSelected(Math.min(selectedSuggestion + 1, suggestionItems.length - 1));
      else if (ev.key === 'ArrowUp') setSelected(Math.max(selectedSuggestion - 1, 0));
      else if (ev.key === 'Enter') {
        if (selectedSuggestion >= 0 && suggestionItems[selectedSuggestion]) {
          applySuggestion(suggestionItems[selectedSuggestion].textContent);
        } else {
          hideSuggestions();
        }
      } else if (ev.key === 'Escape') {
        hideSuggestions();
      }
    }
  });

  textarea.addEventListener('input', async () => {
    const pos = textarea.selectionStart;
    const before = textarea.value.slice(0, pos);
    const lastTrigger = before.lastIndexOf('[@');
    if (lastTrigger === -1) { hideSuggestions(); return; }
    const term = before.slice(lastTrigger + 2);
    const m = term.match(/^([\w\- ]{0,40})$/);
    if (!m) { hideSuggestions(); return; }
    await updateSuggestionsForTerm(m[1]);
  });

  textarea.addEventListener('blur', () => {
    setTimeout(hideSuggestions, 150);
  });

  note.appendChild(suggestionBox);
  // --- end suggestions ---

  const btnContainer = document.createElement('div');
  btnContainer.className = 'btn-container';

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.onclick = () => {
    isEditing = !isEditing;
    textarea.readOnly = !isEditing;
    textarea.style.background = isEditing ? 'transparent' : '#f9f9f9';
    showButtons();
    if (isEditing) textarea.focus();
  };

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.display = 'none';
  saveBtn.onclick = async () => {
    textarea.readOnly = true;
    textarea.style.background = '#f9f9f9';
    isEditing = false;

    const now = new Date();
    const newEntry = { text: textarea.value, saved: now.toISOString() };
    logs.push(newEntry);
    localStorage.setItem(noteKey, JSON.stringify(logs));
    showButtons();

    try {
      if (!directoryHandle) {
        const blob = new Blob([textarea.value], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        let fileName = await promptFileName([]);
        if (!fileName) return alert('Save cancelled.');
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Note downloaded.');
        return;
      }

      if (!noteFileHandle) {
        const existingNames = await getExistingFileNames();
        let fileName = await promptFileName(existingNames);
        if (!fileName) return alert('Save cancelled.');
        noteFileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
        noteId = fileName;
        noteKey = `note-history-${noteId}`;
        filenameDisplay.textContent = getBaseName(fileName);
      }

      const writable = await noteFileHandle.createWritable();
      await writable.write(textarea.value);
      await writable.close();
      alert('Note saved.');
    } catch (err) {
      console.error(err);
      alert('Failed to save.');
    }

    updateSendReceiveCounts();
    sendGraphData();
  };

  textarea.addEventListener('input', () => {
    if (isEditing) saveBtn.style.display = '';
  });

  const logBtn = document.createElement('button');
  logBtn.textContent = 'Log';
  const sendNumber = document.createElement('span');
  sendNumber.className = 'note-number send-number';
  sendNumber.textContent = ' s - 0';
  const receiveNumber = document.createElement('span');
  receiveNumber.className = 'note-number receive-number';
  receiveNumber.textContent = ' r - 0';
  logBtn.appendChild(sendNumber);
  logBtn.appendChild(receiveNumber);

  const logDropdown = document.createElement('select');
  logDropdown.className = 'log-dropdown';
  logDropdown.style.display = 'none';

  logBtn.onclick = () => {
    logDropdown.innerHTML = '';
    logs.forEach((log, i) => {
      const option = document.createElement('option');
      option.value = i;
      option.textContent = `#${i + 1} - ${formatDate(new Date(log.saved))}`;
      logDropdown.appendChild(option);
    });
    logDropdown.style.display = logDropdown.style.display === 'none' ? 'block' : 'none';
  };

  logDropdown.onchange = () => {
    const idx = parseInt(logDropdown.value, 10);
    if (logs[idx]) {
      textarea.value = logs[idx].text;
      textarea.dispatchEvent(new Event('input'));
    }
    logDropdown.style.display = 'none';
  };

  const filenameDisplay = document.createElement('div');
  filenameDisplay.className = 'filename';
  filenameDisplay.textContent = existingFileHandle ? getBaseName(existingFileHandle.name) : 'New Note';

  btnContainer.append(editBtn, saveBtn, logBtn, logDropdown);
  note.append(colorPicker, btnContainer, filenameDisplay, textarea);
  canvas.appendChild(note);
  // Add this line to create a sidebar entry for each note:
  createSidebarEntry(note, filenameDisplay.textContent, existingFileHandle);

  function showButtons() {
    saveBtn.style.display = isEditing ? '' : 'none';
  }

  note.addEventListener('mousedown', ev => {
    if (['TEXTAREA', 'BUTTON', 'SELECT'].includes(ev.target.tagName)) return;
    dragNote = note;
    offsetX = ev.offsetX;
    offsetY = ev.offsetY;
    note.style.zIndex = 10;
  });

  note.addEventListener('click', () => {
    note.style.zIndex = 10;
    Array.from(canvas.children).forEach(child => {
      if (child !== note) child.style.zIndex = 1;
    });
  });

  updateSendReceiveCounts();
  sendGraphData();
}

addNoteBtn.addEventListener('click', () => {
  createNote(60 + Math.random() * 300, 60 + Math.random() * 200);
});

canvas.addEventListener('dblclick', (e) => {
  if (e.target !== canvas) return;
  createNote(e.clientX - canvas.getBoundingClientRect().left,
             e.clientY - canvas.getBoundingClientRect().top);
});

document.addEventListener('mousemove', (ev) => {
  if (!dragNote) return;
  dragNote.style.left = (ev.clientX - offsetX) + 'px';
  dragNote.style.top = (ev.clientY - offsetY) + 'px';
});

document.addEventListener('mouseup', () => {
  dragNote = null;
});

selectFolderBtn.addEventListener('click', async () => {
  try {
    directoryHandle = await window.showDirectoryPicker({ startIn: 'documents', mode: 'readwrite' });
    const perm = await directoryHandle.requestPermission({ mode: 'readwrite' });
    if (perm !== 'granted') throw new Error('Permission not granted');

    // remember the selected folder for future sessions
    try { await saveDirectoryHandle(directoryHandle); } catch (e) { console.warn('Could not save directory handle', e); }

  addNoteBtn.disabled = false;
  setCurrentFolderName(directoryHandle.name || '(selected)');
    // clear existing notes before loading from folder to avoid duplicates
    Array.from(document.querySelectorAll('.note')).forEach(n => n.remove());
    openNotesContent.innerHTML = '';

    for await (const [name, handle] of directoryHandle.entries()) {
      if (handle.kind === 'file' && name.endsWith('.txt')) {
        const file = await handle.getFile();
        const text = await file.text();
        createNote(60 + Math.random() * 300, 60 + Math.random() * 200, text, handle);
      }
    }

    sendGraphData();
  } catch (err) {
    console.error('Folder selection error:', err);
    alert('Failed to open folder. Notes will be downloaded instead.');
  }
});

function createSidebarEntry(note, filename, fileHandle) {
  const entry = document.createElement('div');
  entry.className = 'sidebar-entry';
  entry.textContent = filename;
  entry.style.cursor = 'pointer';

  // Close button
  const closeBtn = document.createElement('button');
  closeBtn.textContent = '✖';
  closeBtn.title = 'Close note';
  closeBtn.style.marginLeft = '8px';
  closeBtn.onclick = (e) => {
    e.stopPropagation();
    note.remove();
    entry.remove();
  };

  // Delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '🗑️';
  deleteBtn.title = 'Delete file';
  deleteBtn.style.marginLeft = '4px';
  deleteBtn.onclick = async (e) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this file?')) {
      if (fileHandle) {
        try {
          await directoryHandle.removeEntry(fileHandle.name);
          note.remove();
          entry.remove();
        } catch (err) {
          alert('Failed to delete file.');
        }
      } else {
        note.remove();
        entry.remove();
      }
    }
  };

  entry.appendChild(closeBtn);
  entry.appendChild(deleteBtn);
  entry.onclick = () => {
    note.style.zIndex = 10;
    Array.from(canvas.children).forEach(child => {
      if (child !== note) child.style.zIndex = 1;
    });
    note.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };
  openNotesContent.appendChild(entry);
  note.addEventListener('click', () => {
    entry.classList.add('active');
    Array.from(sidebar.children).forEach(child => {
      if (child !== entry) child.classList.remove('active');
    });
  });
}

const openNotesTabBtn = document.getElementById('openNotesTabBtn');
const folderFilesTabBtn = document.getElementById('folderFilesTabBtn');
const openNotesContent = document.getElementById('openNotesContent');
const folderFilesContent = document.getElementById('folderFilesContent');

openNotesTabBtn.addEventListener('click', () => {
  openNotesTabBtn.classList.add('active-tab');
  folderFilesTabBtn.classList.remove('active-tab');
  openNotesContent.classList.add('active');
  folderFilesContent.classList.remove('active');
});

folderFilesTabBtn.addEventListener('click', () => {
  folderFilesTabBtn.classList.add('active-tab');
  openNotesTabBtn.classList.remove('active-tab');
  folderFilesContent.classList.add('active');
  openNotesContent.classList.remove('active');
  // Populate the folder files list
  if (directoryHandle) populateFolderFilesTab(directoryHandle);
});

async function populateFolderFilesTab(handle) {
  folderFilesContent.innerHTML = '';
  for await (const [name, entryHandle] of handle.entries()) {
    if (entryHandle.kind === 'file' && name.endsWith('.txt')) {
      const fileEntry = document.createElement('div');
      fileEntry.className = 'folder-file-entry';
      fileEntry.textContent = name;
      fileEntry.style.cursor = 'pointer';
      fileEntry.onclick = async () => {
        const baseName = getBaseName(name);
        const stillOpen = Array.from(document.querySelectorAll('.note .filename'))
          .some(div => div.textContent === baseName);
        if (stillOpen) {
          const note = Array.from(document.querySelectorAll('.note')).find(n =>
            n.querySelector('.filename').textContent === baseName
          );
          if (note) {
            note.style.zIndex = 10;
            note.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
          return;
        }
        const file = await entryHandle.getFile();
        const text = await file.text();
        createNote(60 + Math.random() * 300, 60 + Math.random() * 200, text, entryHandle);
      };
      folderFilesContent.appendChild(fileEntry);
    }
  }
}

// Try to restore a previously selected folder on load
(async function restoreSavedFolder() {
  try {
    const saved = await loadSavedDirectoryHandle();
    if (saved) {
      // load notes from the saved folder
      addNoteBtn.disabled = false;
      setCurrentFolderName(saved.name || '(saved)');
      for await (const [name, handle] of saved.entries()) {
        if (handle.kind === 'file' && name.endsWith('.txt')) {
          const file = await handle.getFile();
          const text = await file.text();
          createNote(60 + Math.random() * 300, 60 + Math.random() * 200, text, handle);
        }
      }
      sendGraphData();
    }
  } catch (e) {
    console.warn('Could not restore saved folder', e);
  }
})();
