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
    const usersUrl = 'https://dummyjson.com/users';
    const list = document.getElementById('api-todo-list');
    const emptyMessage = document.getElementById('api-empty');
    const statusMessage = document.getElementById('api-status');
    const errorMessage = document.getElementById('api-error');
    const refreshButton = document.getElementById('api-refresh-btn');
    const addForm = document.getElementById('api-add-form');
    const addInput = document.getElementById('api-todo-input');
    const addButton = document.getElementById('api-add-btn');
    const filterButtons = apiTab.querySelectorAll('[data-api-filter]');
    const searchInput = document.getElementById('api-search-input');
    const sortSelect = document.getElementById('api-sort-select');
    const authorSelect = document.getElementById('api-author-select');
    const resetFiltersButton = document.getElementById('api-reset-filters-btn');
    const addDialog = document.getElementById('api-add-dialog');
    const openAddButton = document.getElementById('api-open-add-btn');
    const assigneeSelect = document.getElementById('api-assignee-select');
    const completedInput = document.getElementById('api-completed-input');
    const addError = document.getElementById('api-add-error');
    const usersRetryButton = document.getElementById('api-users-retry-btn');
    const userDialog = document.getElementById('api-user-dialog');
    const userDetails = document.getElementById('api-user-details');
    const userList = document.getElementById('api-user-task-list');
    const userStatus = document.getElementById('api-user-status');
    const userError = document.getElementById('api-user-error');
    const userRetryButton = document.getElementById('api-user-retry-btn');

    let tasks = [];
    let mainTaskKeys = [];
    let filter = 'all';
    let sortOrder = 'default';
    let appliedSort = 'default';
    let searchQuery = '';
    let authorFilter = 'all';
    let hasLoaded = false;
    let isLoading = false;
    let isAdding = false;
    let pendingRequests = 0;
    let localSequence = 0;
    let editingKey = null;
    let editDraft = '';
    let editingContext = 'main';
    let mainLoadVersion = 0;
    let profileLoadVersion = 0;
    let dataGeneration = 0;
    let activeUserId = null;
    let profileReturnKey = null;
    let isProfileLoading = false;
    let usersLoaded = false;
    let usersLoading = false;
    let usersPromise = null;
    const pendingKeys = new Set();
    const users = new Map();
    const fullProfiles = new Set();
    const userTaskKeys = new Map();
    // DummyJSON не хранит PATCH/DELETE: повторные чтения накладывают
    // сделанные изменения на ответ API. Только явное обновление сбрасывает их.
    const taskChanges = new Map();
    const deletedKeys = new Set();

    function showError(message = '') {
        errorMessage.textContent = message;
        errorMessage.hidden = !message;
        if (userDialog.open) {
            userError.textContent = message;
            userError.hidden = !message;
        }
    }

    // fetch виден в DevTools → Network, в том числе для новых задач.
    // DummyJSON их не хранит: только их ожидаемый 404 разрешает локальное действие.
    async function request(path = '', { method = 'GET', body, isLocal = false, baseUrl = apiUrl } = {}) {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch(baseUrl + path, {
                method,
                signal: controller.signal,
                ...(body === undefined ? {} : {
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                })
            });
            if (isLocal && response.status === 404 && (method === 'PATCH' || method === 'DELETE')) {
                return null;
            }
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            if (response.status === 204) return null;
            return await response.json();
        } finally {
            clearTimeout(timeout);
        }
    }

    function isValidTask(task) {
        return task && Number.isInteger(task.id) && task.id > 0
            && typeof task.todo === 'string' && typeof task.completed === 'boolean'
            && Number.isInteger(task.userId) && task.userId > 0;
    }

    function updateControls() {
        refreshButton.disabled = isLoading || pendingRequests > 0;
        sortSelect.disabled = pendingRequests > 0;
        resetFiltersButton.disabled = pendingRequests > 0;
        authorSelect.disabled = !usersLoaded || usersLoading;
        addButton.disabled = isLoading || isAdding || !usersLoaded || usersLoading;
        addInput.disabled = isLoading || isAdding;
        assigneeSelect.disabled = isAdding || !usersLoaded || usersLoading;
        completedInput.disabled = isAdding;
        addDialog.querySelectorAll('[data-close-dialog]').forEach(button => { button.disabled = isAdding; });
        usersRetryButton.disabled = usersLoading;
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

    function tasksForKeys(keys) {
        return keys.map(key => tasks.find(task => task.key === key)).filter(Boolean);
    }

    function mergeRemoteTasks(items) {
        const keys = [];
        items.forEach(item => {
            const key = `remote-${item.id}`;
            if (deletedKeys.has(key)) return;
            const value = { ...item, ...taskChanges.get(key), key, isLocal: false };
            const existing = tasks.find(task => task.key === key);
            if (existing) Object.assign(existing, value);
            else tasks.push(value);
            keys.push(key);
        });
        return keys;
    }

    function sortedTasks(items) {
        if (appliedSort === 'default') return items;
        return [...items].sort((a, b) => a.todo.localeCompare(b.todo, ['ru', 'en'], { sensitivity: 'base' })
            * (appliedSort === 'asc' ? 1 : -1));
    }

    function fullName(user) {
        return [user?.firstName, user?.lastName].filter(Boolean).join(' ') || `Пользователь #${user?.id}`;
    }

    function createAvatar(user, className) {
        const image = document.createElement('img');
        image.className = className;
        image.alt = className === 'api-user-avatar' ? '' : `Аватар ${fullName(user)}`;
        if (className === 'api-user-avatar') image.loading = 'lazy';
        image.decoding = 'async';
        const fallback = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="80" height="80"><rect width="80" height="80" rx="16" fill="#334155"/><text x="40" y="53" text-anchor="middle" font-family="sans-serif" font-size="40" fill="#f8fafc">?</text></svg>');
        let source = fallback;
        try {
            const url = new URL(user?.image);
            if (url.protocol === 'https:' || url.protocol === 'http:') source = url.href;
        } catch { /* У пользователя может отсутствовать фотография. */ }
        image.src = source;
        image.addEventListener('error', () => { image.src = fallback; }, { once: true });
        return image;
    }

    function createUserChip(userId) {
        const user = users.get(userId) || { id: userId };
        const handle = user.username ? `@${user.username}` : `Пользователь #${userId}`;
        const button = makeButton('', 'api-user-chip', `Открыть профиль ${handle}`, () => openUserProfile(userId));
        button.title = `Открыть профиль ${handle}`;
        button.dataset.userId = userId;
        const text = document.createElement('span');
        text.textContent = handle;
        button.append(createAvatar(user, 'api-user-avatar'), text);
        return button;
    }

    function renderAssignees() {
        const selected = assigneeSelect.value;
        const selectedAuthor = authorFilter;
        const options = [...users.values()].sort((a, b) => fullName(a).localeCompare(fullName(b), ['ru', 'en']));
        assigneeSelect.replaceChildren();
        const allAuthors = document.createElement('option');
        allAuthors.value = 'all';
        allAuthors.textContent = 'Все авторы';
        authorSelect.replaceChildren(allAuthors);
        if (!usersLoaded) {
            const option = document.createElement('option');
            option.value = '';
            option.textContent = usersLoading ? 'Загрузка пользователей…' : 'Пользователи не загружены';
            assigneeSelect.appendChild(option);
        } else {
            options.forEach(user => {
                const option = document.createElement('option');
                option.value = user.id;
                option.textContent = `${fullName(user)} (@${user.username}) · ID ${user.id}`;
                assigneeSelect.appendChild(option);
                authorSelect.appendChild(option.cloneNode(true));
            });
            if (users.has(Number(selected))) assigneeSelect.value = selected;
            else if (users.has(1)) assigneeSelect.value = '1';
            if (users.has(Number(selectedAuthor))) authorSelect.value = selectedAuthor;
        }
    }

    async function loadUsers() {
        if (usersPromise) return usersPromise;
        if (usersLoaded) return true;
        usersLoading = true;
        addError.hidden = true;
        usersRetryButton.hidden = true;
        renderAssignees();
        updateControls();
        usersPromise = (async () => {
            try {
                // limit=0 получает весь справочник: userId задач может быть больше 30.
                const data = await request('?limit=0&select=id,firstName,lastName,username,image', { baseUrl: usersUrl });
                if (!data || !Array.isArray(data.users) || !data.users.length
                    || !data.users.every(user => Number.isInteger(user.id) && user.id > 0
                        && typeof user.username === 'string' && user.username.trim())) {
                    throw new Error('Некорректный список пользователей');
                }
                data.users.forEach(user => users.set(user.id, { ...users.get(user.id), ...user }));
                usersLoaded = true;
                return true;
            } catch {
                addError.textContent = 'Не удалось загрузить пользователей. Повторите загрузку для выбора исполнителя.';
                addError.hidden = false;
                usersRetryButton.hidden = false;
                return false;
            } finally {
                usersLoading = false;
                usersPromise = null;
                renderAssignees();
                renderTasks();
            }
        })();
        return usersPromise;
    }

    function renderUserDetails() {
        const user = users.get(activeUserId) || { id: activeUserId };
        document.getElementById('api-user-title').textContent = fullName(user);
        const summary = document.createElement('div');
        summary.className = 'api-profile-summary';
        const identity = document.createElement('div');
        const name = document.createElement('h3');
        name.textContent = fullName(user);
        const handle = document.createElement('p');
        handle.textContent = `${user.username ? '@' + user.username + ' · ' : ''}ID ${activeUserId}`;
        identity.append(name, handle);
        summary.append(createAvatar(user, 'api-profile-avatar'), identity);
        const info = document.createElement('dl');
        info.className = 'api-profile-info';
        const address = user.address || {};
        const company = user.company || {};
        const fields = [
            ['Email', user.email], ['Телефон', user.phone], ['Возраст', user.age],
            ['Пол', ({ male: 'Мужской', female: 'Женский' })[user.gender] || user.gender],
            ['Дата рождения', user.birthDate],
            ['Адрес', [address.address, address.city, address.state, address.country].filter(Boolean).join(', ')],
            ['Индекс', address.postalCode], ['Компания', company.name], ['Отдел', company.department],
            ['Должность', company.title], ['Университет', user.university], ['Роль', user.role],
            ['Рост / вес', user.height != null && user.weight != null ? `${user.height} см / ${user.weight} кг` : null],
            ['Группа крови', user.bloodGroup]
        ];
        fields.forEach(([label, value]) => {
            const field = document.createElement('div');
            field.className = 'api-profile-field';
            const term = document.createElement('dt');
            term.textContent = label;
            const description = document.createElement('dd');
            description.textContent = value == null || value === '' ? 'Не указано' : String(value);
            field.append(term, description);
            info.appendChild(field);
        });
        userDetails.replaceChildren(summary, info);
    }

    async function openUserProfile(userId, force = false) {
        if (!Number.isInteger(userId) || userId < 1) return;
        activeUserId = userId;
        editingKey = null;
        editDraft = '';
        if (!userDialog.open) {
            profileReturnKey = document.activeElement?.closest('.api-row')?.dataset.taskKey || null;
            userDialog.showModal();
        }
        userError.hidden = true;
        userRetryButton.hidden = true;
        const version = ++profileLoadVersion;
        const generation = dataGeneration;
        if (!force && fullProfiles.has(userId) && userTaskKeys.has(userId)) {
            isProfileLoading = false;
            userStatus.textContent = 'Профиль загружен';
            renderTasks();
            return;
        }
        isProfileLoading = true;
        userStatus.textContent = 'Загрузка профиля и задач…';
        renderTasks();
        const results = await Promise.allSettled([
            request(`/${userId}`, { baseUrl: usersUrl }),
            request(`/${userId}/todos?limit=0`, { baseUrl: usersUrl })
        ]);
        if (version !== profileLoadVersion || generation !== dataGeneration || !userDialog.open) return;
        const errors = [];
        const profile = results[0];
        if (profile.status === 'fulfilled' && profile.value?.id === userId
            && typeof profile.value.username === 'string') {
            users.set(userId, { ...users.get(userId), ...profile.value });
            fullProfiles.add(userId);
        } else errors.push('Не удалось загрузить сведения о пользователе.');
        const response = results[1];
        if (response.status === 'fulfilled' && Array.isArray(response.value?.todos)
            && response.value.todos.every(task => isValidTask(task) && task.userId === userId)) {
            userTaskKeys.set(userId, mergeRemoteTasks(response.value.todos));
        } else errors.push('Не удалось загрузить задачи пользователя.');
        isProfileLoading = false;
        userError.textContent = errors.join(' ');
        userError.hidden = !errors.length;
        userRetryButton.hidden = !errors.length;
        userStatus.textContent = errors.length ? '' : 'Профиль и задачи загружены';
        renderTasks();
    }

    function createTaskRow(task, context = 'main') {
        const busy = isLoading || pendingKeys.has(task.key);
        const row = document.createElement('li');
        row.className = 'api-row';
        row.classList.toggle('is-completed', task.completed);
        row.dataset.taskKey = task.key;
        row.dataset.context = context;
        const checkbox = document.createElement('input');
        checkbox.type = 'checkbox';
        checkbox.className = 'api-checkbox';
        checkbox.id = `api-checkbox-${context}-${task.key}`;
        checkbox.checked = task.completed;
        checkbox.disabled = busy;
        checkbox.setAttribute('aria-label', `Выполнение задачи: ${task.todo}`);
        checkbox.addEventListener('change', () => updateTask(task.key, { completed: checkbox.checked }));
        const body = document.createElement('div');
        body.className = 'api-task-body';
        row.append(checkbox, body);

        if (editingKey === task.key && editingContext === context) {
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
            const save = document.createElement('button');
            save.type = 'submit';
            save.className = 'demo-btn api-save-btn';
            save.textContent = 'Сохранить';
            save.disabled = busy;
            const cancel = makeButton('Отмена', 'api-cancel-btn', 'Отменить редактирование', () => {
                editingKey = null;
                editDraft = '';
                showError();
                renderTasks();
            });
            cancel.disabled = busy;
            editor.append(input, save, cancel);
            editor.addEventListener('submit', event => {
                event.preventDefault();
                const value = editDraft.trim();
                if (!value) {
                    showError('Введите текст задачи');
                    input.focus();
                    return;
                }
                updateTask(task.key, { todo: value });
            });
            body.appendChild(editor);
        } else {
            const label = document.createElement('label');
            label.className = 'api-todo-label';
            label.htmlFor = checkbox.id;
            const text = document.createElement('span');
            text.className = 'api-todo-text';
            text.textContent = task.todo;
            label.appendChild(text);
            body.appendChild(label);
            const actions = document.createElement('div');
            actions.className = 'api-row-actions';
            const edit = makeButton('Изменить', 'api-icon-btn api-edit-btn', `Редактировать задачу: ${task.todo}`, () => {
                editingKey = task.key;
                editingContext = context;
                editDraft = task.todo;
                showError();
                renderTasks();
                const container = context === 'profile' ? userList : list;
                const input = container.querySelector('.api-edit-form input');
                input.focus();
                input.select();
            });
            const remove = makeButton('Удалить', 'api-icon-btn api-delete-btn', `Удалить задачу: ${task.todo}`, () => deleteTask(task.key));
            edit.disabled = busy;
            remove.disabled = busy;
            actions.append(edit, remove);
            row.appendChild(actions);
        }

        // Отдельный блок всегда располагает аватар и @username под названием.
        // Кнопка пользователя вне label, поэтому её клик не переключает checkbox.
        body.appendChild(createUserChip(task.userId));
        const meta = document.createElement('div');
        meta.className = 'api-task-meta';
        const status = document.createElement('span');
        status.className = `api-task-status ${task.completed ? 'is-completed' : 'is-pending'}`;
        status.textContent = task.completed ? 'Выполнено' : 'Не выполнено';
        const id = document.createElement('span');
        id.className = 'api-task-id';
        id.textContent = `Задача #${task.id}${task.isLocal ? ' · новая' : ''}`;
        meta.append(status, id);
        body.appendChild(meta);
        return row;
    }

    function renderTasks() {
        const focused = document.activeElement;
        const selection = apiTab.contains(focused) && focused.matches('.api-edit-form input')
            ? { key: focused.closest('.api-row').dataset.taskKey,
                context: focused.closest('.api-row').dataset.context,
                start: focused.selectionStart, end: focused.selectionEnd }
            : null;
        const mainTasks = tasksForKeys(mainTaskKeys);
        const completed = mainTasks.filter(task => task.completed).length;
        document.getElementById('api-total-count').textContent = mainTasks.length;
        document.getElementById('api-completed-count').textContent = completed;
        document.getElementById('api-pending-count').textContent = mainTasks.length - completed;
        filterButtons.forEach(button => {
            const selected = button.dataset.apiFilter === filter;
            button.classList.toggle('active', selected);
            button.setAttribute('aria-pressed', String(selected));
        });
        const visible = sortedTasks(mainTasks.filter(task => (filter === 'all'
            || (filter === 'completed' ? task.completed : !task.completed))
            && task.todo.toLocaleLowerCase().includes(searchQuery)
            && (authorFilter === 'all' || task.userId === Number(authorFilter))));
        document.getElementById('api-list-title').textContent = filter === 'completed'
            ? 'Выполненные задачи' : filter === 'pending' ? 'Невыполненные задачи' : 'Все задачи';
        document.getElementById('api-visible-count').textContent = `${visible.length} / ${mainTasks.length}`;
        document.getElementById('api-results-summary').textContent = `Показано ${visible.length} из ${mainTasks.length} задач. Нажмите на username, чтобы открыть профиль.`;
        list.replaceChildren(...visible.map(task => createTaskRow(task)));
        emptyMessage.hidden = visible.length > 0 || !hasLoaded;
        emptyMessage.textContent = searchQuery ? 'По вашему запросу задач не найдено.'
            : authorFilter !== 'all' ? 'У выбранного исполнителя нет задач с такими условиями.'
            : filter === 'completed' ? 'Выполненных задач пока нет.'
            : filter === 'pending' ? 'Невыполненных задач пока нет.' : 'Задач пока нет. Добавьте первую.';

        if (userDialog.open && activeUserId !== null) {
            renderUserDetails();
            // Общие объекты синхронизируют профиль и основной список. Сюда
            // входят и задачи вне первых 30, и новые задачи этого исполнителя.
            const assigned = tasks.filter(task => task.userId === activeUserId && !deletedKeys.has(task.key));
            const done = assigned.filter(task => task.completed).length;
            document.getElementById('api-user-total-count').textContent = assigned.length;
            document.getElementById('api-user-completed-count').textContent = done;
            document.getElementById('api-user-pending-count').textContent = assigned.length - done;
            userList.replaceChildren(...assigned.map(task => createTaskRow(task, 'profile')));
            userList.setAttribute('aria-busy', String(isProfileLoading));
            document.getElementById('api-user-empty').hidden = assigned.length > 0 || isProfileLoading;
        }
        if (selection) {
            const container = selection.context === 'profile' ? userList : list;
            const input = container.querySelector('.api-edit-form input');
            if (input && !input.disabled && input.closest('.api-row').dataset.taskKey === selection.key) {
                input.focus({ preventScroll: true });
                input.setSelectionRange(selection.start, selection.end);
            }
        }
        updateControls();
    }

    async function loadTasks({ reset = false } = {}) {
        if (pendingRequests > 0) return;
        const version = ++mainLoadVersion;
        const requestedSort = sortOrder;
        isLoading = true;
        showError();
        statusMessage.textContent = 'Загрузка задач…';
        renderTasks();
        try {
            // Сортировка выполняет настоящий GET с параметрами API. Поиск
            // по названию применяется к загруженному списку без перезагрузки.
            const path = requestedSort === 'default' ? '?limit=0' : `?limit=0&sortBy=todo&order=${requestedSort}`;
            const data = await request(path);
            if (version !== mainLoadVersion) return;
            if (!data || !Array.isArray(data.todos) || !data.todos.every(isValidTask)) {
                throw new Error('Некорректный ответ API');
            }
            if (reset) {
                tasks = [];
                mainTaskKeys = [];
                taskChanges.clear();
                deletedKeys.clear();
                userTaskKeys.clear();
                dataGeneration++;
            }
            const localKeys = mainTaskKeys.filter(key => key.startsWith('local-'));
            mainTaskKeys = [...localKeys, ...mergeRemoteTasks(data.todos)];
            appliedSort = requestedSort;
            hasLoaded = true;
            editingKey = null;
            editDraft = '';
            statusMessage.textContent = `Загружено задач: ${mainTaskKeys.length}`;
        } catch {
            if (version !== mainLoadVersion) return;
            showError('Не удалось загрузить задачи. Проверьте подключение и попробуйте ещё раз.');
            statusMessage.textContent = '';
            sortOrder = appliedSort;
            sortSelect.value = appliedSort;
        } finally {
            // Медленный старый ответ не заменяет результат последнего выбора.
            if (version === mainLoadVersion) {
                isLoading = false;
                renderTasks();
                if (reset && userDialog.open) openUserProfile(activeUserId, true);
            }
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
            // Всегда отправляем PATCH. Только ожидаемый 404 новой задачи
            // обрабатывается в request() локально; остальные ошибки не скрываем.
            await request(`/${task.id}`, { method: 'PATCH', body: changes, isLocal: task.isLocal });
            // DummyJSON не хранит предыдущие PATCH: применяем только отправленные
            // поля, чтобы редактирование текста не отменяло изменение checkbox.
            Object.assign(task, changes);
            if (!task.isLocal) taskChanges.set(key, { ...taskChanges.get(key), ...changes });
            if ('todo' in changes && editingKey === key) {
                editingKey = null;
                editDraft = '';
            }
            statusMessage.textContent = task.isLocal
                ? 'Запрос отправлен; изменения сохранены локально' : 'Изменения сохранены';
            if (userDialog.open) userStatus.textContent = statusMessage.textContent;
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
            // DELETE также отправляется для новых задач; их ожидаемый 404
            // разрешает удалить задачу из текущего списка.
            await request(`/${task.id}`, { method: 'DELETE', isLocal: task.isLocal });
            if (!task.isLocal) deletedKeys.add(key);
            tasks = tasks.filter(item => item.key !== key);
            mainTaskKeys = mainTaskKeys.filter(item => item !== key);
            if (editingKey === key) editingKey = null;
            statusMessage.textContent = task.isLocal
                ? 'Запрос отправлен; задача удалена локально' : 'Задача удалена';
            if (userDialog.open) userStatus.textContent = statusMessage.textContent;
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
        if (isLoading || isAdding || !usersLoaded || usersLoading) return;
        const text = addInput.value.trim();
        const userId = Number(assigneeSelect.value);
        if (!text) {
            addError.textContent = 'Введите текст новой задачи';
            addError.hidden = false;
            addInput.focus();
            return;
        }
        if (!users.has(userId)) {
            addError.textContent = 'Выберите исполнителя задачи';
            addError.hidden = false;
            assigneeSelect.focus();
            return;
        }
        isAdding = true;
        pendingRequests++;
        showError();
        addError.hidden = true;
        updateControls();
        try {
            const data = await request('/add', {
                method: 'POST', body: { todo: text, completed: completedInput.value === 'true', userId }
            });
            if (!isValidTask(data)) throw new Error('Некорректный ответ API');
            // POST может повторять серверный ID. Уникальный key отличает такие
            // задачи друг от друга; isLocal отмечает задачу, которой нет на сервере.
            const task = { ...data, key: `local-${++localSequence}`, isLocal: true };
            tasks.unshift(task);
            mainTaskKeys.unshift(task.key);
            addForm.reset();
            filter = 'all';
            authorFilter = 'all';
            authorSelect.value = 'all';
            searchQuery = '';
            searchInput.value = '';
            statusMessage.textContent = 'Задача добавлена';
            addDialog.close();
        } catch {
            addError.textContent = 'Не удалось добавить задачу. Попробуйте ещё раз.';
            addError.hidden = false;
        } finally {
            isAdding = false;
            pendingRequests--;
            renderTasks();
            if (addDialog.open) addInput.focus();
        }
    });

    filterButtons.forEach(button => {
        button.addEventListener('click', () => {
            filter = button.dataset.apiFilter;
            renderTasks();
        });
    });
    searchInput.addEventListener('input', () => {
        searchQuery = searchInput.value.trim().toLocaleLowerCase();
        renderTasks();
    });
    sortSelect.addEventListener('change', () => {
        sortOrder = sortSelect.value;
        loadTasks();
    });
    authorSelect.addEventListener('change', () => {
        authorFilter = authorSelect.value;
        renderTasks();
    });
    resetFiltersButton.addEventListener('click', () => {
        const needsReload = sortOrder !== 'default' || appliedSort !== 'default' || isLoading;
        filter = 'all';
        authorFilter = 'all';
        authorSelect.value = 'all';
        searchQuery = '';
        searchInput.value = '';
        sortOrder = 'default';
        sortSelect.value = 'default';
        if (needsReload) loadTasks();
        else renderTasks();
    });
    openAddButton.addEventListener('click', () => {
        if (!addDialog.open) addDialog.showModal();
        if (!usersLoaded) loadUsers();
        else addError.hidden = true;
        addInput.focus();
    });
    apiTab.querySelectorAll('[data-close-dialog]').forEach(button => {
        button.addEventListener('click', () => {
            const dialog = document.getElementById(button.dataset.closeDialog);
            if (dialog === addDialog && isAdding) return;
            dialog.close();
        });
    });
    addDialog.addEventListener('cancel', event => { if (isAdding) event.preventDefault(); });
    userDialog.addEventListener('close', () => {
        profileLoadVersion++;
        isProfileLoading = false;
        activeUserId = null;
        if (editingContext === 'profile') {
            editingKey = null;
            editDraft = '';
        }
        renderTasks();
        // Строки перерисовываются, поэтому возвращаем фокус на новую кнопку
        // того же исполнителя вместо уже удалённого элемента DOM.
        const trigger = profileReturnKey
            ? list.querySelector(`[data-task-key="${profileReturnKey}"] .api-user-chip`) : null;
        (trigger || openAddButton).focus({ preventScroll: true });
        profileReturnKey = null;
    });
    usersRetryButton.addEventListener('click', loadUsers);
    userRetryButton.addEventListener('click', () => openUserProfile(activeUserId, true));
    refreshButton.addEventListener('click', () => loadTasks({ reset: true }));
    apiTab.addEventListener('tab:open', () => {
        if (!hasLoaded) loadTasks();
        if (!usersLoaded) loadUsers();
    });
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
