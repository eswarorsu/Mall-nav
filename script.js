// ═══════════════════ DATABASE CONFIG ═══════════════════
const SUPABASE_URL = "https://nqnmbliwewhbbposhnug.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xbm1ibGl3ZXdoYmJwb3NobnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1ODM4NTcsImV4cCI6MjA5MzE1OTg1N30.1_srs7d8vB72ImYYGe38Wgj6LgUYMCSK2-omp7oNFLY";

let sb = null;
if (typeof supabase !== 'undefined') {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ═══════════════════ CONSTANTS ═══════════════════
const CAT_COLOR = { washroom:'#3b82f6', food:'#f59e0b', exit:'#22c55e', dustbin:'#6b7280', atm:'#eab308', medical:'#ef4444', elevator:'#a855f7', info:'#14b8a6' };
const CAT_LABEL = { washroom:'WC', food:'FS', exit:'EX', dustbin:'BN', atm:'$', medical:'+', elevator:'EL', info:'i' };
const CAT_NAME  = { washroom:'Washroom', food:'Food', exit:'Exit / Stairs', dustbin:'Dustbin', atm:'ATM', medical:'Medical Aid', elevator:'Elevator', info:'Information' };
const YAH = { x:235, y:192 };
const NS='http://www.w3.org/2000/svg';

// Store colors for map fill
const STORE_COLORS = {
  'Zara':'#dbd6cc','H&M':'#dbd5d5','Sports Direct':'#ccd1ca','Apple Store':'#cccccc',
  'Samsung':'#c8d0d8','JBL Audio':'#d0ccd4','Café Coffee Day':'#d4ccc0','Lush':'#ccd4c8',
  'Crossword Books':'#c8d0cc','Food Court':'#d8d0c4','KFC':'#d4c8c0',"McDonald's":'#d0ccc4',
  'PVR Cinemas':'#c4c8d4','Lifestyle':'#d4c8d0','Kids Play Zone':'#ccd8cc','Shoppers Stop':'#d0ccd8',
  'Titan':'#d8d4c8','Swarovski':'#d4d0cc','Bata Shoes':'#ccc8d0','Woodland':'#c8d4d0',
  'Hamleys Toys':'#d4c8cc','IMAX Lobby':'#c8ccd4','Starbucks':'#ccd4c8','Food Junction':'#d0d4cc',
  'Tanishq Jewels':'#d8d4c0','Malabar Gold':'#d4d0bc','Furniture World':'#4e342e','Rooftop Café':'#2c3a47',
  'Parking Ramp':'#455a64','Forever 21':'#6a0040','Zudio':'#3c1a8a','Home Décor Co.':'#2e5e14'
};

// ═══════════════════ STATE ═══════════════════
let curFloor=0, selPOI=null, activeCat='all', query='', selStore=null, offersCache={};
let FLOORS = [], STORE_META = {};
let html5QrCode = null;

// ═══════════════════ INITIALIZATION ═══════════════════
window.addEventListener('DOMContentLoaded', () => {
    setTimeout(initCameraScanner, 800);
});

function initCameraScanner() {
    if (typeof Html5Qrcode === 'undefined') return;
    html5QrCode = new Html5Qrcode("reader");
    html5QrCode.start({ facingMode: "environment" }, { fps: 20, qrbox: 250 }, onScanSuccess, (e)=>{});
}

function onScanSuccess(decodedText) {
    const cleanCode = decodedText.trim();
    if (html5QrCode) {
        html5QrCode.stop().then(() => verifyAndLoad(cleanCode)).catch(() => verifyAndLoad(cleanCode));
    }
}

async function scanFile(input) {
    if (!input.files?.length) return;
    const scanner = new Html5Qrcode("reader");
    try {
        const text = await scanner.scanFile(input.files[0], true);
        verifyAndLoad(text);
    } catch(e) { alert("Could not find QR code in this image."); }
}

async function verifyAndLoad(scannedCode) {
    const hintEl = document.querySelector('.qr-hint');
    const titleEl = document.querySelector('.qr-title');
    const code = scannedCode.trim();
    
    titleEl.textContent = 'VERIFYING...';
    hintEl.textContent = `Checking code: [${code}]`;
    hintEl.style.color = "var(--teal)";

    try {
        if (!sb) throw new Error("Supabase is not initialized. Check your URL/Key.");
        
        // Use .maybeSingle() instead of .single() to avoid the "Cannot coerce" error
        const { data, error } = await sb.from('blueprints').select('*').eq('qr_code', code).maybeSingle();
        
        if (error) {
            console.error("Supabase Error:", error);
            throw new Error(`Database: ${error.message}`);
        }
        
        if (!data) throw new Error(`Access Denied: Code "${code}" not found.`);

        // Success!
        titleEl.textContent = 'ACCESS GRANTED';
        hintEl.textContent = `Loading ${data.name}...`;
        
        setTimeout(() => {
            document.getElementById('qr-screen').classList.add('hidden');
            FLOORS = data.data.floors || [];
            STORE_META = data.data.store_meta || {};
            startBootSequence();
        }, 800);
        
    } catch (err) {
        console.error("Auth Error:", err);
        titleEl.textContent = 'ACCESS DENIED';
        hintEl.textContent = err.message;
        hintEl.style.color = "#ff4444";
        
        // Let them try again after a few seconds
        setTimeout(() => {
            titleEl.textContent = 'SCAN BLUEPRINT';
            hintEl.textContent = 'Position the MallNav QR code within the frame';
            hintEl.style.color = "rgba(255,255,255,0.4)";
            if (!html5QrCode?.isScanning) initCameraScanner();
        }, 4000);
    }
}

function startBootSequence() {
    const overlay = document.getElementById('scan-overlay');
    overlay.style.display = 'flex';
    setTimeout(() => overlay.style.opacity = '1', 50);

    const steps = ['Mapping floor boundaries...', 'Detecting structural walls...', 'Identifying store layouts...', 'Locating points of interest...', 'Building navigation graph...', 'Ready!'];
    const fillEl = document.getElementById('scan-fill'), statusEl = document.getElementById('scan-status');
    let step = 0;

    const iv = setInterval(() => {
        step++;
        fillEl.style.width = Math.round((step / (steps.length - 1)) * 100) + '%';
        statusEl.textContent = steps[step] || steps[steps.length - 1];
        if (step >= steps.length - 1) {
            clearInterval(iv);
            setTimeout(() => {
                overlay.style.opacity = '0';
                document.getElementById('app').style.display = 'flex';
                renderTabs();
                switchFloor(0);
                setTimeout(() => { overlay.style.display = 'none'; document.getElementById('app').style.opacity = '1'; }, 700);
            }, 500);
        }
    }, 400);
}

// ═══════════════════ MAP RENDERING (FROM USER TEMPLATE) ═══════════════════
function el(tag,attrs){const e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e;}
function tx(content,attrs){const e=document.createElementNS(NS,'text');Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));e.textContent=content;return e;}

