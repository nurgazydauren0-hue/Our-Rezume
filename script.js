function switchTab(tabId) {
    const allTabs = document.querySelectorAll('.tab-content');
    allTabs.forEach(tab => tab.classList.remove('active'));

    const allButtons = document.querySelectorAll('.nav-btn');
    allButtons.forEach(btn => btn.classList.remove('active'));

    const targetTab = document.getElementById(tabId);
    const targetBtn = document.querySelector(`.nav-btn[data-tab="${tabId}"]`);

    if (targetTab) {
        targetTab.classList.add('active');
        window.scrollTo({ top: 0, behavior: 'smooth' });
        targetTab.dispatchEvent(new Event('tab:open'));
    }

    if (targetBtn) {
        targetBtn.classList.add('active');
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const clickableElements = document.querySelectorAll('[data-tab]');

    clickableElements.forEach(element => {
        element.addEventListener('click', () => {
            const tabId = element.getAttribute('data-tab');
            switchTab(tabId);
        });
    });
});

// REST API: GET получает данные, POST создаёт, PATCH частично изменяет,
// DELETE удаляет. PUT полностью заменяет объект; в этом задании он не нужен.
document.addEventListener('DOMContentLoaded', () => {
    const apiTab = document.getElementById('api');
    if (!apiTab) return;

    const apiUrl = 'https://dummyjson.com/todos';
    const list = document.getElementById('api-todo-list');
    const emptyMessage = document.getElementById('api-empty');
    const statusMessage = document.getElementById('api-status');
    const errorMessage = document.getElementById('api-error');
    const refreshButton = document.getElementById('api-refresh-btn');
    const addForm = document.getElementById('api-add-form');
    const addInput = document.getElementById('api-todo-input');
    const addButton = document.getElementById('api-add-btn');
    const filterButtons = apiTab.querySelectorAll('[data-api-filter]');

    let tasks = [];
    let filter = 'all';
    let hasLoaded = false;
    let isLoading = false;
    let isAdding = false;
    let pendingRequests = 0;
    let localSequence = 0;
    let editingKey = null;
    let editDraft = '';
    const pendingKeys = new Set();

    function showError(message = '') {
        errorMessage.textContent = message;
        errorMessage.hidden = !message;
    }

    // fetch виден в DevTools → Network. Только ожидаемый 404 локальной
    // задачи допускает изменение в памяти: остальные ошибки сохраняют данные.
    async function request(path = '', { method = 'GET', body, isLocal = false } = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(apiUrl + path, {
                method,
                signal: controller.signal,
                ...(body === undefined ? {} : {
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                })
            });
            if (isLocal && response.status === 404) return null;
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (response.status === 204) return null;
            return await response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    function isValidTask(task) {
        return task && Number.isInteger(task.id) && task.id > 0
            && typeof task.todo === 'string' && typeof task.completed === 'boolean';
    }

    function updateControls() {
        refreshButton.disabled = isLoading || pendingRequests > 0;
        addButton.disabled = isLoading || isAdding;
        addInput.disabled = isLoading || isAdding;
        addButton.textContent = isAdding ? 'Добавление…' : 'Добавить задачу';
        list.setAttribute('aria-busy', String(isLoading));
    }

    function makeButton(text, className, label, action) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = className;
        button.textContent = text;
        button.setAttribute('aria-label', label);
        button.addEventListener('click', action);
        return button;
    }

    function renderTasks() {
        // Фоновый ответ другой задачи не должен прерывать ввод в редакторе.
        const focusedInput = document.activeElement;
        const selection = list.contains(focusedInput) && focusedInput.matches('.api-edit-form input')
            ? { key: focusedInput.closest('.api-row').dataset.taskKey,
                start: focusedInput.selectionStart, end: focusedInput.selectionEnd }
            : null;
        const completedCount = tasks.filter(task => task.completed).length;
        document.getElementById('api-total-count').textContent = tasks.length;
        document.getElementById('api-completed-count').textContent = completedCount;
        document.getElementById('api-pending-count').textContent = tasks.length - completedCount;

        filterButtons.forEach(button => {
            const selected = button.dataset.apiFilter === filter;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-pressed', String(selected));
        });

        const visibleTasks = tasks.filter(task => filter === 'all'
            || (filter === 'completed' ? task.completed : !task.completed));
        const fragment = document.createDocumentFragment();

        visibleTasks.forEach(task => {
            const busy = isLoading || pendingKeys.has(task.key);
            const row = document.createElement('li');
            row.className = 'api-row';
            row.classList.toggle('is-completed', task.completed);
            row.dataset.taskKey = task.key;

            const checkbox = document.createElement('input');
            checkbox.type = 'checkbox';
            checkbox.className = 'api-checkbox';
            checkbox.id = `api-checkbox-${task.key}`;
            checkbox.checked = task.completed;
            checkbox.disabled = busy;
            checkbox.setAttribute('aria-label', `Выполнение задачи: ${task.todo}`);
            checkbox.addEventListener('change', () => {
                updateTask(task.key, { completed: checkbox.checked });
            });
            row.appendChild(checkbox);

            if (editingKey === task.key) {
                row.classList.add('is-editing');
                const editor = document.createElement('form');
                editor.className = 'api-edit-form';
                const input = document.createElement('input');
                input.type = 'text';
                input.className = 'api-input';
                input.value = editDraft;
                input.disabled = busy;
                input.setAttribute('aria-label', 'Новый текст задачи');
                input.addEventListener('input', () => { editDraft = input.value; });
                const saveButton = document.createElement('button');
                saveButton.type = 'submit';
                saveButton.className = 'demo-btn api-save-btn';
                saveButton.textContent = 'Сохранить';
                saveButton.disabled = busy;
                const cancelButton = makeButton('Отмена', 'api-cancel-btn', 'Отменить редактирование', () => {
                    editingKey = null;
                    editDraft = '';
                    showError();
                    renderTasks();
                });
                cancelButton.disabled = busy;
                editor.append(input, saveButton, cancelButton);
                editor.addEventListener('submit', event => {
                    event.preventDefault();
                    const text = editDraft.trim();
                    if (!text) {
                        showError('Введите текст задачи');
                        input.focus();
                        return;
                    }
                    updateTask(task.key, { todo: text });
                });
                row.appendChild(editor);
            } else {
                const label = document.createElement('label');
                label.className = 'api-todo-label';
                label.htmlFor = checkbox.id;
                const text = document.createElement('span');
                text.className = 'api-todo-text';
                // textContent безопасно выводит и пользовательский текст, и ответ API.
                text.textContent = task.todo;
                label.appendChild(text);
                const actions = document.createElement('div');
                actions.className = 'api-row-actions';
                const editButton = makeButton('✏️', 'api-icon-btn', `Редактировать задачу: ${task.todo}`, () => {
                    editingKey = task.key;
                    editDraft = task.todo;
                    showError();
                    renderTasks();
                    const editInput = list.querySelector('.api-edit-form input');
                    editInput.focus();
                    editInput.select();
                });
                const deleteButton = makeButton('🗑️', 'api-icon-btn', `Удалить задачу: ${task.todo}`, () => {
                    deleteTask(task.key);
                });
                editButton.disabled = busy;
                deleteButton.disabled = busy;
                actions.append(editButton, deleteButton);
                row.append(label, actions);
            }
            fragment.appendChild(row);
        });

        list.replaceChildren(fragment);
        if (selection) {
            const nextInput = list.querySelector('.api-edit-form input');
            if (nextInput && !nextInput.disabled
                && nextInput.closest('.api-row').dataset.taskKey === selection.key) {
                nextInput.focus({ preventScroll: true });
                nextInput.setSelectionRange(selection.start, selection.end);
            }
        }
        emptyMessage.hidden = visibleTasks.length > 0 || (!hasLoaded && tasks.length === 0);
        emptyMessage.textContent = filter === 'completed' ? 'Выполненных задач пока нет.'
            : filter === 'pending' ? 'Невыполненных задач пока нет.' : 'Задач пока нет. Добавьте первую.';
        updateControls();
    }

    async function loadTasks() {
        if (isLoading || pendingRequests > 0) return;
        isLoading = true;
        showError();
        statusMessage.textContent = 'Загрузка задач…';
        renderTasks();
        try {
            // GET /todos по умолчанию возвращает 30 задач.
            const data = await request();
            if (!data || !Array.isArray(data.todos) || !data.todos.every(isValidTask)) {
                throw new Error('Некорректный ответ API');
            }
            tasks = data.todos.map(task => ({ ...task, key: `remote-${task.id}`, isLocal: false }));
            hasLoaded = true;
            editingKey = null;
            editDraft = '';
            statusMessage.textContent = `Загружено задач: ${tasks.length}`;
        } catch {
            showError('Не удалось загрузить задачи. Проверьте подключение и попробуйте ещё раз.');
            statusMessage.textContent = '';
        } finally {
            isLoading = false;
            renderTasks();
        }
    }

    async function updateTask(key, changes) {
        const task = tasks.find(item => item.key === key);
        if (!task || isLoading || pendingKeys.has(key)) return;
        pendingKeys.add(key);
        pendingRequests++;
        showError();
        renderTasks();
        try {
            await request(`/${task.id}`, { method: 'PATCH', body: changes, isLocal: task.isLocal });
            // DummyJSON не хранит предыдущие PATCH: применяем только отправленные
            // поля, чтобы редактирование текста не отменяло изменение checkbox.
            Object.assign(task, changes);
            if ('todo' in changes && editingKey === key) {
                editingKey = null;
                editDraft = '';
            }
            statusMessage.textContent = 'Изменения сохранены';
        } catch {
            showError('Не удалось изменить задачу. Попробуйте ещё раз.');
        } finally {
            pendingKeys.delete(key);
            pendingRequests--;
            renderTasks();
        }
    }

    async function deleteTask(key) {
        const task = tasks.find(item => item.key === key);
        if (!task || isLoading || pendingKeys.has(key)) return;
        pendingKeys.add(key);
        pendingRequests++;
        showError();
        renderTasks();
        try {
            await request(`/${task.id}`, { method: 'DELETE', isLocal: task.isLocal });
            tasks = tasks.filter(item => item.key !== key);
            if (editingKey === key) editingKey = null;
            statusMessage.textContent = 'Задача удалена';
        } catch {
            showError('Не удалось удалить задачу. Попробуйте ещё раз.');
        } finally {
            pendingKeys.delete(key);
            pendingRequests--;
            renderTasks();
        }
    }

    addForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (isLoading || isAdding) return;
        const text = addInput.value.trim();
        if (!text) {
            showError('Введите текст новой задачи');
            addInput.focus();
            return;
        }
        isAdding = true;
        pendingRequests++;
        showError();
        updateControls();
        try {
            const data = await request('/add', {
                method: 'POST', body: { todo: text, completed: false, userId: 1 }
            });
            if (!isValidTask(data)) throw new Error('Некорректный ответ API');
            // POST может повторять серверный ID. Уникальный key отличает такие
            // задачи друг от друга; isLocal разрешает только ожидаемый 404.
            tasks.unshift({ ...data, key: `local-${++localSequence}`, isLocal: true });
            addInput.value = '';
            filter = 'all';
            statusMessage.textContent = 'Задача добавлена';
        } catch {
            showError('Не удалось добавить задачу. Попробуйте ещё раз.');
        } finally {
            isAdding = false;
            pendingRequests--;
            renderTasks();
            addInput.focus();
        }
    });

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filter = button.dataset.apiFilter;
            renderTasks();
        });
    });
    refreshButton.addEventListener('click', loadTasks);
    apiTab.addEventListener('tab:open', () => { if (!hasLoaded) loadTasks(); });
    renderTasks();
});

