// --- 全局变量 ---
const totalApps = 7;
let iconPresets = [];
let fontPresets = [];
let wallpaperPresets = [];
let apiPresets = [];

// 世界书数据 (全局共享)
let worldbookEntries = [];
let worldbookGroups = [];
let currentEditingId = null;

// 总结专用世界书选择
let tempSummaryWbIds = [];

let pendingDeleteType = ''; 
let pendingDeleteIndex = -1;
let pendingSaveType = '';

let dragItem = null;
let dragGhost = null;
let dragStartX = 0;
let dragStartY = 0;
let longPressTimer = null;
let isDragging = false;

// 手机仿真器相关全局变量
let wcActiveSimChatId = null; // 当前正在查看的模拟对话ID
let currentPhoneContact = null; // 当前正在查看的通讯录联系人

// --- IndexedDB 封装 (iOS Theme) ---
const idb = {
    dbName: 'iOSThemeStudioDB',
    storeName: 'settings',
    version: 1,
    db: null,

    async open() {
        if (this.db) return this.db;
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(this.dbName, this.version);
            request.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains(this.storeName)) {
                    db.createObjectStore(this.storeName);
                }
            };
            request.onsuccess = (e) => {
                this.db = e.target.result;
                resolve(this.db);
            };
            request.onerror = (e) => reject(e);
        });
    },

    async get(key) {
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async set(key, value) {
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.put(value, key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },

    async clear() {
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readwrite');
            const store = tx.objectStore(this.storeName);
            const req = store.clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },
    
    async getAllKeys() {
        await this.open();
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(this.storeName, 'readonly');
            const store = tx.objectStore(this.storeName);
            const req = store.getAllKeys();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    }
};

// --- 初始化 ---
window.onload = async function() {
    initGrid(); 
    loadAllData(); // 加载 IndexedDB 数据
    startClock();

    // 初始化 WeChat DB
    try {
        await wcDb.init();
        await wcLoadData();
        wcRenderAll();
        wcSwitchTab('chat');
    } catch (e) {
        console.error("WeChat DB Init failed", e);
    }
    
    // WeChat 全局点击隐藏菜单
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.wc-bubble') && !e.target.closest('#wc-context-menu')) {
            wcHideContextMenu();
        }
    });

    const bgFileInput = document.getElementById('bgFileInput');
    if (bgFileInput) {
        bgFileInput.addEventListener('change', function(e) {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = function(evt) {
                    const url = evt.target.result;
                    document.getElementById('mainScreen').style.backgroundImage = `url('${url}')`;
                    saveThemeSettings();
                    addWallpaperToGrid(url);
                };
                reader.readAsDataURL(file);
            }
        });
    }

    // 修复：通用输入框确认按钮事件绑定
    const generalConfirmBtn = document.getElementById('wc-general-input-confirm');
    if (generalConfirmBtn) {
        generalConfirmBtn.onclick = function() {
            const val = document.getElementById('wc-general-input-field').value;
            if (wcState.generalInputCallback) {
                wcState.generalInputCallback(val);
            }
            wcCloseModal('wc-modal-general-input');
        };
    }
};

// --- 数据加载逻辑 (异步) ---
async function loadAllData() {
    try {
        // 1. 加载小组件数据
        const widgetData = await idb.get('ios_theme_widget') || {};
        if (widgetData.bg) document.getElementById('mainWidget').style.backgroundImage = widgetData.bg;
        if (widgetData.avatar) {
            const av = document.getElementById('widgetAvatar');
            av.style.backgroundImage = widgetData.avatar;
            av.style.backgroundSize = 'cover';
        }
        if (widgetData.text) document.getElementById('widgetText').innerText = widgetData.text;

        // 2. 加载 Apple ID 数据
        const appleData = await idb.get('ios_theme_apple') || {};
        if (appleData.avatar) {
            const av = document.getElementById('appleIdAvatar');
            const avDetail = document.getElementById('appleIdDetailAvatar');
            av.style.backgroundImage = appleData.avatar;
            av.style.backgroundSize = 'cover';
            av.innerText = '';
            avDetail.style.backgroundImage = appleData.avatar;
            avDetail.style.backgroundSize = 'cover';
            avDetail.innerText = '';
        }
        if (appleData.name) {
            document.getElementById('appleIdName').innerText = appleData.name;
            document.getElementById('appleIdDetailName').innerText = appleData.name;
        }

        // 3. 加载世界书数据
        worldbookEntries = JSON.parse(await idb.get('ios_theme_wb_entries') || '[]');
        worldbookGroups = JSON.parse(await idb.get('ios_theme_wb_groups') || '[]');

        // 4. 加载主题设置 (壁纸、字体)
        const themeData = await idb.get('ios_theme_settings') || {};
        if (themeData.wallpaper) document.getElementById('mainScreen').style.backgroundImage = themeData.wallpaper;
        if (themeData.fontSize) {
            changeFontSize(themeData.fontSize);
            document.getElementById('fontSizeSlider').value = themeData.fontSize;
        }
        if (themeData.fontUrl) {
            document.getElementById('fontUrlInput').value = themeData.fontUrl;
            applyFont(themeData.fontUrl);
        }

        // 5. 加载 App 布局
        const appsData = JSON.parse(await idb.get('ios_theme_apps') || '[]');
        appsData.forEach(app => {
            const nameEl = document.getElementById(`name-${app.id}`);
            const iconEl = document.getElementById(`icon-${app.id}`);
            if (nameEl) nameEl.innerText = app.name;
            if (iconEl && app.iconBg) {
                iconEl.style.backgroundImage = app.iconBg;
                iconEl.style.backgroundColor = 'transparent';
            }
        });

        // 6. 加载预设
        const presets = await idb.get('ios_theme_presets') || {};
        iconPresets = presets.icons || [];
        fontPresets = presets.fonts || [];
        wallpaperPresets = presets.wallpapers || [];
        apiPresets = presets.apis || [];

        // 7. 加载 API 设置
        const apiConfig = await idb.get('ios_theme_api_config') || {};
        if (apiConfig.baseUrl) document.getElementById('apiBaseUrl').value = apiConfig.baseUrl;
        if (apiConfig.key) document.getElementById('apiKey').value = apiConfig.key;
        if (apiConfig.temp) {
            document.getElementById('tempSlider').value = apiConfig.temp;
            document.getElementById('tempDisplay').innerText = apiConfig.temp;
        }
        if (apiConfig.model) {
             const select = document.getElementById('modelSelect');
             if (select.options.length <= 1) {
                 const opt = document.createElement('option');
                 opt.value = apiConfig.model;
                 opt.innerText = apiConfig.model + " (已保存)";
                 opt.selected = true;
                 select.appendChild(opt);
             }
        }

        // 渲染列表
        renderAppEditors();
        renderWallpaperGrid();
        renderIconPresets();
        renderFontPresets();
        renderApiPresets();

    } catch (e) {
        console.error("IndexedDB Load Error:", e);
    }
}

// --- 数据保存逻辑 ---
async function saveWidgetData() {
    const data = {
        bg: document.getElementById('mainWidget').style.backgroundImage,
        avatar: document.getElementById('widgetAvatar').style.backgroundImage,
        text: document.getElementById('widgetText').innerText
    };
    await idb.set('ios_theme_widget', data);
}

async function saveAppleData() {
    const data = {
        avatar: document.getElementById('appleIdAvatar').style.backgroundImage,
        name: document.getElementById('appleIdName').innerText
    };
    await idb.set('ios_theme_apple', data);
}

async function saveWorldbookData() {
    await idb.set('ios_theme_wb_entries', JSON.stringify(worldbookEntries));
    await idb.set('ios_theme_wb_groups', JSON.stringify(worldbookGroups));
}

async function saveThemeSettings() {
    const data = {
        wallpaper: document.getElementById('mainScreen').style.backgroundImage,
        fontSize: document.getElementById('fontSizeSlider').value,
        fontUrl: document.getElementById('fontUrlInput').value
    };
    await idb.set('ios_theme_settings', data);
}

async function saveAppsData() {
    const apps = [];
    for (let i = 0; i < totalApps; i++) {
        const iconElem = document.getElementById(`icon-${i}`);
        let bg = window.getComputedStyle(iconElem).backgroundImage;
        if (bg === 'none') bg = '';
        apps.push({
            id: i,
            name: document.getElementById(`name-${i}`).innerText,
            iconBg: bg
        });
    }
    await idb.set('ios_theme_apps', JSON.stringify(apps));
}

async function savePresetsData() {
    const data = {
        icons: iconPresets,
        fonts: fontPresets,
        wallpapers: wallpaperPresets,
        apis: apiPresets
    };
    await idb.set('ios_theme_presets', data);
}

// --- Apple ID 交互 ---
function openAppleIdSettings() { document.getElementById('appleIdSettingsModal').classList.add('open'); }
function closeAppleIdSettings() { document.getElementById('appleIdSettingsModal').classList.remove('open'); }

// 存储分析弹窗逻辑
function openStorageAnalysis() { document.getElementById('storageModalOverlay').classList.add('active'); analyzeStorage(); }
function closeStorageModal() { document.getElementById('storageModalOverlay').classList.remove('active'); }

async function analyzeStorage() {
    const keys = {
        '世界书': ['ios_theme_wb_entries', 'ios_theme_wb_groups'],
        '图片/媒体': ['ios_theme_widget', 'ios_theme_apple', 'ios_theme_apps'],
        '预设库': ['ios_theme_presets'],
        '系统设置': ['ios_theme_settings', 'ios_theme_api_config']
    };
    const colors = { '世界书': '#007aff', '图片/媒体': '#ff9500', '预设库': '#34c759', '系统设置': '#8e8e93' };
    let usage = {};
    let totalBytes = 0;

    for (let category in keys) {
        usage[category] = 0;
        for (let key of keys[category]) {
            const val = await idb.get(key);
            if (val) {
                const str = typeof val === 'string' ? val : JSON.stringify(val);
                usage[category] += str.length;
            }
        }
        totalBytes += usage[category];
    }

    const canvas = document.getElementById('storageChart');
    const ctx = canvas.getContext('2d');
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const radius = 140;
    const lineWidth = 40;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.lineWidth = lineWidth;
    ctx.lineCap = 'round';

    let startAngle = 0;
    if (totalBytes === 0) {
        ctx.beginPath(); ctx.strokeStyle = '#e5e5ea'; ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI); ctx.stroke();
    } else {
        for (let category in usage) {
            if (usage[category] > 0) {
                const sliceAngle = (usage[category] / totalBytes) * 2 * Math.PI;
                ctx.beginPath(); ctx.strokeStyle = colors[category]; ctx.arc(centerX, centerY, radius, startAngle, startAngle + sliceAngle); ctx.stroke();
                startAngle += sliceAngle;
            }
        }
    }

    const totalKB = (totalBytes / 1024).toFixed(2);
    document.getElementById('storageTotal').innerText = totalKB + ' KB';
    const legend = document.getElementById('storageLegend');
    legend.innerHTML = '';
    for (let category in usage) {
        const kb = (usage[category] / 1024).toFixed(2);
        const item = document.createElement('div');
        item.className = 'legend-item';
        item.innerHTML = `<div class="legend-color" style="background:${colors[category]}"></div><div class="legend-name">${category}</div><div class="legend-value">${kb} KB</div>`;
        legend.appendChild(item);
    }
}

