/* ============================================================
   Переключение вкладок (Tabs)
   ============================================================ */
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

/* ============================================================
   ЗАДАНИЕ 1. Работа с элементами DOM
   ЗАДАНИЕ 2. Управление классами элементов
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {

    /* --------------------------------------------------------
       ЗАДАНИЕ 1, пункт 1
       Найти элемент по id="welcome-title" (изначальный текст —
       «Резюме») и по клику изменить его текст на «Сәлем, әлем!»
    -------------------------------------------------------- */
    const welcomeTitle = document.getElementById('welcome-title');
    if (welcomeTitle) {
        welcomeTitle.addEventListener('click', () => {
            welcomeTitle.textContent = 'Сәлем, әлем!';
        });
    }

    /* --------------------------------------------------------
       ЗАДАНИЕ 1, пункт 2
       По клику на кнопку создать новый <div> с классом
       "new-div" и текстом «Я новый элемент», добавить его
       в конец <body>
    -------------------------------------------------------- */
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

    /* --------------------------------------------------------
       ЗАДАНИЕ 1, пункт 3
       Найти элемент с классом "old-element" и по клику
       полностью удалить его из DOM
    -------------------------------------------------------- */
    const oldElement = document.querySelector('.old-element');
    if (oldElement) {
        oldElement.addEventListener('click', () => {
            oldElement.remove();
        });
    }

    /* --------------------------------------------------------
       ЗАДАНИЕ 1, пункт 4
       Создать элемент <p> с текстом «Это меняемый абзац»,
       добавить его на страницу и повесить обработчик клика:
       при нажатии меняются color и font-size текста (toggle)
    -------------------------------------------------------- */
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


    /* ============================================================
       ЗАДАНИЕ 2. Управление классами элементов
       ============================================================ */

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


/* ============================================================
   ЗАДАНИЕ 3. Генерация таблицы по размерам пользователя
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {

    const rowsInput = document.getElementById('table-rows-input');
    const colsInput = document.getElementById('table-cols-input');
    const generateBtn = document.getElementById('generate-table-btn');
    const tableContainer = document.getElementById('table-container');
    const coloredCountOutput = document.getElementById('colored-count-output');

    let coloredCellsCount = 0;

    /* Обновляет счётчик закрашенных ячеек на странице */
    function updateColoredCount() {
        coloredCountOutput.textContent = 'Закрашено ячеек: ' + coloredCellsCount;
    }

    /* Создаёт таблицу нужного размера и вешает клики на ячейки */
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


/* ============================================================
   ЗАДАНИЕ 4. Переключатель тёмной темы (Dark Mode)
   ============================================================ */
document.addEventListener('DOMContentLoaded', () => {

    const themeToggleBtn = document.getElementById('theme-toggle-btn');

    /* Применяет тёмную или светлую тему, переключая класс на <body> */
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