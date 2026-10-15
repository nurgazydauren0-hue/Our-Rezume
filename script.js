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
    const authorsDialog = document.getElementById('api-authors-dialog');
    const authorsList = document.getElementById('api-authors-list');
    const authorsSearch = document.getElementById('api-authors-search-input');
    const authorsError = document.getElementById('api-authors-error');
    const authorEditorDialog = document.getElementById('api-author-editor-dialog');
    const authorForm = document.getElementById('api-author-form');
    const authorError = document.getElementById('api-author-error');
    const authorSaveButton = document.getElementById('api-author-save-btn');
    const authorDeleteDialog = document.getElementById('api-author-delete-dialog');
    const authorDeleteError = document.getElementById('api-author-delete-error');
    const authorDeleteButton = document.getElementById('api-author-delete-confirm-btn');
    const assigneeAddButton = document.getElementById('api-assignee-add-btn');
    const assigneeEditButton = document.getElementById('api-assignee-edit-btn');
    const assigneeDeleteButton = document.getElementById('api-assignee-delete-btn');
    const profileAddTaskButton = document.getElementById('api-profile-add-task-btn');
    const profileEditUserButton = document.getElementById('api-profile-edit-user-btn');
    const profileDeleteUserButton = document.getElementById('api-profile-delete-user-btn');

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
    let taskEditorKey = null;
    let taskEditorContext = 'main';
    let authorEditorId = null;
    let deletingAuthorId = null;
    let authorEditorVersion = 0;
    let localUserSequence = 0;
    let isAuthorLoading = false;
    let isAuthorSaving = false;
    let isAuthorDeleting = false;
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
    const userChanges = new Map();
    const deletedUserIds = new Set();
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

    // fetch виден в DevTools → Network, в том числе для новых задач и авторов.
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
        const authorBusy = isAuthorSaving || isAuthorDeleting;
        addButton.disabled = isLoading || isAdding || !usersLoaded || usersLoading || authorBusy;
        addInput.disabled = isLoading || isAdding;
        assigneeSelect.disabled = isAdding || !usersLoaded || usersLoading || authorBusy;
        completedInput.disabled = isAdding;
        addDialog.querySelectorAll('[data-close-dialog]').forEach(button => { button.disabled = isAdding; });
        usersRetryButton.disabled = usersLoading;
        addButton.textContent = isAdding ? 'Сохранение…' : taskEditorKey ? 'Сохранить изменения' : 'Добавить задачу';
        openAddButton.disabled = isLoading || pendingRequests > 0;
        assigneeAddButton.disabled = isAdding || authorBusy || !usersLoaded;
        assigneeEditButton.disabled = assigneeDeleteButton.disabled = isAdding || authorBusy
            || !users.has(Number(assigneeSelect.value)) || pendingRequests > 0;
        profileAddTaskButton.disabled = isLoading || pendingRequests > 0 || !usersLoaded;
        profileEditUserButton.disabled = profileDeleteUserButton.disabled = pendingRequests > 0
            || isProfileLoading || !usersLoaded || !users.has(activeUserId);
        document.getElementById('api-profile-add-author-btn').disabled = pendingRequests > 0 || !usersLoaded;
        document.getElementById('api-authors-add-btn').disabled = pendingRequests > 0 || !usersLoaded;
        document.getElementById('api-authors-retry-btn').disabled = usersLoading;
        authorForm.querySelectorAll('input, select, button').forEach(control => {
            control.disabled = isAuthorLoading || isAuthorSaving;
        });
        authorEditorDialog.querySelectorAll('[data-close-dialog]').forEach(button => { button.disabled = isAuthorSaving; });
        authorSaveButton.textContent = isAuthorLoading ? 'Загрузка…' : isAuthorSaving ? 'Сохранение…'
            : authorEditorId === null ? 'Добавить автора' : 'Сохранить изменения';
        authorDeleteDialog.querySelectorAll('button').forEach(button => { button.disabled = isAuthorDeleting; });
        authorDeleteButton.textContent = isAuthorDeleting ? 'Удаление…' : 'Удалить автора';
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
            if (deletedUserIds.has(value.userId)) value.userId = null;
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
        if (userId === null || deletedUserIds.has(userId)) {
            const text = document.createElement('span');
            text.className = 'api-task-id';
            text.textContent = 'Без исполнителя';
            return text;
        }
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
        const unassigned = document.createElement('option');
        unassigned.value = '';
        unassigned.textContent = taskEditorKey ? 'Без исполнителя' : 'Выберите исполнителя';
        unassigned.disabled = !taskEditorKey;
        assigneeSelect.appendChild(unassigned);
        const allAuthors = document.createElement('option');
        allAuthors.value = 'all';
        allAuthors.textContent = 'Все авторы';
        authorSelect.replaceChildren(allAuthors);
        const withoutAuthor = document.createElement('option');
        withoutAuthor.value = 'unassigned';
        withoutAuthor.textContent = 'Без исполнителя';
        authorSelect.appendChild(withoutAuthor);
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
            assigneeSelect.value = users.has(Number(selected)) ? selected : '';
            authorSelect.value = selectedAuthor === 'unassigned' || users.has(Number(selectedAuthor)) ? selectedAuthor : 'all';
            authorFilter = authorSelect.value;
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
                data.users.forEach(mergeRemoteUser);
                usersLoaded = true;
                return true;
            } catch {
                addError.textContent = 'Не удалось загрузить пользователей. Повторите загрузку для выбора исполнителя.';
                addError.hidden = false;
                usersRetryButton.hidden = false;
                authorsError.textContent = 'Не удалось загрузить авторов. Повторите загрузку.';
                authorsError.hidden = false;
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

    function mergeRemoteUser(user) {
        if (deletedUserIds.has(user.id)) return;
        users.set(user.id, { ...users.get(user.id), ...user, ...userChanges.get(user.id) });
    }

    function renderAuthors() {
        const query = authorsSearch.value.trim().toLocaleLowerCase();
        const visible = [...users.values()]
            .filter(user => `${fullName(user)} ${user.username}`.toLocaleLowerCase().includes(query))
            .sort((a, b) => fullName(a).localeCompare(fullName(b), ['ru', 'en']));
        authorsList.replaceChildren(...visible.map(user => {
            const row = document.createElement('li');
            row.className = 'api-author-card';
            row.dataset.userId = user.id;
            const summary = document.createElement('div');
            summary.className = 'api-author-summary';
            const details = document.createElement('div');
            details.className = 'api-author-card-details';
            const name = makeButton(fullName(user), 'api-user-chip api-author-card-name',
                `Открыть профиль ${fullName(user)}`, () => openUserProfile(user.id));
            const handle = document.createElement('span');
            handle.className = 'api-author-card-meta';
            handle.textContent = `@${user.username} · ID ${user.id}${user.isLocal ? ' · новый' : ''}`;
            details.append(name, handle);
            summary.append(createAvatar(user, 'api-user-avatar'), details);
            const actions = document.createElement('div');
            actions.className = 'api-author-card-actions';
            const edit = makeButton('Изменить', 'api-edit-btn', `Изменить автора ${fullName(user)}`, () => openAuthorEditor(user.id));
            const remove = makeButton('Удалить', 'api-delete-btn', `Удалить автора ${fullName(user)}`, () => openAuthorDelete(user.id));
            edit.disabled = remove.disabled = pendingRequests > 0;
            actions.append(edit, remove);
            row.append(summary, actions);
            return row;
        }));
        document.getElementById('api-authors-empty').hidden = visible.length > 0 || usersLoading;
        document.getElementById('api-authors-status').textContent = usersLoading ? 'Загрузка авторов…'
            : `Показано авторов: ${visible.length} из ${users.size}`;
        document.getElementById('api-authors-retry-btn').hidden = usersLoaded || usersLoading;
        if (usersLoaded) authorsError.hidden = true;
    }

    // Тестовый API повторяет ID при POST; локальный ID хранится отдельно от apiId.
    function apiUserId(userId) {
        return users.get(userId)?.apiId ?? userId;
    }

    function fillAuthorForm(user = {}) {
        for (const input of authorForm.querySelectorAll('[name]')) {
            input.setCustomValidity('');
            let value = input.name.split('.').reduce((value, part) => value?.[part], user) ?? '';
            if (input.type === 'date' && value) {
                const parts = String(value).split('-');
                if (parts.length === 3) value = `${parts[0]}-${parts[1].padStart(2, '0')}-${parts[2].padStart(2, '0')}`;
            }
            if (input.tagName === 'SELECT' && ![...input.options].some(option => option.value === String(value))) {
                const option = document.createElement('option');
                option.value = value;
                option.textContent = value;
                input.appendChild(option);
            }
            input.value = value;
        }
    }

    async function openAuthorEditor(userId = null) {
        if (pendingRequests > 0 || !usersLoaded || (userId !== null && !users.has(userId))) return;
        authorEditorId = userId;
        const version = ++authorEditorVersion;
        authorError.hidden = true;
        authorForm.reset();
        fillAuthorForm(userId === null ? {} : users.get(userId));
        document.getElementById('api-author-editor-title').textContent = userId === null ? 'Новый автор' : 'Изменить автора';
        if (!authorEditorDialog.open) authorEditorDialog.showModal();
        isAuthorLoading = userId !== null && !fullProfiles.has(userId);
        updateControls();
        if (isAuthorLoading) {
            try {
                const user = await request(`/${apiUserId(userId)}`, { baseUrl: usersUrl });
                if (version !== authorEditorVersion || !authorEditorDialog.open) return;
                if (user?.id !== userId || typeof user.username !== 'string') throw new Error('Некорректный профиль');
                mergeRemoteUser(user);
                fullProfiles.add(userId);
                fillAuthorForm(users.get(userId));
                renderAssignees();
                renderTasks();
            } catch {
                if (version !== authorEditorVersion || !authorEditorDialog.open) return;
                authorError.textContent = 'Полный профиль не загружен. Закройте окно и повторите изменение автора.';
                authorError.hidden = false;
                // Не отправляем пустые значения вместо ещё не загруженных полей.
                return;
            } finally {
                if (version === authorEditorVersion && authorError.hidden) isAuthorLoading = false;
                updateControls();
            }
        }
        if (version === authorEditorVersion) authorForm.elements.namedItem('firstName').focus();
    }

    function openAuthorDelete(userId) {
        if (pendingRequests > 0 || !users.has(userId)) return;
        deletingAuthorId = userId;
        document.getElementById('api-author-delete-name').textContent = fullName(users.get(userId));
        authorDeleteError.hidden = true;
        if (!authorDeleteDialog.open) authorDeleteDialog.showModal();
        updateControls();
    }

    function openTaskEditor(key = null, context = 'main', userId = null) {
        if (isLoading || pendingRequests > 0) return;
        const task = key === null ? null : tasks.find(item => item.key === key);
        if (key !== null && !task) return;
        taskEditorKey = key;
        taskEditorContext = context;
        addForm.reset();
        renderAssignees();
        addError.hidden = true;
        document.getElementById('api-add-title').textContent = task ? 'Изменить задачу' : 'Новая задача';
        addDialog.querySelector('.api-dialog-close').setAttribute('aria-label', 'Закрыть форму задачи');
        addInput.value = task?.todo || '';
        completedInput.value = String(task?.completed ?? (filter === 'completed'));
        const selectedId = task ? task.userId : userId ?? (users.has(Number(authorFilter)) ? Number(authorFilter) : null);
        assigneeSelect.value = users.has(selectedId) ? String(selectedId) : task ? '' : String(users.keys().next().value ?? '');
        if (!addDialog.open) addDialog.showModal();
        if (!usersLoaded) loadUsers();
        updateControls();
        addInput.focus();
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
        if (!Number.isInteger(userId) || userId < 1 || deletedUserIds.has(userId)) return;
        activeUserId = userId;
        if (!userDialog.open) {
            profileReturnKey = document.activeElement?.closest('.api-row')?.dataset.taskKey || null;
            userDialog.showModal();
        }
        userError.hidden = true;
        userRetryButton.hidden = true;
        const version = ++profileLoadVersion;
        const generation = dataGeneration;
        if (users.get(userId)?.isLocal || (!force && fullProfiles.has(userId) && userTaskKeys.has(userId))) {
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
            mergeRemoteUser(profile.value);
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
        const busy = isLoading || pendingKeys.has(task.key) || isAuthorSaving || isAuthorDeleting || isAdding;
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

        {
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
                showError();
                openTaskEditor(task.key, context);
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
            && (authorFilter === 'all' || (authorFilter === 'unassigned'
                ? task.userId === null : task.userId === Number(authorFilter)))));
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
        if (authorsDialog.open) renderAuthors();
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
        if (!task || isLoading || pendingKeys.has(key) || isAuthorSaving || isAuthorDeleting) return false;
        pendingKeys.add(key);
        pendingRequests++;
        showError();
        renderTasks();
        try {
            // Всегда отправляем PATCH. Только ожидаемый 404 новой задачи
            // обрабатывается в request() локально; остальные ошибки не скрываем.
            const body = { ...changes };
            if ('userId' in body) body.userId = apiUserId(body.userId);
            await request(`/${task.id}`, { method: 'PATCH', body, isLocal: task.isLocal });
            // DummyJSON не хранит предыдущие PATCH: применяем только отправленные
            // поля, чтобы редактирование текста не отменяло изменение checkbox.
            Object.assign(task, changes);
            if (!task.isLocal) taskChanges.set(key, { ...taskChanges.get(key), ...changes });
            statusMessage.textContent = task.isLocal
                ? 'Запрос отправлен; изменения сохранены локально' : 'Изменения сохранены';
            if (userDialog.open) userStatus.textContent = statusMessage.textContent;
            return true;
        } catch {
            showError('Не удалось изменить задачу. Попробуйте ещё раз.');
            return false;
        } finally {
            pendingKeys.delete(key);
            pendingRequests--;
            renderTasks();
        }
    }

    async function deleteTask(key) {
        const task = tasks.find(item => item.key === key);
        if (!task || isLoading || pendingKeys.has(key) || isAuthorSaving || isAuthorDeleting || isAdding) return;
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
        if (isLoading || isAdding || !usersLoaded || usersLoading || isAuthorSaving || isAuthorDeleting) return;
        const text = addInput.value.trim();
        const userId = assigneeSelect.value ? Number(assigneeSelect.value) : null;
        if (!text) {
            addError.textContent = 'Введите текст новой задачи';
            addError.hidden = false;
            addInput.focus();
            return;
        }
        if (!users.has(userId) && !(taskEditorKey && userId === null)) {
            addError.textContent = 'Выберите исполнителя задачи';
            addError.hidden = false;
            assigneeSelect.focus();
            return;
        }
        isAdding = true;
        showError();
        addError.hidden = true;
        renderTasks();
        if (taskEditorKey) {
            try {
                const saved = await updateTask(taskEditorKey, { todo: text, userId, completed: completedInput.value === 'true' });
                if (saved) addDialog.close();
                else {
                    addError.textContent = 'Не удалось изменить задачу. Попробуйте ещё раз.';
                    addError.hidden = false;
                }
            } finally {
                isAdding = false;
                renderTasks();
                if (addDialog.open) addInput.focus();
            }
            return;
        }
        pendingRequests++;
        updateControls();
        try {
            const data = await request('/add', {
                method: 'POST', body: { todo: text, completed: completedInput.value === 'true', userId: apiUserId(userId) }
            });
            if (!isValidTask(data)) throw new Error('Некорректный ответ API');
            // POST может повторять серверный ID. Уникальный key отличает такие
            // задачи друг от друга; isLocal отмечает задачу, которой нет на сервере.
            const task = { ...data, todo: text, userId, completed: completedInput.value === 'true',
                key: `local-${++localSequence}`, isLocal: true };
            tasks.unshift(task);
            mainTaskKeys.unshift(task.key);
            addForm.reset();
            filter = 'all';
            authorFilter = 'all';
            authorSelect.value = 'all';
            searchQuery = '';
            searchInput.value = '';
            statusMessage.textContent = 'Задача добавлена';
            if (userDialog.open) userStatus.textContent = 'Задача добавлена';
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

    authorForm.addEventListener('submit', async event => {
        event.preventDefault();
        if (isAuthorLoading || isAuthorSaving || pendingRequests > 0) return;
        const changes = {};
        for (const input of authorForm.querySelectorAll('[name]')) {
            const value = input.value.trim();
            input.setCustomValidity('');
            if (input.required && !value) {
                input.setCustomValidity('Заполните это поле');
                input.reportValidity();
                return;
            }
            const parts = input.name.split('.');
            const target = parts.length === 1 ? changes : (changes[parts[0]] ||= { ...users.get(authorEditorId)?.[parts[0]] });
            target[parts.at(-1)] = input.type === 'number' ? value === '' ? null : Number(value) : value;
        }
        changes.username = changes.username.replace(/^@+/, '');
        if (!changes.username || /\s/.test(changes.username)) {
            authorError.textContent = 'Укажите username без пробелов.';
            authorError.hidden = false;
            return;
        }
        if ([...users.values()].some(user => user.id !== authorEditorId
            && user.username.toLocaleLowerCase() === changes.username.toLocaleLowerCase())) {
            authorError.textContent = 'Этот username уже занят другим автором.';
            authorError.hidden = false;
            return;
        }
        isAuthorSaving = true;
        pendingRequests++;
        authorError.hidden = true;
        renderTasks();
        try {
            const existing = users.get(authorEditorId);
            const data = await request(existing ? `/${apiUserId(existing.id)}` : '/add', {
                baseUrl: usersUrl, method: existing ? 'PATCH' : 'POST', body: changes, isLocal: existing?.isLocal
            });
            let savedId = authorEditorId;
            if (existing) {
                users.set(savedId, { ...existing, ...changes });
                if (!existing.isLocal) userChanges.set(savedId, { ...userChanges.get(savedId), ...changes });
            } else {
                if (!Number.isInteger(data?.id) || data.id < 1) throw new Error('Некорректный ответ API');
                localUserSequence = Math.max(localUserSequence + 1, data.id, ...users.keys(), ...deletedUserIds);
                while (users.has(localUserSequence) || deletedUserIds.has(localUserSequence)) localUserSequence++;
                savedId = localUserSequence;
                users.set(savedId, { ...changes, id: savedId, apiId: data.id, isLocal: true });
                userTaskKeys.set(savedId, []);
            }
            fullProfiles.add(savedId);
            renderAssignees();
            if (addDialog.open) assigneeSelect.value = String(savedId);
            const message = existing ? 'Автор изменён' : 'Автор добавлен';
            statusMessage.textContent = message;
            userStatus.textContent = message;
            authorEditorDialog.close();
        } catch {
            authorError.textContent = 'Не удалось сохранить автора. Попробуйте ещё раз.';
            authorError.hidden = false;
        } finally {
            isAuthorSaving = false;
            pendingRequests--;
            renderTasks();
        }
    });
    authorForm.addEventListener('input', event => { event.target.setCustomValidity?.(''); });

    authorDeleteButton.addEventListener('click', async () => {
        const user = users.get(deletingAuthorId);
        if (!user || pendingRequests > 0) return;
        isAuthorDeleting = true;
        pendingRequests++;
        authorDeleteError.hidden = true;
        renderTasks();
        try {
            await request(`/${apiUserId(user.id)}`, { baseUrl: usersUrl, method: 'DELETE', isLocal: user.isLocal });
            deletedUserIds.add(user.id);
            users.delete(user.id);
            fullProfiles.delete(user.id);
            userTaskKeys.delete(user.id);
            userChanges.delete(user.id);
            // Удаление автора не удаляет задачи. Накладка применяется и к будущим GET.
            tasks.filter(task => task.userId === user.id).forEach(task => {
                task.userId = null;
                if (!task.isLocal) taskChanges.set(task.key, { ...taskChanges.get(task.key), userId: null });
            });
            if (authorFilter === String(user.id)) authorFilter = 'all';
            renderAssignees();
            if (activeUserId === user.id) userDialog.close();
            statusMessage.textContent = 'Автор удалён. Его задачи сохранены без исполнителя.';
            authorDeleteDialog.close();
        } catch {
            authorDeleteError.textContent = 'Не удалось удалить автора. Попробуйте ещё раз.';
            authorDeleteError.hidden = false;
        } finally {
            isAuthorDeleting = false;
            pendingRequests--;
            renderTasks();
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
    openAddButton.addEventListener('click', () => openTaskEditor());
    profileAddTaskButton.addEventListener('click', () => openTaskEditor(null, 'profile', activeUserId));
    assigneeSelect.addEventListener('change', updateControls);
    assigneeAddButton.addEventListener('click', () => openAuthorEditor());
    assigneeEditButton.addEventListener('click', () => openAuthorEditor(Number(assigneeSelect.value)));
    assigneeDeleteButton.addEventListener('click', () => openAuthorDelete(Number(assigneeSelect.value)));
    profileEditUserButton.addEventListener('click', () => openAuthorEditor(activeUserId));
    profileDeleteUserButton.addEventListener('click', () => openAuthorDelete(activeUserId));
    document.getElementById('api-profile-add-author-btn').addEventListener('click', () => openAuthorEditor());
    document.getElementById('api-authors-add-btn').addEventListener('click', () => openAuthorEditor());
    document.getElementById('api-open-authors-btn').addEventListener('click', () => {
        if (!authorsDialog.open) authorsDialog.showModal();
        if (!usersLoaded) loadUsers();
        renderAuthors();
        updateControls();
        authorsSearch.focus();
    });
    authorsSearch.addEventListener('input', renderAuthors);
    document.getElementById('api-authors-retry-btn').addEventListener('click', loadUsers);
    apiTab.querySelectorAll('[data-close-dialog]').forEach(button => {
        button.addEventListener('click', () => {
            const dialog = document.getElementById(button.dataset.closeDialog);
            if (dialog === addDialog && isAdding) return;
            if (dialog === authorEditorDialog && isAuthorSaving) return;
            if (dialog === authorDeleteDialog && isAuthorDeleting) return;
            dialog.close();
        });
    });
    addDialog.addEventListener('cancel', event => { if (isAdding) event.preventDefault(); });
    authorEditorDialog.addEventListener('cancel', event => { if (isAuthorSaving) event.preventDefault(); });
    authorDeleteDialog.addEventListener('cancel', event => { if (isAuthorDeleting) event.preventDefault(); });
    function focusParentDialog(fallback = openAddButton) {
        const parent = addDialog.open ? assigneeSelect : userDialog.open ? profileEditUserButton
            : authorsDialog.open ? authorsSearch : fallback;
        parent?.focus({ preventScroll: true });
    }
    addDialog.addEventListener('close', () => {
        const key = taskEditorKey;
        const context = taskEditorContext;
        taskEditorKey = null;
        const container = context === 'profile' && userDialog.open ? userList : list;
        const trigger = key ? container.querySelector(`[data-task-key="${key}"] .api-edit-btn`) : null;
        if (userDialog.open) (trigger || profileAddTaskButton).focus({ preventScroll: true });
        else focusParentDialog(trigger || openAddButton);
    });
    authorEditorDialog.addEventListener('close', () => {
        authorEditorVersion++;
        isAuthorLoading = false;
        authorEditorId = null;
        updateControls();
        focusParentDialog();
    });
    authorDeleteDialog.addEventListener('close', () => {
        deletingAuthorId = null;
        focusParentDialog();
    });
    userDialog.addEventListener('close', () => {
        profileLoadVersion++;
        isProfileLoading = false;
        activeUserId = null;
        renderTasks();
        // Строки перерисовываются, поэтому возвращаем фокус на новую кнопку
        // того же исполнителя вместо уже удалённого элемента DOM.
        const trigger = profileReturnKey
            ? list.querySelector(`[data-task-key="${profileReturnKey}"] .api-user-chip`) : null;
        focusParentDialog(trigger || openAddButton);
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