async function exportData() {
    const data = {};
    const keys = await idb.getAllKeys();
    for (let key of keys) {
        if (key.startsWith('ios_theme_')) {
            data[key] = await idb.get(key);
        }
    }
    const exportObj = { signature: 'ios_theme_studio_backup', timestamp: Date.now(), data: data };
    const blob = new Blob([JSON.stringify(exportObj)], {type: 'application/json'});
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ios_theme_backup_${new Date().toISOString().slice(0,10)}.json`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a); URL.revokeObjectURL(url);
}

function importData(input) {
    const file = input.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async function(e) {
        try {
            const json = JSON.parse(e.target.result);
            if (json.signature !== 'ios_theme_studio_backup') return alert("导入失败：文件格式不正确。");
            if (confirm("这将覆盖当前所有数据，确定要恢复吗？")) {
                const data = json.data;
                for (let key in data) await idb.set(key, data[key]);
                alert("数据恢复成功，页面将刷新。");
                location.reload();
            }
        } catch (err) { alert("导入失败：文件损坏。"); }
    };
    reader.readAsText(file);
    input.value = '';
}

async function clearAllData() {
    if (confirm("警告：此操作将永久删除所有数据！确定要继续吗？")) {
        if (confirm("再次确认：真的要清空所有数据吗？")) {
            await idb.clear();
            alert("数据已清空，页面将重置。");
            location.reload();
        }
    }
}

// --- 时钟与小组件 ---
function startClock() {
    function update() {
        const now = new Date();
        const hours = String(now.getHours()).padStart(2, '0');
        const minutes = String(now.getMinutes()).padStart(2, '0');
        const year = now.getFullYear();
        const month = now.getMonth() + 1;
        const day = now.getDate();
        document.getElementById('widgetTime').innerText = `${hours}:${minutes}`;
        document.getElementById('widgetDate').innerText = `${year}/${month}/${day}`;
    }
    update();
    setInterval(update, 1000);
}

function triggerWidgetBgUpload() { document.getElementById('widgetBgInput').click(); }
function handleWidgetBgUpload(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) { 
            document.getElementById('mainWidget').style.backgroundImage = `url('${e.target.result}')`; 
            saveWidgetData(); 
        };
        reader.readAsDataURL(file);
    }
}
function triggerAvatarUpload() { document.getElementById('widgetAvatarInput').click(); }
function handleWidgetAvatarUpload(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) { 
            const avatar = document.getElementById('widgetAvatar');
            avatar.style.backgroundImage = `url('${e.target.result}')`; 
            avatar.style.backgroundSize = 'cover';
            saveWidgetData(); 
        };
        reader.readAsDataURL(file);
    }
}
function editWidgetText() {
    openTextEditModal("编辑签名", "请输入要显示的文本内容", document.getElementById('widgetText').innerText, (val) => {
        if(val) {
            document.getElementById('widgetText').innerText = val;
            saveWidgetData(); 
        }
    });
}

// --- Apple ID 交互 ---
function triggerAppleAvatarUpload() { document.getElementById('appleAvatarInput').click(); }
function handleAppleAvatarUpload(input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) { 
            const bg = `url('${e.target.result}')`;
            document.getElementById('appleIdAvatar').style.backgroundImage = bg; 
            document.getElementById('appleIdAvatar').innerText = ''; 
            document.getElementById('appleIdAvatar').style.backgroundSize = 'cover';
            document.getElementById('appleIdDetailAvatar').style.backgroundImage = bg;
            document.getElementById('appleIdDetailAvatar').innerText = '';
            document.getElementById('appleIdDetailAvatar').style.backgroundSize = 'cover';
            saveAppleData(); 
        };
        reader.readAsDataURL(file);
    }
}
function editAppleIdText() {
    const nameElem = document.getElementById('appleIdName');
    openTextEditModal("编辑 Apple ID", "请输入显示的名称", nameElem.innerText, (val) => {
        if(val) {
            nameElem.innerText = val;
            document.getElementById('appleIdDetailName').innerText = val;
            saveAppleData(); 
        }
    });
}

// --- 恢复默认 ---
function resetWallpaper() {
    document.getElementById('mainScreen').style.backgroundImage = '';
    document.getElementById('bgUrlInput').value = '';
    saveThemeSettings(); 
}
function resetIcons() {
    const defaultNames = ['App 1', 'App 2', 'App 3', 'App 4', 'Theme', 'Settings', '世界书'];
    for (let i = 0; i < totalApps; i++) {
        const iconDiv = document.getElementById(`icon-${i}`);
        const nameDiv = document.getElementById(`name-${i}`);
        iconDiv.style.backgroundImage = '';
        iconDiv.style.backgroundColor = '#f0f0f0';
        nameDiv.innerText = defaultNames[i];
    }
    renderAppEditors();
    saveAppsData(); 
}
function resetFonts() {
    document.getElementById('dynamic-font-style').textContent = '';
    changeFontSize(11);
    document.getElementById('fontSizeSlider').value = 11;
    document.getElementById('fontUrlInput').value = '';
    saveThemeSettings(); 
}

// --- 网格与拖拽 ---
function initGrid() {
    const grid = document.getElementById('homeGrid');
    if (!grid) return; 

    for (let i = 8; i < 28; i++) {
        const cell = document.createElement('div');
        cell.className = 'grid-cell';
        cell.dataset.index = i;
        grid.appendChild(cell);
    }
    const appsData = [
        { id: 'app-0', iconId: 'icon-0', nameId: 'name-0', name: 'App 1' },
        { id: 'app-1', iconId: 'icon-1', nameId: 'name-1', name: 'App 2' },
        { id: 'app-2', iconId: 'icon-2', nameId: 'name-2', name: 'App 3' },
        { id: 'app-3', iconId: 'icon-3', nameId: 'name-3', name: 'App 4' }
    ];
    const cells = Array.from(grid.children).slice(1); 
    appsData.forEach((data, index) => {
        if (cells[index]) {
            const appDiv = document.createElement('div');
            appDiv.className = 'app-item';
            appDiv.id = data.id;
            appDiv.innerHTML = `<div class="app-icon" id="${data.iconId}"></div><div class="app-name" id="${data.nameId}">${data.name}</div>`;
            addDragListeners(appDiv);
            
            // 为 App 1 添加点击打开 WeChat 的事件
            if (data.id === 'app-0') {
                appDiv.addEventListener('click', (e) => {
                    if (!isDragging) openWechat();
                });
            }
            
            cells[index].appendChild(appDiv);
        }
    });
}

function addDragListeners(el) {
    el.addEventListener('touchstart', handleDragStart, { passive: false });
    el.addEventListener('touchmove', handleDragMove, { passive: false });
    el.addEventListener('touchend', handleDragEnd);
    el.addEventListener('mousedown', handleDragStart);
}

function handleDragStart(e) {
    if (e.target.closest('.settings-modal')) return;
    const touch = e.touches ? e.touches[0] : e;
    dragStartX = touch.clientX;
    dragStartY = touch.clientY;
    const targetApp = e.currentTarget;

    longPressTimer = setTimeout(() => {
        isDragging = true;
        dragItem = targetApp;
        dragGhost = targetApp.cloneNode(true);
        dragGhost.classList.add('app-ghost');
        document.body.appendChild(dragGhost);
        updateGhostPosition(touch.clientX, touch.clientY);
        targetApp.classList.add('dragging');
        if (navigator.vibrate) navigator.vibrate(50);
    }, 500);
}

function handleDragMove(e) {
    if (!longPressTimer) return;
    const touch = e.touches ? e.touches[0] : e;
    if (!isDragging) {
        const moveX = Math.abs(touch.clientX - dragStartX);
        const moveY = Math.abs(touch.clientY - dragStartY);
        if (moveX > 10 || moveY > 10) {
            clearTimeout(longPressTimer);
            longPressTimer = null;
        }
    } else {
        e.preventDefault();
        updateGhostPosition(touch.clientX, touch.clientY);
    }
}

function handleDragEnd(e) {
    clearTimeout(longPressTimer);
    longPressTimer = null;
    if (isDragging && dragItem) {
        const touch = e.changedTouches ? e.changedTouches[0] : e;
        dragGhost.style.display = 'none';
        const elemBelow = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetCell = elemBelow ? elemBelow.closest('.grid-cell') : null;
        if (targetCell && !targetCell.classList.contains('widget-item')) {
            const existingApp = targetCell.querySelector('.app-item');
            const originalCell = dragItem.parentElement;
            if (existingApp && existingApp !== dragItem) {
                originalCell.appendChild(existingApp);
                targetCell.appendChild(dragItem);
            } else {
                targetCell.appendChild(dragItem);
            }
        }
        dragItem.classList.remove('dragging');
        if (dragGhost) dragGhost.remove();
        dragGhost = null;
        dragItem = null;
        setTimeout(() => { isDragging = false; }, 50);
    }
    document.removeEventListener('mousemove', handleDragMove);
    document.removeEventListener('mouseup', handleDragEnd);
}

document.addEventListener('mousedown', function(e) {
    if(e.target.closest('.app-item')) {
        document.addEventListener('mousemove', handleDragMove);
        document.addEventListener('mouseup', handleDragEnd);
    }
});

function updateGhostPosition(x, y) {
    if (dragGhost) {
        dragGhost.style.left = (x - 35) + 'px';
        dragGhost.style.top = (y - 35) + 'px';
    }
}

// --- 界面交互 ---
function switchTab(tabName, element) {
    document.querySelectorAll('.tab-content').forEach(el => el.classList.remove('active'));
    document.querySelectorAll('.tab-item').forEach(el => el.classList.remove('active'));
    document.getElementById('tab-' + tabName).classList.add('active');
    element.classList.add('active');
    const titles = { 'wallpaper': '壁纸设置', 'icons': '图标与名称', 'fonts': '字体设置' };
    document.getElementById('headerTitle').innerText = titles[tabName];
}

function openSettings() {
    renderAppEditors();
    document.getElementById('settingsModal').classList.add('open');
}
function closeSettings() { document.getElementById('settingsModal').classList.remove('open'); }
function openIOSSettings() { document.getElementById('iosSettingsModal').classList.add('open'); }
function closeIOSSettings() { document.getElementById('iosSettingsModal').classList.remove('open'); }
function openApiSettings() { document.getElementById('apiSettingsModal').classList.add('open'); }
function closeApiSettings() { document.getElementById('apiSettingsModal').classList.remove('open'); }

// --- 世界书逻辑 ---
function openWorldbook() {
    switchWorldbookView('all'); 
    document.getElementById('worldbookModal').classList.add('open');
}
function closeWorldbook() { document.getElementById('worldbookModal').classList.remove('open'); }

function switchWorldbookView(view) {
    const container = document.getElementById('wbViewContainer');
    const tabAll = document.getElementById('tab-wb-all');
    const tabGroup = document.getElementById('tab-wb-group');
    const title = document.getElementById('wbHeaderTitle');

    if (view === 'all') {
        container.style.transform = 'translateX(0)';
        tabAll.classList.add('active');
        tabGroup.classList.remove('active');
        title.innerText = "所有条目";
        renderWorldbookList();
    } else {
        container.style.transform = 'translateX(-50%)'; 
        tabAll.classList.remove('active');
        tabGroup.classList.add('active');
        title.innerText = "分组视图";
        renderGroupView();
    }
}

function renderWorldbookList() {
    const container = document.getElementById('worldbookList');
    container.innerHTML = '';
    if (worldbookEntries.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无条目，点击右上角添加</div>';
        return;
    }
    const sortedEntries = [...worldbookEntries].sort((a, b) => a.title.localeCompare(b.title));
    sortedEntries.forEach(entry => {
        container.appendChild(createEntryElement(entry));
    });
}

function renderGroupView() {
    const container = document.getElementById('worldbookGroupList');
    container.innerHTML = '';
    if (worldbookGroups.length === 0) {
        container.innerHTML = '<div style="padding: 20px; text-align: center; color: #999;">暂无分组，请点击下方添加</div>';
        return;
    }
    worldbookGroups.forEach(group => {
        const groupEntries = worldbookEntries.filter(e => e.type === group);
        const groupItem = document.createElement('div');
        groupItem.className = 'wb-group-item';
        const swipeWrapper = document.createElement('div');
        swipeWrapper.className = 'wb-group-swipe-wrapper';
        const swipeBox = document.createElement('div');
        swipeBox.className = 'wb-swipe-box';
        const header = document.createElement('div');
        header.className = 'wb-group-header';
        header.innerHTML = `<span class="wb-group-name">${group}</span><span class="wb-group-count">${groupEntries.length}</span>`;
        header.onclick = () => { groupItem.querySelector('.wb-group-content').classList.toggle('expanded'); };
        const deleteBtn = document.createElement('div');
        deleteBtn.className = 'wb-delete-btn';
        deleteBtn.innerText = '删除';
        deleteBtn.onclick = (e) => { e.stopPropagation(); deleteGroup(group); };
        swipeBox.appendChild(header);
        swipeBox.appendChild(deleteBtn);
        swipeWrapper.appendChild(swipeBox);
        addSwipeLogic(swipeBox);
        const content = document.createElement('div');
        content.className = 'wb-group-content';
        if (groupEntries.length > 0) {
            groupEntries.forEach(entry => { content.appendChild(createEntryElement(entry)); });
        } else {
            content.innerHTML = '<div style="padding:10px 16px; color:#999; font-size:13px;">无条目</div>';
        }
        groupItem.appendChild(swipeWrapper);
        groupItem.appendChild(content);
        container.appendChild(groupItem);
    });
}

function deleteGroup(groupName) {
    if (confirm(`确定要删除分组 "${groupName}" 吗？\n该分组下的所有条目也将被删除！`)) {
        worldbookGroups = worldbookGroups.filter(g => g !== groupName);
        worldbookEntries = worldbookEntries.filter(e => e.type !== groupName);
        saveWorldbookData();
        renderGroupView();
    } else {
        const items = document.querySelectorAll('.wb-swipe-box');
        items.forEach(el => el.style.transform = 'translateX(0)');
    }
}

function createEntryElement(entry) {
    const wrapper = document.createElement('div');
    wrapper.className = 'wb-list-item-wrapper';
    const swipeBox = document.createElement('div');
    swipeBox.className = 'wb-swipe-box';
    const content = document.createElement('div');
    content.className = 'wb-list-item';
    content.onclick = () => openWorldbookEditor(entry.id);
    content.innerHTML = `<div class="wb-item-info"><div class="wb-item-title">${entry.title} <span class="wb-item-type">${entry.type}</span></div><div class="wb-item-desc">${entry.desc}</div></div>`;
    const deleteBtn = document.createElement('div');
    deleteBtn.className = 'wb-delete-btn';
    deleteBtn.innerText = '删除';
    deleteBtn.onclick = (e) => { e.stopPropagation(); deleteWorldbookEntry(entry.id); };

    swipeBox.appendChild(content);
    swipeBox.appendChild(deleteBtn);
    wrapper.appendChild(swipeBox);
    
    // 添加滑动逻辑
    addSwipeLogic(swipeBox);
    
    return wrapper;
}

function addSwipeLogic(element) {
    let startX, currentX;
    element.addEventListener('touchstart', (e) => {
        startX = e.touches[0].clientX;
    }, {passive: true});

    element.addEventListener('touchmove', (e) => {
        currentX = e.touches[0].clientX;
        const diff = currentX - startX;
        if (diff < 0 && diff > -100) {
            element.style.transform = `translateX(${diff}px)`;
        }
    }, {passive: true});

    element.addEventListener('touchend', (e) => {
        const diff = currentX - startX;
        if (diff < -40) {
            element.style.transform = 'translateX(-80px)'; // 显示删除按钮
        } else {
            element.style.transform = 'translateX(0)';
        }
        startX = null;
        currentX = null;
    });
    
    // 点击其他地方收起
    document.addEventListener('touchstart', (e) => {
        if (!element.contains(e.target)) {
            element.style.transform = 'translateX(0)';
        }
    }, {passive: true});
}

function openWorldbookEditor(id = null) {
    currentEditingId = id;
    const modal = document.getElementById('worldbookEditorModal');
    const titleInput = document.getElementById('wbTitleInput');
    const typeInput = document.getElementById('wbTypeInput');
    const keyInput = document.getElementById('wbKeyInput');
    const descInput = document.getElementById('wbDescInput');

    // 刷新分组下拉框
    typeInput.innerHTML = '';
    if (worldbookGroups.length === 0) worldbookGroups = ['Default'];
    worldbookGroups.forEach(g => {
        const opt = document.createElement('option');
        opt.value = g;
        opt.innerText = g;
        typeInput.appendChild(opt);
    });
    // 添加新建分组选项
    const newOpt = document.createElement('option');
    newOpt.value = '__NEW__';
    newOpt.innerText = '+ 新建分组...';
    typeInput.appendChild(newOpt);

    typeInput.onchange = () => {
        if (typeInput.value === '__NEW__') {
            const newGroup = prompt("请输入新分组名称");
            if (newGroup) {
                if (!worldbookGroups.includes(newGroup)) {
                    worldbookGroups.push(newGroup);
                    const opt = document.createElement('option');
                    opt.value = newGroup;
                    opt.innerText = newGroup;
                    typeInput.insertBefore(opt, newOpt);
                }
                typeInput.value = newGroup;
            } else {
                typeInput.value = worldbookGroups[0];
            }
        }
    };

    if (id) {
        const entry = worldbookEntries.find(e => e.id === id);
        if (entry) {
            document.getElementById('wbEditorTitle').innerText = "编辑条目";
            titleInput.value = entry.title;
            typeInput.value = entry.type;
            keyInput.value = entry.keys;
            descInput.value = entry.desc;
        }
    } else {
        document.getElementById('wbEditorTitle').innerText = "新建条目";
        titleInput.value = '';
        typeInput.value = worldbookGroups[0];
        keyInput.value = '';
        descInput.value = '';
    }
    modal.classList.add('open');
}

function closeWorldbookEditor() { document.getElementById('worldbookEditorModal').classList.remove('open'); }

function saveWorldbookEntry() {
    const title = document.getElementById('wbTitleInput').value;
    let type = document.getElementById('wbTypeInput').value;
    const keys = document.getElementById('wbKeyInput').value;
    const desc = document.getElementById('wbDescInput').value;

    if (!title) { alert("请输入条目名称"); return; }
    if (worldbookGroups.length === 0) { type = "Default"; worldbookGroups.push("Default"); }

    if (currentEditingId) {
        const index = worldbookEntries.findIndex(e => e.id === currentEditingId);
        if (index !== -1) {
            worldbookEntries[index] = { id: currentEditingId, title, type, keys, desc };
        }
    } else {
        const newId = Date.now();
        worldbookEntries.push({ id: newId, title, type, keys, desc });
    }
    saveWorldbookData();
    closeWorldbookEditor();
    if (document.getElementById('tab-wb-all').classList.contains('active')) {
        renderWorldbookList();
    } else {
        renderGroupView();
    }
}

function deleteWorldbookEntry(id) {
    if (confirm("确定要删除这个条目吗？")) {
        worldbookEntries = worldbookEntries.filter(e => e.id !== id);
        saveWorldbookData();
        if (document.getElementById('tab-wb-all').classList.contains('active')) {
            renderWorldbookList();
        } else {
            renderGroupView();
        }
    } else {
        const items = document.querySelectorAll('.wb-swipe-box');
        items.forEach(el => el.style.transform = 'translateX(0)');
    }
}

function addNewGroup() {
    const name = prompt("请输入新分组名称");
    if (name && !worldbookGroups.includes(name)) {
        worldbookGroups.push(name);
        saveWorldbookData();
        renderGroupView();
    }
}

function filterWorldbook(keyword) {
    if (!keyword) {
        renderWorldbookList();
        return;
    }
    const lower = keyword.toLowerCase();
    const filtered = worldbookEntries.filter(e => 
        e.title.toLowerCase().includes(lower) || 
        e.keys.toLowerCase().includes(lower) ||
        e.desc.toLowerCase().includes(lower)
    );
    const container = document.getElementById('worldbookList');
    container.innerHTML = '';
    filtered.forEach(entry => container.appendChild(createEntryElement(entry)));
}

// --- API 设置逻辑 ---
async function saveApiConfig() {
    const config = {
        baseUrl: document.getElementById('apiBaseUrl').value,
        key: document.getElementById('apiKey').value,
        temp: document.getElementById('tempSlider').value,
        model: document.getElementById('modelSelect').value
    };
    await idb.set('ios_theme_api_config', config);
    alert("API 配置已保存");
}

async function fetchModels() {
    const baseUrl = document.getElementById('apiBaseUrl').value;
    const key = document.getElementById('apiKey').value;
    if (!baseUrl || !key) return alert("请先填写 API 地址和密钥");
    
    const btn = document.getElementById('fetchBtn');
    btn.innerText = "拉取中...";
    
    try {
        const res = await fetch(`${baseUrl}/models`, {
            headers: { 'Authorization': `Bearer ${key}` }
        });
        const data = await res.json();
        const select = document.getElementById('modelSelect');
        select.innerHTML = '';
        
        if (data.data && Array.isArray(data.data)) {
            data.data.forEach(m => {
                const opt = document.createElement('option');
                opt.value = m.id;
                opt.innerText = m.id;
                select.appendChild(opt);
            });
            alert(`成功拉取 ${data.data.length} 个模型`);
        } else {
            alert("拉取失败：格式不正确");
        }
    } catch (e) {
        alert("拉取失败：" + e.message);
    } finally {
        btn.innerText = "拉取模型列表";
    }
}

function renderApiPresets() {
    const list = document.getElementById('apiPresetList');
    list.innerHTML = '';
    if (apiPresets.length === 0) {
        list.innerHTML = '<div style="color:#999; font-size:13px; padding:5px;">暂无预设</div>';
        return;
    }
    apiPresets.forEach((p, idx) => {
        const tag = document.createElement('div');
        tag.className = 'preset-tag';
        tag.innerHTML = `<span class="preset-name" onclick="applyApiPreset(${idx})">${p.name}</span><span class="preset-delete" onclick="deletePreset('api', ${idx})">×</span>`;
        list.appendChild(tag);
    });
}

function applyApiPreset(idx) {
    const p = apiPresets[idx];
    if (p) {
        document.getElementById('apiBaseUrl').value = p.baseUrl;
        document.getElementById('apiKey').value = p.key;
        document.getElementById('tempSlider').value = p.temp;
        document.getElementById('tempDisplay').innerText = p.temp;
    }
}

// --- 通用模态框逻辑 ---
function openNameModal(type) {
    pendingSaveType = type;
    document.getElementById('modalTitle').innerText = "保存预设";
    document.getElementById('modalDesc').innerText = "请输入预设名称";
    document.getElementById('modalInputContainer').classList.add('show');
    document.getElementById('modalInput').value = '';
    document.getElementById('modalConfirmBtn').onclick = confirmSavePreset;
    document.getElementById('modalOverlay').classList.add('active');
}

function openTextEditModal(title, desc, initialValue, callback) {
    document.getElementById('modalTitle').innerText = title;
    document.getElementById('modalDesc').innerText = desc;
    document.getElementById('modalInputContainer').classList.add('show');
    document.getElementById('modalInput').value = initialValue || '';
    document.getElementById('modalConfirmBtn').onclick = () => {
        callback(document.getElementById('modalInput').value);
        closeModal();
    };
    document.getElementById('modalOverlay').classList.add('active');
}

function closeModal() {
    document.getElementById('modalOverlay').classList.remove('active');
}

async function confirmSavePreset() {
    const name = document.getElementById('modalInput').value;
    if (!name) return alert("请输入名称");

    if (pendingSaveType === 'icon') {
        const currentIcons = [];
        for(let i=0; i<totalApps; i++) {
            currentIcons.push({
                id: i,
                name: document.getElementById(`name-${i}`).innerText,
                bg: document.getElementById(`icon-${i}`).style.backgroundImage
            });
        }
        iconPresets.push({ name, data: currentIcons });
        renderIconPresets();
    } else if (pendingSaveType === 'font') {
        fontPresets.push({
            name,
            url: document.getElementById('fontUrlInput').value,
            size: document.getElementById('fontSizeSlider').value
        });
        renderFontPresets();
    } else if (pendingSaveType === 'api') {
        apiPresets.push({
            name,
            baseUrl: document.getElementById('apiBaseUrl').value,
            key: document.getElementById('apiKey').value,
            temp: document.getElementById('tempSlider').value
        });
        renderApiPresets();
    }
    await savePresetsData();
    closeModal();
}

function deletePreset(type, idx) {
    if (!confirm("确定删除此预设吗？")) return;
    if (type === 'icon') {
        iconPresets.splice(idx, 1);
        renderIconPresets();
    } else if (type === 'font') {
        fontPresets.splice(idx, 1);
        renderFontPresets();
    } else if (type === 'api') {
        apiPresets.splice(idx, 1);
        renderApiPresets();
    }
    savePresetsData();
}

function renderIconPresets() {
    const list = document.getElementById('iconPresetList');
    list.innerHTML = '';
    if (iconPresets.length === 0) {
        list.innerHTML = '<div style="color:#999; font-size:13px; padding:5px;">暂无预设</div>';
        return;
    }
    iconPresets.forEach((p, idx) => {
        const tag = document.createElement('div');
        tag.className = 'preset-tag';
        tag.innerHTML = `<span class="preset-name" onclick="applyIconPreset(${idx})">${p.name}</span><span class="preset-delete" onclick="deletePreset('icon', ${idx})">×</span>`;
        list.appendChild(tag);
    });
}

function applyIconPreset(idx) {
    const p = iconPresets[idx];
    if (p && p.data) {
        p.data.forEach(app => {
            const nameEl = document.getElementById(`name-${app.id}`);
            const iconEl = document.getElementById(`icon-${app.id}`);
            if (nameEl) nameEl.innerText = app.name;
            if (iconEl) {
                iconEl.style.backgroundImage = app.bg;
                iconEl.style.backgroundColor = app.bg ? 'transparent' : '#f0f0f0';
            }
        });
        saveAppsData();
        renderAppEditors();
    }
}

function renderFontPresets() {
    const list = document.getElementById('fontPresetList');
    const container = document.getElementById('fontPresetsContainer');
    list.innerHTML = '';
    if (fontPresets.length === 0) {
        container.style.display = 'none';
        return;
    }
    container.style.display = 'block';
    fontPresets.forEach((p, idx) => {
        const tag = document.createElement('div');
        tag.className = 'preset-tag';
        tag.innerHTML = `<span class="preset-name" onclick="applyFontPreset(${idx})">${p.name}</span><span class="preset-delete" onclick="deletePreset('font', ${idx})">×</span>`;
        list.appendChild(tag);
    });
}

function applyFontPreset(idx) {
    const p = fontPresets[idx];
    if (p) {
        document.getElementById('fontUrlInput').value = p.url;
        document.getElementById('fontSizeSlider').value = p.size;
        applyFont(p.url);
        changeFontSize(p.size);
    }
}

function applyFont(url) {
    const finalUrl = url || document.getElementById('fontUrlInput').value;
    const style = document.getElementById('dynamic-font-style');
    if (finalUrl) {
        style.textContent = `@font-face { font-family: 'CustomFont'; src: url('${finalUrl}'); } body, input, textarea, button, select { font-family: 'CustomFont', sans-serif !important; }`;
        saveThemeSettings();
    }
}

function changeFontSize(val) {
    document.documentElement.style.setProperty('--app-font-size', val + 'px');
    document.getElementById('fontSizeDisplay').innerText = val + 'px';
    saveThemeSettings();
}

function renderAppEditors() {
    const list = document.getElementById('appEditorList');
    list.innerHTML = '';
    for (let i = 0; i < totalApps; i++) {
        const name = document.getElementById(`name-${i}`).innerText;
        const bg = document.getElementById(`icon-${i}`).style.backgroundImage;
        
        const div = document.createElement('div');
        div.className = 'app-edit-item';
        div.innerHTML = `
            <div class="app-edit-preview" style="background-image:${bg}" onclick="triggerAppIconUpload(${i})">
                <svg class="camera-icon" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
            </div>
            <div class="app-edit-inputs">
                <input type="text" value="${name}" oninput="updateAppName(${i}, this.value)" placeholder="App Name">
                <input type="text" placeholder="图标 URL (粘贴后点击空白处)" onblur="updateAppIconUrl(${i}, this.value)">
                <button class="action-btn secondary" style="padding:6px; font-size:12px; margin:0;" onclick="resetSingleApp(${i})">重置</button>
            </div>
            <input type="file" id="appIconInput-${i}" class="hidden-file-input" accept="image/*" onchange="handleAppIconUpload(${i}, this)">
        `;
        list.appendChild(div);
    }
}

function updateAppName(id, val) {
    document.getElementById(`name-${id}`).innerText = val;
    saveAppsData();
}

function updateAppIconUrl(id, url) {
    if (!url) return;
    const bg = `url('${url}')`;
    const iconEl = document.getElementById(`icon-${id}`);
    iconEl.style.backgroundImage = bg;
    iconEl.style.backgroundColor = 'transparent';
    saveAppsData();
    renderAppEditors();
}

function triggerAppIconUpload(id) {
    document.getElementById(`appIconInput-${id}`).click();
}

function handleAppIconUpload(id, input) {
    const file = input.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function(e) {
            const bg = `url('${e.target.result}')`;
            const iconEl = document.getElementById(`icon-${id}`);
            iconEl.style.backgroundImage = bg;
            iconEl.style.backgroundColor = 'transparent';
            saveAppsData();
            renderAppEditors();
        };
        reader.readAsDataURL(file);
    }
}

function resetSingleApp(id) {
    const defaultNames = ['App 1', 'App 2', 'App 3', 'App 4', 'Theme', 'Settings', '世界书'];
    document.getElementById(`name-${id}`).innerText = defaultNames[id];
    const iconEl = document.getElementById(`icon-${id}`);
    iconEl.style.backgroundImage = '';
    iconEl.style.backgroundColor = '#f0f0f0';
    saveAppsData();
    renderAppEditors();
}

function renderWallpaperGrid() {
    const grid = document.getElementById('wallpaperGrid');
    grid.innerHTML = '';
    if (wallpaperPresets.length === 0) {
        grid.innerHTML = '<div style="color:#999; font-size:13px; grid-column:span 3; text-align:center; padding:20px;">暂无保存的壁纸</div>';
        return;
    }
    wallpaperPresets.forEach((url, idx) => {
        const item = document.createElement('div');
        item.className = 'wallpaper-item';
        item.style.backgroundImage = `url('${url}')`;
        item.onclick = () => {
            document.getElementById('mainScreen').style.backgroundImage = `url('${url}')`;
            saveThemeSettings();
        };
        const del = document.createElement('div');
        del.className = 'wallpaper-delete';
        del.innerText = '×';
        del.onclick = (e) => {
            e.stopPropagation();
            wallpaperPresets.splice(idx, 1);
            savePresetsData();
            renderWallpaperGrid();
        };
        item.appendChild(del);
        grid.appendChild(item);
    });
}

function addWallpaperToGrid(url) {
    if (!wallpaperPresets.includes(url)) {
        wallpaperPresets.push(url);
        savePresetsData();
        renderWallpaperGrid();
    }
}

function setWallpaperFromUrl() {
    const url = document.getElementById('bgUrlInput').value;
    if (url) {
        document.getElementById('mainScreen').style.backgroundImage = `url('${url}')`;
        saveThemeSettings();
        addWallpaperToGrid(url);
    }
}

/* ==========================================================================
   WECHAT APP LOGIC (Prefix: wc)
   ========================================================================== */

// --- WeChat DB ---
const WC_DB_NAME = 'WeChatSimDB';
const WC_DB_VERSION = 1;

const wcDb = {
    instance: null,
    init: function() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open(WC_DB_NAME, WC_DB_VERSION);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('kv_store')) db.createObjectStore('kv_store');
                if (!db.objectStoreNames.contains('characters')) db.createObjectStore('characters', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('chats')) db.createObjectStore('chats', { keyPath: 'charId' });
                if (!db.objectStoreNames.contains('moments')) db.createObjectStore('moments', { keyPath: 'id' });
                if (!db.objectStoreNames.contains('masks')) db.createObjectStore('masks', { keyPath: 'id' });
            };
            request.onsuccess = (event) => {
                this.instance = event.target.result;
                resolve();
            };
            request.onerror = (event) => reject(event.target.error);
        });
    },
    get: function(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.instance.transaction([storeName], 'readonly');
            const request = transaction.objectStore(storeName).get(key);
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    getAll: function(storeName) {
        return new Promise((resolve, reject) => {
            const transaction = this.instance.transaction([storeName], 'readonly');
            const request = transaction.objectStore(storeName).getAll();
            request.onsuccess = () => resolve(request.result);
            request.onerror = () => reject(request.error);
        });
    },
    put: function(storeName, value, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.instance.transaction([storeName], 'readwrite');
            const request = key ? transaction.objectStore(storeName).put(value, key) : transaction.objectStore(storeName).put(value);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    },
    delete: function(storeName, key) {
        return new Promise((resolve, reject) => {
            const transaction = this.instance.transaction([storeName], 'readwrite');
            const request = transaction.objectStore(storeName).delete(key);
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }
};

// --- WeChat State ---
const wcState = {
    currentTab: 'chat',
    characters: [],
    chats: {}, 
    moments: [],
    user: { name: 'User', avatar: '', cover: '', persona: '' },
    wallet: { balance: 0.00, transactions: [], password: '123456' },
    masks: [], 
    stickerCategories: [{ name: "全部", list: [] }],
    cssPresets: [],
    activeStickerCategoryIndex: 0,
    tempImage: '',
    tempImageType: '',
    editingCharId: null,
    editingMaskId: null,
    momentType: 'local',
    activeChatId: null,
    isStickerPanelOpen: false,
    isMorePanelOpen: false,
    isStickerDeleteMode: false,
    isMultiSelectMode: false,
    longPressTimer: null,
    selectedMsgId: null,
    replyingToMsgId: null,
    multiSelectedIds: [],
    tempTransfer: { amount: 0, note: '' },
    activeTransferMsgId: null,
    phoneClockInterval: null,
    tempPhoneConfig: {},
    phoneAppTab: 'chat',
    generalInputCallback: null,
    tempBgCleared: false,
    replyingToComment: null
};

// --- WeChat Core Functions ---
function openWechat() {
    document.getElementById('wechatModal').classList.add('open');
    wcRenderAll();
}

function closeWechat() {
    document.getElementById('wechatModal').classList.remove('open');
}

async function wcLoadData() {
    try {
        const user = await wcDb.get('kv_store', 'user');
        if (user) wcState.user = user;
        else wcState.user.avatar = 'data:image/svg+xml;base64,' + btoa('<svg xmlns="http://www.w3.org/2000/svg' + ' width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#007AFF"/></svg>');

        const wallet = await wcDb.get('kv_store', 'wallet');
        if (wallet) wcState.wallet = wallet;

        const stickers = await wcDb.get('kv_store', 'sticker_categories');
        if (stickers) wcState.stickerCategories = stickers;

        const presets = await wcDb.get('kv_store', 'css_presets');
        if (presets) wcState.cssPresets = presets;

        const chars = await wcDb.getAll('characters');
        wcState.characters = chars || [];
        
        wcState.masks = await wcDb.getAll('masks') || [];
        wcState.moments = await wcDb.getAll('moments') || [];
        
        const allChats = await wcDb.getAll('chats');
        if (allChats) {
            allChats.forEach(item => {
                wcState.chats[item.charId] = item.messages;
            });
        }
    } catch (e) {
        console.error("WeChat Data load error", e);
    }
}

async function wcSaveData() {
    try {
        await wcDb.put('kv_store', wcState.user, 'user');
        await wcDb.put('kv_store', wcState.wallet, 'wallet');
        await wcDb.put('kv_store', wcState.stickerCategories, 'sticker_categories');
        await wcDb.put('kv_store', wcState.cssPresets, 'css_presets');
        
        for (const char of wcState.characters) {
            if (char && char.id) await wcDb.put('characters', char);
        }
        for (const mask of wcState.masks) await wcDb.put('masks', mask);
        for (const moment of wcState.moments) await wcDb.put('moments', moment);
        for (const charId in wcState.chats) {
            await wcDb.put('chats', { charId: parseInt(charId), messages: wcState.chats[charId] });
        }
    } catch (e) {
        console.error("WeChat Save failed", e);
    }
}

function wcCompressImage(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            const img = new Image();
            img.src = event.target.result;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                const MAX_WIDTH = 600; 
                const scaleSize = MAX_WIDTH / img.width;
                if (scaleSize < 1) {
                    canvas.width = MAX_WIDTH;
                    canvas.height = img.height * scaleSize;
                } else {
                    canvas.width = img.width;
                    canvas.height = img.height;
                }
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
                resolve(canvas.toDataURL('image/jpeg', 0.6));
            };
            img.onerror = (err) => reject(err);
        };
        reader.onerror = (err) => reject(err);
    });
}

// --- WeChat Navigation ---
function wcSwitchTab(tabId) {
    wcState.currentTab = tabId;
    document.querySelectorAll('.wc-tab-item').forEach(el => el.classList.remove('active'));
    document.querySelector(`.wc-tab-item[onclick="wcSwitchTab('${tabId}')"]`).classList.add('active');
    document.querySelectorAll('.wc-page').forEach(el => el.classList.remove('active'));
    document.getElementById(`wc-view-${tabId}`).classList.add('active');
    
    document.getElementById('wc-view-chat-detail').classList.remove('active');
    document.getElementById('wc-view-memory').classList.remove('active');
    document.getElementById('wc-main-tabbar').style.display = 'flex';
    document.getElementById('wc-btn-back').style.display = 'none';
    document.getElementById('wc-btn-exit').style.display = 'flex';

    const titleMap = { 'chat': 'Chat', 'contacts': 'Contacts', 'moments': 'Moments', 'user': 'User' };
    document.getElementById('wc-nav-title').innerText = titleMap[tabId];

    const rightContainer = document.getElementById('wc-nav-right-container');
    rightContainer.innerHTML = '';

    if (tabId === 'chat') {
        const btn = document.createElement('button');
        btn.className = 'wc-nav-btn';
        btn.innerHTML = '<svg class="wc-icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        btn.onclick = () => wcOpenModal('wc-modal-add-char');
        rightContainer.appendChild(btn);
    } else if (tabId === 'moments') {
        const btn = document.createElement('button');
        btn.className = 'wc-nav-btn';
        btn.innerHTML = '<svg class="wc-icon" viewBox="0 0 24 24"><path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z"></path><circle cx="12" cy="13" r="4"></circle></svg>';
        btn.onclick = () => wcOpenModal('wc-modal-post-moment');
        rightContainer.appendChild(btn);
    }
}

function wcHandleBack() {
    if (document.getElementById('wc-view-memory').classList.contains('active')) {
        wcCloseMemoryPage();
        return;
    }
    if (document.getElementById('wc-view-chat-detail').classList.contains('active')) {
        document.getElementById('wc-view-chat-detail').classList.remove('active');
        document.getElementById('wc-main-tabbar').style.display = 'flex';
        document.getElementById('wc-btn-back').style.display = 'none';
        document.getElementById('wc-btn-exit').style.display = 'flex';
        document.getElementById('wc-nav-title').innerText = 'Chat';
        
        const rightContainer = document.getElementById('wc-nav-right-container');
        rightContainer.innerHTML = '';
        const btn = document.createElement('button');
        btn.className = 'wc-nav-btn';
        btn.innerHTML = '<svg class="wc-icon" viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>';
        btn.onclick = () => wcOpenModal('wc-modal-add-char');
        rightContainer.appendChild(btn);

        wcState.activeChatId = null;
        wcCloseAllPanels();
        wcExitMultiSelectMode();
        
        document.getElementById('wc-chat-background-layer').style.backgroundImage = 'none';
        document.getElementById('wc-custom-css-style').innerHTML = '';
        
        wcRenderChats(); 
    }
}

// --- WeChat Chat Logic ---
function wcOpenChat(charId) {
    wcState.activeChatId = charId;
    const char = wcState.characters.find(c => c.id === charId);
    if (!char) return;

    document.getElementById('wc-view-chat-detail').classList.add('active');
    document.getElementById('wc-main-tabbar').style.display = 'none';
    document.getElementById('wc-btn-back').style.display = 'flex';
    document.getElementById('wc-btn-exit').style.display = 'none';
    
    document.getElementById('wc-nav-title').innerText = char.note || char.name;
    
    const rightContainer = document.getElementById('wc-nav-right-container');
    rightContainer.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'wc-nav-btn';
    btn.innerHTML = '<svg class="wc-icon" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
    btn.onclick = () => wcOpenChatSettings();
    rightContainer.appendChild(btn);

    wcApplyChatConfig(char);
    wcRenderMessages(charId);
    wcScrollToBottom();
}

function wcApplyChatConfig(char) {
    if (!char) return;
    const bgLayer = document.getElementById('wc-chat-background-layer');
    if (char.chatConfig && char.chatConfig.backgroundImage) {
        bgLayer.style.backgroundImage = `url(${char.chatConfig.backgroundImage})`;
    } else {
        bgLayer.style.backgroundImage = 'none';
    }

    const cssStyle = document.getElementById('wc-custom-css-style');
    if (char.chatConfig && char.chatConfig.customCss) {
        cssStyle.innerHTML = char.chatConfig.customCss;
    } else {
        cssStyle.innerHTML = '';
    }
}

function wcFormatTime(timestamp) {
    const date = new Date(timestamp);
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    return `${hours}:${minutes}`;
}

function wcRenderMessages(charId) {
    const container = document.getElementById('wc-chat-messages');
    container.innerHTML = '';
    const msgs = wcState.chats[charId] || [];
    const char = wcState.characters.find(c => c.id === charId);
    
    if (!char) return;

    let userAvatar = wcState.user.avatar;
    if (char.chatConfig && char.chatConfig.userAvatar) {
        userAvatar = char.chatConfig.userAvatar;
    }

    if (wcState.isMultiSelectMode) {
        container.classList.add('multi-select-mode');
    } else {
        container.classList.remove('multi-select-mode');
    }

    let lastTime = 0;

    msgs.forEach((msg) => {
        if (msg.hidden) return;

        if (msg.time - lastTime > 5 * 60 * 1000) {
            const timeDiv = document.createElement('div');
            timeDiv.className = 'wc-message-row system';
            timeDiv.innerHTML = `<div class="wc-system-msg-text transparent">${wcFormatTime(msg.time)}</div>`;
            container.appendChild(timeDiv);
            lastTime = msg.time;
        }

        const row = document.createElement('div');
        
        if (msg.type === 'system') {
            row.className = 'wc-message-row system';
            row.innerHTML = `<div class="wc-system-msg-text ${msg.style || ''}">${msg.content}</div>`;
            container.appendChild(row);
            return;
        }

        row.className = `wc-message-row ${msg.sender === 'me' ? 'me' : 'them'}`;
        const avatarUrl = msg.sender === 'me' ? userAvatar : char.avatar;
        
        let quoteHtml = '';
        if (msg.quote) {
            quoteHtml = `<div class="wc-quote-block">${msg.quote}</div>`;
        }

        let contentHtml = '';
        if (msg.type === 'sticker') {
            contentHtml = `<div class="wc-bubble wc-bubble-sticker ${msg.sender === 'me' ? 'me' : 'them'}">${quoteHtml}<img src="${msg.content}" class="wc-sticker-img"></div>`;
        } else if (msg.type === 'image') {
            contentHtml = `<div class="wc-bubble wc-bubble-sticker ${msg.sender === 'me' ? 'me' : 'them'}">${quoteHtml}<img src="${msg.content}" class="wc-bubble-img"></div>`;
        } else if (msg.type === 'voice') {
            if (msg.showText) {
                contentHtml = `<div class="wc-bubble ${msg.sender === 'me' ? 'me' : 'them'}" onclick="wcToggleVoiceText(${msg.id})">${quoteHtml}[语音转文字] ${msg.content}</div>`;
            } else {
                contentHtml = `
                    <div class="wc-bubble voice ${msg.sender === 'me' ? 'me' : 'them'}" onclick="wcToggleVoiceText(${msg.id})">
                        ${quoteHtml}
                        <div class="wc-voice-bars">
                            <div class="wc-voice-bar"></div><div class="wc-voice-bar"></div><div class="wc-voice-bar"></div>
                        </div>
                    </div>`;
            }
        } else if (msg.type === 'transfer') {
            const statusClass = (msg.status === 'received' || msg.status === 'rejected') ? 'received' : '';
            const statusText = msg.status === 'received' ? '已收款' : (msg.status === 'rejected' ? '已退还' : '转账');
            const icon = msg.status === 'received' ? '<polyline points="20 6 9 17 4 12"></polyline>' : '<rect x="2" y="6" width="20" height="12" rx="2"></rect><circle cx="12" cy="12" r="2"></circle><path d="M6 12h.01M18 12h.01"></path>';
            
            contentHtml = `
                <div class="wc-bubble transfer ${statusClass}" onclick="wcHandleTransferClick(${msg.id})">
                    ${quoteHtml}
                    <div class="wc-transfer-content">
                        <div class="wc-transfer-icon-circle">
                            <svg class="wc-icon" viewBox="0 0 24 24">${icon}</svg>
                        </div>
                        <div class="wc-transfer-info">
                            <span class="wc-transfer-amount">¥${msg.amount}</span>
                            <span class="wc-transfer-desc">${statusText}</span>
                        </div>
                    </div>
                </div>`;
        } else {
            contentHtml = `<div class="wc-bubble ${msg.sender === 'me' ? 'me' : 'them'}">${quoteHtml}${msg.content}</div>`;
        }

        const checkboxHtml = `<div class="wc-msg-checkbox ${wcState.multiSelectedIds.includes(msg.id) ? 'checked' : ''}" onclick="wcToggleMultiSelectMsg(${msg.id})"></div>`;
        const timeHtml = `<span class="wc-msg-timestamp-outside">${wcFormatTime(msg.time)}</span>`;

        const bubbleWrapper = document.createElement('div');
        bubbleWrapper.className = 'wc-bubble-container';
        bubbleWrapper.innerHTML = contentHtml;
        
        bubbleWrapper.addEventListener('touchstart', (e) => wcHandleTouchStart(e, msg.id));
        bubbleWrapper.addEventListener('touchend', wcHandleTouchEnd);
        bubbleWrapper.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            wcShowContextMenu(e.clientX, e.clientY, msg.id);
        });

        if (msg.sender === 'me') {
            row.innerHTML = `${checkboxHtml}<img src="${avatarUrl}" class="wc-chat-avatar">`;
            row.appendChild(bubbleWrapper);
            row.insertAdjacentHTML('beforeend', timeHtml);
        } else {
            row.innerHTML = `${checkboxHtml}<img src="${avatarUrl}" class="wc-chat-avatar">`;
            row.appendChild(bubbleWrapper);
            row.insertAdjacentHTML('beforeend', timeHtml);
        }

        container.appendChild(row);
    });
}

function wcScrollToBottom() {
    const area = document.getElementById('wc-chat-messages');
    setTimeout(() => { area.scrollTop = area.scrollHeight; }, 50);
}

// --- WeChat Interaction ---
function wcHandleTouchStart(e, msgId) {
    wcState.longPressTimer = setTimeout(() => {
        const touch = e.touches[0];
        wcShowContextMenu(touch.clientX, touch.clientY, msgId);
    }, 500);
}

function wcHandleTouchEnd() {
    if (wcState.longPressTimer) {
        clearTimeout(wcState.longPressTimer);
        wcState.longPressTimer = null;
    }
}

function wcShowContextMenu(x, y, msgId) {
    wcState.selectedMsgId = msgId;
    const menu = document.getElementById('wc-context-menu');
    const menuWidth = 150;
    const menuHeight = 180;
    const screenW = window.innerWidth;
    const screenH = window.innerHeight;

    if (x + menuWidth > screenW) x = screenW - menuWidth - 10;
    if (y + menuHeight > screenH) y = screenH - menuHeight - 10;

    menu.style.left = x + 'px';
    menu.style.top = y + 'px';
    menu.style.display = 'flex';
}

function wcHideContextMenu() {
    document.getElementById('wc-context-menu').style.display = 'none';
    wcState.selectedMsgId = null;
}

function wcHandleReply() {
    const msgs = wcState.chats[wcState.activeChatId];
    const msg = msgs.find(m => m.id === wcState.selectedMsgId);
    if (msg) {
        wcState.replyingToMsgId = msg.id;
        let text = msg.content;
        if (msg.type !== 'text') text = `[${msg.type}]`;
        document.getElementById('wc-quote-text-content').innerText = text;
        document.getElementById('wc-quote-preview-area').style.display = 'flex';
        document.getElementById('wc-chat-input').focus();
    }
    wcHideContextMenu();
}

function wcCancelQuote() {
    wcState.replyingToMsgId = null;
    document.getElementById('wc-quote-preview-area').style.display = 'none';
}

function wcHandleEdit() {
    const msgs = wcState.chats[wcState.activeChatId];
    const msg = msgs.find(m => m.id === wcState.selectedMsgId);
    if (msg) {
        const newText = prompt("编辑消息内容:", msg.content);
        if (newText !== null && newText.trim() !== "") {
            msg.content = newText;
            wcSaveData();
            wcRenderMessages(wcState.activeChatId);
        }
    }
    wcHideContextMenu();
}

function wcHandleDelete() {
    if (confirm("确定删除这条消息吗？")) {
        wcState.chats[wcState.activeChatId] = wcState.chats[wcState.activeChatId].filter(m => m.id !== wcState.selectedMsgId);
        wcSaveData();
        wcRenderMessages(wcState.activeChatId);
    }
    wcHideContextMenu();
}

function wcHandleMultiSelect() {
    wcState.isMultiSelectMode = true;
    wcState.multiSelectedIds = [wcState.selectedMsgId];
    wcHideContextMenu();
    wcRenderMessages(wcState.activeChatId);
    document.getElementById('wc-multi-select-footer').style.display = 'flex';
    document.getElementById('wc-chat-footer').style.display = 'none';
}

function wcToggleMultiSelectMsg(msgId) {
    if (wcState.multiSelectedIds.includes(msgId)) {
        wcState.multiSelectedIds = wcState.multiSelectedIds.filter(id => id !== msgId);
    } else {
        wcState.multiSelectedIds.push(msgId);
    }
    wcRenderMessages(wcState.activeChatId);
}

function wcHandleMultiDeleteAction() {
    if (wcState.multiSelectedIds.length === 0) return;
    if (confirm(`确定删除选中的 ${wcState.multiSelectedIds.length} 条消息吗？`)) {
        wcState.chats[wcState.activeChatId] = wcState.chats[wcState.activeChatId].filter(m => !wcState.multiSelectedIds.includes(m.id));
        wcSaveData();
        wcExitMultiSelectMode();
    }
}

function wcExitMultiSelectMode() {
    wcState.isMultiSelectMode = false;
    wcState.multiSelectedIds = [];
    document.getElementById('wc-multi-select-footer').style.display = 'none';
    document.getElementById('wc-chat-footer').style.display = 'flex';
    wcRenderMessages(wcState.activeChatId);
}

function wcHandleEnter(e) {
    if (e.key === 'Enter') {
        if (!e.shiftKey) {
            e.preventDefault();
            wcSendMsg();
        }
    }
}

function wcSendMsg() {
    const input = document.getElementById('wc-chat-input');
    const text = input.value.trim();
    if (!text) return;

    let extra = {};
    if (wcState.replyingToMsgId) {
        const msgs = wcState.chats[wcState.activeChatId];
        const replyMsg = msgs.find(m => m.id === wcState.replyingToMsgId);
        if (replyMsg) {
            let replyText = replyMsg.content;
            if (replyMsg.type !== 'text') replyText = `[${replyMsg.type}]`;
            extra.quote = `${replyMsg.sender === 'me' ? wcState.user.name : wcState.characters.find(c=>c.id===wcState.activeChatId).name}: ${replyText}`;
        }
        wcCancelQuote();
    }

    wcAddMessage(wcState.activeChatId, 'me', 'text', text, extra);
    input.value = '';
}

// --- WeChat AI & API Logic ---
async function wcTriggerAI() {
    const charId = wcState.activeChatId;
    const char = wcState.characters.find(c => c.id === charId);
    if (!char) return;

    const apiConfig = await idb.get('ios_theme_api_config');
    if (!apiConfig || !apiConfig.baseUrl || !apiConfig.key || !apiConfig.model) {
        alert("请先在系统设置中配置 API 地址、密钥并选择模型！");
        return;
    }

    const titleEl = document.getElementById('wc-nav-title');
    const originalTitle = titleEl.innerText;
    titleEl.innerText = "对方正在输入...";

    try {
        const config = char.chatConfig || {};
        const now = new Date();
        const timeString = now.toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai', hour12: false });
        const dayString = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'][now.getDay()];
        const currentTimeInfo = `【当前系统时间】\n现实时间：${timeString} ${dayString}\n\n`;

        let systemPrompt = `你正在参与一个沉浸式的微信聊天模拟。严格扮演你的角色，不要破坏沉浸感。\n`;
        systemPrompt += currentTimeInfo;
        
        systemPrompt += `【时间感知模块】
1. 你不能自行假设时间流逝。任何“经过了多久”的判断，必须依据现实时间或由我明确告知的时间信息。
2. 每次回复前，请读取“当前系统时间”，并基于此判断间隔。
3. 如果我未提供新的时间信息，请保持默认状态，不可生成“已过1小时”“天亮了”等推测性内容。
4. 在回复中涉及时间时，请体现逻辑一致性。
5. 允许我在任何时刻通过提示语更新时间，你需即时根据最新时间修正自己的表述。
6. 若我使用「现在」一词，请视为现实当前时间（即系统当前时间），不要提前或延迟。
7. 你可以记录上次对话中的时间节点，并在下次对话时主动比对。如果我没有更新时间，也不要自行虚构时间变化。

【时间行为逻辑】
你具有准确的时间意识。不会凭空判断时间流逝，而是基于现实时间或对方提供的时间数据进行逻辑判断。
在每次互动时，根据时间差计算具体分钟数，并用自然的语气表现出“确实过了多久”。\n\n`;

        systemPrompt += `【重要回复规则】
1. 必须模拟即时通讯软件聊天风格，口语化、碎片化。
2. 严禁长篇大论，严禁小说体。
3. 频繁使用换行符，每一句对话独占一行。
4. 将长段话拆分成多条短消息发送（用换行分隔）。
5. 不要使用书面语，像用手机打字一样。
6. 严禁使用逗号将多个独立的句子强行连接成一句长句。\n\n`;

        systemPrompt += `【你的角色设定】\n名字：${char.name}\n人设：${char.prompt || '无'}\n\n`;
        systemPrompt += `【对方(用户)设定】\n名字：${config.userName || wcState.user.name}\n人设：${config.userPersona || '无'}\n\n`;

        if (config.worldbookEntries && config.worldbookEntries.length > 0) {
            const selectedEntries = worldbookEntries.filter(e => config.worldbookEntries.includes(e.id.toString()));
            if (selectedEntries.length > 0) {
                systemPrompt += `【世界观/背景设定】\n`;
                selectedEntries.forEach(e => { systemPrompt += `- ${e.title} (${e.keys}): ${e.desc}\n`; });
                systemPrompt += `\n`;
            }
        }

        if (char.memories && char.memories.length > 0) {
            const readCount = config.aiMemoryCount || 5;
            const recentMemories = char.memories.slice(0, readCount);
            systemPrompt += `【关于聊天的记忆/总结】\n`;
            recentMemories.forEach(m => { systemPrompt += `- ${m.content}\n`; });
            systemPrompt += `\n`;
        }

        let availableStickers = [];
        if (config.stickerGroupIds && config.stickerGroupIds.length > 0) {
            config.stickerGroupIds.forEach(groupId => {
                const group = wcState.stickerCategories[groupId];
                if (group && group.list) {
                    group.list.forEach(s => availableStickers.push(s.desc));
                }
            });
        }
        
        if (availableStickers.length > 0) {
            const limitedStickers = availableStickers.slice(0, 50); 
            systemPrompt += `【可用表情包】\n你可以发送表情包，当前可用的表情包描述有：${limitedStickers.join(', ')}。\n`;
        }

        const recentMoments = wcState.moments.slice(0, 5); 
        if (recentMoments.length > 0) {
            systemPrompt += `【朋友圈动态 (Moments) - 这是一个社交网络环境】\n`;
            systemPrompt += `你可以看到用户(User)和其他人发布的朋友圈。如果用户发了新内容，你可以点赞或评论。\n`;
            recentMoments.forEach(m => {
                const commentsStr = m.comments ? m.comments.map(c => `${c.name}: ${c.text}`).join(' | ') : '无';
                const likesStr = m.likes ? m.likes.join(', ') : '无';
                systemPrompt += `[ID:${m.id}] 发帖人:${m.name} | 内容:${m.text} | 图片:${m.imageDesc || '无'} | 点赞:${likesStr} | 评论:[${commentsStr}]\n`;
            });
            systemPrompt += `\n`;
        }

        systemPrompt += `【特殊动作指令】
除了发送普通文本，你可以使用以下标签触发特殊动作（必须严格按格式输出，不要加多余的空格）：
1. 发送语音：[语音]你想说的话[/语音]
2. 发送转账：[转账:金额:备注] (例如 [转账:50.50:请你喝奶茶])
3. 收取用户的转账：[收款] (当用户刚刚给你发了转账时，你可以输出这个标签来收款)
4. 退还用户的转账：[退款] (拒绝用户的转账)
5. 发布朋友圈：[动态:文本内容:图片描述] (例如 [动态:今天天气真好:蓝天白云的照片])
6. 评论朋友圈：[评论:动态ID:内容] (例如 [评论:1700000000:哈哈真有趣])
7. 回复朋友圈评论：[回复:动态ID:目标人名:内容] (例如 [回复:1700000000:User:谢谢夸奖])
8. 点赞朋友圈：[点赞:动态ID] (例如 [点赞:1700000000])
`;
        if (availableStickers.length > 0) {
            systemPrompt += `9. 发送表情包：[表情包:描述] (描述必须在上述【可用表情包】列表中)\n`;
        }
        systemPrompt += `\n请根据上下文自然地回复。你可以混合使用文本和特殊指令。如果当前聊天氛围适合发朋友圈，或者你想评论对方的朋友圈，请使用相应的指令。`;

        let limit = config.contextLimit > 0 ? config.contextLimit : 30;
        const msgs = wcState.chats[charId] || [];
        const recentMsgs = msgs.slice(-limit);
        
        const messages = [{ role: "system", content: systemPrompt }];
        
        recentMsgs.forEach(m => {
            if (m.type === 'system') {
                messages.push({
                    role: "system",
                    content: `[系统提示]: ${m.content}`
                });
                return;
            }

            let content = m.content;
            if (m.type === 'sticker') content = `[发送了一个表情包]`;
            if (m.type === 'image') content = `[发送了一张图片]`;
            if (m.type === 'voice') content = `[语音] ${m.content}`;
            if (m.type === 'transfer') content = `[转账: ${m.amount}元, 备注: ${m.note}, 状态: ${m.status}]`;
            
            messages.push({
                role: m.sender === 'me' ? 'user' : 'assistant',
                content: content
            });
        });

        const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiConfig.key}`
            },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: messages,
                temperature: parseFloat(apiConfig.temp) || 0.7
            })
        });

        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        let replyText = data.choices[0].message.content;

        await wcParseAIResponse(charId, replyText, config.stickerGroupIds);

    } catch (error) {
        console.error("API 请求失败:", error);
        wcAddMessage(charId, 'system', 'system', `API 请求失败: ${error.message}`, { style: 'transparent' });
    } finally {
        titleEl.innerText = originalTitle;
    }
}

