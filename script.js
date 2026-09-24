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
       Создать новый <div> с классом "new-div" и текстом
       «Мен жаңа элементпін», добавить его в конец <body>
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
       Создать элемент <p> с текстом «Бұл ауыспалы абзац»,
       добавить его на страницу и повесить обработчик клика:
       при нажатии меняются color и font-size текста
    -------------------------------------------------------- */
    const changeableParagraph = document.createElement('p');
    changeableParagraph.textContent = 'Это меняемый абзац';

    const paragraphContainer = document.getElementById('changeable-paragraph-container');
    if (paragraphContainer) {
        paragraphContainer.appendChild(changeableParagraph);
    } else {
        // если контейнера нет на странице — добавляем в конец body
        document.body.appendChild(changeableParagraph);
    }

    // Обработчик клика: переключаем (toggle) изменённый вид туда-обратно
    changeableParagraph.addEventListener('click', () => {
        changeableParagraph.classList.toggle('paragraph-changed');
    });


    /* ============================================================
       ЗАДАНИЕ 2. Управление классами элементов
       ============================================================ */

    const demoElement = document.getElementById('demo-element');
    const classListOutput = document.getElementById('class-list-output');
    const toggleClassBtn = document.getElementById('toggle-class-btn');

    /* --------------------------------------------------------
       ЗАДАНИЕ 2, пункт 2
       Вывести список всех CSS-классов элемента в console.log
       и в отдельный тег <p> рядом на странице
    -------------------------------------------------------- */
    function printClassList() {
        const classesArray = Array.from(demoElement.classList);
        console.log('Классы элемента demo-element:', classesArray);
        classListOutput.textContent = 'Классы: ' + classesArray.join(', ');
    }

    if (demoElement && classListOutput) {
        printClassList(); // показать список классов сразу при загрузке
    }

    /* --------------------------------------------------------
       ЗАДАНИЕ 2, пункт 1
       Реализовать переключение класса "active":
       classList.toggle сам добавляет класс, если его нет,
       и удаляет, если он уже есть
    -------------------------------------------------------- */
    if (toggleClassBtn && demoElement) {
        toggleClassBtn.addEventListener('click', () => {
            demoElement.classList.toggle('active');
            printClassList(); // обновить вывод списка классов после переключения
        });
    }
});