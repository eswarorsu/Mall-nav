// ═══════════════════ DATABASE CONFIG (SUPABASE) ═══════════════════
const SUPABASE_URL = "https://nqnmbliwewhbbposhnug.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5xbm1ibGl3ZXdoYmJwb3NobnVnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzc1ODM4NTcsImV4cCI6MjA5MzE1OTg1N30.1_srs7d8vB72ImYYGe38Wgj6LgUYMCSK2-omp7oNFLY";

// Global Supabase Client
let sb = null;
if (typeof supabase !== 'undefined') {
    sb = supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
}

// ═══════════════════ CONSTANTS & CONFIG ═══════════════════
const CAT_COLOR = { washroom:'#3b82f6', food:'#f59e0b', exit:'#22c55e', dustbin:'#6b7280', atm:'#eab308', medical:'#ef4444', elevator:'#a855f7', info:'#14b8a6' };
const CAT_LABEL = { washroom:'WC', food:'FS', exit:'EX', dustbin:'BN', atm:'$', medical:'+', elevator:'EL', info:'i' };
const CAT_NAME  = { washroom:'Washroom', food:'Food', exit:'Exit / Stairs', dustbin:'Dustbin', atm:'ATM', medical:'Medical Aid', elevator:'Elevator', info:'Information' };
const YAH = { x:235, y:192 };
const NS='http://www.w3.org/2000/svg';

// ═══════════════════ STATE ═══════════════════
let curFloor=0, selPOI=null, activeCat='all', query='', selStore=null, offersCache={};
let FLOORS = [], STORE_META = {};
let html5QrCode = null;

// ═══════════════════ INITIALIZATION ═══════════════════
window.addEventListener('DOMContentLoaded', () => {
    // AUTO-START CAMERA FOR MOBILE
    setTimeout(initCameraScanner, 1000);
});

// ═══════════════════ HARDWARE CAMERA LOGIC ═══════════════════
function initCameraScanner() {
    if (typeof Html5Qrcode === 'undefined') return;
    
    // Check if protocol is secure (Required for camera)
    if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
        const readerEl = document.getElementById('reader');
        readerEl.innerHTML = `
            <div style="color:#ef4444; padding:30px; text-align:center; font-family:'DM Sans', sans-serif;">
                <div style="font-size:24px; margin-bottom:10px;">🔒</div>
                <div style="font-weight:600; margin-bottom:8px;">Insecure Connection</div>
                <div style="font-size:11px; color:rgba(255,255,255,0.6); line-height:1.4;">
                    Browser blocks camera on non-HTTPS sites.<br>Please use <b>https://</b> to test on mobile.
                </div>
            </div>
        `;
        return;
    }

    if (html5QrCode) {
        try { html5QrCode.clear(); } catch(e) {}
    }
    
    html5QrCode = new Html5Qrcode("reader");
    const config = { fps: 15, qrbox: { width: 250, height: 250 } };

    html5QrCode.start(
        { facingMode: "environment" }, 
        config, 
        onScanSuccess, 
        onScanFailure
    ).catch(err => {
        console.error("Camera start error:", err);
        const readerEl = document.getElementById('reader');
        let msg = "Camera access denied or not found.";
        if (err.toString().includes("NotAllowedError")) msg = "Please allow camera permissions in your browser settings.";
        
        readerEl.innerHTML = `<div style="color:white; padding:40px; text-align:center; font-size:12px; opacity:0.7;">${msg}</div>`;
    });
}

function onScanSuccess(decodedText, decodedResult) {
    // 1. Clean the scanned text
    const cleanCode = decodedText.trim();
    console.log("🔍 Scanned Text Code:", cleanCode);
    
    if (html5QrCode) {
        html5QrCode.stop().then(() => {
            verifyAndLoad(cleanCode);
        }).catch(err => {
            verifyAndLoad(cleanCode);
        });
    }
}

function onScanFailure(error) {}