// 辅助函数：延迟
function wcDelay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

async function wcParseAIResponse(charId, text, stickerGroupIds) {
    let remainingText = text;
    const actions = [];

    // 1. 解析所有动作并存入队列
    if (remainingText.includes('[收款]')) {
        actions.push({ type: 'transfer_action', status: 'received' });
        remainingText = remainingText.replace(/\[收款\]/g, '');
    }
    if (remainingText.includes('[退款]')) {
        actions.push({ type: 'transfer_action', status: 'rejected' });
        remainingText = remainingText.replace(/\[退款\]/g, '');
    }

    const transferRegex = /\[转账:([\d.]+):(.*?)\]/g;
    let match;
    while ((match = transferRegex.exec(remainingText)) !== null) {
        const amount = parseFloat(match[1]).toFixed(2);
        const note = match[2];
        if (!isNaN(amount)) {
            actions.push({ type: 'transfer', amount, note });
        }
    }
    remainingText = remainingText.replace(transferRegex, '');

    const voiceRegex = /\[语音\](.*?)\[\/语音\]/g;
    while ((match = voiceRegex.exec(remainingText)) !== null) {
        actions.push({ type: 'voice', content: match[1].trim() });
    }
    remainingText = remainingText.replace(voiceRegex, '');

    const stickerRegex = /\[表情包:(.*?)\]/g;
    while ((match = stickerRegex.exec(remainingText)) !== null) {
        const desc = match[1].trim();
        const url = wcFindStickerUrlMulti(stickerGroupIds, desc);
        if (url) {
            actions.push({ type: 'sticker', url });
        } else {
            actions.push({ type: 'text', content: `*(发送了一个表情: ${desc})*` });
        }
    }
    remainingText = remainingText.replace(stickerRegex, '');

    // 朋友圈相关操作直接执行，不延迟
    const momentRegex = /\[动态:(.*?):(.*?)]/g;
    while ((match = momentRegex.exec(remainingText)) !== null) {
        wcAIHandleMomentPost(charId, match[1], match[2]);
    }
    remainingText = remainingText.replace(momentRegex, '');

    const commentRegex = /\[评论:(\d+):(.*?)]/g;
    while ((match = commentRegex.exec(remainingText)) !== null) {
        wcAIHandleComment(charId, match[1], match[2]);
    }
    remainingText = remainingText.replace(commentRegex, '');

    const replyRegex = /\[回复:(\d+):(.*?):(.*?)]/g;
    while ((match = replyRegex.exec(remainingText)) !== null) {
        wcAIHandleReply(charId, match[1], match[2], match[3]);
    }
    remainingText = remainingText.replace(replyRegex, '');

    const likeRegex = /\[点赞:(\d+)\]/g;
    while ((match = likeRegex.exec(remainingText)) !== null) {
        wcAIHandleLike(charId, match[1]);
    }
    remainingText = remainingText.replace(likeRegex, '');

    // 处理剩余文本
    remainingText = remainingText.trim();
    if (remainingText) {
        const lines = remainingText.split('\n');
        lines.forEach(line => {
            if (line.trim()) {
                actions.push({ type: 'text', content: line.trim() });
            }
        });
    }

    // 2. 逐个执行动作，每条间隔 2 秒
    for (const action of actions) {
        await wcDelay(2000); // 延迟 2 秒
        
        if (action.type === 'transfer_action') {
            wcAIHandleTransfer(charId, action.status);
        } else if (action.type === 'transfer') {
            wcAddMessage(charId, 'them', 'transfer', '转账', { amount: action.amount, note: action.note, status: 'pending' });
        } else if (action.type === 'voice') {
            wcAddMessage(charId, 'them', 'voice', action.content);
        } else if (action.type === 'sticker') {
            wcAddMessage(charId, 'them', 'sticker', action.url);
        } else if (action.type === 'text') {
            wcAddMessage(charId, 'them', 'text', action.content);
        }
    }
}

