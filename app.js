const canvas = document.getElementById('canvas');
const addNoteBtn = document.getElementById('addNoteBtn');
const selectFolderBtn = document.getElementById('selectFolderBtn');
const toggleGraphBtn = document.getElementById('toggleGraphBtn');

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
    id: note.querySelector('.filename').textContent
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

async function getExistingFileNames() {
  if (!directoryHandle) return [];
  const names = [];
  for await (const [name, handle] of directoryHandle.entries()) {
    if (handle.kind === 'file') names.push(name);
  }
  return names;
}

function getBaseName(filename) {
  return filename.replace(/\.txt$/, '');
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
    await directoryHandle.requestPermission({ mode: 'readwrite' });

    addNoteBtn.disabled = false;
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