async function verifyAndLoad(scannedCode) {
    const hintEl = document.querySelector('.qr-hint');
    const titleEl = document.querySelector('.qr-title');
    
    titleEl.textContent = 'VERIFYING...';
    hintEl.textContent = `Checking Database for: ${scannedCode}`;
    hintEl.style.color = '#14b8a6';
    
    try {
        if (!sb) throw new Error("Supabase is not connected. Check your URL/Key.");
        
        console.log("📡 Querying code:", scannedCode);
        
        // Use a very basic query to avoid schema issues
        const { data, error, status } = await sb
            .from('blueprints')
            .select('*') 
            .eq('qr_code', scannedCode)
            .single();
        
        if (error) {
            console.error("Supabase Error:", error);
            // This will show the EXACT error message on your phone screen
            throw new Error(`DB Error [${status}]: ${error.message}`);
        }
        
        if (!data) throw new Error(`Code '${scannedCode}' not found in database.`);
        
        // Success!
        titleEl.textContent = 'MATCH FOUND';
        hintEl.textContent = `Unlocking ${data.name}...`;
        loadBlueprint(data);
        
    } catch (err) {
        console.error("Full Error Details:", err);
        titleEl.textContent = 'SYSTEM ERROR';
        titleEl.style.color = '#ef4444';
        
        // Display the detailed error for the user to see
        hintEl.innerHTML = `<span style="color:#ff6b6b; font-weight:bold;">${err.message}</span><br>Check Supabase Table/Policies.`;
        
        setTimeout(() => {
            titleEl.textContent = 'SCAN BLUEPRINT';
            titleEl.style.color = '#14b8a6';
            hintEl.textContent = 'Position the QR code within the frame';
            hintEl.style.color = 'rgba(255,255,255,0.4)';
            initCameraScanner();
        }, 3000);
    }
}

// ═══════════════════ UI & ACTIONS ═══════════════════
async function startQRScan() {
    initCameraScanner();
}

function loadBlueprint(blueprint) {
    const payload = blueprint.data || blueprint;
    FLOORS = payload.floors || [];
    STORE_META = payload.store_meta || {};
    document.getElementById('qr-screen').classList.add('hidden');
    setTimeout(initScan, 500);
}

// ═══════════════════ SVG & MAP RENDERING ═══════════════════
const STORE_COLORS = {
  'Zara':'#dbd6cc','H&M':'#dbd5d5','Sports Direct':'#ccd1ca','Apple Store':'#cccccc',
  'Samsung':'#c8d0d8','JBL Audio':'#d0ccd4','Café Coffee Day':'#d4ccc0','Lush':'#ccd4c8',
  'Crossword Books':'#c8d0cc','Food Court':'#d8d0c4','KFC':'#d4c8c0',"McDonald's":'#d0ccc4',
  'PVR Cinemas':'#c4c8d4','Lifestyle':'#d4c8d0','Kids Play Zone':'#ccd8cc','Shoppers Stop':'#d0ccd8',
  'Titan':'#d8d4c8','Swarovski':'#d4d0cc','Bata Shoes':'#ccc8d0','Woodland':'#c8d4d0',
  'Hamleys Toys':'#d4c8cc','IMAX Lobby':'#c8ccd4','Starbucks':'#ccd4c8','Food Junction':'#d0d4cc',
  'Tanishq Jewels':'#d8d4c0','Malabar Gold':'#d4d0bc','Furniture World':'#c4ccc8','Rooftop Café':'#c8d4cc',
  'Parking Ramp':'#c0c4c0','Forever 21':'#d0ccd4','Zudio':'#ccc8d4','Home Décor Co.':'#d4d0c8'
};

function el(tag,attrs){const e=document.createElementNS(NS,tag);Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));return e;}
function tx(content,attrs){const e=document.createElementNS(NS,'text');Object.entries(attrs).forEach(([k,v])=>e.setAttribute(k,v));e.textContent=content;return e;}