function renderTabs() {
    const container = document.getElementById('floor-tabs-container');
    container.innerHTML = FLOORS.map((f, i) => `<button class="floor-tab ${i===curFloor?'active':''}" onclick="switchFloor(${i})">${f.label}</button>`).join('');
}

function renderMap() {
    const floor = FLOORS[curFloor], g = document.getElementById('map-g');
    if (!g || !floor) return;
    g.innerHTML = '';
    g.appendChild(el('rect',{x:0,y:0,width:500,height:400,rx:10,fill:'#e8e4dc',stroke:'#b0aca4','stroke-width':1.5}));
    g.appendChild(el('rect',{x:0,y:172,width:500,height:40,fill:'#f5f2ec'}));
    g.appendChild(el('rect',{x:215,y:0,width:40,height:400,fill:'#f5f2ec'}));
    g.appendChild(el('rect',{x:215,y:172,width:40,height:40,fill:'#f9f7f4'}));
    
    floor.stores.forEach(s => {
        const sg = document.createElementNS(NS, 'g'); sg.style.cursor = 'pointer';
        const isSel = selStore && selStore.id === s.id;
        const fillColor = STORE_COLORS[s.lbl] || '#d0ccc6';
        sg.appendChild(el('rect', { x: s.x, y: s.y, width: s.w, height: s.h, rx: 3, fill: fillColor, stroke: isSel ? '#14b8a6' : '#a8a49c', 'stroke-width': isSel ? 2 : 0.5 }));
        if (s.lbl) {
            const fs = Math.min(10, (s.w - 8) / s.lbl.length * 1.35);
            sg.appendChild(tx(s.lbl, { x: s.x + s.w / 2, y: s.y + s.h / 2, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': fs, fill: '#5a5650' }));
        }
        sg.onclick = () => openStore(s);
        g.appendChild(sg);
    });

    if (selPOI) { const p = floor.pois.find(x=>x.id===selPOI); if(p) drawPath(g, p); }

    floor.pois.forEach(poi => {
        const color = CAT_COLOR[poi.type] || '#888', label = CAT_LABEL[poi.type] || '?', isSel = selPOI === poi.id;
        const mg = document.createElementNS(NS, 'g'); mg.style.cursor = 'pointer';
        mg.onclick = () => selectPOI(poi.id);
        if (isSel) mg.appendChild(el('circle', { cx: poi.x, cy: poi.y, r: 14, fill: color, opacity: 0.2, class: 'yah-pulse' }));
        mg.appendChild(el('circle', { cx: poi.x, cy: poi.y, r: isSel ? 9 : 7, fill: color, stroke: 'white', 'stroke-width': isSel ? 2.5 : 1.5 }));
        mg.appendChild(tx(label, { x: poi.x, y: poi.y, 'text-anchor': 'middle', 'dominant-baseline': 'central', 'font-size': 6.5, 'font-weight': 700, fill: 'white' }));
        g.appendChild(mg);
    });

    g.appendChild(el('circle', { cx: YAH.x, cy: YAH.y, r: 12, fill: '#14b8a6', opacity: 0.22, class: 'yah-pulse' }));
    g.appendChild(el('circle', { cx: YAH.x, cy: YAH.y, r: 7, fill: 'white', stroke: '#14b8a6', 'stroke-width': 2 }));
    g.appendChild(el('circle', { cx: YAH.x, cy: YAH.y, r: 3.5, fill: '#14b8a6' }));
}

function drawPath(g, poi) {
    const d = `M${YAH.x} ${YAH.y} L${poi.x} ${YAH.y} L${poi.x} ${poi.y}`;
    g.appendChild(el('path', { d, fill: 'none', stroke: '#14b8a6', 'stroke-width': 5, opacity: 0.12, 'stroke-linecap': 'round' }));
    g.appendChild(el('path', { d, fill: 'none', stroke: '#14b8a6', 'stroke-width': 2, 'stroke-dasharray': '7 5', class: 'nav-path' }));
}

// ═══════════════════ UI ACTIONS ═══════════════════
function openStore(store) {
    selStore = store;
    const meta = STORE_META[store.lbl] || { color: '#555', emoji: '🏪' };
    document.getElementById('sd-badge').style.background = meta.color;
    document.getElementById('sd-badge').textContent = meta.emoji;
    document.getElementById('sd-name').textContent = store.lbl;
    document.getElementById('sd-floor').textContent = FLOORS[curFloor].name;
    document.getElementById('shop-drawer').classList.add('open');
    renderMap();
    loadOffers(store);
}

function selectPOI(id) {
    const p = FLOORS[curFloor].pois.find(x => x.id === id); if (!p) return;
    selPOI = id;
    const dist = Math.round((Math.abs(p.x - YAH.x) + Math.abs(p.y - YAH.y)) / 5);
    document.getElementById('ii').style.background = CAT_COLOR[p.type] || '#888';
    document.getElementById('ii').textContent = CAT_LABEL[p.type] || '?';
    document.getElementById('in').textContent = p.name;
    document.getElementById('im').textContent = `${CAT_NAME[p.type]} · ${p.desc}`;
    document.getElementById('id').innerHTML = `~${dist} m<small>~${Math.ceil(dist / 80)} min</small>`;
    document.getElementById('info-panel').classList.add('on');
    renderMap();
}

async function loadOffers(store) {
    const list = document.getElementById('offers-list');
    list.innerHTML = '<div class="skeleton" style="height:60px; width:100%; margin-bottom:10px;"></div>';
    
    // Simulate a network delay for the AI effect
    setTimeout(() => {
        const storeName = store.lbl || "this store";
        let deals = [];

        // Dynamic logic based on store name
        if (storeName.includes('Zara') || storeName.includes('H&M') || storeName.includes('Lifestyle')) {
            deals = [
                { title: `End of Season Sale`, desc: `Up to 50% off on all winter collections at ${storeName}.`, type: 'hot', icon: '🔥' },
                { title: `Buy 2 Get 1 Free`, desc: `Exclusive offer on basic tees and accessories.`, type: 'new', icon: '✨' }
            ];
        } else if (storeName.includes('Apple') || storeName.includes('Samsung')) {
            deals = [
                { title: `Exchange Bonus`, desc: `Get extra ₹5000 off when you trade in your old device.`, type: 'new', icon: '📱' },
                { title: `Zero Cost EMI`, desc: `Available on all latest flagship models for 12 months.`, type: 'hot', icon: '⚡' }
            ];
        } else if (storeName.includes('Food') || storeName.includes('KFC') || storeName.includes('McDonald')) {
            deals = [
                { title: `Lunch Combo @ ₹199`, desc: `Choose your favorite burger, fries, and a large coke.`, type: 'hot', icon: '🍔' },
                { title: `Free Dessert`, desc: `Complimentary sundae on orders above ₹500.`, type: 'new', icon: '🍦' }
            ];
        } else {
            deals = [
                { title: `Storewide Discount`, desc: `Flash sale! Get 10% instant discount at ${storeName}.`, type: 'hot', icon: '💰' },
                { title: `Welcome Gift`, desc: `Free gift voucher for the first 50 customers today.`, type: 'new', icon: '🎁' }
            ];
        }

        list.innerHTML = deals.map(d => `
            <div class="offer-card ${d.type}">
                <div class="offer-pill ${d.type}">${d.icon} ${d.type.toUpperCase()}</div>
                <div class="offer-title">${d.title}</div>
                <div class="offer-desc">${d.desc}</div>
                <div class="offer-footer">
                    <div class="offer-exp">⏱ Limited Time</div>
                    <div class="offer-code">SAVE${Math.floor(Math.random()*90 + 10)}</div>
                </div>
            </div>
        `).join('');
    }, 600);
}

// ═══════════════════ POI & SEARCH LOGIC ═══════════════════
function filtered() {
    const floor = FLOORS[curFloor];
    if (!floor) return [];
    return floor.pois.filter(p => {
        const matchesCat = activeCat === 'all' || p.type === activeCat;
        const matchesQuery = !query || p.name.toLowerCase().includes(query.toLowerCase()) || (p.desc && p.desc.toLowerCase().includes(query.toLowerCase()));
        return matchesCat && matchesQuery;
    });
}

function renderList() {
    const list = document.getElementById('poi-list');
    if (!list) return;
    const pois = filtered();
    
    if (pois.length === 0) {
        list.innerHTML = '<div class="no-results">No results found.<br>Try a different search or category.</div>';
        return;
    }

    list.innerHTML = pois.map(p => {
        const color = CAT_COLOR[p.type] || '#888';
        const label = CAT_LABEL[p.type] || '?';
        const isSel = selPOI === p.id;
        return `
            <div class="poi-item ${isSel ? 'selected' : ''}" onclick="selectPOI('${p.id}')">
                <div class="poi-ico" style="background:${color}20; color:${color}">
                    <span style="font-size:9px; font-weight:700">${label}</span>
                </div>
                <div style="flex:1; min-width:0">
                    <div class="poi-name">${p.name}</div>
                    <div class="poi-type">${CAT_NAME[p.type] || p.type} · ${p.desc}</div>
                </div>
            </div>
        `;
    }).join('');
}

function setCat(c) {
    activeCat = c;
    document.querySelectorAll('.cat-btn').forEach(b => {
        b.classList.toggle('active', b.dataset.c === c);
    });
    renderMap();
    renderList();
}

function onSearch() {
    query = document.getElementById('search-inp').value;
    renderMap();
    renderList();
}

function logout() {
    document.getElementById('app').style.opacity = '0';
    setTimeout(() => {
        document.getElementById('app').style.display = 'none';
        document.getElementById('qr-screen').classList.remove('hidden');
        initCameraScanner();
    }, 500);
}

window.switchFloor = (i) => { 
    curFloor = i; 
    selPOI = null; 
    selStore = null;
    document.getElementById('info-panel').classList.remove('on');
    document.getElementById('floor-badge').textContent = FLOORS[i].label + ' — ' + FLOORS[i].name;
    renderTabs(); 
    renderMap(); 
    renderList();
};
window.closeDrawer = () => { selStore = null; document.getElementById('shop-drawer').classList.remove('open'); renderMap(); };
window.clearSel = () => { selPOI = null; document.getElementById('info-panel').classList.remove('on'); renderMap(); renderList(); };
window.verifyAndLoad = verifyAndLoad;
window.scanFile = scanFile;
window.logout = logout;
window.navToStore = () => alert("Navigating to store center...");
window.onSearch = onSearch;
window.setCat = setCat;