document.addEventListener('DOMContentLoaded', () => {

    const welcomeTitle = document.getElementById('welcome-title');
    if (welcomeTitle) {
        welcomeTitle.addEventListener('click', () => {
            welcomeTitle.textContent = 'Сәлем, әлем!';
        });
    }

    const addNewDivBtn = document.getElementById('add-new-div-btn');
    if (addNewDivBtn) {
        addNewDivBtn.addEventListener('click', () => {
            const existing = document.querySelector('.new-div');
            if (existing) {
                existing.remove();
            }

            const newDiv = document.createElement('div');
            newDiv.className = 'new-div';
            newDiv.textContent = 'Я новый элемент';
            document.body.appendChild(newDiv);
        });
    }

    const oldElement = document.querySelector('.old-element');
    if (oldElement) {
        oldElement.addEventListener('click', () => {
            oldElement.remove();
        });
    }

    const changeableParagraph = document.createElement('p');
    changeableParagraph.textContent = 'Это меняемый абзац';

    const paragraphContainer = document.getElementById('changeable-paragraph-container');
    if (paragraphContainer) {
        paragraphContainer.appendChild(changeableParagraph);
    } else {
        document.body.appendChild(changeableParagraph);
    }

    changeableParagraph.addEventListener('click', () => {
        changeableParagraph.classList.toggle('paragraph-changed');
    });

    const demoElement = document.getElementById('demo-element');
    const classListOutput = document.getElementById('class-list-output');
    const toggleClassBtn = document.getElementById('toggle-class-btn');

    function printClassList() {
        const classesArray = Array.from(demoElement.classList);
        console.log('Классы элемента demo-element:', classesArray);
        classListOutput.textContent = 'Классы: ' + classesArray.join(', ');
    }

    if (demoElement && classListOutput) {
        printClassList();
    }

    if (toggleClassBtn && demoElement) {
        toggleClassBtn.addEventListener('click', () => {
            demoElement.classList.toggle('active');
            printClassList();
        });
    }
});