function wcAIHandleMomentPost(charId, text, imageDesc) {
    const char = wcState.characters.find(c => c.id === charId);
    if (!char) return;
    
    const newMoment = {
        id: Date.now(),
        name: char.name,
        avatar: char.avatar,
        text: text,
        image: null,
        imageDesc: imageDesc,
        time: Date.now(),
        likes: [],
        comments: []
    };
    
    wcState.moments.unshift(newMoment);
    wcSaveData();
    wcRenderMoments();
}

function wcAIHandleComment(charId, momentId, text) {
    const char = wcState.characters.find(c => c.id === charId);
    const moment = wcState.moments.find(m => m.id == momentId);
    if (!char || !moment) return;

    if (!moment.comments) moment.comments = [];
    moment.comments.push({ name: char.name, text: text });
    wcSaveData();
    wcRenderMoments();
}

function wcAIHandleReply(charId, momentId, targetName, text) {
    const char = wcState.characters.find(c => c.id === charId);
    const moment = wcState.moments.find(m => m.id == momentId);
    if (!char || !moment) return;

    if (!moment.comments) moment.comments = [];
    moment.comments.push({ name: char.name, text: `回复 ${targetName}: ${text}` });
    wcSaveData();
    wcRenderMoments();
}

function wcAIHandleLike(charId, momentId) {
    const char = wcState.characters.find(c => c.id === charId);
    const moment = wcState.moments.find(m => m.id == momentId);
    if (!char || !moment) return;
    
    if (!moment.likes) moment.likes = [];
    if (!moment.likes.includes(char.name)) {
        moment.likes.push(char.name);
        wcSaveData();
        wcRenderMoments();
    }
}

function wcAIHandleTransfer(charId, status) {
    const msgs = wcState.chats[charId] || [];
    for (let i = msgs.length - 1; i >= 0; i--) {
        const m = msgs[i];
        if (m.type === 'transfer' && m.sender === 'me' && m.status === 'pending') {
            m.status = status;
            if (status === 'rejected') {
                const amount = parseFloat(m.amount);
                wcState.wallet.balance += amount;
                wcState.wallet.transactions.push({
                    id: Date.now(), type: 'income', amount: amount, note: `转账退还`, time: Date.now()
                });
                wcAddMessage(charId, 'them', 'system', `对方已退还你的转账`, { style: 'transparent' });
            } else if (status === 'received') {
                wcAddMessage(charId, 'them', 'system', `对方已收款`, { style: 'transparent' });
            }
            wcSaveData();
            wcRenderMessages(charId);
            break;
        }
    }
}

function wcFindStickerUrlMulti(groupIds, desc) {
    if (!groupIds || groupIds.length === 0) return null;
    for (const groupId of groupIds) {
        const group = wcState.stickerCategories[groupId];
        if (group && group.list) {
            const sticker = group.list.find(s => s.desc === desc);
            if (sticker) return sticker.url;
        }
    }
    return null;
}

function wcAddMessage(charId, sender, type, content, extra = {}) {
    if (!wcState.chats[charId]) wcState.chats[charId] = [];
    const msg = { 
        id: Date.now() + Math.random(),
        sender, type, content, time: Date.now(), ...extra
    };
    wcState.chats[charId].push(msg);
    
    const char = wcState.characters.find(c => c.id === charId);
    if (char && char.chatConfig && char.chatConfig.summaryTrigger > 0) {
        const triggerCount = char.chatConfig.summaryTrigger;
        const totalMsgs = wcState.chats[charId].length;
        
        if (totalMsgs % triggerCount === 0) {
            const start = totalMsgs - triggerCount;
            const end = totalMsgs - 1;
            wcAutoGenerateSummary(charId, start, end);
        }
    }

    wcSaveData();
    if (wcState.activeChatId === charId) {
        wcRenderMessages(charId);
        wcScrollToBottom();
    }
}

// --- iOS Loading Overlay Functions ---
function wcShowLoading(text = "正在生成内容...") {
    const overlay = document.getElementById('wc-ios-loading-overlay');
    const spinner = document.getElementById('wc-loading-spinner');
    const success = document.getElementById('wc-loading-success');
    const error = document.getElementById('wc-loading-error');
    const textEl = document.getElementById('wc-loading-text');

    spinner.style.display = 'block';
    success.classList.add('hidden');
    error.classList.add('hidden');
    textEl.innerText = text;
    overlay.classList.remove('hidden');
}

function wcShowSuccess(text = "生成成功") {
    const spinner = document.getElementById('wc-loading-spinner');
    const success = document.getElementById('wc-loading-success');
    const textEl = document.getElementById('wc-loading-text');

    spinner.style.display = 'none';
    success.classList.remove('hidden');
    textEl.innerText = text;

    setTimeout(() => {
        document.getElementById('wc-ios-loading-overlay').classList.add('hidden');
    }, 1500);
}

function wcShowError(text = "生成失败") {
    const spinner = document.getElementById('wc-loading-spinner');
    const error = document.getElementById('wc-loading-error');
    const textEl = document.getElementById('wc-loading-text');

    spinner.style.display = 'none';
    error.classList.remove('hidden');
    textEl.innerText = text;

    setTimeout(() => {
        document.getElementById('wc-ios-loading-overlay').classList.add('hidden');
    }, 2000);
}

async function wcAutoGenerateSummary(charId, start, end) {
    const char = wcState.characters.find(c => c.id === charId);
    const msgs = wcState.chats[charId] || [];
    const sliceMsgs = msgs.slice(start, end + 1);
    const apiConfig = await idb.get('ios_theme_api_config');
    
    if (!apiConfig || !apiConfig.key) return;

    // 自动总结不显示弹窗，静默执行
    try {
        let prompt = `请自动总结以下对话片段 (${start}-${end})，提取关键信息。\n`;
        
        if (char.chatConfig && char.chatConfig.summaryWorldbookEntries) {
            prompt += `\n【参考背景】\n`;
            char.chatConfig.summaryWorldbookEntries.forEach(id => {
                const entry = worldbookEntries.find(e => e.id.toString() === id.toString());
                if (entry) prompt += `- ${entry.title}: ${entry.desc}\n`;
            });
        }

        prompt += `\n【对话】\n`;
        sliceMsgs.forEach(m => {
            const sender = m.sender === 'me' ? '用户' : char.name;
            let content = m.content;
            if (m.type !== 'text') content = `[${m.type}]`;
            prompt += `${sender}: ${content}\n`;
        });

        const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.5
            })
        });

        const data = await response.json();
        const summary = data.choices[0].message.content;

        if (!char.memories) char.memories = [];
        char.memories.unshift({
            id: Date.now(),
            type: 'summary',
            content: `[自动总结 ${start}-${end}] ${summary}`,
            time: Date.now()
        });
        wcSaveData();
        if (document.getElementById('wc-view-memory').classList.contains('active')) {
            wcRenderMemories();
        }
        console.log("自动总结完成");

    } catch (e) {
        console.error("自动总结失败", e);
    }
}

// --- WeChat Panels ---
function wcToggleStickerPanel() {
    if (wcState.isStickerPanelOpen) {
        wcCloseAllPanels();
    } else {
        wcState.isMorePanelOpen = false;
        wcState.isStickerPanelOpen = true;
        wcUpdatePanelUI();
    }
}

function wcToggleMorePanel() {
    if (wcState.isMorePanelOpen) {
        wcCloseAllPanels();
    } else {
        wcState.isStickerPanelOpen = false;
        wcState.isMorePanelOpen = true;
        wcUpdatePanelUI();
    }
}

function wcCloseAllPanels() {
    wcState.isStickerPanelOpen = false;
    wcState.isMorePanelOpen = false;
    wcState.isStickerDeleteMode = false;
    wcUpdatePanelUI();
}

function wcUpdatePanelUI() {
    const stickerPanel = document.getElementById('wc-sticker-panel');
    const morePanel = document.getElementById('wc-more-panel');
    const footer = document.getElementById('wc-chat-footer');
    const scrollArea = document.getElementById('wc-chat-messages');

    stickerPanel.classList.remove('active');
    morePanel.classList.remove('active');
    footer.classList.remove('panel-active');
    scrollArea.classList.remove('panel-open');

    if (wcState.isStickerPanelOpen) {
        stickerPanel.classList.add('active');
        footer.classList.add('panel-active');
        scrollArea.classList.add('panel-open');
        wcRenderStickerPanel();
    } else if (wcState.isMorePanelOpen) {
        morePanel.classList.add('active');
        footer.classList.add('panel-active');
        scrollArea.classList.add('panel-open');
    }
    wcScrollToBottom();
}

// --- WeChat Stickers ---
function wcRenderStickerPanel() {
    const container = document.getElementById('wc-sticker-tabs');
    container.innerHTML = '';
    wcState.stickerCategories.forEach((cat, index) => {
        const tab = document.createElement('div');
        tab.className = `wc-sticker-tab-item ${index === wcState.activeStickerCategoryIndex ? 'active' : ''}`;
        tab.innerText = cat.name;
        tab.onclick = () => { wcState.activeStickerCategoryIndex = index; wcRenderStickerPanel(); };
        container.appendChild(tab);
    });

    const grid = document.getElementById('wc-sticker-grid');
    grid.innerHTML = '';
    const currentCat = wcState.stickerCategories[wcState.activeStickerCategoryIndex];
    if (!currentCat || !currentCat.list) return;

    currentCat.list.forEach((sticker, index) => {
        const item = document.createElement('div');
        item.className = `wc-sticker-item ${wcState.isStickerDeleteMode ? 'shake' : ''}`;
        
        item.style.display = 'flex';
        item.style.flexDirection = 'column';
        item.style.alignItems = 'center';
        item.style.justifyContent = 'center';
        item.style.padding = '5px';
        
        const img = document.createElement('img');
        img.src = sticker.url;
        img.style.width = '50px';
        img.style.height = '50px';
        img.style.objectFit = 'contain';
        item.appendChild(img);

        const desc = document.createElement('div');
        desc.style.fontSize = '10px';
        desc.style.color = '#888';
        desc.style.textAlign = 'center';
        desc.style.marginTop = '4px';
        desc.style.overflow = 'hidden';
        desc.style.textOverflow = 'ellipsis';
        desc.style.whiteSpace = 'nowrap';
        desc.style.width = '100%';
        desc.style.maxWidth = '60px';
        desc.innerText = sticker.desc;
        item.appendChild(desc);

        if (wcState.isStickerDeleteMode) {
            const badge = document.createElement('div');
            badge.className = 'wc-sticker-delete-badge';
            badge.innerText = '×';
            badge.onclick = (e) => { 
                e.stopPropagation(); 
                currentCat.list.splice(index, 1); 
                wcSaveData(); 
                wcRenderStickerPanel(); 
            };
            item.appendChild(badge);
        } else {
            item.onclick = (e) => {
                e.stopPropagation();
                wcAddMessage(wcState.activeChatId, 'me', 'sticker', sticker.url);
            };
        }
        grid.appendChild(item);
    });
}

function wcOpenStickerOptions(e) {
    if(e) e.stopPropagation();
    const btnText = document.getElementById('wc-btn-sticker-manage-text');
    btnText.innerText = wcState.isStickerDeleteMode ? "退出管理模式" : "管理表情 (删除)";
    btnText.style.color = wcState.isStickerDeleteMode ? "#000" : "#007AFF";
    wcOpenModal('wc-sticker-options-modal');
}

function wcToggleStickerDeleteMode() {
    wcState.isStickerDeleteMode = !wcState.isStickerDeleteMode;
    wcRenderStickerPanel();
}

