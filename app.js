const canvas = document.getElementById('canvas');
const addNoteBtn = document.getElementById('addNoteBtn');
const selectFolderBtn = document.getElementById('selectFolderBtn');

let dragNote = null, offsetX = 0, offsetY = 0;
let directoryHandle = null;

function formatDate(date) {
  return date.toLocaleString();
}

async function promptFileName(existingNames) {
  while (true) {
    let fileName = prompt('Enter a file name for your note (without extension):');
    if (fileName === null) return null; // User cancelled

    fileName = fileName.trim();
    if (!fileName) {
      alert('File name cannot be empty.');
      continue;
    }

    if (!fileName.endsWith('.txt')) fileName += '.txt';

    if (existingNames.includes(fileName)) {
      alert(`File name "${fileName}" already exists. Please enter a different name.`);
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

function createNote(x, y, text = "New note", existingFileHandle = null) {
  let noteFileHandle = existingFileHandle;

  // Unique note ID for localStorage key
  let noteId = existingFileHandle ? existingFileHandle.name : `note-${Date.now()}`;
  let noteKey = `note-history-${noteId}`;

  // Load history from localStorage or start fresh
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
      if (color.name !== 'default') {
        note.classList.add(color.name);
      }
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
  let isSaved = !!existingFileHandle;

  const textarea = document.createElement('textarea');
  textarea.value = text;
  textarea.setAttribute('spellcheck', 'false');
  textarea.setAttribute('readonly', 'readonly');
  textarea.style.background = '#f9f9f9';

  function autoResizeTextarea() {
    textarea.style.height = 'auto';
    textarea.style.height = textarea.scrollHeight + 'px';
  }
  autoResizeTextarea();
  textarea.addEventListener('input', autoResizeTextarea);

  const btnContainer = document.createElement('div');
  btnContainer.className = 'btn-container';

  const editBtn = document.createElement('button');
  editBtn.textContent = 'Edit';
  editBtn.onclick = function () {
    if (!isEditing) {
      textarea.removeAttribute('readonly');
      textarea.style.background = 'transparent';
      textarea.focus();
      isEditing = true;
      showButtons();
    } else {
      isEditing = false;
      textarea.setAttribute('readonly', 'readonly');
      textarea.style.background = '#f9f9f9';
      showButtons();
    }
  };

  const saveBtn = document.createElement('button');
  saveBtn.textContent = 'Save';
  saveBtn.style.display = 'none';
  saveBtn.onclick = async function() {
    textarea.setAttribute('readonly', 'readonly');
    textarea.style.background = '#f9f9f9';
    isEditing = false;

    const now = new Date();
    const newEntry = { text: textarea.value, saved: now.toISOString() };
    logs.push(newEntry);
    currentLogIndex = logs.length - 1;
    localStorage.setItem(noteKey, JSON.stringify(logs));
    showButtons();

    try {
      if (!directoryHandle) {
        // Fallback to download if no folder selected
        const blob = new Blob([textarea.value], {type: 'text/plain'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        
        let fileName = await promptFileName([]);
        if (!fileName) {
          alert('Save cancelled.');
          return;
        }
        
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        alert('Note downloaded.');
        return;
      }

      try {
        if (!noteFileHandle) {
          const existingNames = await getExistingFileNames();
          let fileName = await promptFileName(existingNames);
          if (!fileName) {
            alert('Save cancelled.');
            return;
          }
          noteFileHandle = await directoryHandle.getFileHandle(fileName, { create: true });
          noteId = fileName;
          noteKey = `note-history-${noteId}`;
        }

        const writable = await noteFileHandle.createWritable();
        await writable.write(textarea.value);
        await writable.close();
        alert('Note saved.');
        isSaved = true;
      } catch (writeError) {
        console.error('Write error:', writeError);
        alert('Failed to save to folder. Trying download instead...');
        // Fallback to download
        const blob = new Blob([textarea.value], {type: 'text/plain'});
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `note-${Date.now()}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      }
    } catch (error) {
      console.error('Error saving file:', error);
      alert('Failed to save note. Please try again.');
    }
  };

  textarea.addEventListener('input', function () {
    if (isEditing) {
      saveBtn.style.display = '';
    }
  });

  const logDropdown = document.createElement('select');
  logDropdown.className = 'log-dropdown';

  const logBtn = document.createElement('button');
  logBtn.textContent = 'Log';
  logBtn.onclick = function (e) {
    e.stopPropagation();
    if (logs.length === 0) {
      alert('No logs yet.');
      return;
    }
    logDropdown.innerHTML = '';
    logs.forEach((log, idx) => {
      const option = document.createElement('option');
      option.value = idx;
      option.textContent = `#${idx + 1} - ${formatDate(new Date(log.saved))}`;
      logDropdown.appendChild(option);
    });
    logDropdown.style.display = logDropdown.style.display === 'none' ? 'block' : 'none';
    if (logDropdown.style.display === 'block') {
      logDropdown.focus();
    }
  };

  logDropdown.addEventListener('mousedown', (e) => e.stopPropagation());
  logDropdown.onchange = function () {
    const idx = parseInt(logDropdown.value, 10);
    if (!isNaN(idx) && logs[idx]) {
      textarea.value = logs[idx].text;
      autoResizeTextarea();
      currentLogIndex = idx;
    }
    logDropdown.style.display = 'none';
  };

  btnContainer.appendChild(editBtn);
  btnContainer.appendChild(saveBtn);
  btnContainer.appendChild(logBtn);
  btnContainer.appendChild(logDropdown);

  note.appendChild(colorPicker);
  note.appendChild(btnContainer);
  note.appendChild(textarea);
  canvas.appendChild(note);

  function showButtons() {
    editBtn.style.display = '';
    saveBtn.style.display = isEditing ? '' : 'none';
    logBtn.style.display = '';
  }

  note.addEventListener('mousedown', function (ev) {
    if (['TEXTAREA', 'BUTTON', 'SELECT'].includes(ev.target.tagName)) return;
    dragNote = note;
    offsetX = ev.offsetX;
    offsetY = ev.offsetY;
    note.style.zIndex = 10;
  });

  note.addEventListener('click', function () {
    note.style.zIndex = 10;
    Array.from(canvas.children).forEach(child => {
      if (child !== note) child.style.zIndex = 1;
    });
  });

  showButtons();
}

addNoteBtn.addEventListener('click', function () {
  createNote(60 + Math.random() * 300, 60 + Math.random() * 200);
});

canvas.addEventListener('dblclick', function (e) {
  if (e.target !== canvas) return;
  createNote(e.clientX - canvas.getBoundingClientRect().left,
             e.clientY - canvas.getBoundingClientRect().top);
});

document.addEventListener('mousemove', function (ev) {
  if (!dragNote) return;
  dragNote.style.left = (ev.clientX - offsetX) + 'px';
  dragNote.style.top = (ev.clientY - offsetY) + 'px';
});

document.addEventListener('mouseup', function () {
  dragNote = null;
});

selectFolderBtn.addEventListener('click', async function () {
  try {
    if (!window.showDirectoryPicker) {
      throw new Error('File System Access API not supported');
    }
    
    directoryHandle = await window.showDirectoryPicker({
      startIn: 'documents',
      mode: 'readwrite'
    });
    
    // Verify we have permission to write
    const options = { mode: 'readwrite' };
    await directoryHandle.requestPermission(options);
    
    addNoteBtn.disabled = false;
    
    // Load existing .txt notes from the directory
    for await (const [name, handle] of directoryHandle.entries()) {
      if (handle.kind === 'file' && name.endsWith('.txt')) {
        const file = await handle.getFile();
        const text = await file.text();
        createNote(
          60 + Math.random() * 300, 
          60 + Math.random() * 200, 
          text,
          handle
        );
      }
    }
  } catch (err) {
    console.error('Folder selection error:', err);
    alert('Folder selection cancelled or failed. Notes will be downloaded instead.');
  }
});