document.addEventListener('DOMContentLoaded', () => {

    const rowsInput = document.getElementById('table-rows-input');
    const colsInput = document.getElementById('table-cols-input');
    const generateBtn = document.getElementById('generate-table-btn');
    const tableContainer = document.getElementById('table-container');
    const coloredCountOutput = document.getElementById('colored-count-output');

    let coloredCellsCount = 0;

    function updateColoredCount() {
        coloredCountOutput.textContent = 'Закрашено ячеек: ' + coloredCellsCount;
    }

    function generateTable(rowsCount, colsCount) {
        tableContainer.innerHTML = '';
        coloredCellsCount = 0;
        updateColoredCount();

        const table = document.createElement('table');
        table.className = 'generated-table';

        for (let r = 0; r < rowsCount; r++) {
            const row = document.createElement('tr');

            for (let c = 0; c < colsCount; c++) {
                const cell = document.createElement('td');

                cell.addEventListener('click', () => {
                    cell.classList.toggle('cell-colored');
                    coloredCellsCount += cell.classList.contains('cell-colored') ? 1 : -1;
                    updateColoredCount();
                });

                row.appendChild(cell);
            }

            table.appendChild(row);
        }

        tableContainer.appendChild(table);
    }

    if (generateBtn) {
        generateBtn.addEventListener('click', () => {
            const rowsCount = parseInt(rowsInput.value, 10);
            const colsCount = parseInt(colsInput.value, 10);

            if (!rowsCount || !colsCount || rowsCount < 1 || colsCount < 1) {
                alert('Введите корректное количество строк и столбцов (число больше 0).');
                return;
            }

            generateTable(rowsCount, colsCount);
        });
    }
});


document.addEventListener('DOMContentLoaded', () => {

    const themeToggleBtn = document.getElementById('theme-toggle-btn');

    function applyTheme(isDark) {
        document.body.classList.toggle('light-theme', !isDark);
        if (themeToggleBtn) {
            themeToggleBtn.textContent = isDark ? 'Светлая тема☀️' : 'Тёмная тема🌙';
        }
    }

    if (themeToggleBtn) {
        themeToggleBtn.addEventListener('click', () => {
            const isCurrentlyLight = document.body.classList.contains('light-theme');
            applyTheme(isCurrentlyLight);
        });
    }
});
