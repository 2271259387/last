const STORAGE_KEY = 'countdown-v2-config';
const DEFAULT_CONFIG = {
    startDate: '2026-07-21',
    endDate: '2027-01-21'
};
const MAX_SPAN_MONTHS = 36;
const MS_PER_DAY = 86400000;
const weekdays = ['一', '二', '三', '四', '五', '六', '日'];

let config = loadConfig();
let monthsData = [];
let timeOffset = 0;
let timerId = null;

function parseDateInput(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || '')) return null;
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(year, month - 1, day, 0, 0, 0, 0);
    if (
        date.getFullYear() !== year ||
        date.getMonth() !== month - 1 ||
        date.getDate() !== day
    ) {
        return null;
    }
    return date;
}

function formatDateInput(date) {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
}

function formatChineseDate(date) {
    return `${date.getFullYear()} 年 ${date.getMonth() + 1} 月 ${date.getDate()} 日`;
}

function getStartDate() {
    return parseDateInput(config.startDate);
}

function getEndDate() {
    return parseDateInput(config.endDate);
}

function getDateRangeError(startValue, endValue) {
    const startDate = parseDateInput(startValue);
    const endDate = parseDateInput(endValue);

    if (!startDate || !endDate) return '请输入有效的开始日期和结束日期。';
    if (endDate <= startDate) return '结束日期必须晚于开始日期。';

    const monthSpan = (endDate.getFullYear() - startDate.getFullYear()) * 12 +
        (endDate.getMonth() - startDate.getMonth());
    const exceedsLimit = monthSpan > MAX_SPAN_MONTHS ||
        (monthSpan === MAX_SPAN_MONTHS && endDate.getDate() > startDate.getDate());
    if (exceedsLimit) return `日期跨度不能超过 ${MAX_SPAN_MONTHS} 个月。`;

    return '';
}

function normalizeConfig(value) {
    if (!value || typeof value !== 'object') return null;
    const startDate = value.startDate;
    const endDate = value.endDate;
    if (getDateRangeError(startDate, endDate)) return null;
    return { startDate, endDate };
}

function loadConfig() {
    try {
        const raw = localStorage.getItem(STORAGE_KEY);
        if (!raw) return null;
        return normalizeConfig(JSON.parse(raw));
    } catch (error) {
        console.warn('读取本地配置失败，已回退到首次设置流程。', error);
        return null;
    }
}

function saveConfig(nextConfig) {
    try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(nextConfig));
        return true;
    } catch (error) {
        console.warn('保存本地配置失败，本次设置仅在当前页面生效。', error);
        return false;
    }
}

function resetConfig() {
    config = { ...DEFAULT_CONFIG };
    saveConfig(config);
    applyConfig();
    fillModalFields(config);
}

async function syncTime() {
    try {
        const response = await fetch(window.location.href, { method: 'HEAD', cache: 'no-cache' });
        const dateStr = response.headers.get('Date');
        if (dateStr) {
            const serverTime = new Date(dateStr).getTime();
            timeOffset = serverTime - Date.now();
        } else {
            throw new Error('无Date Header');
        }
    } catch (error) {
        timeOffset = 0;
    }
}

function getNow() {
    return new Date(Date.now() + timeOffset);
}

function generateMonthsData(startDate, endDate) {
    const months = [];
    const cursor = new Date(startDate.getFullYear(), startDate.getMonth(), 1);
    const lastMonth = new Date(endDate.getFullYear(), endDate.getMonth(), 1);

    while (cursor <= lastMonth) {
        months.push({
            y: cursor.getFullYear(),
            m: cursor.getMonth(),
            label: `${cursor.getFullYear()}年${cursor.getMonth() + 1}月`
        });
        cursor.setMonth(cursor.getMonth() + 1);
    }

    return months;
}

function getGridSize(count) {
    return Math.ceil(Math.sqrt(Math.max(count, 1)));
}

function initCalendarGrid() {
    const gridEl = document.getElementById('calendar-grid');
    gridEl.innerHTML = '';

    const gridSize = getGridSize(monthsData.length);
    gridEl.style.setProperty('--grid-size', gridSize);

    monthsData.forEach((md, index) => {
        const card = document.createElement('div');
        card.className = 'month-card';
        card.style.animationDelay = `${index * 0.08}s`;

        card.innerHTML = `
            <div class="month-title">${md.label}</div>
            <div class="month-progress-container">
                <div class="month-progress" id="prog-bar-${index}"></div>
            </div>
            <div class="days-grid" id="grid-m-${index}"></div>
        `;
        gridEl.appendChild(card);
        renderMonthGrid(index, md.y, md.m);
    });
}

function renderMonthGrid(index, year, month) {
    const container = document.getElementById(`grid-m-${index}`);
    const startDate = getStartDate();
    const endDate = getEndDate();

    weekdays.forEach(wd => {
        const el = document.createElement('div');
        el.className = 'day-cell weekday';
        el.textContent = wd;
        container.appendChild(el);
    });

    const firstDay = (new Date(year, month, 1).getDay() + 6) % 7;
    const daysInMonth = new Date(year, month + 1, 0).getDate();

    for (let i = 0; i < firstDay; i++) {
        const el = document.createElement('div');
        el.className = 'day-cell day-empty';
        container.appendChild(el);
    }

    for (let d = 1; d <= daysInMonth; d++) {
        const el = document.createElement('div');
        const cellDate = new Date(year, month, d, 0, 0, 0, 0);
        el.className = 'day-cell';
        el.id = `day-${year}-${month}-${d}`;

        if (cellDate < startDate || cellDate > endDate) {
            el.classList.add('day-empty');
        } else {
            el.classList.add('day-valid');
            el.textContent = d;
        }

        container.appendChild(el);
    }
}