function renderMap(){
  if (!FLOORS.length) return;
  const floor=FLOORS[curFloor], g=document.getElementById('map-g');
  if(!g) return;
  g.innerHTML='';
  g.appendChild(el('rect',{x:0,y:0,width:500,height:400,rx:10,fill:'#e8e4dc',stroke:'#b0aca4','stroke-width':1.5}));
  g.appendChild(el('rect',{x:0,y:172,width:500,height:40,fill:'#f5f2ec'}));
  g.appendChild(el('rect',{x:215,y:0,width:40,height:400,fill:'#f5f2ec'}));
  g.appendChild(el('rect',{x:215,y:172,width:40,height:40,fill:'#f9f7f4'}));
  g.appendChild(el('line',{x1:0,y1:192,x2:500,y2:192,stroke:'#ccc8c0','stroke-width':0.5,'stroke-dasharray':'5 5'}));
  g.appendChild(el('line',{x1:235,y1:0,x2:235,y2:400,stroke:'#ccc8c0','stroke-width':0.5,'stroke-dasharray':'5 5'}));

  floor.stores.forEach(s=>{
    const sg=document.createElementNS(NS,'g'); sg.style.cursor='pointer';
    const isSel=selStore&&selStore.id===s.id;
    const fillColor=STORE_COLORS[s.lbl]||'#d0ccc6';
    const r=el('rect',{x:s.x,y:s.y,width:s.w,height:s.h,rx:3,fill:fillColor,stroke:isSel?'#14b8a6':'#a8a49c','stroke-width':isSel?2:0.5});
    sg.appendChild(r);
    if(s.lbl){
      const fs=Math.min(10,(s.w-8)/s.lbl.length*1.35);
      sg.appendChild(tx(s.lbl,{x:s.x+s.w/2,y:s.y+s.h/2,'text-anchor':'middle','dominant-baseline':'central','font-size':fs,fill:'#5a5650','font-family':'DM Sans,sans-serif'}));
    }
    if(isSel){
      sg.appendChild(el('rect',{x:s.x+2,y:s.y+2,width:20,height:11,rx:3,fill:'#14b8a6',opacity:0.95}));
      sg.appendChild(tx('✦',{x:s.x+12,y:s.y+7.5,'text-anchor':'middle','dominant-baseline':'central','font-size':7.5,fill:'white'}));
    }
    sg.addEventListener('click',()=>openStore(s));
    g.appendChild(sg);
  });

  if(selPOI){ const poi=floor.pois.find(p=>p.id===selPOI); if(poi) drawPath(g,poi); }
  const visible=new Set(filtered().map(p=>p.id));
  floor.pois.forEach(poi=>{
    const show=visible.has(poi.id);
    const color=CAT_COLOR[poi.type]||'#888', label=CAT_LABEL[poi.type]||'?', isSel=selPOI===poi.id;
    const mg=document.createElementNS(NS,'g'); mg.style.cursor='pointer'; mg.style.opacity=show?'1':'0.12';
    mg.onclick=()=>selectPOI(poi.id);
    if(isSel) mg.appendChild(el('circle',{cx:poi.x,cy:poi.y,r:14,fill:color,opacity:0.2,class:'yah-pulse'}));
    mg.appendChild(el('circle',{cx:poi.x,cy:poi.y,r:isSel?9:7,fill:color,stroke:'white','stroke-width':isSel?2.5:1.5}));
    mg.appendChild(tx(label,{x:poi.x,y:poi.y,'text-anchor':'middle','dominant-baseline':'central','font-size':label.length>2?5:6.5,'font-weight':700,fill:'white'}));
    g.appendChild(mg);
  });

  g.appendChild(el('circle',{cx:YAH.x,cy:YAH.y,r:12,fill:'#14b8a6',opacity:0.22,class:'yah-pulse'}));
  g.appendChild(el('circle',{cx:YAH.x,cy:YAH.y,r:7,fill:'white',stroke:'#14b8a6','stroke-width':2}));
  g.appendChild(el('circle',{cx:YAH.x,cy:YAH.y,r:3.5,fill:'#14b8a6'}));
}

function drawPath(g,poi){
  const fx=YAH.x,fy=YAH.y,tx2=poi.x,ty=poi.y;
  let d=`M${fx} ${fy} L${tx2} ${fy} L${tx2} ${ty}`;
  g.appendChild(el('path',{d,fill:'none',stroke:'#14b8a6','stroke-width':5,opacity:0.12,'stroke-linecap':'round'}));
  g.appendChild(el('path',{d,fill:'none',stroke:'#14b8a6','stroke-width':2,'stroke-dasharray':'7 5','stroke-linecap':'round',class:'nav-path'}));
}

function openStore(store){
  selStore=store;
  const meta=STORE_META[store.lbl]||{color:'#555',emoji:'🏪'};
  document.getElementById('sd-badge').style.background=meta.color;
  document.getElementById('sd-badge').textContent=meta.emoji;
  document.getElementById('sd-name').textContent=store.lbl;
  document.getElementById('sd-floor').textContent=FLOORS[curFloor].name;
  document.getElementById('shop-drawer').classList.add('open');
  renderMap();
  loadOffers(store);
}