function wcImportStickers() {
    const catName = document.getElementById('wc-sticker-category-name').value.trim();
    const data = document.getElementById('wc-sticker-import-text').value;
    if (!catName || !data) return alert('请填写完整');
    const lines = data.split('\n');
    const newStickers = [];
    lines.forEach(line => {
        const match = line.match(/^([^:：]+)[:：](.+)$/);
        if (match) newStickers.push({ desc: match[1].trim(), url: match[2].trim() });
    });
    if (newStickers.length === 0) return alert('格式错误');
    
    wcState.stickerCategories.push({ name: catName, list: newStickers });
    wcState.stickerCategories[0].list.push(...newStickers);
    
    wcSaveData();
    wcCloseModal('wc-import-sticker-modal');
    wcState.activeStickerCategoryIndex = wcState.stickerCategories.length - 1;
    wcRenderStickerPanel();
}

function wcOpenDeleteCategoriesModal() {
    const list = document.getElementById('wc-sticker-delete-cats-list');
    list.innerHTML = '';
    wcState.stickerCategories.forEach((cat, index) => {
        if (index === 0) return; 
        const div = document.createElement('div');
        div.className = 'wc-list-item';
        div.style.background = 'white';
        div.innerHTML = `<div class="wc-item-content"><div class="wc-item-title">${cat.name}</div></div><input type="checkbox" class="wc-delete-cat-checkbox" value="${index}">`;
        list.appendChild(div);
    });
    wcOpenModal('wc-sticker-delete-cats-modal');
}

function wcConfirmDeleteCategories() {
    const checkboxes = document.querySelectorAll('.wc-delete-cat-checkbox:checked');
    const indices = Array.from(checkboxes).map(cb => parseInt(cb.value)).sort((a,b)=>b-a);
    indices.forEach(i => wcState.stickerCategories.splice(i, 1));
    
    const allStickers = [];
    for (let i = 1; i < wcState.stickerCategories.length; i++) {
        allStickers.push(...wcState.stickerCategories[i].list);
    }
    wcState.stickerCategories[0].list = allStickers;

    wcState.activeStickerCategoryIndex = 0;
    wcSaveData();
    wcCloseModal('wc-sticker-delete-cats-modal');
    wcRenderStickerPanel();
}

// --- WeChat More Actions ---
function wcActionRoll() {
    const msgs = wcState.chats[wcState.activeChatId];
    if (!msgs || msgs.length === 0) return;

    let lastMeIndex = -1;
    for (let i = msgs.length - 1; i >= 0; i--) {
        if (msgs[i].sender === 'me') {
            lastMeIndex = i;
            break;
        }
    }

    if (lastMeIndex !== -1) {
        wcState.chats[wcState.activeChatId] = msgs.slice(0, lastMeIndex + 1);
    } else {
        wcState.chats[wcState.activeChatId] = [];
    }

    wcSaveData();
    wcRenderMessages(wcState.activeChatId);
    wcTriggerAI();
    wcCloseAllPanels();
}

function wcActionVoice() {
    wcCloseAllPanels();
    wcOpenGeneralInput("输入语音内容", (text) => {
        if (text) wcAddMessage(wcState.activeChatId, 'me', 'voice', text);
    });
}

function wcToggleVoiceText(msgId) {
    const msgs = wcState.chats[wcState.activeChatId];
    const msg = msgs.find(m => m.id === msgId);
    if (msg) {
        msg.showText = !msg.showText;
        wcRenderMessages(wcState.activeChatId);
    }
}

function wcActionImageDesc() {
    const desc = prompt("请输入图片描述：");
    if (desc) wcAddMessage(wcState.activeChatId, 'me', 'text', `[图片描述] ${desc}`);
}

// --- WeChat Memory ---
function wcActionMemory() {
    wcCloseAllPanels();
    wcOpenMemoryPage();
}

function wcOpenMemoryPage() {
    document.getElementById('wc-view-chat-detail').classList.remove('active');
    document.getElementById('wc-view-memory').classList.add('active');
    document.getElementById('wc-nav-title').innerText = '回忆总结';
    
    const rightContainer = document.getElementById('wc-nav-right-container');
    rightContainer.innerHTML = '';
    
    const btnSettings = document.createElement('button');
    btnSettings.className = 'wc-nav-btn';
    btnSettings.innerHTML = '<svg class="wc-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>';
    btnSettings.onclick = () => wcOpenMemorySettingsModal();
    rightContainer.appendChild(btnSettings);

    const btn = document.createElement('button');
    btn.className = 'wc-nav-btn';
    btn.innerHTML = '<svg class="wc-icon" viewBox="0 0 24 24"><circle cx="12" cy="12" r="1"></circle><circle cx="19" cy="12" r="1"></circle><circle cx="5" cy="12" r="1"></circle></svg>';
    btn.onclick = () => wcOpenModal('wc-modal-memory-actions');
    rightContainer.appendChild(btn);

    wcRenderMemories();
}

function wcCloseMemoryPage() {
    document.getElementById('wc-view-memory').classList.remove('active');
    document.getElementById('wc-view-chat-detail').classList.add('active');
    const char = wcState.characters.find(c => c.id === wcState.activeChatId);
    document.getElementById('wc-nav-title').innerText = char.note || char.name;
    
    const rightContainer = document.getElementById('wc-nav-right-container');
    rightContainer.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'wc-nav-btn';
    btn.innerHTML = '<svg class="wc-icon" viewBox="0 0 24 24"><line x1="3" y1="12" x2="21" y2="12"></line><line x1="3" y1="6" x2="21" y2="6"></line><line x1="3" y1="18" x2="21" y2="18"></line></svg>';
    btn.onclick = () => wcOpenChatSettings();
    rightContainer.appendChild(btn);
}

function wcRenderMemories() {
    const container = document.getElementById('wc-memory-list-container');
    container.innerHTML = '';
    const char = wcState.characters.find(c => c.id === wcState.activeChatId);
    if (!char.memories) char.memories = [];

    if (char.memories.length === 0) {
        container.innerHTML = '<div style="text-align: center; color: #8E8E93; padding-top: 50px;">暂无回忆</div>';
        return;
    }

    char.memories.forEach((mem, index) => {
        const div = document.createElement('div');
        div.className = 'wc-memory-card';
        div.innerHTML = `
            <div class="wc-memory-header">
                <span>${new Date(mem.time).toLocaleString()}</span>
                <span>${mem.type === 'summary' ? '自动总结' : '手动添加'}</span>
            </div>
            <div class="wc-memory-content">${mem.content}</div>
            <div class="wc-memory-delete-btn" onclick="wcDeleteMemory(${index})">删除</div>
        `;
        container.appendChild(div);
    });
}

function wcDeleteMemory(index) {
    if (confirm("确定删除这条记忆吗？")) {
        const char = wcState.characters.find(c => c.id === wcState.activeChatId);
        char.memories.splice(index, 1);
        wcSaveData();
        wcRenderMemories();
    }
}

function wcOpenMemorySummaryModal() {
    const msgs = wcState.chats[wcState.activeChatId] || [];
    document.getElementById('wc-mem-total-count-label').innerText = `当前聊天总层数: ${msgs.length}`;
    wcOpenModal('wc-modal-memory-summary');
}

function wcOpenMemorySettingsModal() {
    const char = wcState.characters.find(c => c.id === wcState.activeChatId);
    if (!char) return;
    if (!char.chatConfig) char.chatConfig = {};

    document.getElementById('wc-mem-setting-trigger').value = char.chatConfig.summaryTrigger || 0;

    const list = document.getElementById('wc-mem-setting-wb-list');
    list.innerHTML = '';
    
    if (!char.chatConfig.summaryWorldbookEntries) char.chatConfig.summaryWorldbookEntries = [];

    if (worldbookEntries.length === 0) {
        list.innerHTML = '<div style="color:#999; font-size:13px;">暂无世界书条目</div>';
    } else {
        worldbookEntries.forEach(entry => {
            const div = document.createElement('div');
            div.className = 'wc-checkbox-item';
            const isChecked = char.chatConfig.summaryWorldbookEntries.includes(entry.id.toString());
            div.innerHTML = `<input type="checkbox" value="${entry.id}" ${isChecked ? 'checked' : ''}><span>${entry.title} (${entry.type})</span>`;
            list.appendChild(div);
        });
    }

    wcOpenModal('wc-modal-memory-settings');
}

function wcSaveMemorySettings() {
    const char = wcState.characters.find(c => c.id === wcState.activeChatId);
    if (!char) return;
    if (!char.chatConfig) char.chatConfig = {};

    const triggerCount = parseInt(document.getElementById('wc-mem-setting-trigger').value) || 0;
    char.chatConfig.summaryTrigger = triggerCount;

    const checkboxes = document.querySelectorAll('#wc-mem-setting-wb-list input[type="checkbox"]:checked');
    char.chatConfig.summaryWorldbookEntries = Array.from(checkboxes).map(cb => cb.value);

    wcSaveData();
    wcCloseModal('wc-modal-memory-settings');
    alert("回忆设置已保存");
}

async function wcGenerateSummary() {
    const start = parseInt(document.getElementById('wc-mem-start-idx').value);
    const end = parseInt(document.getElementById('wc-mem-end-idx').value);
    
    if (isNaN(start) || isNaN(end) || start > end) {
        alert("请输入有效的起始和结束层数");
        return;
    }

    const char = wcState.characters.find(c => c.id === wcState.activeChatId);
    const msgs = wcState.chats[wcState.activeChatId] || [];
    
    const sliceMsgs = msgs.slice(start, end + 1);
    if (sliceMsgs.length === 0) {
        alert("该范围内没有消息");
        return;
    }

    const apiConfig = await idb.get('ios_theme_api_config');
    if (!apiConfig || !apiConfig.baseUrl || !apiConfig.key || !apiConfig.model) {
        alert("请先配置 API");
        return;
    }

    wcCloseModal('wc-modal-memory-summary');
    wcShowLoading("正在生成总结...");

    try {
        let prompt = `请总结以下对话的主要内容，提取关键信息和情感变化，字数控制在200字以内。\n`;
        
        let wbIds = [];
        if (char.chatConfig && char.chatConfig.summaryWorldbookEntries && char.chatConfig.summaryWorldbookEntries.length > 0) {
            wbIds = char.chatConfig.summaryWorldbookEntries;
        } else {
            wbIds = tempSummaryWbIds;
        }

        if (wbIds.length > 0) {
            prompt += `\n【参考背景资料】\n`;
            wbIds.forEach(id => {
                const entry = worldbookEntries.find(e => e.id.toString() === id.toString());
                if (entry) prompt += `- ${entry.title}: ${entry.desc}\n`;
            });
        }

        prompt += `\n【对话内容】\n`;
        sliceMsgs.forEach(m => {
            const sender = m.sender === 'me' ? '用户' : char.name;
            let content = m.content;
            if (m.type !== 'text') content = `[${m.type}]`;
            prompt += `${sender}: ${content}\n`;
        });

        const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiConfig.key}`
            },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.5
            })
        });

        if (!response.ok) throw new Error("API Error");
        const data = await response.json();
        const summary = data.choices[0].message.content;

        if (!char.memories) char.memories = [];
        char.memories.unshift({
            id: Date.now(),
            type: 'summary',
            content: `[总结 ${start}-${end}] ${summary}`,
            time: Date.now()
        });
        wcSaveData();
        wcRenderMemories();
        wcShowSuccess("总结生成成功");

    } catch (e) {
        wcShowError("生成失败");
    }
}

function wcAddManualMemory() {
    const text = document.getElementById('wc-mem-manual-text').value;
    if (!text) return;
    const char = wcState.characters.find(c => c.id === wcState.activeChatId);
    if (!char.memories) char.memories = [];
    
    char.memories.unshift({
        id: Date.now(),
        type: 'manual',
        content: text,
        time: Date.now()
    });
    wcSaveData();
    wcRenderMemories();
    document.getElementById('wc-mem-manual-text').value = '';
    wcCloseModal('wc-modal-memory-add');
}

function wcSaveAiMemoryCount() {
    const count = document.getElementById('wc-mem-ai-read-count').value;
    const char = wcState.characters.find(c => c.id === wcState.activeChatId);
    if (!char.chatConfig) char.chatConfig = {};
    char.chatConfig.aiMemoryCount = parseInt(count) || 5;
    wcSaveData();
    wcCloseModal('wc-modal-memory-ai-count');
    alert(`已设置发送给AI的记忆条数为: ${char.chatConfig.aiMemoryCount}`);
}

// --- WeChat General Input ---
function wcOpenGeneralInput(title, callback, isPassword = false) {
    document.getElementById('wc-general-input-title').innerText = title;
    const input = document.getElementById('wc-general-input-field');
    input.value = '';
    input.type = isPassword ? 'password' : 'text';
    wcState.generalInputCallback = callback;
    wcOpenModal('wc-modal-general-input');
    input.focus();
}

// --- WeChat Transfer ---
function wcOpenTransferModal() {
    document.getElementById('wc-transfer-amount').value = '';
    document.getElementById('wc-transfer-note').value = '';
    wcOpenModal('wc-modal-transfer-input');
    wcCloseAllPanels();
}

function wcSubmitTransferDetails() {
    const amount = document.getElementById('wc-transfer-amount').value;
    const note = document.getElementById('wc-transfer-note').value;
    if (!amount || parseFloat(amount) <= 0) return alert("请输入有效金额");
    
    wcState.tempTransfer = { amount, note };
    wcCloseModal('wc-modal-transfer-input');
    
    wcOpenGeneralInput("请输入支付密码", (pass) => {
        wcCheckPassword(pass);
    }, true);
}

function wcCheckPassword(val) {
    if (val !== wcState.wallet.password) {
        alert("密码错误！");
        return;
    }
    const amount = parseFloat(wcState.tempTransfer.amount);
    if (wcState.wallet.balance < amount) {
        alert("余额不足！请先充值。");
        return;
    }
    wcState.wallet.balance -= amount;
    wcState.wallet.transactions.push({
        id: Date.now(), type: 'payment', amount: amount,
        note: `转账给 ${document.getElementById('wc-nav-title').innerText}`, time: Date.now()
    });
    wcSaveData();
    wcAddMessage(wcState.activeChatId, 'me', 'transfer', '转账', {
        amount: wcState.tempTransfer.amount,
        note: wcState.tempTransfer.note,
        status: 'pending'
    });
}

function wcHandleTransferClick(msgId) {
    const msgs = wcState.chats[wcState.activeChatId];
    const msg = msgs.find(m => m.id === msgId);
    if (!msg) return;
    if (msg.status !== 'pending') return;

    if (msg.sender === 'me') {
        alert("等待对方收款");
    } else {
        wcState.activeTransferMsgId = msgId;
        wcOpenModal('wc-modal-transfer-action');
    }
}

function wcConfirmTransferReceive() { wcUpdateTransferStatus('received'); }
function wcConfirmTransferReject() { wcUpdateTransferStatus('rejected'); }

function wcUpdateTransferStatus(status) {
    const msgs = wcState.chats[wcState.activeChatId];
    const msg = msgs.find(m => m.id === wcState.activeTransferMsgId);
    if (msg) {
        msg.status = status;
        if (status === 'received') {
            const amount = parseFloat(msg.amount);
            wcState.wallet.balance += amount;
            wcState.wallet.transactions.push({
                id: Date.now(), type: 'income', amount: amount, note: `收到转账`, time: Date.now()
            });
            wcAddMessage(wcState.activeChatId, 'me', 'system', `已收款，资金已存入零钱`, { style: 'transparent' });
        } else if (status === 'rejected') {
            wcAddMessage(wcState.activeChatId, 'me', 'system', `已退还转账`, { style: 'transparent' });
        }
        wcSaveData();
        wcRenderMessages(wcState.activeChatId);
    }
    wcCloseModal('wc-modal-transfer-action');
}

// --- WeChat Wallet ---
function wcOpenWallet() {
    document.getElementById('wc-view-user').classList.remove('active');
    document.getElementById('wc-view-wallet').classList.add('active');
    
    document.getElementById('wc-main-tabbar').style.display = 'none';
    
    document.getElementById('wc-btn-exit').style.display = 'none';
    document.getElementById('wc-btn-back').style.display = 'flex';
    
    document.getElementById('wc-btn-back').onclick = wcCloseWallet;
    
    document.getElementById('wc-nav-title').innerText = '钱包';
    
    const rightContainer = document.getElementById('wc-nav-right-container');
    rightContainer.innerHTML = '';
    const btn = document.createElement('button');
    btn.className = 'wc-nav-btn';
    btn.innerText = '设置'; 
    btn.onclick = () => wcOpenModal('wc-modal-wallet-settings');
    rightContainer.appendChild(btn);

    wcRenderWallet();
}

function wcCloseWallet() {
    document.getElementById('wc-view-wallet').classList.remove('active');
    wcSwitchTab('user');
    
    document.getElementById('wc-main-tabbar').style.display = 'flex';
    document.getElementById('wc-btn-back').style.display = 'none';
    document.getElementById('wc-btn-exit').style.display = 'flex';
    
    document.getElementById('wc-btn-back').onclick = wcHandleBack;
}

function wcRenderWallet() {
    document.getElementById('wc-wallet-balance-display').innerText = parseFloat(wcState.wallet.balance).toFixed(2);
    const list = document.getElementById('wc-wallet-history-list');
    list.innerHTML = '';
    const sortedTrans = [...wcState.wallet.transactions].sort((a, b) => b.time - a.time);

    if (sortedTrans.length === 0) {
        list.innerHTML = '<div style="padding: 20px; text-align: center; color: #8E8E93;">暂无交易记录</div>';
        return;
    }

    sortedTrans.forEach(t => {
        const div = document.createElement('div');
        div.className = 'wc-transaction-item';
        const isIncome = t.type === 'income' || t.type === 'recharge';
        const sign = isIncome ? '+' : '-';
        const colorClass = isIncome ? 'wc-amount-in' : 'wc-amount-out';
        div.innerHTML = `
            <div class="wc-trans-info">
                <div class="wc-trans-title">${t.note}</div>
                <div class="wc-trans-time">${new Date(t.time).toLocaleString()}</div>
            </div>
            <div class="wc-trans-amount ${colorClass}">${sign}${parseFloat(t.amount).toFixed(2)}</div>
        `;
        list.appendChild(div);
    });
}

function wcOpenRechargeModal() {
    document.getElementById('wc-recharge-amount').value = '';
    wcOpenModal('wc-modal-recharge');
}

function wcConfirmRecharge() {
    const amount = parseFloat(document.getElementById('wc-recharge-amount').value);
    if (!amount || amount <= 0) return alert("请输入有效金额");
    wcState.wallet.balance += amount;
    wcState.wallet.transactions.push({
        id: Date.now(), type: 'recharge', amount: amount, note: '余额充值', time: Date.now()
    });
    wcSaveData();
    wcRenderWallet();
    wcCloseModal('wc-modal-recharge');
    alert(`充值成功 +${amount.toFixed(2)}`);
}

function wcOpenSetPasswordModal() {
    wcOpenGeneralInput("设置新支付密码 (6位数字)", (newPass) => {
        if (newPass && newPass.length === 6 && !isNaN(newPass)) {
            wcState.wallet.password = newPass;
            wcSaveData();
            alert("密码设置成功");
        } else if (newPass) {
            alert("密码格式错误，必须为6位数字");
        }
    }, true);
}

function wcClearTransactionHistory() {
    if (confirm("确定清空所有交易记录吗？余额不会改变。")) {
        wcState.wallet.transactions = [];
        wcSaveData();
        wcRenderWallet();
    }
}

// --- WeChat Render All ---
function wcRenderAll() { wcRenderContacts(); wcRenderChats(); wcRenderMoments(); wcRenderUser(); }

function wcRenderContacts() {
    const list = document.getElementById('wc-contacts-list');
    list.innerHTML = '';
    wcState.characters.forEach(char => {
        const div = document.createElement('div');
        div.className = 'wc-swipe-container';
        div.innerHTML = `<div class="wc-swipe-actions" onclick="wcDeleteCharacter(${char.id})">删除</div><div class="wc-swipe-content" onclick="wcShowCharDetail(${char.id})" ontouchstart="wcHandleTouchStartSwipe(event)" ontouchmove="wcHandleTouchMoveSwipe(event)" ontouchend="wcHandleTouchEndSwipe(event)"><img src="${char.avatar}" class="wc-avatar"><div class="wc-item-content"><div class="wc-item-title">${char.name}</div><div class="wc-item-subtitle">${char.note}</div></div></div>`;
        list.appendChild(div);
    });
}

function wcRenderChats() {
    const list = document.getElementById('wc-chat-list');
    list.innerHTML = '';
    const pinnedChars = wcState.characters.filter(c => c.isPinned);
    const otherChars = wcState.characters.filter(c => !c.isPinned).sort((a, b) => {
        const msgsA = wcState.chats[a.id] || [];
        const msgsB = wcState.chats[b.id] || [];
        const timeA = msgsA.length > 0 ? msgsA[msgsA.length - 1].time : 0;
        const timeB = msgsB.length > 0 ? msgsB[msgsB.length - 1].time : 0;
        return timeB - timeA;
    });

    const createChatItem = (char) => {
        const msgs = wcState.chats[char.id] || [];
        const lastMsg = msgs.length > 0 ? msgs[msgs.length - 1] : null;
        let subtitle = '点击开始聊天...';
        let timeStr = '';
        if (lastMsg) {
            if (lastMsg.type === 'sticker') subtitle = '[表情包]';
            else if (lastMsg.type === 'image') subtitle = '[图片]';
            else if (lastMsg.type === 'voice') subtitle = '[语音]';
            else if (lastMsg.type === 'transfer') subtitle = '[转账]';
            else if (lastMsg.type === 'system') subtitle = '[系统消息]';
            else subtitle = lastMsg.content;
            timeStr = new Date(lastMsg.time).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
        }
        
        const div = document.createElement('div');
        div.className = 'wc-chat-swipe-container';
        const pinText = char.isPinned ? "取消置顶" : "置顶";
        const pinClass = char.isPinned ? "wc-pinned-chat" : "";
        
        div.innerHTML = `
            <div class="wc-chat-swipe-actions">
                <div class="wc-chat-action-btn wc-btn-pin" onclick="wcTogglePin(${char.id})">${pinText}</div>
            </div>
            <div class="wc-chat-swipe-content ${pinClass}" onclick="wcOpenChat(${char.id})" ontouchstart="wcHandleTouchStartSwipe(event)" ontouchmove="wcHandleTouchMoveSwipe(event)" ontouchend="wcHandleTouchEndSwipe(event)">
                <img src="${char.avatar}" class="wc-avatar">
                <div class="wc-item-content">
                    <div class="wc-item-title">${char.note || char.name}</div>
                    <div class="wc-item-subtitle">${subtitle}</div>
                </div>
                <div style="font-size: 12px; color: #C7C7CC;">${timeStr}</div>
            </div>
        `;
        return div;
    };

    pinnedChars.forEach(char => list.appendChild(createChatItem(char)));
    if (pinnedChars.length > 0 && otherChars.length > 0) {
        const sep = document.createElement('div');
        sep.className = 'wc-list-separator';
        sep.innerText = 'ovo';
        list.appendChild(sep);
    }
    otherChars.forEach(char => list.appendChild(createChatItem(char)));
}

function wcRenderMoments() {
    const feed = document.getElementById('wc-moments-feed');
    feed.innerHTML = '';
    if (wcState.user.cover) document.getElementById('wc-moments-cover').src = wcState.user.cover;
    if (wcState.user.avatar) document.getElementById('wc-moments-user-avatar').src = wcState.user.avatar;
    
    wcState.moments.forEach(moment => {
        let mediaHtml = '';
        if (moment.image) mediaHtml = `<img src="${moment.image}" class="wc-moment-image">`;
        else if (moment.imageDesc) mediaHtml = `<div class="wc-moment-image-placeholder"><svg class="wc-icon" style="margin-bottom: 4px;" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg><div>[图片] ${moment.imageDesc}</div></div>`;
        
        let likesHtml = '';
        if (moment.likes && moment.likes.length > 0) likesHtml = `<div class="wc-moment-like-row"><svg class="wc-icon wc-icon-fill" style="width:14px; height:14px; margin-right:4px;" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>${moment.likes.join(', ')}</div>`;
        
        let commentsHtml = '';
        if (moment.comments && moment.comments.length > 0) {
            moment.comments.forEach((c, cIdx) => { 
                commentsHtml += `<div class="wc-moment-comment-row" onclick="wcPrepareReply(${moment.id}, ${cIdx}, '${c.name}')"><span class="wc-moment-comment-name">${c.name}:</span> ${c.text}</div>`; 
            });
        }
        
        const interactionArea = (likesHtml || commentsHtml) ? `<div class="wc-moment-likes-comments">${likesHtml}${commentsHtml}</div>` : '';
        
        const div = document.createElement('div');
        div.className = 'wc-moment-card';
        div.innerHTML = `
            <img src="${moment.avatar || wcState.user.avatar}" class="wc-avatar" style="width: 40px; height: 40px; border-radius: 4px;">
            <div class="wc-moment-content">
                <div class="wc-moment-name">${moment.name || wcState.user.name}</div>
                <div class="wc-moment-text">${moment.text}</div>
                ${mediaHtml}
                <div class="wc-moment-actions">
                    <div style="display: flex; align-items: center; gap: 10px;">
                        <span style="font-size: 12px; color: #8E8E93;">${new Date(moment.time).toLocaleTimeString()}</span>
                        <span style="font-size: 12px; color: #576B95; cursor: pointer;" onclick="wcDeleteMoment(${moment.id})">删除</span>
                    </div>
                    <div style="display: flex; gap: 16px;">
                        <div onclick="wcToggleLike(${moment.id})"><svg class="wc-icon" style="width:20px; height:20px; color: #576B95;" viewBox="0 0 24 24"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg></div>
                        <div onclick="wcToggleCommentBox(${moment.id})"><svg class="wc-icon" style="width:20px; height:20px; color: #576B95;" viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"></path></svg></div>
                    </div>
                </div>
                ${interactionArea}
                <div id="wc-comment-box-${moment.id}" class="wc-comment-input-box" style="display: none;">
                    <input type="text" id="wc-input-comment-${moment.id}" class="wc-comment-input" placeholder="评论...">
                    <button class="wc-moment-action-btn" onclick="wcAddComment(${moment.id})">发送</button>
                </div>
            </div>
        `;
        feed.prepend(div);
    });
}

function wcRenderUser() { 
    if (wcState.user.avatar) document.getElementById('wc-user-center-avatar').src = wcState.user.avatar; 
    document.getElementById('wc-user-name-display').innerText = wcState.user.name; 
}

// --- WeChat Character & User Management ---
function wcTriggerUpload(type) { document.getElementById(`wc-file-input-${type}`).click(); }

async function wcHandleFileSelect(event, type) {
    const file = event.target.files[0];
    if (!file) return;
    try {
        const base64 = await wcCompressImage(file);
        wcState.tempImage = base64;
        wcState.tempImageType = type; 

        if (type === 'char') {
            document.getElementById('wc-preview-char-avatar').src = base64;
            document.getElementById('wc-preview-char-avatar').style.display = 'block';
            document.getElementById('wc-icon-char-upload').style.display = 'none';
        } else if (type === 'edit-char') {
            document.getElementById('wc-edit-char-avatar').src = base64;
        } else if (type === 'user') {
            wcState.user.avatar = base64;
            wcSaveData();
            wcRenderUser();
        } else if (type === 'cover') {
            wcState.user.cover = base64;
            wcSaveData();
            wcRenderMoments();
        } else if (type === 'moment') {
            document.getElementById('wc-preview-moment-img').src = base64;
            document.getElementById('wc-preview-moment-img').style.display = 'block';
            document.getElementById('wc-icon-moment-upload').style.display = 'none';
        } else if (type === 'mask') {
            document.getElementById('wc-preview-mask-avatar').src = base64;
        } else if (type === 'chat-img') {
            wcAddMessage(wcState.activeChatId, 'me', 'image', base64);
            wcCloseAllPanels();
        } else if (type === 'setting-char') {
            document.getElementById('wc-setting-char-avatar').src = base64;
        } else if (type === 'setting-user') {
            document.getElementById('wc-setting-user-avatar').src = base64;
        } else if (type === 'setting-bg') {
            document.getElementById('wc-setting-bg-preview').src = base64;
            document.getElementById('wc-setting-bg-preview').style.display = 'block';
            document.getElementById('wc-setting-bg-text').style.display = 'none';
        } else if (type === 'phone-bg') {
            document.getElementById('wc-preview-phone-bg').src = base64;
            document.getElementById('wc-preview-phone-bg').style.display = 'block';
            document.getElementById('wc-text-phone-bg').style.display = 'none';
            wcState.tempPhoneConfig.wallpaper = base64;
        } else if (type.startsWith('icon-')) {
            const iconKey = type.replace('icon-', '');
            document.getElementById(`wc-preview-icon-${iconKey}`).src = base64;
            document.getElementById(`wc-preview-icon-${iconKey}`).style.display = 'block';
            if(!wcState.tempPhoneConfig.icons) wcState.tempPhoneConfig.icons = {};
            wcState.tempPhoneConfig.icons[iconKey] = base64;
        }
    } catch (err) {
        alert("图片处理失败");
    }
}

function wcSaveCharacter() {
    const name = document.getElementById('wc-input-char-name').value;
    const note = document.getElementById('wc-input-char-note').value;
    const prompt = document.getElementById('wc-input-char-prompt').value;
    if (!name) return alert('请输入角色名称');
    
    const defaultAvatarSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#8E8E93"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="40">${name[0]}</text></svg>`;
    const defaultAvatar = 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(defaultAvatarSvg)));

    const newChar = {
        id: Date.now(), name: name, note: note, prompt: prompt,
        avatar: wcState.tempImage || defaultAvatar, isPinned: false
    };
    wcState.characters.push(newChar);
    wcSaveData();
    wcCloseModal('wc-modal-add-char');
    wcRenderAll();
}