function updateState() {
    if (!config) return;

    const now = getNow();
    const startDate = getStartDate();
    const endDate = getEndDate();

    document.getElementById('settings-button').textContent = `距离 ${formatChineseDate(endDate)}`;

    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const hh = String(now.getHours()).padStart(2, '0');
    const min = String(now.getMinutes()).padStart(2, '0');
    const ss = String(now.getSeconds()).padStart(2, '0');
    document.getElementById('current-time-text').textContent = `${yyyy}-${mm}-${dd} ${hh}:${min}:${ss}`;

    let totalDaysLeft = Math.ceil((endDate - now) / MS_PER_DAY);
    if (totalDaysLeft < 0) totalDaysLeft = 0;
    document.getElementById('days-left').textContent = totalDaysLeft;

    const totalSpan = endDate - startDate;
    let elapsed = now - startDate;
    if (elapsed < 0) elapsed = 0;
    if (elapsed > totalSpan) elapsed = totalSpan;
    const percent = ((elapsed / totalSpan) * 100).toFixed(1);

    document.getElementById('total-progress').style.width = `${percent}%`;
    document.getElementById('total-progress-text').textContent = `${percent}%`;

    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);

    monthsData.forEach((md, index) => {
        const naturalMonthStart = new Date(md.y, md.m, 1, 0, 0, 0, 0);
        const naturalMonthEnd = new Date(md.y, md.m + 1, 0, 23, 59, 59, 999);
        const monthStart = naturalMonthStart < startDate ? startDate : naturalMonthStart;
        const monthEnd = naturalMonthEnd > endDate ? endDate : naturalMonthEnd;

        let mPercent = ((now - monthStart) / (monthEnd - monthStart)) * 100;
        if (mPercent < 0) mPercent = 0;
        if (mPercent > 100) mPercent = 100;
        document.getElementById(`prog-bar-${index}`).style.width = `${mPercent}%`;

        const daysInMonth = new Date(md.y, md.m + 1, 0).getDate();
        for (let d = 1; d <= daysInMonth; d++) {
            const el = document.getElementById(`day-${md.y}-${md.m}-${d}`);
            if (!el || el.classList.contains('day-empty')) continue;

            const cellDate = new Date(md.y, md.m, d, 0, 0, 0, 0);
            const isToday = cellDate.getTime() === todayStart.getTime();

            el.classList.remove('day-past', 'day-future', 'day-today', 'day-weekend');
            if (isToday) {
                el.classList.add('day-today');
            } else if (cellDate < todayStart) {
                el.classList.add('day-past');
            } else {
                el.classList.add('day-future');
            }

            const isWeekend = cellDate.getDay() === 0 || cellDate.getDay() === 6;
            if (isWeekend && cellDate.getTime() >= todayStart.getTime()) {
                el.classList.add('day-weekend');
            }

            const cellDateStr = formatDateInput(cellDate);
            const daysFromStart = Math.max(0, Math.ceil((cellDate - startDate) / MS_PER_DAY));
            const daysToEnd = Math.max(0, Math.ceil((endDate - cellDate) / MS_PER_DAY));
            el.title = `${cellDateStr}\n\n距离开始：\n${daysFromStart} 天\n\n距离结束：\n${daysToEnd} 天`;
        }
    });
}

function applyConfig() {
    monthsData = generateMonthsData(getStartDate(), getEndDate());
    initCalendarGrid();
    updateState();
}

function fillModalFields(value) {
    document.getElementById('start-date-input').value = value.startDate;
    document.getElementById('end-date-input').value = value.endDate;
    document.getElementById('date-error').textContent = '';
}

function openSettingsModal(isInitial = false) {
    const modal = document.getElementById('settings-modal');
    modal.dataset.initial = String(isInitial);
    fillModalFields(config || DEFAULT_CONFIG);
    modal.classList.add('is-open');
    modal.setAttribute('aria-hidden', 'false');
    document.getElementById('start-date-input').focus();
}

function closeSettingsModal() {
    const modal = document.getElementById('settings-modal');
    if (modal.dataset.initial === 'true' && !config) return;
    modal.classList.remove('is-open');
    modal.setAttribute('aria-hidden', 'true');
}

function setupModalEvents() {
    const modal = document.getElementById('settings-modal');
    const form = document.getElementById('settings-form');

    document.getElementById('settings-button').addEventListener('click', () => openSettingsModal(false));
    document.getElementById('cancel-settings').addEventListener('click', closeSettingsModal);
    document.getElementById('reset-settings').addEventListener('click', resetConfig);

    modal.addEventListener('click', event => {
        if (event.target === modal) closeSettingsModal();
    });

    document.addEventListener('keydown', event => {
        if (event.key === 'Escape' && modal.classList.contains('is-open')) closeSettingsModal();
    });

    form.addEventListener('submit', event => {
        event.preventDefault();
        const nextConfig = {
            startDate: document.getElementById('start-date-input').value,
            endDate: document.getElementById('end-date-input').value
        };
        const error = getDateRangeError(nextConfig.startDate, nextConfig.endDate);
        document.getElementById('date-error').textContent = error;
        if (error) return;

        config = nextConfig;
        const saved = saveConfig(config);
        applyConfig();
        if (!saved) {
            document.getElementById('date-error').textContent = '浏览器本地存储不可用，本次设置仅在当前页面生效。';
            return;
        }
        closeSettingsModal();
    });
}

function startTimer() {
    if (timerId) clearInterval(timerId);
    timerId = setInterval(updateState, 1000);
}

syncTime().then(() => {
    setupModalEvents();
    if (!config) {
        openSettingsModal(true);
    } else {
        applyConfig();
    }
    startTimer();
});

setInterval(syncTime, 18000000);