function closeDrawer(){
  selStore=null;
  document.getElementById('shop-drawer').classList.remove('open');
  renderMap();
}

function selectPOI(id){
  const p=FLOORS[curFloor].pois.find(x=>x.id===id); if(!p) return;
  selPOI=id; closeDrawer();
  const dist=Math.round((Math.abs(p.x-YAH.x)+Math.abs(p.y-YAH.y))/5), walk=Math.ceil(dist/80);
  const c=CAT_COLOR[p.type]||'#888', l=CAT_LABEL[p.type]||'?';
  document.getElementById('ii').style.background=c;
  document.getElementById('ii').textContent=l;
  document.getElementById('in').textContent=p.name;
  document.getElementById('im').textContent=`${CAT_NAME[p.type]} · ${p.desc}`;
  document.getElementById('id').innerHTML=`~${dist} m<small>~${walk} min walk</small>`;
  document.getElementById('info-panel').classList.add('on');
  renderMap(); renderList();
}

function filtered(){
  return (FLOORS[curFloor]?.pois || []).filter(p=>{
    const mc=activeCat==='all'||p.type===activeCat;
    const ms=!query||p.name.toLowerCase().includes(query.toLowerCase());
    return mc&&ms;
  });
}

function renderList(){
  const list=document.getElementById('poi-list'); if(!list) return;
  const pois=filtered();
  if(!pois.length){ list.innerHTML='<div class="no-results">No results found.</div>'; return; }
  list.innerHTML=pois.map(p=>{
    const c=CAT_COLOR[p.type]||'#888', l=CAT_LABEL[p.type]||'?', sel=selPOI===p.id;
    return `<div class="poi-item${sel?' selected':''}" onclick="selectPOI('${p.id}')">
      <div class="poi-ico" style="background:${c}20;color:${c}"><span>${l}</span></div>
      <div style="flex:1;min-width:0">
        <div class="poi-name">${p.name}</div>
        <div class="poi-type">${CAT_NAME[p.type]} · ${p.desc}</div>
      </div>
    </div>`;
  }).join('');
}

function initScan(){
  renderList(); renderMap();
  const fillEl=document.getElementById('scan-fill'), statusEl=document.getElementById('scan-status');
  const steps=['Mapping floor boundaries...','Detecting structural walls...','Locating stores...','Ready!'];
  let step=0;
  const iv=setInterval(()=>{
    step++; fillEl.style.width=Math.round((step/(steps.length-1))*100)+'%';
    statusEl.textContent=steps[step]||steps[steps.length-1];
    if(step>=steps.length-1){
      clearInterval(iv);
      setTimeout(()=>{
        document.getElementById('scan-overlay').style.opacity='0';
        document.getElementById('app').style.display='flex';
        setTimeout(()=>{ document.getElementById('scan-overlay').style.display='none'; document.getElementById('app').style.opacity='1'; },700);
      },500);
    }
  },600);
}

async function loadOffers(store){
  const list = document.getElementById('offers-list'); if(!list) return;
  list.innerHTML='<div class="skeleton" style="height:50px;width:100%;"></div>';
  setTimeout(() => {
    const offers = [
      { title: `20% Off at ${store.lbl}`, description: "Special discount for members.", validity: "Today only" },
      { title: "Buy 1 Get 1 Free", description: "On selected items.", validity: "End of week" }
    ];
    list.innerHTML = offers.map(o => `<div class="offer-card new">
      <div class="offer-pill new">NEW</div>
      <div class="offer-title">${o.title}</div>
      <div class="offer-desc">${o.description}</div>
      <div class="offer-footer"><div class="offer-exp">⏱ ${o.validity}</div></div>
    </div>`).join('');
  }, 1000);
}

window.startQRScan = startQRScan;
window.switchFloor = (i) => { curFloor=i; renderMap(); renderList(); };
window.onSearch = () => { query=document.getElementById('search-inp').value; renderMap(); renderList(); };
window.setCat = (c) => { activeCat=c; renderMap(); renderList(); };
window.closeDrawer = closeDrawer;
window.selectPOI = selectPOI;
window.clearSel = () => { selPOI=null; document.getElementById('info-panel').classList.remove('on'); renderMap(); renderList(); };
window.navToStore = () => { alert("Navigating..."); };