function wcDeleteCharacter(id) {
    if(confirm('确定删除该角色吗？')) {
        wcState.characters = wcState.characters.filter(c => c.id !== id);
        delete wcState.chats[id];
        wcDb.delete('chats', id);
        wcDb.delete('characters', id);
        wcSaveData();
        wcRenderAll();
    }
}

function wcTogglePin(id) {
    const char = wcState.characters.find(c => c.id === id);
    if (char) {
        char.isPinned = !char.isPinned;
        wcSaveData();
        wcRenderChats();
    }
}

function wcShowCharDetail(id) {
    const char = wcState.characters.find(c => c.id === id);
    if (!char) return;
    wcState.editingCharId = id;
    document.getElementById('wc-detail-char-avatar').src = char.avatar;
    document.getElementById('wc-detail-char-name').innerText = char.name;
    document.getElementById('wc-detail-char-note').innerText = char.note || "暂无备注";
    wcOpenModal('wc-modal-char-detail');
}

function wcCheckPhoneAction() {
    wcCloseModal('wc-modal-char-detail');
    wcOpenPhoneSim();
}

function wcOpenEditCharSettings() {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    if (!char) return;
    wcState.tempImage = '';
    document.getElementById('wc-edit-char-avatar').src = char.avatar;
    document.getElementById('wc-edit-char-name').value = char.name;
    document.getElementById('wc-edit-char-note').value = char.note;
    document.getElementById('wc-edit-char-prompt').value = char.prompt;
    wcOpenModal('wc-modal-edit-char-settings');
}

function wcUpdateCharacter() {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    if (!char) return;
    char.name = document.getElementById('wc-edit-char-name').value;
    char.note = document.getElementById('wc-edit-char-note').value;
    char.prompt = document.getElementById('wc-edit-char-prompt').value;
    if (wcState.tempImage && wcState.tempImageType === 'edit-char') char.avatar = wcState.tempImage;
    wcSaveData();
    wcCloseModal('wc-modal-edit-char-settings');
    document.getElementById('wc-detail-char-avatar').src = char.avatar;
    document.getElementById('wc-detail-char-name').innerText = char.name;
    document.getElementById('wc-detail-char-note').innerText = char.note || "暂无备注";
    wcRenderAll();
}

// --- WeChat Phone Sim ---
function wcOpenPhoneSim() {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    if (!char) return;
    const sim = document.getElementById('wc-view-phone-sim');
    sim.classList.add('active');
    const screenBg = document.getElementById('wc-phone-screen-bg');
    if (char.phoneConfig && char.phoneConfig.wallpaper) {
        screenBg.style.backgroundImage = `url(${char.phoneConfig.wallpaper})`;
    } else {
        screenBg.style.backgroundImage = 'none';
    }
    const icons = char.phoneConfig && char.phoneConfig.icons ? char.phoneConfig.icons : {};
    ['msg', 'browser', 'cart', 'settings'].forEach(id => {
        const iconEl = document.getElementById(`wc-icon-${id === 'msg' ? 'message' : id}`);
        if (icons[id]) iconEl.innerHTML = `<img src="${icons[id]}">`;
    });
    wcStartPhoneClock();
    
    // 确保指纹显示
    document.getElementById('wc-phone-fingerprint-btn').style.display = 'flex';
}

function wcClosePhoneSim() {
    document.getElementById('wc-view-phone-sim').classList.remove('active');
    document.getElementById('wc-phone-app-message').style.display = 'none';
    document.getElementById('wc-phone-app-settings').style.display = 'none';
    wcStopPhoneClock();
}

function wcStartPhoneClock() {
    wcUpdatePhoneClock();
    wcState.phoneClockInterval = setInterval(wcUpdatePhoneClock, 1000);
}

function wcStopPhoneClock() {
    if (wcState.phoneClockInterval) clearInterval(wcState.phoneClockInterval);
}

function wcUpdatePhoneClock() {
    const now = new Date();
    const hours = now.getHours().toString().padStart(2, '0');
    const minutes = now.getMinutes().toString().padStart(2, '0');
    document.getElementById('wc-sim-clock-time').innerText = `${hours}:${minutes}`;
    const days = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
    document.getElementById('wc-sim-clock-date').innerText = `${now.getMonth() + 1}月${now.getDate()}日 ${days[now.getDay()]}`;
}

function wcOpenPhoneSettings() {
    wcState.tempPhoneConfig = {};
    document.getElementById('wc-preview-phone-bg').style.display = 'none';
    document.getElementById('wc-text-phone-bg').style.display = 'block';
    ['msg', 'browser', 'cart', 'settings'].forEach(id => {
        document.getElementById(`wc-preview-icon-${id}`).style.display = 'none';
    });
    wcOpenModal('wc-modal-phone-settings');
}

function wcSavePhoneSettings() {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    if (!char) return;
    if (!char.phoneConfig) char.phoneConfig = {};
    if (wcState.tempPhoneConfig.wallpaper) char.phoneConfig.wallpaper = wcState.tempPhoneConfig.wallpaper;
    if (wcState.tempPhoneConfig.icons) {
        if (!char.phoneConfig.icons) char.phoneConfig.icons = {};
        Object.assign(char.phoneConfig.icons, wcState.tempPhoneConfig.icons);
    }
    wcSaveData();
    wcCloseModal('wc-modal-phone-settings');
    const screenBg = document.getElementById('wc-phone-screen-bg');
    if (char.phoneConfig.wallpaper) screenBg.style.backgroundImage = `url(${char.phoneConfig.wallpaper})`;
    const icons = char.phoneConfig.icons || {};
    ['msg', 'browser', 'cart', 'settings'].forEach(id => {
        if (icons[id]) document.getElementById(`wc-icon-${id === 'msg' ? 'message' : id}`).innerHTML = `<img src="${icons[id]}">`;
    });
}

function wcOpenPhoneApp(appName) {
    if (appName === 'message') {
        document.getElementById('wc-phone-app-message').style.display = 'flex';
        wcSwitchPhoneTab('chat');
    } else if (appName === 'settings') {
        document.getElementById('wc-phone-app-settings').style.display = 'flex';
        wcGeneratePhoneSettings(true); // true = render only
    }
    // 隐藏指纹
    document.getElementById('wc-phone-fingerprint-btn').style.display = 'none';
}

function wcClosePhoneApp() {
    document.getElementById('wc-phone-app-message').style.display = 'none';
    document.getElementById('wc-phone-app-settings').style.display = 'none';
    // 显示指纹
    document.getElementById('wc-phone-fingerprint-btn').style.display = 'flex';
}

// --- Phone App Navigation ---

function wcSwitchPhoneTab(tab) {
    wcState.phoneAppTab = tab;
    
    document.querySelectorAll('.wc-phone-tab-item').forEach(t => t.classList.remove('active'));
    document.getElementById(`wc-phone-tab-${tab}`).classList.add('active');

    const headerLeft = document.getElementById('wc-phone-header-left');
    const headerTitle = document.getElementById('wc-phone-header-title');
    const content = document.getElementById('wc-phone-app-content');
    
    content.innerHTML = '';

    if (tab === 'chat') {
        headerTitle.innerText = '微信';
        headerLeft.innerHTML = `<div onclick="wcConfirmGenerateChats()" style="cursor: pointer; display: flex; align-items: center;"><svg class="wc-icon" style="width: 20px; height: 20px;" viewBox="0 0 24 24"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg></div>`;
        wcRenderPhoneChats();
    } else if (tab === 'contacts') {
        headerTitle.innerText = '通讯录';
        headerLeft.innerHTML = `<div onclick="wcOpenPhoneContactsGenModal()" style="cursor: pointer; display: flex; align-items: center;"><svg class="wc-icon" style="width: 22px; height: 22px;" viewBox="0 0 24 24"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg></div>`;
        wcRenderPhoneContacts();
    } else if (tab === 'me') {
        headerTitle.innerText = '我';
        headerLeft.innerHTML = '';
        wcRenderPhoneMe();
    }
}

function wcRenderPhoneMe() {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    const content = document.getElementById('wc-phone-app-content');
    if (!char) return;

    const profile = char.phoneData && char.phoneData.profile ? char.phoneData.profile : { nickname: char.name, sign: "暂无签名" };

    content.innerHTML = `
        <div style="background: #fff; padding: 30px 20px; display: flex; align-items: center; margin-bottom: 10px;">
            <img src="${char.avatar}" style="width: 64px; height: 64px; border-radius: 8px; margin-right: 16px; object-fit: cover;">
            <div style="flex: 1;">
                <div style="font-size: 20px; font-weight: 600; margin-bottom: 4px;">${profile.nickname}</div>
                <div style="font-size: 14px; color: #888;">微信号: wxid_${char.id.toString().substring(0,8)}</div>
                <div style="font-size: 13px; color: #888; margin-top: 4px;">个性签名: ${profile.sign}</div>
            </div>
            <div onclick="wcGenerateCharProfile()" style="padding: 8px; cursor: pointer;">
                <svg class="wc-icon" style="width: 20px; height: 20px; color: #576B95;" viewBox="0 0 24 24"><path d="M23 4v6h-6"></path><path d="M1 20v-6h6"></path><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
            </div>
        </div>
        
        <div class="wc-list-group" style="margin: 0;">
            <div class="wc-list-item" onclick="wcOpenPhoneWallet()" style="background: #fff; border-bottom: 0.5px solid #E5E5EA;">
                <svg class="wc-icon" style="margin-right: 10px; color: #FA9D3B;" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
                <div class="wc-item-content">
                    <div class="wc-item-title">支付</div>
                </div>
                <svg class="chevron-right" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </div>
        </div>
        
        <div class="wc-list-group" style="margin-top: 10px;">
            <div class="wc-list-item" style="background: #fff; border-bottom: 0.5px solid #E5E5EA;">
                <svg class="wc-icon" style="margin-right: 10px; color: #007AFF;" viewBox="0 0 24 24"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
                <div class="wc-item-content">
                    <div class="wc-item-title">隐私</div>
                </div>
                <svg class="chevron-right" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </div>
            <div class="wc-list-item" style="background: #fff;">
                <svg class="wc-icon" style="margin-right: 10px; color: #8E8E93;" viewBox="0 0 24 24"><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z"></path></svg>
                <div class="wc-item-content">
                    <div class="wc-item-title">设置</div>
                </div>
                <svg class="chevron-right" viewBox="0 0 24 24"><path d="M10 6L8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg>
            </div>
        </div>
    `;
}

async function wcGenerateCharProfile() {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    if (!char) return;

    const apiConfig = await idb.get('ios_theme_api_config');
    if (!apiConfig || !apiConfig.key) return alert("请先配置 API");

    wcShowLoading("正在生成个人资料...");

    try {
        let prompt = `你扮演角色：${char.name}。\n人设：${char.prompt}\n`;
        prompt += `请为你的微信账号生成一个网名(nickname)和一个个性签名(sign)。\n`;
        prompt += `要求：\n1. 网名要符合人设，不要太长。\n2. 个性签名要体现当前的心情或状态。\n`;
        prompt += `返回 JSON 格式：{"nickname": "...", "sign": "..."}`;

        const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            })
        });

        const data = await response.json();
        let content = data.choices[0].message.content;
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const profile = JSON.parse(content);

        if (!char.phoneData) char.phoneData = {};
        char.phoneData.profile = profile;
        wcSaveData();
        wcRenderPhoneMe();
        wcShowSuccess("资料更新成功");

    } catch (e) {
        console.error(e);
        wcShowError("生成失败");
    }
}

function wcOpenPhoneWallet() {
    document.getElementById('wc-phone-app-wallet').style.display = 'flex';
    wcRenderPhoneWalletContent();
}

function wcClosePhoneWallet() {
    document.getElementById('wc-phone-app-wallet').style.display = 'none';
}

function wcRenderPhoneWalletContent() {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    const content = document.getElementById('wc-phone-wallet-content');
    if (!char) return;

    const wallet = (char.phoneData && char.phoneData.wallet) ? char.phoneData.wallet : { balance: 0.00, transactions: [] };

    let transHtml = '';
    if (wallet.transactions && wallet.transactions.length > 0) {
        wallet.transactions.forEach(t => {
            const isIncome = t.type === 'income';
            const sign = isIncome ? '+' : '-';
            const colorClass = isIncome ? 'wc-amount-in' : 'wc-amount-out';
            transHtml += `
                <div class="wc-transaction-item">
                    <div class="wc-trans-info">
                        <div class="wc-trans-title">${t.note}</div>
                        <div class="wc-trans-time">${t.time}</div>
                    </div>
                    <div class="wc-trans-amount ${colorClass}">${sign}${parseFloat(t.amount).toFixed(2)}</div>
                </div>
            `;
        });
    } else {
        transHtml = '<div style="padding: 20px; text-align: center; color: #8E8E93;">暂无交易记录</div>';
    }

    content.innerHTML = `
        <div class="wc-wallet-header" style="padding: 30px 20px; margin-bottom: 10px; background: #07C160; color: white;">
            <svg class="wc-icon wc-wallet-icon-lg" style="color: white;" viewBox="0 0 24 24"><rect x="1" y="4" width="22" height="16" rx="2" ry="2"></rect><line x1="1" y1="10" x2="23" y2="10"></line></svg>
            <div class="wc-wallet-balance-label" style="color: rgba(255,255,255,0.8);">当前余额 (元)</div>
            <div class="wc-wallet-balance-num" style="color: white;">${parseFloat(wallet.balance).toFixed(2)}</div>
        </div>
        <div class="wc-list-group-title" style="padding: 0 16px 8px; color: var(--wc-text-secondary); font-size: 13px;">交易记录</div>
        <div style="background: #fff;">
            ${transHtml}
        </div>
    `;
}

async function wcGenerateCharWallet() {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    if (!char) return;

    const apiConfig = await idb.get('ios_theme_api_config');
    if (!apiConfig || !apiConfig.key) return alert("请先配置 API");

    wcShowLoading("正在生成钱包数据...");

    try {
        // 1. 收集上下文
        const chatConfig = char.chatConfig || {};
        const userPersona = chatConfig.userPersona || wcState.user.persona || "无";
        
        // 世界书 (前10条)
        let wbInfo = "";
        if (worldbookEntries.length > 0) {
            wbInfo = "【世界观参考】:\n" + worldbookEntries.slice(0, 10).map(e => `${e.title}: ${e.desc}`).join('\n');
        }

        // 最近聊天记录
        const msgs = wcState.chats[char.id] || [];
        const recentMsgs = msgs.slice(-20).map(m => `${m.sender==='me'?'User':char.name}: ${m.content}`).join('\n');

        // 2. 构建 Prompt
        let prompt = `你扮演角色：${char.name}。\n`;
        prompt += `人设：${char.prompt}\n${wbInfo}\n`;
        prompt += `【用户(User)设定】：${userPersona}\n`;
        prompt += `【最近聊天记录】：\n${recentMsgs}\n\n`;
        
        prompt += `请根据角色的人设、职业、近期经历以及聊天记录，生成该角色的微信钱包数据。\n`;
        prompt += `【要求】：\n`;
        prompt += `1. 生成合理的余额 (balance)。\n`;
        prompt += `2. 生成 5 条最近的交易记录 (transactions)。\n`;
        prompt += `3. 交易记录必须符合角色生活轨迹 (例如：购物、餐饮、转账、工资等)。\n`;
        prompt += `4. 返回纯 JSON 对象，格式如下：\n`;
        prompt += `{
  "balance": 1234.56,
  "transactions": [
    {"type": "expense", "amount": 25.00, "note": "便利店", "time": "10-24 08:30"},
    {"type": "income", "amount": 5000.00, "note": "工资", "time": "10-15 10:00"}
  ]
}\n`;
        prompt += `注意：type 只能是 'income' (收入) 或 'expense' (支出)。time 格式为简短日期。\n`;

        const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            })
        });

        const data = await response.json();
        let content = data.choices[0].message.content;
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const walletData = JSON.parse(content);

        // 保存数据
        if (!char.phoneData) char.phoneData = {};
        char.phoneData.wallet = walletData;
        wcSaveData();

        wcRenderPhoneWalletContent();
        wcShowSuccess("钱包生成成功");

    } catch (e) {
        console.error(e);
        wcShowError("生成失败");
    }
}

// --- Phone Settings Logic ---
async function wcGeneratePhoneSettings(renderOnly = false) {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    const content = document.getElementById('wc-phone-settings-content');
    if (!char) return;

    if (renderOnly) {
        // 仅渲染现有数据
        const settings = char.phoneData && char.phoneData.settings ? char.phoneData.settings : { battery: 80, screenTime: "4小时20分", appUsage: [] };
        renderSettingsUI(settings);
        return;
    }

    const apiConfig = await idb.get('ios_theme_api_config');
    if (!apiConfig || !apiConfig.key) return alert("请先配置 API");

    wcShowLoading("正在生成手机状态...");

    try {
        let prompt = `你扮演角色：${char.name}。\n人设：${char.prompt}\n`;
        prompt += `请根据角色的人设和生活习惯，生成该角色当前的手机状态数据。\n`;
        prompt += `要求返回 JSON 格式：\n`;
        prompt += `{
  "battery": 65,
  "screenTime": "5小时30分",
  "appUsage": [
    {"name": "微信", "time": "2小时"},
    {"name": "抖音", "time": "1小时"},
    {"name": "王者荣耀", "time": "1.5小时"}
  ]
}`;

        const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            })
        });

        const data = await response.json();
        let contentStr = data.choices[0].message.content;
        contentStr = contentStr.replace(/```json/g, '').replace(/```/g, '').trim();
        const settingsData = JSON.parse(contentStr);

        if (!char.phoneData) char.phoneData = {};
        char.phoneData.settings = settingsData;
        wcSaveData();
        renderSettingsUI(settingsData);
        wcShowSuccess("状态更新成功");

    } catch (e) {
        console.error(e);
        wcShowError("生成失败");
    }
}

function renderSettingsUI(data) {
    const content = document.getElementById('wc-phone-settings-content');
    let appUsageHtml = '';
    if (data.appUsage && data.appUsage.length > 0) {
        data.appUsage.forEach(app => {
            appUsageHtml += `
                <div style="display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid #eee;">
                    <span>${app.name}</span>
                    <span style="color: #888;">${app.time}</span>
                </div>
            `;
        });
    }

    content.innerHTML = `
        <div style="background: #fff; border-radius: 10px; padding: 16px; margin-bottom: 16px;">
            <div style="font-size: 16px; font-weight: 600; margin-bottom: 10px;">电池</div>
            <div style="display: flex; align-items: center;">
                <div style="flex: 1; height: 20px; background: #eee; border-radius: 10px; overflow: hidden;">
                    <div style="width: ${data.battery}%; height: 100%; background: #34C759;"></div>
                </div>
                <span style="margin-left: 10px; font-weight: bold;">${data.battery}%</span>
            </div>
        </div>

        <div style="background: #fff; border-radius: 10px; padding: 16px;">
            <div style="font-size: 16px; font-weight: 600; margin-bottom: 10px;">屏幕使用时间</div>
            <div style="font-size: 24px; font-weight: bold; margin-bottom: 16px;">${data.screenTime}</div>
            <div style="font-size: 14px; color: #888; margin-bottom: 8px;">应用使用排行</div>
            ${appUsageHtml}
        </div>
    `;
}

// --- Phone Message Logic ---

function wcConfirmGenerateChats() {
    if (confirm("重新生成聊天列表将覆盖当前手机内的所有模拟对话记录，确定要继续吗？")) {
        wcGeneratePhoneChats();
    }
}

async function wcGeneratePhoneChats() {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    if (!char) return;
    
    if (!char.phoneData || !char.phoneData.contacts || char.phoneData.contacts.length === 0) {
        alert("请先生成通讯录！聊天记录需要基于通讯录好友生成。");
        return;
    }

    const apiConfig = await idb.get('ios_theme_api_config');
    if (!apiConfig || !apiConfig.key) return alert("请先配置 API");

    wcShowLoading("正在生成对话数据...");

    try {
        const msgs = wcState.chats[char.id] || [];
        const recentMsgs = msgs.slice(-20).map(m => `${m.sender==='me'?'User':char.name}: ${m.content}`).join('\n');
        
        const contactNames = char.phoneData.contacts.map(c => `${c.name} (${c.desc})`).join(', ');

        let prompt = `你扮演角色：${char.name}。\n`;
        prompt += `人设：${char.prompt}\n`;
        prompt += `请生成你的微信消息列表。除了和用户(User)的对话外，还需要生成 3-5 个其他对话。\n`;
        prompt += `【重要】：必须基于现有的通讯录好友生成对话，不要凭空捏造新人物。\n`;
        prompt += `【通讯录名单】：${contactNames}\n`;
        prompt += `【要求】：对于每个对话，必须生成最近的 3-5 条具体聊天记录(history)。\n`;
        prompt += `【格式要求】：返回一个纯 JSON 数组，不要 Markdown。格式如下：\n`;
        prompt += `[
  {
    "id": 1,
    "name": "User",
    "lastMsg": "最后一条消息内容",
    "time": "12:00",
    "isGroup": false,
    "history": [ {"sender": "them", "content": "你好"}, {"sender": "me", "content": "你好呀"} ]
  },
  {
    "id": 2,
    "name": "通讯录中的某人",
    "lastMsg": "明天集合",
    "time": "11:30",
    "isGroup": false,
    "history": [ {"sender": "them", "content": "明天几点？"}, {"sender": "me", "content": "早上8点"} ]
  }
]\n`;
        prompt += `注意：history 中的 sender 为 "me" 代表你(${char.name})，"them" 代表对方。\n`;
        prompt += `【最近与User的聊天参考】：\n${recentMsgs}`;

        const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.7
            })
        });

        const data = await response.json();
        let content = data.choices[0].message.content;
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const chatList = JSON.parse(content);

        if (!char.phoneData) char.phoneData = {};
        char.phoneData.chats = chatList;
        wcSaveData();

        wcRenderPhoneChats();
        wcShowSuccess("对话生成成功");

    } catch (e) {
        console.error(e);
        wcShowError("生成失败");
    }
}

function wcRenderPhoneChats() {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    const contentDiv = document.getElementById('wc-phone-app-content');
    contentDiv.innerHTML = '';

    if (!char || !char.phoneData || !char.phoneData.chats || char.phoneData.chats.length === 0) {
        contentDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #999; font-size: 13px;">点击左上角刷新按钮<br>生成 AI 视角的聊天列表</div>';
        return;
    }

    char.phoneData.chats.forEach(chat => {
        const div = document.createElement('div');
        div.className = 'wc-list-item';
        div.style.background = 'white';
        div.style.borderBottom = '0.5px solid #E5E5EA';
        
        const isUser = chat.name === 'User';
        let imgHtml = '';
        if (isUser) {
            imgHtml = `<img src="${wcState.user.avatar}" class="wc-avatar" style="width:40px;height:40px;border-radius:4px;">`;
        } else {
            const color = '#' + ((chat.name.length * 1234567) % 16777215).toString(16).padStart(6, '0');
            imgHtml = `<div style="width:40px;height:40px;border-radius:4px;background:${color};display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;font-size:16px;">${chat.name[0]}</div>`;
        }

        div.innerHTML = `
            ${imgHtml}
            <div class="wc-item-content" style="margin-left:10px;">
                <div style="display:flex;justify-content:space-between;">
                    <div class="wc-item-title" style="font-size:15px;font-weight:500;">${chat.name}</div>
                    <div style="font-size:11px;color:#B2B2B2;">${chat.time}</div>
                </div>
                <div class="wc-item-subtitle" style="font-size:13px;color:#8E8E93;">${chat.lastMsg}</div>
            </div>
        `;
        
        div.onclick = () => wcOpenSimChatDetailSaved(chat);
        contentDiv.appendChild(div);
    });
}

function wcOpenSimChatDetailSaved(chatItem) {
    wcActiveSimChatId = chatItem.id;
    const detailView = document.getElementById('wc-phone-sim-chat-detail');
    const titleEl = document.getElementById('wc-sim-chat-title');
    const footer = document.getElementById('wc-sim-chat-footer');
    
    detailView.style.display = 'flex';
    titleEl.innerText = chatItem.name;
    
    if (chatItem.name === 'User') {
        if(footer) footer.style.display = 'none';
        const char = wcState.characters.find(c => c.id === wcState.editingCharId);
        const realMsgs = wcState.chats[char.id] || [];
        const realHistory = realMsgs.slice(-15).map(m => ({
            sender: m.sender === 'me' ? 'them' : 'me', 
            content: m.content
        }));
        renderSimHistory(realHistory);
    } else {
        if(footer) footer.style.display = 'flex';
        renderSimHistory(chatItem.history || []);
    }
}

function wcCloseSimChatDetail() {
    document.getElementById('wc-phone-sim-chat-detail').style.display = 'none';
    wcActiveSimChatId = null;
}

function wcSimSendMsg() {
    const input = document.getElementById('wc-sim-chat-input');
    const text = input.value.trim();
    if (!text) return;
    
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    if (!char || !char.phoneData || !char.phoneData.chats) return;
    
    const chat = char.phoneData.chats.find(c => c.id === wcActiveSimChatId);
    if (!chat) return;
    
    if (!chat.history) chat.history = [];
    
    chat.history.push({ sender: 'me', content: text });
    chat.lastMsg = text;
    chat.time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
    
    wcSaveData();
    renderSimHistory(chat.history);
    wcRenderPhoneChats();
    input.value = '';
}

async function wcSimTriggerAI() {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    if (!char || !char.phoneData || !char.phoneData.chats) return;
    
    const chat = char.phoneData.chats.find(c => c.id === wcActiveSimChatId);
    if (!chat) return;

    const apiConfig = await idb.get('ios_theme_api_config');
    if (!apiConfig || !apiConfig.key) return alert("请配置 API");

    const btn = document.querySelector('#wc-sim-chat-footer button:last-child');
    btn.disabled = true;

    try {
        let prompt = `你现在扮演角色：${chat.name}。\n`;
        prompt += `背景/关系：${chat.desc || '普通朋友'}\n`;
        prompt += `你正在和 ${char.name} (由用户扮演) 进行微信聊天。\n`;
        prompt += `请根据聊天记录回复 ${char.name} 的消息。\n`;
        
        prompt += `【回复格式严格要求】：
1. 必须模拟即时通讯软件的聊天风格。
2. 保持回复简短有力，禁止长篇大论的小说体。
3. 强制要求：频繁使用换行符。绝对禁止将所有对话合并在同一段落中。
4. 结构：每一句对话必须独占一行。
5. 禁止发送长文本或小说式的段落。
6. 必须模拟真实人类的打字习惯：将一长段话拆分成多条短消息发送。
7. 严禁使用逗号将多个独立的句子强行连接成一句长句。
8. 风格：口语化、碎片化，像是在用手机打字。\n`;

        prompt += `【聊天记录】：\n`;
        
        const recentHistory = (chat.history || []).slice(-10);
        recentHistory.forEach(h => {
            const speaker = h.sender === 'me' ? char.name : chat.name;
            prompt += `${speaker}: ${h.content}\n`;
        });
        
        prompt += `${chat.name}:`;

        const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.8
            })
        });

        const data = await response.json();
        const reply = data.choices[0].message.content.trim();

        if (!chat.history) chat.history = [];

        // 分割多行回复，逐条显示
        const lines = reply.split('\n');
        for (const line of lines) {
            if (line.trim()) {
                await wcDelay(2000); // 延迟 2 秒
                chat.history.push({ sender: 'them', content: line.trim() });
                chat.lastMsg = line.trim();
                chat.time = new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
                wcSaveData();
                renderSimHistory(chat.history);
                wcRenderPhoneChats();
            }
        }

    } catch (e) {
        console.error(e);
        alert("AI 回复失败");
    } finally {
        btn.disabled = false;
    }
}

function renderSimHistory(history) {
    const container = document.getElementById('wc-sim-chat-history');
    container.innerHTML = '';
    
    history.forEach(msg => {
        const isMe = msg.sender === 'me'; 
        
        const row = document.createElement('div');
        row.style.display = 'flex';
        row.style.flexDirection = isMe ? 'row-reverse' : 'row';
        row.style.marginBottom = '10px';
        row.style.alignItems = 'flex-start';
        row.style.width = '100%'; // 确保占满宽度

        const bubble = document.createElement('div');
        bubble.style.maxWidth = '70%';
        bubble.style.padding = '8px 12px';
        bubble.style.borderRadius = '8px';
        bubble.style.fontSize = '14px';
        bubble.style.lineHeight = '1.4';
        bubble.style.wordBreak = 'break-word';
        
        if (isMe) {
            bubble.style.background = '#95EC69';
            bubble.style.color = 'black';
            bubble.style.marginRight = '5px';
        } else {
            bubble.style.background = 'white';
            bubble.style.color = 'black';
            bubble.style.marginLeft = '5px';
        }
        
        bubble.innerText = msg.content;
        
        const avatar = document.createElement('div');
        avatar.style.width = '30px';
        avatar.style.height = '30px';
        avatar.style.borderRadius = '4px';
        avatar.style.background = isMe ? '#ddd' : '#ccc';
        avatar.style.flexShrink = '0';
        
        row.appendChild(avatar);
        row.appendChild(bubble);
        container.appendChild(row);
    });
    setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
}

// --- Phone Contacts Logic ---

function wcOpenPhoneContactsGenModal() {
    wcOpenModal('wc-modal-gen-contacts');
}

async function wcGeneratePhoneContacts() {
    const min = parseInt(document.getElementById('wc-gen-contact-min').value) || 3;
    const max = parseInt(document.getElementById('wc-gen-contact-max').value) || 8;
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    if (!char) return;

    const apiConfig = await idb.get('ios_theme_api_config');
    if (!apiConfig || !apiConfig.key) return alert("请先配置 API");

    wcShowLoading("正在生成通讯录...");

    try {
        const chatConfig = char.chatConfig || {};
        const userName = chatConfig.userName || wcState.user.name;
        const userPersona = chatConfig.userPersona || wcState.user.persona || "无";

        let wbInfo = "";
        if (worldbookEntries.length > 0) {
            wbInfo = "【世界观参考】:\n" + worldbookEntries.slice(0, 10).map(e => `${e.title}: ${e.desc}`).join('\n');
        }

        let prompt = `你扮演角色：${char.name}。\n`;
        prompt += `人设：${char.prompt}\n${wbInfo}\n`;
        prompt += `【重要：用户身份】\n用户(User)的名字是：${userName}。\n用户在你的生活中的角色/人设是：${userPersona}。\n`;
        prompt += `【严重警告】：用户(User)也是通讯录的一部分。如果用户的设定是“恋人”，绝对不要再生成另一个“恋人/男(女)朋友/老公/老婆”！\n`;
        prompt += `【绝对禁令】：\n1. 严禁生成与用户(User)角色冲突的NPC。\n2. 如果用户是你的亲人，不要生成重复的亲人角色。\n`;
        
        prompt += `请生成你的微信通讯录数据。总人数在 ${min} 到 ${max} 之间。\n`;
        prompt += `【要求】：\n`;
        prompt += `1. 生成两部分数据：'contacts'(已添加的好友/群) 和 'requests'(待验证的好友请求)。\n`;
        prompt += `2. 'requests' 应该有 1-2 个，或者没有。\n`;
        prompt += `3. 每个人物必须包含 'desc' (一句话概括来历/关系)。\n`;
        prompt += `4. 返回纯 JSON 对象，格式如下：\n`;
        prompt += `{
  "contacts": [
    {"name": "张三", "type": "friend", "desc": "童年玩伴"},
    {"name": "冒险团", "type": "group", "desc": "工作群"}
  ],
  "requests": [
    {"name": "神秘人", "desc": "在酒馆遇到的陌生人"}
  ]
}\n`;

        const response = await fetch(`${apiConfig.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiConfig.key}` },
            body: JSON.stringify({
                model: apiConfig.model,
                messages: [{ role: "user", content: prompt }],
                temperature: 0.8
            })
        });

        const data = await response.json();
        let content = data.choices[0].message.content;
        content = content.replace(/```json/g, '').replace(/```/g, '').trim();
        const result = JSON.parse(content);

        if (!char.phoneData) char.phoneData = {};
        
        const newContacts = (result.contacts || []).map(c => ({ ...c, id: Date.now() + Math.random() }));
        const newRequests = (result.requests || []).map(r => ({ ...r, id: Date.now() + Math.random(), status: 'pending' }));

        char.phoneData.contacts = newContacts;
        char.phoneData.friendRequests = newRequests;

        wcSaveData();
        wcCloseModal('wc-modal-gen-contacts');
        wcRenderPhoneContacts();
        wcShowSuccess("通讯录生成成功");

    } catch (e) {
        console.error(e);
        wcShowError("生成失败");
    }
}

function wcRenderPhoneContacts() {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    const contentDiv = document.getElementById('wc-phone-app-content');
    contentDiv.innerHTML = '';

    if (!char || !char.phoneData) {
        contentDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #999; font-size: 13px;">点击左上角 + 号<br>生成通讯录</div>';
        return;
    }

    if (char.phoneData.friendRequests && char.phoneData.friendRequests.length > 0) {
        const header = document.createElement('div');
        header.className = 'wc-list-group-title';
        header.innerText = '新的朋友';
        contentDiv.appendChild(header);

        char.phoneData.friendRequests.forEach(req => {
            const div = document.createElement('div');
            div.className = 'wc-list-item';
            div.style.background = 'white';
            
            const color = '#' + ((req.name.length * 99999) % 16777215).toString(16).padStart(6, '0');
            
            div.innerHTML = `
                <div style="width:36px;height:36px;border-radius:4px;background:${color};display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">${req.name[0]}</div>
                <div class="wc-item-content" style="margin-left:10px;">
                    <div class="wc-item-title">${req.name}</div>
                    <div class="wc-item-subtitle" style="font-size:12px;">${req.desc}</div>
                </div>
                <div style="display:flex; gap:5px;">
                    <button class="wc-btn-mini" style="background:#07C160; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:12px;" onclick="wcHandleFriendRequest('${req.id}', 'accept')">接受</button>
                    <button class="wc-btn-mini" style="background:#FA5151; color:white; border:none; padding:4px 8px; border-radius:4px; font-size:12px;" onclick="wcHandleFriendRequest('${req.id}', 'reject')">拒绝</button>
                </div>
            `;
            contentDiv.appendChild(div);
        });
    }

    const header2 = document.createElement('div');
    header2.className = 'wc-list-group-title';
    header2.innerText = '联系人';
    contentDiv.appendChild(header2);

    const contacts = char.phoneData.contacts || [];
    contacts.forEach(contact => {
        const div = document.createElement('div');
        div.className = 'wc-list-item';
        div.style.background = 'white';
        div.style.borderBottom = '0.5px solid #E5E5EA';
        
        const color = '#' + ((contact.name.length * 12345) % 16777215).toString(16).padStart(6, '0');
        
        div.innerHTML = `
            <div style="width:36px;height:36px;border-radius:4px;background:${color};display:flex;align-items:center;justify-content:center;color:white;font-weight:bold;">${contact.name[0]}</div>
            <div class="wc-item-content" style="margin-left:10px;">
                <div class="wc-item-title">${contact.name}</div>
                <div class="wc-item-subtitle" style="font-size:12px; color:#999;">${contact.type === 'group' ? '[群聊]' : ''} ${contact.desc}</div>
            </div>
        `;
        div.onclick = () => wcShowPhoneContactDetail(contact);
        contentDiv.appendChild(div);
    });
}

function wcHandleFriendRequest(reqId, action) {
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    if (!char) return;

    const reqIndex = char.phoneData.friendRequests.findIndex(r => r.id == reqId);
    if (reqIndex === -1) return;
    const req = char.phoneData.friendRequests[reqIndex];

    if (action === 'accept') {
        if (!char.phoneData.contacts) char.phoneData.contacts = [];
        char.phoneData.contacts.push({
            id: req.id,
            name: req.name,
            desc: req.desc,
            type: 'friend'
        });
        wcAddMessage(char.id, 'system', 'system', `[系统提示] 你(User)操作了对方的手机，通过了 "${req.name}" 的好友请求。`, { style: 'transparent', hidden: true });
    } else {
        wcAddMessage(char.id, 'system', 'system', `[系统提示] 你(User)操作了对方的手机，拒绝了 "${req.name}" 的好友请求。`, { style: 'transparent', hidden: true });
    }

    char.phoneData.friendRequests.splice(reqIndex, 1);
    wcSaveData();
    wcRenderPhoneContacts();
}

function wcShowPhoneContactDetail(contact) {
    currentPhoneContact = contact;
    document.getElementById('wc-card-contact-name').innerText = contact.name;
    document.getElementById('wc-card-contact-desc').innerText = contact.desc || "暂无介绍";
    
    const color = '#' + ((contact.name.length * 12345) % 16777215).toString(16).padStart(6, '0');
    const avatarEl = document.getElementById('wc-card-contact-avatar');
    avatarEl.style.background = color;
    avatarEl.innerHTML = `<div style="width:100%;height:100%;display:flex;align-items:center;justify-content:center;color:white;font-size:32px;font-weight:bold;">${contact.name[0]}</div>`;
    
    const modal = document.getElementById('wc-modal-phone-contact-card');
    modal.style.display = 'flex'; 
    wcOpenModal('wc-modal-phone-contact-card');
}

function wcDeletePhoneContact() {
    if (!currentPhoneContact) return;
    if (confirm(`确定要删除好友 "${currentPhoneContact.name}" 吗？`)) {
        const char = wcState.characters.find(c => c.id === wcState.editingCharId);
        char.phoneData.contacts = char.phoneData.contacts.filter(c => c.id !== currentPhoneContact.id);
        
        wcAddMessage(char.id, 'system', 'system', `[系统提示] 你(User)操作了对方的手机，删除了好友 "${currentPhoneContact.name}"。`, { style: 'transparent', hidden: true });
        
        wcSaveData();
        wcCloseModal('wc-modal-phone-contact-card');
        wcRenderPhoneContacts();
    }
}

function wcShareContactToMain() {
    if (!currentPhoneContact) return;
    
    const name = currentPhoneContact.name;
    const desc = currentPhoneContact.desc;
    
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100" viewBox="0 0 100 100"><rect width="100" height="100" fill="#576B95"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" fill="white" font-size="40">${name[0]}</text></svg>`;
    const avatar = 'data:image/svg+xml;base64,' + window.btoa(unescape(encodeURIComponent(svg)));

    const newChar = {
        id: Date.now(),
        name: name,
        note: name,
        prompt: `你扮演 ${name}。背景设定：${desc}。`,
        avatar: avatar,
        isPinned: false
    };
    
    wcState.characters.push(newChar);
    wcSaveData();
    
    const char = wcState.characters.find(c => c.id === wcState.editingCharId);
    wcAddMessage(char.id, 'system', 'system', `[系统提示] 你将 "${name}" 添加到了你的联系人列表。`, { style: 'transparent', hidden: true });
    
    wcCloseModal('wc-modal-phone-contact-card');
    alert(`已将 ${name} 添加到主聊天列表！`);
    
    wcRenderAll();
}

function wcOpenShareCardModal() {
    const list = document.getElementById('wc-share-card-list');
    list.innerHTML = '';
    
    const targets = wcState.characters.filter(c => c.id !== wcState.editingCharId);
    
    if (targets.length === 0) {
        list.innerHTML = '<div style="padding:20px; text-align:center; color:#999;">没有其他好友可分享</div>';
    } else {
        targets.forEach(t => {
            const div = document.createElement('div');
            div.className = 'wc-list-item';
            div.style.background = 'white';
            div.innerHTML = `
                <img src="${t.avatar}" class="wc-avatar" style="width:36px;height:36px;">
                <div class="wc-item-content"><div class="wc-item-title">${t.name}</div></div>
                <button class="wc-btn-mini" style="background:#07C160; color:white; border:none; padding:6px 12px; border-radius:4px;" onclick="wcConfirmShareCard(${t.id})">发送</button>
            `;
            list.appendChild(div);
        });
    }
    
    wcOpenModal('wc-modal-share-card-select');
}

function wcConfirmShareCard(targetCharId) {
    if (!currentPhoneContact) return;
    
    const targetChar = wcState.characters.find(c => c.id === targetCharId);
    
    if (targetChar) {
        const cardContent = `[名片] 姓名: ${currentPhoneContact.name} | 介绍: ${currentPhoneContact.desc}`;
        wcAddMessage(targetCharId, 'me', 'text', cardContent);
        alert(`已将 ${currentPhoneContact.name} 的名片发送给 ${targetChar.name}`);
        wcCloseModal('wc-modal-share-card-select');
    }
}

// --- WeChat Chat Settings ---
function wcOpenChatSettings() {
    const char = wcState.characters.find(c => c.id === wcState.activeChatId);
    if (!char) return;
    if (!char.chatConfig) char.chatConfig = { userAvatar: wcState.user.avatar, userName: wcState.user.name, userPersona: wcState.user.persona, contextLimit: 0, summaryTrigger: 0, stickerGroupIds: [], backgroundImage: "", customCss: "", worldbookEntries: [] };
    
    document.getElementById('wc-setting-char-avatar').src = char.avatar;
    document.getElementById('wc-setting-char-name').value = char.name;
    document.getElementById('wc-setting-char-note').value = char.note || "";
    document.getElementById('wc-setting-char-prompt').value = char.prompt || "";
    document.getElementById('wc-setting-user-avatar').src = char.chatConfig.userAvatar || wcState.user.avatar;
    document.getElementById('wc-setting-user-name').value = char.chatConfig.userName || wcState.user.name;
    document.getElementById('wc-setting-user-prompt').value = char.chatConfig.userPersona || wcState.user.persona;
    
    const maskSelect = document.getElementById('wc-setting-user-mask-select');
    maskSelect.innerHTML = '<option value="">选择面具...</option>';
    wcState.masks.forEach(m => {
        const opt = document.createElement('option');
        opt.value = m.id;
        opt.innerText = m.name;
        maskSelect.appendChild(opt);
    });

    document.getElementById('wc-setting-context-limit').value = char.chatConfig.contextLimit || 0;
    document.getElementById('wc-setting-summary-trigger').value = char.chatConfig.summaryTrigger || 0;
    
    const wbList = document.getElementById('wc-setting-worldbook-list');
    wbList.innerHTML = '';
    if (worldbookEntries.length === 0) {
        wbList.innerHTML = '<div style="color:#999; font-size:13px;">暂无世界书条目</div>';
    } else {
        worldbookEntries.forEach(entry => {
            const div = document.createElement('div');
            div.className = 'wc-checkbox-item';
            const isChecked = char.chatConfig.worldbookEntries && char.chatConfig.worldbookEntries.includes(entry.id.toString());
            div.innerHTML = `<input type="checkbox" value="${entry.id}" ${isChecked ? 'checked' : ''}><span>${entry.title} (${entry.type})</span>`;
            wbList.appendChild(div);
        });
    }

    const stickerList = document.getElementById('wc-setting-sticker-group-list');
    stickerList.innerHTML = '';
    wcState.stickerCategories.forEach((cat, idx) => {
        const div = document.createElement('div');
        div.className = 'wc-checkbox-item';
        const isChecked = char.chatConfig.stickerGroupIds && char.chatConfig.stickerGroupIds.includes(idx);
        div.innerHTML = `<input type="checkbox" value="${idx}" ${isChecked ? 'checked' : ''}><span>${cat.name}</span>`;
        stickerList.appendChild(div);
    });

    const bgPreview = document.getElementById('wc-setting-bg-preview');
    if (char.chatConfig.backgroundImage) {
        bgPreview.src = char.chatConfig.backgroundImage;
        bgPreview.style.display = 'block';
        document.getElementById('wc-setting-bg-text').style.display = 'none';
    } else {
        bgPreview.style.display = 'none';
        document.getElementById('wc-setting-bg-text').style.display = 'block';
    }
    document.getElementById('wc-setting-custom-css').value = char.chatConfig.customCss || "";
    wcUpdateCssPresetSelect();
    wcState.tempImage = '';
    wcOpenModal('wc-modal-chat-settings');
}

function wcImportMaskToChat(maskId) {
    if (!maskId) return;
    const mask = wcState.masks.find(m => m.id == maskId);
    if (mask) {
        document.getElementById('wc-setting-user-name').value = mask.name;
        document.getElementById('wc-setting-user-prompt').value = mask.prompt;
        document.getElementById('wc-setting-user-avatar').src = mask.avatar;
    }
}

function wcClearChatBackground() {
    document.getElementById('wc-setting-bg-preview').src = "";
    document.getElementById('wc-setting-bg-preview').style.display = 'none';
    document.getElementById('wc-setting-bg-text').style.display = 'block';
    wcState.tempBgCleared = true;
}

function wcSaveChatSettings() {
    const char = wcState.characters.find(c => c.id === wcState.activeChatId);
    if (!char) return;
    char.name = document.getElementById('wc-setting-char-name').value;
    char.note = document.getElementById('wc-setting-char-note').value;
    char.prompt = document.getElementById('wc-setting-char-prompt').value;
    if (wcState.tempImage && wcState.tempImageType === 'setting-char') char.avatar = wcState.tempImage;

    if (!char.chatConfig) char.chatConfig = {};
    char.chatConfig.userName = document.getElementById('wc-setting-user-name').value;
    char.chatConfig.userPersona = document.getElementById('wc-setting-user-prompt').value;
    if (wcState.tempImage && wcState.tempImageType === 'setting-user') char.chatConfig.userAvatar = wcState.tempImage;
    else if (document.getElementById('wc-setting-user-avatar').src.startsWith('data:')) char.chatConfig.userAvatar = document.getElementById('wc-setting-user-avatar').src;

    char.chatConfig.contextLimit = parseInt(document.getElementById('wc-setting-context-limit').value) || 0;
    char.chatConfig.summaryTrigger = parseInt(document.getElementById('wc-setting-summary-trigger').value) || 0;
    
    const wbCheckboxes = document.querySelectorAll('#wc-setting-worldbook-list input[type="checkbox"]:checked');
    char.chatConfig.worldbookEntries = Array.from(wbCheckboxes).map(cb => cb.value);

    const stickerCheckboxes = document.querySelectorAll('#wc-setting-sticker-group-list input[type="checkbox"]:checked');
    char.chatConfig.stickerGroupIds = Array.from(stickerCheckboxes).map(cb => parseInt(cb.value));

    if (wcState.tempImage && wcState.tempImageType === 'setting-bg') char.chatConfig.backgroundImage = wcState.tempImage;
    else if (wcState.tempBgCleared) char.chatConfig.backgroundImage = "";
    wcState.tempBgCleared = false;

    char.chatConfig.customCss = document.getElementById('wc-setting-custom-css').value;
    wcSaveData();
    document.getElementById('wc-nav-title').innerText = char.note || char.name;
    wcApplyChatConfig(char);
    wcRenderMessages(char.id);
    
    if (char.chatConfig.stickerGroupIds.length > 0 && !char.chatConfig.stickerGroupIds.includes(wcState.activeStickerCategoryIndex)) {
        wcState.activeStickerCategoryIndex = char.chatConfig.stickerGroupIds[0];
    } else if (char.chatConfig.stickerGroupIds.length === 0) {
        wcState.activeStickerCategoryIndex = 0;
    }
    
    wcRenderStickerPanel();
    wcCloseModal('wc-modal-chat-settings');
}

function wcClearChatHistory() {
    if (confirm("确定清空与该角色的所有聊天记录吗？此操作不可恢复。")) {
        wcState.chats[wcState.activeChatId] = [];
        wcSaveData();
        wcRenderMessages(wcState.activeChatId);
        wcCloseModal('wc-modal-chat-settings');
    }
}

// --- WeChat CSS Presets ---
function wcUpdateCssPresetSelect() {
    const select = document.getElementById('wc-setting-css-preset-select');
    select.innerHTML = '<option value="">选择预设...</option>';
    wcState.cssPresets.forEach((p, idx) => {
        const opt = document.createElement('option');
        opt.value = idx;
        opt.innerText = p.name;
        select.appendChild(opt);
    });
}

function wcSaveCssPreset() {
    const css = document.getElementById('wc-setting-custom-css').value;
    if (!css) return alert("CSS 内容为空");
    const name = prompt("请输入预设名称：");
    if (name) {
        wcState.cssPresets.push({ name, css });
        wcSaveData();
        wcUpdateCssPresetSelect();
        alert("预设已保存");
    }
}

function wcApplyCssPreset(idx) {
    if (idx === "") return;
    const preset = wcState.cssPresets[idx];
    if (preset) document.getElementById('wc-setting-custom-css').value = preset.css;
}

// --- WeChat Masks ---
function wcOpenMasksModal() { wcOpenModal('wc-modal-masks'); wcRenderMasks(); }
function wcRenderMasks() {
    const list = document.getElementById('wc-masks-list');
    list.innerHTML = '';
    wcState.masks.forEach(mask => {
        const div = document.createElement('div');
        div.className = 'wc-list-item';
        div.innerHTML = `<img src="${mask.avatar}" class="wc-avatar"><div class="wc-item-content"><div class="wc-item-title">${mask.name}</div><div class="wc-item-subtitle">${mask.prompt.substring(0, 20)}...</div></div><button class="wc-nav-btn" style="margin-right:10px" onclick="wcApplyMask(${mask.id})">使用</button><button class="wc-nav-btn" style="color:red" onclick="wcDeleteMask(${mask.id})">删除</button>`;
        div.onclick = (e) => { if(e.target.tagName !== 'BUTTON') wcOpenEditMask(mask.id); };
        list.appendChild(div);
    });
}
function wcOpenEditMask(id = null) {
    wcState.editingMaskId = id;
    wcState.tempImage = '';
    if (id) {
        const mask = wcState.masks.find(m => m.id === id);
        document.getElementById('wc-mask-modal-title').innerText = '编辑面具';
        document.getElementById('wc-input-mask-name').value = mask.name;
        document.getElementById('wc-input-mask-prompt').value = mask.prompt;
        document.getElementById('wc-preview-mask-avatar').src = mask.avatar;
    } else {
        document.getElementById('wc-mask-modal-title').innerText = '新建面具';
        document.getElementById('wc-input-mask-name').value = '';
        document.getElementById('wc-input-mask-prompt').value = '';
        document.getElementById('wc-preview-mask-avatar').src = '';
    }
    wcOpenModal('wc-modal-edit-mask');
}
function wcSaveMask() {
    const name = document.getElementById('wc-input-mask-name').value;
    const prompt = document.getElementById('wc-input-mask-prompt').value;
    const avatar = wcState.tempImage || (wcState.editingMaskId ? wcState.masks.find(m=>m.id===wcState.editingMaskId).avatar : wcState.user.avatar);
    if (!name) return alert('请输入名称');
    if (wcState.editingMaskId) {
        const mask = wcState.masks.find(m => m.id === wcState.editingMaskId);
        mask.name = name; mask.prompt = prompt; mask.avatar = avatar;
    } else {
        wcState.masks.push({ id: Date.now(), name, prompt, avatar });
    }
    wcSaveData();
    wcCloseModal('wc-modal-edit-mask');
    wcRenderMasks();
}
function wcDeleteMask(id) {
    if(confirm('删除此面具？')) { wcState.masks = wcState.masks.filter(m => m.id !== id); wcSaveData(); wcRenderMasks(); }
}
function wcApplyMask(id) {
    const mask = wcState.masks.find(m => m.id === id);
    if (mask) {
        wcState.user.name = mask.name; wcState.user.avatar = mask.avatar; wcState.user.persona = mask.prompt;
        wcSaveData(); wcRenderUser(); wcCloseModal('wc-modal-masks'); alert(`已切换身份为：${mask.name}`);
    }
}

// --- WeChat Modals ---
function wcOpenModal(id) {
    const modal = document.getElementById(id);
    modal.classList.remove('hidden');
    modal.classList.add('active'); 
    wcState.tempImage = ''; 
    if(id === 'wc-modal-add-char') {
        document.getElementById('wc-preview-char-avatar').style.display = 'none';
        document.getElementById('wc-icon-char-upload').style.display = 'block';
    }
}

function wcCloseModal(id) {
    const modal = document.getElementById(id);
    modal.classList.add('hidden');
    modal.classList.remove('active');
}

function wcToggleMomentType(type) {
    wcState.momentType = type;
    document.getElementById('wc-seg-local').className = type === 'local' ? 'wc-segment-btn active' : 'wc-segment-btn';
    document.getElementById('wc-seg-desc').className = type === 'desc' ? 'wc-segment-btn active' : 'wc-segment-btn';
    document.getElementById('wc-area-local-img').style.display = type === 'local' ? 'block' : 'none';
    document.getElementById('wc-area-desc-img').style.display = type === 'desc' ? 'block' : 'none';
}

function wcSaveMoment() {
    const text = document.getElementById('wc-input-moment-text').value;
    let image = null; let imageDesc = null;
    if (wcState.momentType === 'local') image = wcState.tempImage; else imageDesc = document.getElementById('wc-input-moment-desc').value;
    if (!text && !image && !imageDesc) return alert('请输入内容');
    wcState.moments.unshift({ id: Date.now(), name: wcState.user.name, avatar: wcState.user.avatar, text: text, image: image, imageDesc: imageDesc, time: Date.now(), likes: [], comments: [] });
    wcSaveData();
    document.getElementById('wc-input-moment-text').value = ''; document.getElementById('wc-input-moment-desc').value = ''; wcState.tempImage = '';
    wcCloseModal('wc-modal-post-moment'); wcRenderMoments();
}

function wcDeleteMoment(id) { if(confirm('删除？')) { wcState.moments = wcState.moments.filter(m => m.id !== id); wcDb.delete('moments', id); wcSaveData(); wcRenderMoments(); } }

function wcToggleLike(id) {
    const moment = wcState.moments.find(m => m.id === id); 
    if (!moment) return;
    
    if (!moment.likes) moment.likes = [];
    const userName = wcState.user.name;
    
    if (moment.likes.includes(userName)) {
        moment.likes = moment.likes.filter(n => n !== userName); 
    } else {
        moment.likes.push(userName);
    }
    
    wcSaveData(); 
    wcRenderMoments();
}

function wcToggleCommentBox(id) { 
    const box = document.getElementById(`wc-comment-box-${id}`); 
    box.style.display = box.style.display === 'none' ? 'flex' : 'none'; 
    wcState.replyingToComment = null;
    const input = document.getElementById(`wc-input-comment-${id}`);
    if(input) input.placeholder = "评论...";
}

function wcPrepareReply(momentId, commentIndex, name) {
    wcState.replyingToComment = { momentId, commentIndex, name };
    const box = document.getElementById(`wc-comment-box-${momentId}`);
    box.style.display = 'flex';
    const input = document.getElementById(`wc-input-comment-${momentId}`);
    if(input) {
        input.placeholder = `回复 ${name}...`;
        input.focus();
    }
}

function wcAddComment(id) {
    const input = document.getElementById(`wc-input-comment-${id}`); 
    const text = input.value; 
    if (!text) return;
    
    const moment = wcState.moments.find(m => m.id === id); 
    if (!moment) return;
    if (!moment.comments) moment.comments = [];
    
    let commentText = text;
    if (wcState.replyingToComment && wcState.replyingToComment.momentId === id) {
        commentText = `回复 ${wcState.replyingToComment.name}: ${text}`;
    }
    
    moment.comments.push({ name: wcState.user.name, text: commentText });
    wcSaveData(); 
    wcRenderMoments();
    
    wcState.replyingToComment = null;
    input.value = '';
}

// Swipe Logic for WeChat
let wcXDown = null; let wcYDown = null; let wcCurrentSwipeElement = null;
function wcHandleTouchStartSwipe(evt) { wcXDown = evt.touches[0].clientX; wcYDown = evt.touches[0].clientY; wcCurrentSwipeElement = evt.currentTarget; }
function wcHandleTouchMoveSwipe(evt) {
    if (!wcXDown || !wcYDown) return;
    let xUp = evt.touches[0].clientX; let yUp = evt.touches[0].clientY;
    let xDiff = wcXDown - xUp; let yDiff = wcYDown - yUp;
    if (Math.abs(xDiff) > Math.abs(yDiff)) { 
        if (xDiff > 0) {
            const offset = -80; 
            wcCurrentSwipeElement.style.transform = `translateX(${offset}px)`; 
        } else {
            wcCurrentSwipeElement.style.transform = 'translateX(0px)'; 
        }
    }
}
function wcHandleTouchEndSwipe(evt) { wcXDown = null; wcYDown = null; }
