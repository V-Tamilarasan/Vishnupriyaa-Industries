
/* ═══════════════════════════════════════════════════
   DB  — collections: materials bills workers templates issuances productions finished sales
   ═══════════════════════════════════════════════════ */
const DB = (() => {
  const PFX  = 'vi3_';
  const COLS = ['materials','bills','workers','templates','issuances','productions','finished','sales'];
  const _c   = {};
  COLS.forEach(c => { try { _c[c] = JSON.parse(localStorage.getItem(PFX+c)||'[]'); } catch { _c[c]=[]; } });
  const save = c => { try { localStorage.setItem(PFX+c, JSON.stringify(_c[c])); } catch { setTimeout(()=>toast('Storage full!','danger'),100); } };
  const uid  = () => Date.now().toString(36)+Math.random().toString(36).slice(2,6);
  return {
    all:    c     => [...(_c[c]||[])],
    find:  (c,id) => (_c[c]||[]).find(d=>d.id===id)||null,
    insert:(c,d)  => { const doc={id:uid(),createdAt:Date.now(),...d}; _c[c].unshift(doc); save(c); return doc; },
    update:(c,id,d)=>{ const i=(_c[c]||[]).findIndex(x=>x.id===id); if(i===-1)return null; _c[c][i]={..._c[c][i],...d,updatedAt:Date.now()}; save(c); return _c[c][i]; },
    delete:(c,id) => { const b=(_c[c]||[]).length; _c[c]=(_c[c]||[]).filter(d=>d.id!==id); save(c); return (_c[c]||[]).length<b; },
    where: (c,fn) => (_c[c]||[]).filter(fn),
    uid,
    /* ── stock helpers ── */
    stockQty: name => parseFloat((_c.materials||[]).find(m=>m.name===name)?.qty||0),
    adjustStock(name, delta) {
      const m=(_c.materials||[]).find(m=>m.name===name); if(!m) return;
      m.qty = Math.max(0, parseFloat(m.qty||0)+parseFloat(delta)); save('materials');
    },
    applyBill(items) {
      items.forEach(it=>{
        const ex=(_c.materials||[]).find(m=>m.name===it.mat);
        if(ex){ ex.qty=parseFloat(ex.qty||0)+parseFloat(it.qty); if(!ex.unitCost&&it.price)ex.unitCost=it.price; }
        else _c.materials.unshift({id:uid(),createdAt:Date.now(),name:it.mat,category:'',unit:it.unit||'',qty:parseFloat(it.qty),minLevel:10,unitCost:it.price||0});
      }); save('materials');
    },
    /* ── worker holdings helpers ── */
    workerHolding(workerId, matName){
      const w=(_c.workers||[]).find(w=>w.id===workerId);
      return parseFloat(w?.holdings?.find(h=>h.mat===matName)?.qty||0);
    },
    isSerialUnique: sn => !(_c.finished||[]).some(f=>f.serialNumber===sn),
    clearAll(){ COLS.forEach(c=>{ _c[c]=[]; localStorage.removeItem(PFX+c); }); },
    exportAll(){ return {exportedAt:new Date().toISOString(), ...Object.fromEntries(COLS.map(c=>[c,_c[c]]))}; },
    importAll(data){ COLS.forEach(c=>{ if(data[c]){ _c[c]=data[c]; localStorage.setItem(PFX+c,JSON.stringify(data[c])); } }); },
    /* ── unit memory ── */
    saveUnit(unit){
      if(!unit) return;
      const stored = JSON.parse(localStorage.getItem(PFX+'_units')||'[]');
      if(!stored.includes(unit)){ stored.push(unit); localStorage.setItem(PFX+'_units',JSON.stringify(stored)); }
    },
    savedUnits(){
      const base=['kg','g','litre','ml','pieces','feet','metre','nos','box','sheet','roll','pair','set'];
      const stored = JSON.parse(localStorage.getItem(PFX+'_units')||'[]');
      return [...new Set([...base,...stored,...(_c.materials||[]).map(m=>m.unit).filter(Boolean)])];
    }
  };
})();

/* ═══════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════ */
const fmtMoney = v => '₹'+parseFloat(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtNum   = v => parseFloat(v||0).toLocaleString('en-IN');
const fmtDate  = ds => ds ? new Date(ds+'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const todayStr = () => new Date().toISOString().slice(0,10);
function stockStatus(m){ const q=parseFloat(m.qty||0),mn=parseFloat(m.minLevel||0); return q<=0?'out':q<=mn?'low':'ok'; }
function stockBadge(m){
  const s=stockStatus(m);
  return s==='out'?`<span class="badge badge-danger">✕ Out of Stock</span>`:
         s==='low'?`<span class="badge badge-warning">⚠ Low</span>`:
                   `<span class="badge badge-success">✓ In Stock</span>`;
}

/* ═══════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════ */
function toast(msg,type='success'){
  const w=document.getElementById('toast-wrap'); if(!w)return;
  const el=document.createElement('div');
  el.className=`toast t-${type}`;
  el.innerHTML=`<span>${{success:'✅',danger:'❌',warning:'⚠️'}[type]||'ℹ'}</span><span>${msg}</span>`;
  w.appendChild(el);
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('show')));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),400); },3800);
}

/* ═══════════════════════════════════════════════════
   MODALS
   ═══════════════════════════════════════════════════ */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelectorAll('.modal-backdrop.open').forEach(m=>m.classList.remove('open')); });

function buildCombo(inputId,dropId,items,onSelect){
  const input=document.getElementById(inputId), drop=document.getElementById(dropId);
  if(!input||!drop) return;
  const ni=input.cloneNode(true); input.parentNode.replaceChild(ni,input);
  const inp=document.getElementById(inputId);
  const render=f=>{
    const lf=f.toLowerCase();
    const filtered=items.filter(i=>{ const s=typeof i==='string'?i:(i.label||i.name||''); return s.toLowerCase().includes(lf); });
    if(!filtered.length){drop.classList.remove('open');return;}
    drop.innerHTML=filtered.map(i=>{ const t=typeof i==='string'?i:(i.label||i.name||''); return `<div class="combo-item" data-value="${t.replace(/"/g,'&quot;')}">${t}</div>`; }).join('');
    drop.classList.add('open');
    drop.querySelectorAll('.combo-item').forEach(el=>el.addEventListener('mousedown',e=>{
      e.preventDefault(); inp.value=el.getAttribute('data-value');
      drop.classList.remove('open'); onSelect?.(inp.value);
    }));
  };
  inp.addEventListener('input',  e=>render(e.target.value));
  inp.addEventListener('focus',  ()=>render(inp.value));
  inp.addEventListener('blur',   ()=>setTimeout(()=>drop.classList.remove('open'),200));
}

/* ═══════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════ */
const PAGE_CONFIG = {
  dashboard:       {label:'Dashboard',         btn:null},
  materials:       {label:'Raw Materials',     btn:{text:'+ Add Material',     fn:()=>openMatModal(null)}},
  suppliers:       {label:'Supplier Bills',    btn:{text:'+ New Bill',          fn:openSupModal}},
  workers:         {label:'Workers',           btn:{text:'+ Add Worker',        fn:()=>openWorkerModal(null)}},
  'worker-profile':{label:'Worker Profile',    btn:null},
  templates:       {label:'Product Templates', btn:{text:'+ New Template',      fn:()=>openTemplateModal(null)}},
  productions:     {label:'Production Log',    btn:{text:'+ Record Production', fn:openProductionModal}},
  finished:        {label:'Finished Goods',    btn:null},
  sales:           {label:'Sales Bills',       btn:{text:'+ New Sales Bill',    fn:()=>openSalesModal(null)}},
  reports:         {label:'Reports',           btn:null},
};
const RENDERERS = {
  dashboard:'renderDashboard', materials:'renderMaterials', suppliers:'renderSuppliers',
  workers:'renderWorkers', 'worker-profile':'renderWorkerProfile',
  templates:'renderTemplates', productions:'renderProductions',
  finished:'renderFinished', sales:'renderSales', reports:'renderReports',
};
let _profileWid=null;
function nav(page,param){
  if(page==='worker-profile'&&param) _profileWid=param;
  document.querySelectorAll('.nav-btn[data-page]').forEach(b=>b.classList.toggle('active',b.dataset.page===page));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  const cfg=PAGE_CONFIG[page]||{};
  const bc=document.getElementById('bc-page'); if(bc)bc.textContent=cfg.label||page;
  const btn=document.getElementById('top-action-btn');
  if(btn){ if(cfg.btn){btn.textContent=cfg.btn.text;btn.style.display='';btn.onclick=cfg.btn.fn;}else btn.style.display='none'; }
  if(RENDERERS[page]) window[RENDERERS[page]]?.();
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('page-overlay')?.classList.remove('show');
}
function toggleNavSection(sec){
  const el=document.getElementById(`section-${sec}`), b=document.getElementById(`collapse-${sec}`);
  if(!el||!b)return;
  const c=el.classList.toggle('collapsed');
  b.textContent=c?'▶':'▼';
}

/* ═══════════════════════════════════════════════════
   COUNTS + DATE
   ═══════════════════════════════════════════════════ */
function updateDate(){
  const el=document.getElementById('topbar-date');
  if(el)el.textContent=new Date().toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
}
function updateCounts(){
  const mats=DB.all('materials'), workers=DB.all('workers');
  const low=mats.filter(m=>stockStatus(m)!=='ok').length;
  const holding=workers.filter(w=>(w.holdings||[]).length>0).length;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('nc-materials', mats.length);
  set('nc-suppliers', DB.all('bills').length);
  set('nc-workers',   workers.length);
  set('nc-templates', DB.all('templates').length);
  set('nc-productions',DB.all('productions').length);
  set('nc-finished',  DB.all('finished').filter(f=>!f.sold).length);
  set('nc-sales',     DB.all('sales').length);
  set('sf-holding',   holding);
  set('sf-low-stock', low);
}

/* ═══════════════════════════════════════════════════
   DASHBOARD
   ═══════════════════════════════════════════════════ */
function renderDashboard(){
  const mats=DB.all('materials'), workers=DB.all('workers');
  const fin=DB.all('finished'), sales=DB.all('sales'), prods=DB.all('productions');
  const inStock=fin.filter(f=>!f.sold).length;
  const totalSales=sales.reduce((s,sl)=>s+parseFloat(sl.totalAmount||sl.amount||0),0);
  const totalWages=prods.reduce((s,p)=>s+parseFloat(p.totalWage||0),0);
  const lowMats=mats.filter(m=>stockStatus(m)!=='ok');
  const holding=workers.filter(w=>(w.holdings||[]).length>0);

  const statsEl=document.getElementById('dash-stats');
  if(statsEl)statsEl.innerHTML=`
    <div class="stat-card"><span class="sc-ico">📦</span><div class="sc-lbl">Materials</div><div class="sc-val">${mats.length}</div><div class="sc-sub">${lowMats.length} low/out</div></div>
    <div class="stat-card"><span class="sc-ico">👷</span><div class="sc-lbl">Workers Holding</div><div class="sc-val">${holding.length}</div><div class="sc-sub">of ${workers.length} total</div></div>
    <div class="stat-card"><span class="sc-ico">✅</span><div class="sc-lbl">In Stock</div><div class="sc-val" style="color:var(--info)">${inStock}</div><div class="sc-sub">${fin.length-inStock} sold</div></div>
    <div class="stat-card"><span class="sc-ico">💳</span><div class="sc-lbl">Wages Paid</div><div class="sc-val" style="font-size:1.2rem">${fmtMoney(totalWages)}</div></div>
    <div class="stat-card" style="border-color:var(--success-light)"><span class="sc-ico">💰</span><div class="sc-lbl">Revenue</div><div class="sc-val" style="font-size:1.2rem;color:var(--success)">${fmtMoney(totalSales)}</div></div>
  `;

  let banners='';
  if(lowMats.length) banners+=`<div class="banner banner-warning"><span class="banner-ico">⚠️</span><div><strong>${lowMats.filter(m=>stockStatus(m)==='out').length} out, ${lowMats.filter(m=>stockStatus(m)==='low').length} low:</strong> ${lowMats.slice(0,3).map(m=>m.name).join(', ')}${lowMats.length>3?` +${lowMats.length-3} more`:''}</div></div>`;
  if(holding.length) banners+=`<div class="banner banner-warning"><span class="banner-ico">📦</span><div><strong>${holding.length} worker(s) holding materials:</strong> ${holding.map(w=>`<button class="card-link" onclick="nav('worker-profile','${w.id}')">${w.name}</button>`).join(', ')}</div></div>`;
  const be=document.getElementById('dash-banners'); if(be)be.innerHTML=banners;

  const riEl=document.getElementById('dash-issuances');
  if(riEl){ const iss=DB.all('issuances').slice(0,5); riEl.innerHTML=iss.length?iss.map(i=>`<div class="dash-row"><span class="dr-name">👷 ${i.workerName}</span><span class="dr-val">${fmtDate(i.date)} · ${(i.materials||[]).length} items</span></div>`).join(''):'<div class="dash-empty">No issuances yet</div>'; }
  const rsEl=document.getElementById('dash-sales');
  if(rsEl){ const sl=sales.slice(0,5); rsEl.innerHTML=sl.length?sl.map(s=>`<div class="dash-row"><span class="dr-name">${s.product}</span><span class="dr-val" style="color:var(--success)">${fmtMoney(s.totalAmount||s.amount)}</span></div>`).join(''):'<div class="dash-empty">No sales yet</div>'; }
  const twEl=document.getElementById('dash-workers-top');
  if(twEl){ const top=[...workers].sort((a,b)=>(b.totalEarned||0)-(a.totalEarned||0)).slice(0,5); twEl.innerHTML=top.length?top.map(w=>`<div class="dash-row"><span class="dr-name">${w.name}</span><span class="dr-val">${fmtMoney(w.totalEarned||0)}</span></div>`).join(''):'<div class="dash-empty">No workers</div>'; }
  const saEl=document.getElementById('dash-stock-alerts');
  if(saEl){ saEl.innerHTML=lowMats.length?lowMats.slice(0,6).map(m=>`<div class="dash-row"><span class="dr-name">${m.name}</span><span class="dr-val">${fmtNum(m.qty)} ${m.unit}</span></div>`).join(''):'<div class="dash-empty" style="color:var(--success)">✓ All stocked</div>'; }
}

/* ═══════════════════════════════════════════════════
   RAW MATERIALS
   ═══════════════════════════════════════════════════ */
let _matFilter='all', _editMatId=null;
function renderMaterials(){
  const mats=DB.all('materials');
  const search=(document.getElementById('mat-search')?.value||'').toLowerCase();
  const filtered=mats.filter(m=>(_matFilter==='all'||stockStatus(m)===_matFilter)&&(m.name.toLowerCase().includes(search)||(m.category||'').toLowerCase().includes(search)));
  const tbody=document.getElementById('mat-tbody'); if(!tbody)return;
  tbody.innerHTML=filtered.length?filtered.map(m=>`<tr>
    <td class="td-name">${m.name}</td>
    <td><span class="badge badge-gray">${m.category||'—'}</span></td>
    <td class="td-mono">${fmtNum(m.qty)}</td>
    <td class="td-mono">${m.unit||'—'}</td>
    <td class="td-mono">${fmtMoney(m.unitCost||0)}</td>
    <td class="td-mono">${fmtMoney(parseFloat(m.qty||0)*parseFloat(m.unitCost||0))}</td>
    <td>${stockBadge(m)}</td>
    <td><div class="acts">
      <button class="act-btn" onclick="openMatModal('${m.id}')">✏️ Edit</button>
      <button class="act-btn danger" onclick="deleteMat('${m.id}')">🗑</button>
    </div></td>
  </tr>`).join(''):`<tr><td colspan="8"><div class="t-empty"><span class="t-empty-ico">📦</span>${mats.length?'No results':'No materials yet — add one or load a supplier bill'}</div></td></tr>`;
  document.getElementById('mat-foot-l').textContent=`${filtered.length} of ${mats.length} materials`;
  const tv=mats.reduce((s,m)=>s+parseFloat(m.qty||0)*parseFloat(m.unitCost||0),0);
  document.getElementById('mat-foot-r').textContent=`Total stock value: ${fmtMoney(tv)}`;
}
function openMatModal(id){
  _editMatId=id; const m=id?DB.find('materials',id):null;
  document.getElementById('mat-modal-ttl').textContent=m?'Edit Material':'Add Raw Material';
  document.getElementById('fm-name').value=m?.name||'';
  document.getElementById('fm-cat').value=m?.category||'';
  document.getElementById('fm-unit').value=m?.unit||'';
  document.getElementById('fm-qty').value=m?.qty||0;
  document.getElementById('fm-cost').value=m?.unitCost||0;
  document.getElementById('fm-min').value=m?.minLevel||10;
  const cats=[...new Set(DB.all('materials').map(m=>m.category).filter(Boolean))];
  buildCombo('fm-cat','fm-cat-drop',cats);
  buildCombo('fm-unit','fm-unit-drop',DB.savedUnits());
  openModal('modal-material');
  setTimeout(()=>document.getElementById('fm-name')?.focus(),100);
}
function saveMat(){
  const name=document.getElementById('fm-name').value.trim(), unit=document.getElementById('fm-unit').value.trim();
  if(!name){toast('Name required','danger');return;}
  if(!unit){toast('Unit required','danger');return;}
  DB.saveUnit(unit);
  const d={name,category:document.getElementById('fm-cat').value.trim(),unit,qty:parseFloat(document.getElementById('fm-qty').value)||0,unitCost:parseFloat(document.getElementById('fm-cost').value)||0,minLevel:parseFloat(document.getElementById('fm-min').value)||10};
  if(_editMatId) DB.update('materials',_editMatId,d); else DB.insert('materials',d);
  closeModal('modal-material'); renderMaterials(); updateCounts(); toast(`"${name}" ${_editMatId?'updated':'added'}`);
}
function deleteMat(id){
  if(!confirm('Delete this material? This will NOT adjust any worker holdings.'))return;
  DB.delete('materials',id); renderMaterials(); updateCounts(); toast('Deleted','warning');
}

/* ═══════════════════════════════════════════════════
   SUPPLIER BILLS
   ═══════════════════════════════════════════════════ */
let _supRowCount = 0;

function openSupModal(){
  _supRowCount = 0;
  document.getElementById('fs-supplier').value='';
  document.getElementById('fs-billno').value='';
  document.getElementById('fs-date').value=todayStr();
  document.getElementById('sup-rows-wrap').innerHTML=
    `<div class="sup-empty-hint">No items yet — click "+ Add Row"</div>`;
  document.getElementById('sup-total').textContent='₹0.00';
  buildCombo('fs-supplier','fs-supplier-drop',[...new Set(DB.all('bills').map(b=>b.supplier).filter(Boolean))]);

  const addBtn = document.getElementById('sup-add-row');
  if(addBtn){
    const fresh = addBtn.cloneNode(true);
    addBtn.parentNode.replaceChild(fresh, addBtn);
    document.getElementById('sup-add-row').addEventListener('click', supAddRow);
  }

  const saveBtn = document.getElementById('sup-save');
  if(saveBtn){
    const fresh = saveBtn.cloneNode(true);
    saveBtn.parentNode.replaceChild(fresh, saveBtn);
    document.getElementById('sup-save').addEventListener('click', saveSupplierBill);
  }

  openModal('modal-supplier');
}

function supAddRow(){
  const wrap = document.getElementById('sup-rows-wrap');
  const hint = wrap.querySelector('.sup-empty-hint');
  if(hint) hint.remove();

  const i = _supRowCount++;
  const div = document.createElement('div');
  div.className = 'bill-row-wrap';
  div.id = `sr-wrap-${i}`;
  div.innerHTML = `
    <div class="bill-row">
      <div class="combo-wrap">
        <input class="finput" id="sr-mat-${i}" placeholder="Material name" autocomplete="off"/>
        <div class="combo-drop" id="sr-mat-drop-${i}"></div>
      </div>
      <input class="finput" id="sr-qty-${i}" type="number" min="0" step="0.01" placeholder="0"/>
      <div class="combo-wrap">
        <input class="finput" id="sr-unit-${i}" placeholder="unit" autocomplete="off"/>
        <div class="combo-drop" id="sr-unit-drop-${i}"></div>
      </div>
      <div style="position:relative">
        <span style="position:absolute;left:.65rem;top:50%;transform:translateY(-50%);color:var(--text-light);font-size:.78rem;pointer-events:none">₹</span>
        <input class="finput" id="sr-price-${i}" type="number" min="0" step="0.01" placeholder="0.00" style="padding-left:1.5rem"/>
      </div>
      <button class="row-del" onclick="supDelRow(${i})">×</button>
    </div>
    <div id="sr-prompt-${i}"></div>`;
  wrap.appendChild(div);

  document.getElementById(`sr-qty-${i}`).addEventListener('input', calcSupTotal);
  document.getElementById(`sr-price-${i}`).addEventListener('input', calcSupTotal);

  document.getElementById(`sr-unit-${i}`).addEventListener('input', ()=>{
    const nmfU = document.getElementById(`nmf-unit-${i}`);
    if(nmfU) nmfU.value = document.getElementById(`sr-unit-${i}`).value;
  });

  buildCombo(`sr-unit-${i}`, `sr-unit-drop-${i}`, DB.savedUnits(), val=>{
    document.getElementById(`sr-unit-${i}`).value = val;
    const nmfU = document.getElementById(`nmf-unit-${i}`);
    if(nmfU) nmfU.value = val;
  });

  const mats = DB.all('materials');
  document.getElementById(`sr-mat-${i}`).addEventListener('input', ()=>{
    _checkNewMatPrompt(i);
    calcSupTotal();
  });
  buildCombo(`sr-mat-${i}`, `sr-mat-drop-${i}`, mats.map(m=>m.name), val=>{
    document.getElementById(`sr-mat-${i}`).value = val;
    const m = mats.find(m=>m.name===val);
    if(m){
      const uEl = document.getElementById(`sr-unit-${i}`);
      if(uEl && !uEl.value) uEl.value = m.unit||'';
      const pEl = document.getElementById(`sr-price-${i}`);
      if(pEl && !pEl.value) pEl.value = m.unitCost||'';
    }
    _checkNewMatPrompt(i);
    calcSupTotal();
  });

  setTimeout(()=>document.getElementById(`sr-mat-${i}`)?.focus(), 50);
}

function supDelRow(i){
  const el = document.getElementById(`sr-wrap-${i}`);
  if(el) el.remove();
  calcSupTotal();
  const wrap = document.getElementById('sup-rows-wrap');
  if(!wrap.querySelector('.bill-row-wrap')){
    wrap.innerHTML = `<div class="sup-empty-hint">No items yet — click "+ Add Row"</div>`;
    document.getElementById('sup-total').textContent='₹0.00';
  }
}

function calcSupTotal(){
  let t = 0;
  document.querySelectorAll('#sup-rows-wrap .bill-row-wrap').forEach(row=>{
    const id = row.id.replace('sr-wrap-','');
    const qty   = parseFloat(document.getElementById(`sr-qty-${id}`)?.value  ||0);
    const price = parseFloat(document.getElementById(`sr-price-${id}`)?.value||0);
    t += qty * price;
  });
  const el = document.getElementById('sup-total');
  if(el) el.textContent = fmtMoney(t);
}

function _checkNewMatPrompt(i){
  const nameEl = document.getElementById(`sr-mat-${i}`);
  const promptEl = document.getElementById(`sr-prompt-${i}`);
  if(!nameEl || !promptEl) return;

  const name = nameEl.value.trim();
  if(!name){ promptEl.innerHTML=''; return; }

  const exists = DB.all('materials').some(m=>m.name.toLowerCase()===name.toLowerCase());
  if(exists){
    promptEl.innerHTML='';
    const m = DB.all('materials').find(m=>m.name.toLowerCase()===name.toLowerCase());
    if(m){
      const uEl=document.getElementById(`sr-unit-${i}`); if(uEl&&!uEl.value) uEl.value=m.unit||'';
      const pEl=document.getElementById(`sr-price-${i}`); if(pEl&&!pEl.value){ pEl.value=m.unitCost||''; calcSupTotal(); }
    }
    return;
  }

  const existing = promptEl.querySelector('.new-mat-form');
  if(existing && existing.dataset.forName === name) return;

  const cats=[...new Set(DB.all('materials').map(m=>m.category).filter(Boolean))];
  promptEl.innerHTML=`
    <div class="new-mat-form" data-for-name="${name}">
      <div class="nmf-header">
        <span class="nmf-badge">✨ New Material</span>
        <span class="nmf-hint">"<strong>${name}</strong>" isn't in Raw Materials yet — fill the details below. It will be created when you save the bill.</span>
      </div>
      <div class="nmf-fields">
        <div class="nmf-field">
          <label class="nmf-label">Unit <span class="nmf-req">*</span></label>
          <div class="combo-wrap" style="width:100%">
            <input class="finput nmf-input" id="nmf-unit-${i}" placeholder="kg / pcs / feet…" autocomplete="off"/>
            <div class="combo-drop" id="nmf-unit-drop-${i}"></div>
          </div>
        </div>
        <div class="nmf-field">
          <label class="nmf-label">Category</label>
          <div class="combo-wrap" style="width:100%">
            <input class="finput nmf-input" id="nmf-cat-${i}" placeholder="Wood, Polish…" autocomplete="off"/>
            <div class="combo-drop" id="nmf-cat-drop-${i}"></div>
          </div>
        </div>
        <div class="nmf-field">
          <label class="nmf-label">Min Alert Level</label>
          <input class="finput nmf-input" id="nmf-min-${i}" type="number" min="0" step="1" value="10" placeholder="10"/>
        </div>
      </div>
      <div class="nmf-note">💡 Unit cost = price you enter above · Quantity = qty you enter above</div>
    </div>`;

  const nmfUnitEl = document.getElementById(`nmf-unit-${i}`);
  nmfUnitEl.addEventListener('input', e=>{
    const mainU = document.getElementById(`sr-unit-${i}`);
    if(mainU) mainU.value = e.target.value;
  });

  buildCombo(`nmf-unit-${i}`,`nmf-unit-drop-${i}`,DB.savedUnits(),val=>{
    document.getElementById(`nmf-unit-${i}`).value=val;
    const mainU=document.getElementById(`sr-unit-${i}`); if(mainU) mainU.value=val;
  });
  buildCombo(`nmf-cat-${i}`,`nmf-cat-drop-${i}`,cats);
}

function _readSupRowsFromDOM(){
  const rows=[];
  document.querySelectorAll('#sup-rows-wrap .bill-row-wrap').forEach(row=>{
    const i = row.id.replace('sr-wrap-','');
    const mat   = (document.getElementById(`sr-mat-${i}`)  ?.value||'').trim();
    const qty   = parseFloat(document.getElementById(`sr-qty-${i}`)  ?.value||0);
    const unit  = (document.getElementById(`sr-unit-${i}`) ?.value||'').trim();
    const price = parseFloat(document.getElementById(`sr-price-${i}`)?.value||0);
    const nmfUnit= (document.getElementById(`nmf-unit-${i}`)?.value||'').trim();
    const nmfCat = (document.getElementById(`nmf-cat-${i}`) ?.value||'').trim();
    const nmfMin = parseFloat(document.getElementById(`nmf-min-${i}`) ?.value||10);
    const isNew  = !!document.querySelector(`#sr-prompt-${i} .new-mat-form`);
    const effectiveUnit = (isNew && nmfUnit) ? nmfUnit : unit;
    rows.push({mat,qty,unit:effectiveUnit,price,isNew,nmfCat,nmfMin});
  });
  return rows;
}

function saveSupplierBill(){
  const supplier = document.getElementById('fs-supplier').value.trim();
  const date     = document.getElementById('fs-date').value;
  if(!supplier){ toast('Supplier name required','danger'); return; }
  if(!date)    { toast('Select a date','danger'); return; }

  const allRows = _readSupRowsFromDOM();
  const valid   = allRows.filter(r=>r.mat && r.qty>0);
  if(!valid.length){ toast('Add at least one material row with a name and quantity','danger'); return; }

  const missingUnit = valid.filter(r=>r.isNew && !r.unit);
  if(missingUnit.length){
    toast('Please fill in the Unit for: '+missingUnit.map(r=>r.mat).join(', '),'danger');
    return;
  }

  valid.forEach(r=>{ if(r.unit) DB.saveUnit(r.unit); });
  const total = valid.reduce((s,r)=>s+r.qty*r.price, 0);

  DB.insert('bills',{
    supplier,
    billno: document.getElementById('fs-billno').value.trim(),
    date,
    items: valid.map(r=>({mat:r.mat, qty:r.qty, unit:r.unit, price:r.price})),
    total
  });

  let newCount = 0;
  valid.forEach(r=>{
    const ex = DB.all('materials').find(m=>m.name.toLowerCase()===r.mat.toLowerCase());
    if(ex){
      DB.update('materials', ex.id, {
        qty: parseFloat(ex.qty||0)+r.qty,
        ...(!ex.unitCost && r.price ? {unitCost:r.price} : {})
      });
    } else {
      DB.insert('materials',{
        name    : r.mat,
        category: r.nmfCat||'',
        unit    : r.unit||'',
        qty     : r.qty,
        unitCost: r.price||0,
        minLevel: r.nmfMin||10,
      });
      newCount++;
    }
  });

  closeModal('modal-supplier');
  renderSuppliers(); renderMaterials(); updateCounts();
  toast(`Bill from "${supplier}" saved${newCount?` — ${newCount} new material(s) added`:''}  — stock updated`);
}

function renderSuppliers(){
  const bills=DB.all('bills'), search=(document.getElementById('sup-search')?.value||'').toLowerCase();
  const filtered=bills.filter(b=>b.supplier.toLowerCase().includes(search)||(b.billno||'').toLowerCase().includes(search));
  const list=document.getElementById('sup-list'); if(!list)return;
  if(!filtered.length){list.innerHTML=`<div class="table-card"><div class="t-empty"><span class="t-empty-ico">🧾</span>${bills.length?'No results':'No bills yet'}</div></div>`;return;}
  list.innerHTML=filtered.map(b=>`
    <div class="wo-card">
      <div class="wo-card-hdr">
        <div class="wc-left">
          <div class="wc-worker">${b.supplier}</div>
          <div class="wc-notes">${b.billno?'#'+b.billno+' · ':''}${fmtDate(b.date)} · ${b.items?.length||0} items</div>
        </div>
        <div class="wc-badges"><strong style="color:var(--success)">${fmtMoney(b.total)}</strong><button class="act-btn danger" onclick="deleteBill('${b.id}')">🗑</button></div>
      </div>
      <div class="wo-card-body" style="flex-direction:column;gap:0.3rem">
        ${(b.items||[]).map(it=>`<div class="iss-mat-row"><span class="imr-name">${it.mat}</span><span class="imr-qty">${fmtNum(it.qty)} ${it.unit} @ ${fmtMoney(it.price)}</span></div>`).join('')}
      </div>
    </div>`).join('');
}
function deleteBill(id){ if(!confirm('Delete bill? Stock will NOT be reversed.'))return; DB.delete('bills',id); renderSuppliers(); updateCounts(); toast('Bill deleted','warning'); }

/* ═══════════════════════════════════════════════════
   WORKERS
   ═══════════════════════════════════════════════════ */
let _workerFilter='all', _editWorkerId=null;
function openWorkerModal(id){
  _editWorkerId=id; const w=id?DB.find('workers',id):null;
  document.getElementById('worker-modal-ttl').textContent=w?'Edit Worker':'Add Worker';
  document.getElementById('fw-name').value=w?.name||'';
  document.getElementById('fw-phone').value=w?.phone||'';
  document.getElementById('fw-skill').value=w?.skill||'';
  buildCombo('fw-skill','fw-skill-drop',[...new Set(DB.all('workers').map(w=>w.skill).filter(Boolean))]);
  openModal('modal-worker'); setTimeout(()=>document.getElementById('fw-name')?.focus(),100);
}
function saveWorker(){
  const name=document.getElementById('fw-name').value.trim(), skill=document.getElementById('fw-skill').value.trim();
  if(!name){toast('Name required','danger');return;}
  if(!skill){toast('Skill required','danger');return;}
  const d={name,phone:document.getElementById('fw-phone').value.trim(),skill};
  if(_editWorkerId){ const ex=DB.find('workers',_editWorkerId); DB.update('workers',_editWorkerId,{...d,totalJobs:ex?.totalJobs||0,totalEarned:ex?.totalEarned||0,holdings:ex?.holdings||[]}); }
  else DB.insert('workers',{...d,totalJobs:0,totalEarned:0,holdings:[]});
  closeModal('modal-worker'); renderWorkers(); updateCounts(); toast(`"${name}" ${_editWorkerId?'updated':'added'}`);
}
function renderWorkers(){
  const workers=DB.all('workers'), search=(document.getElementById('worker-search')?.value||'').toLowerCase();
  let fl=workers.filter(w=>w.name.toLowerCase().includes(search)||(w.skill||'').toLowerCase().includes(search));
  if(_workerFilter==='holding') fl=fl.filter(w=>(w.holdings||[]).length>0);
  if(_workerFilter==='free')    fl=fl.filter(w=>!(w.holdings||[]).length);
  const tbody=document.getElementById('worker-tbody'); if(!tbody)return;
  tbody.innerHTML=fl.length?fl.map(w=>{
    const h=(w.holdings||[]).length;
    const status=h?`<span class="badge badge-amber">📦 ${h} mat${h>1?'s':''}</span>`:`<span class="badge badge-success">✓ Free</span>`;
    return `<tr>
      <td class="td-name">${w.name}</td>
      <td class="td-mono">${w.phone||'—'}</td>
      <td><span class="badge badge-gray">${w.skill||'—'}</span></td>
      <td class="td-mono">${w.totalJobs||0}</td>
      <td class="td-mono">${fmtMoney(w.totalEarned||0)}</td>
      <td>${status}</td>
      <td><div class="acts">
        <button class="act-btn" onclick="nav('worker-profile','${w.id}')">👤 Profile</button>
        <button class="act-btn" onclick="openWorkerModal('${w.id}')">✏️</button>
        <button class="act-btn danger" onclick="deleteWorker('${w.id}')">🗑</button>
      </div></td>
    </tr>`;
  }).join(''):`<tr><td colspan="7"><div class="t-empty"><span class="t-empty-ico">👷</span>${workers.length?'No results':'No workers yet'}</div></td></tr>`;
  document.getElementById('worker-foot').textContent=`${fl.length} of ${workers.length} workers`;
}
function deleteWorker(id){
  const w=DB.find('workers',id); if(!w)return;
  if((w.holdings||[]).length){toast('Cannot delete — worker is holding materials. Return them to stock first.','danger');return;}
  if(!confirm('Delete this worker?'))return;
  DB.delete('workers',id); renderWorkers(); updateCounts(); toast('Deleted','warning');
}

/* ═══════════════════════════════════════════════════
   WORKER PROFILE
   ═══════════════════════════════════════════════════ */
function renderWorkerProfile(){
  const wid=_profileWid, pageEl=document.getElementById('page-worker-profile'); if(!pageEl)return;
  if(!wid){pageEl.innerHTML='<div class="page-inner"><div class="t-empty">No worker selected</div></div>';return;}
  const worker=DB.find('workers',wid);
  if(!worker){pageEl.innerHTML='<div class="page-inner"><div class="t-empty">Worker not found</div></div>';return;}
  const bc=document.getElementById('bc-page'); if(bc)bc.textContent=`Profile — ${worker.name}`;
  const holdings=worker.holdings||[];
  const prods=DB.where('productions',p=>p.workerId===wid);
  const fin=DB.where('finished',f=>f.workerId===wid);
  const totalHoldingValue=holdings.reduce((s,h)=>{const m=DB.all('materials').find(m=>m.name===h.mat); return s+parseFloat(h.qty||0)*parseFloat(m?.unitCost||0);},0);
  const totalMatUsedValue=fin.reduce((s,f)=>s+parseFloat(f.matCostPerPiece||0),0);
  const issuances=DB.where('issuances',i=>i.workerId===wid||i.workerName===worker.name);

  pageEl.innerHTML=`<div class="page-inner">
    <div style="display:flex;align-items:center;gap:0.6rem;flex-wrap:wrap;margin-bottom:1.2rem">
      <button class="btn btn-ghost btn-sm" onclick="nav('workers')">← Workers</button>
      <button class="btn btn-primary btn-sm" onclick="openIssueModal('${wid}')">📦 Issue Materials</button>
      <button class="btn btn-success btn-sm" onclick="openProductionModal('${wid}')">✅ Record Production</button>
      <button class="btn btn-ghost btn-sm" style="background:var(--info-light);color:var(--info);border-color:#bfdbfe" onclick="openReturnStockModal('${wid}')">↩ Return to Stock</button>
    </div>

    <div class="card" style="margin-bottom:1.2rem">
      <div class="card-hdr" style="background:var(--amber-pale)">
        <div style="display:flex;align-items:center;gap:1rem">
          <div style="width:48px;height:48px;border-radius:50%;background:linear-gradient(135deg,var(--amber),var(--amber-dark));color:#fff;font-family:var(--font-display);font-size:1.4rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${worker.name.charAt(0).toUpperCase()}</div>
          <div><div style="font-weight:700;font-size:1.1rem;color:var(--text-primary)">${worker.name}</div><div style="font-size:0.78rem;color:var(--text-tertiary)">${worker.skill||'—'} · ${worker.phone||'No phone'}</div></div>
        </div>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
          <div class="stat-card" style="padding:0.6rem 0.9rem;min-width:80px"><div class="sc-lbl">Jobs</div><div class="sc-val">${worker.totalJobs||0}</div></div>
          <div class="stat-card" style="padding:0.6rem 0.9rem;min-width:80px"><div class="sc-lbl">Earned</div><div class="sc-val" style="font-size:1rem">${fmtMoney(worker.totalEarned||0)}</div></div>
          <div class="stat-card" style="padding:0.6rem 0.9rem;min-width:80px;border-color:var(--amber-light)"><div class="sc-lbl">Holding Value</div><div class="sc-val" style="font-size:1rem;color:var(--amber-dark)">${fmtMoney(totalHoldingValue)}</div></div>
          <div class="stat-card" style="padding:0.6rem 0.9rem;min-width:80px"><div class="sc-lbl">Mat. Used (Total)</div><div class="sc-val" style="font-size:1rem;color:var(--amber-dark)">${fmtMoney(totalMatUsedValue)}</div></div>
        </div>
      </div>
    </div>

    <div class="two-col">
      <!-- ── HOLDINGS CARD ── -->
      <div class="card" id="wp-holdings-card" style="border-color:${holdings.length?'var(--amber)':'var(--border)'}">
        <div class="card-hdr" style="${holdings.length?'background:var(--amber-pale)':''}">
          <span class="card-title" style="${holdings.length?'color:var(--amber-dark)':''}">📦 Currently Holding</span>
          <div style="display:flex;gap:0.4rem;align-items:center">
            ${holdings.length?`<span id="wp-holding-val" style="font-size:0.72rem;font-family:var(--font-mono);color:var(--amber-dark)">${fmtMoney(totalHoldingValue)}</span>`:''}
            ${holdings.length?`<button class="btn btn-ghost btn-sm" onclick="openReturnStockModal('${wid}')">↩ Return</button>`:''}
            <button class="btn btn-ghost btn-sm" id="wp-holding-edit-btn" onclick="toggleHoldingEdit('${wid}')">✏️ Edit</button>
          </div>
        </div>
        <div class="card-body" id="wp-holdings-body">
          ${_renderHoldingsView(holdings)}
        </div>
      </div>

      <div class="card">
        <div class="card-hdr"><span class="card-title">🪑 Finished Products</span></div>
        <div class="card-body">
          ${fin.length?fin.slice(0,8).map(f=>`<div class="dash-row" style="gap:0.5rem">
            <div>
              <div style="font-weight:600">${f.product}</div>
              <div style="font-size:0.7rem;font-family:var(--font-mono);color:var(--text-tertiary)">SN: ${f.serialNumber||'—'} · ${fmtDate(f.date)}</div>
              <div style="font-size:0.72rem;color:var(--text-tertiary)">💳 ${fmtMoney(f.totalWage||0)} wage${f.matCostPerPiece?` · 📦 ${fmtMoney(f.matCostPerPiece)} mat.`:''}</div>
            </div>
            ${f.sold?`<span class="badge badge-success" style="font-size:0.65rem;flex-shrink:0">Sold</span>`:`<button class="btn btn-primary btn-sm" onclick="openSalesModal('${f.id}')" style="flex-shrink:0">🧾 Sell</button>`}
          </div>`).join(''):'<div class="dash-empty">No products yet</div>'}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:1.2rem">
      <div class="card-hdr"><span class="card-title">📋 Production History</span></div>
      <div class="card-body" style="padding:0">
        ${prods.length?`<table class="data-table">
          <thead><tr><th>Product</th><th>Serial No.</th><th>Date</th><th>Pieces</th><th>Wage</th><th>Materials Used</th><th>Mat. Cost/pc</th><th>Overhead/pc</th></tr></thead>
          <tbody>${prods.map(p=>{
            const ohCost=(p.overheadsSnapshot||[]).reduce((s,o)=>s+parseFloat(o.amount||0),0);
            return `<tr>
              <td class="td-name">${p.product}</td>
              <td style="font-family:var(--font-mono);font-size:0.74rem">${p.serialNumber||'—'}</td>
              <td class="td-mono">${fmtDate(p.date)}</td>
              <td class="td-mono">${p.piecesCount||1}</td>
              <td class="td-mono">${fmtMoney(p.totalWage||0)}</td>
              <td style="font-size:0.74rem;color:var(--text-tertiary)">${(p.materialsUsed||[]).map(m=>`${fmtNum(m.qty)} ${m.unit} ${m.mat}`).join(', ')||'—'}</td>
              <td class="td-mono" style="color:var(--amber-dark)">${p.matCostPerPiece>0?fmtMoney(p.matCostPerPiece):'—'}</td>
              <td class="td-mono" style="color:var(--info)">${ohCost>0?fmtMoney(ohCost):'—'}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>`:'<div class="t-empty"><span class="t-empty-ico">🏭</span>No production yet</div>'}
      </div>
    </div>

    ${_renderIssuanceTimeline(issuances, worker)}

  </div>`;
}

/* ── Holdings view (read-only table) ── */
function _renderHoldingsView(holdings){
  if(!holdings.length) return '<div class="dash-empty" style="color:var(--success)">✓ Not holding any materials</div>';
  return `<table class="data-table" style="font-size:0.82rem">
    <thead><tr><th>Material</th><th>Qty</th><th>Unit</th></tr></thead>
    <tbody>${holdings.map(h=>`<tr><td class="td-name">${h.mat}</td><td class="td-mono">${fmtNum(h.qty)}</td><td class="td-mono">${h.unit}</td></tr>`).join('')}</tbody>
  </table>`;
}

/* ── Holdings edit mode — NOW BALANCES STOCK ── */
let _holdingEditMode = false;
let _holdingEditOldSnapshot = [];

function toggleHoldingEdit(wid){
  _holdingEditMode = !_holdingEditMode;
  const worker = DB.find('workers', wid);
  if(!worker) return;
  const body = document.getElementById('wp-holdings-body');
  const btn  = document.getElementById('wp-holding-edit-btn');
  if(!body) return;
  if(_holdingEditMode){
    _holdingEditOldSnapshot = JSON.parse(JSON.stringify(worker.holdings||[]));
    btn.textContent='✕ Cancel';
    btn.style.background='var(--danger-light)';
    btn.style.borderColor='var(--danger)';
    btn.style.color='var(--danger)';
    body.innerHTML = _renderHoldingsEditForm(worker.holdings||[], wid);
    _wireHoldingEditForm(wid);
  } else {
    _holdingEditOldSnapshot = [];
    btn.textContent='✏️ Edit';
    btn.style.background='';btn.style.borderColor='';btn.style.color='';
    body.innerHTML = _renderHoldingsView(worker.holdings||[]);
  }
}

function _renderHoldingsEditForm(holdings, wid){
  const rows = holdings.length ? holdings : [];
  return `
    <div class="banner banner-info" style="margin-bottom:0.7rem;font-size:0.77rem">
      <span class="banner-ico">⚖️</span>
      <div>Raw material stock will be <strong>automatically balanced</strong> based on the difference between old and new holdings when you save.</div>
    </div>
    <div id="he-rows">
      ${rows.map((h,i)=>`
        <div class="he-row" id="he-row-${i}">
          <div class="combo-wrap" style="flex:1">
            <input class="finput he-mat" id="he-mat-${i}" value="${h.mat}" placeholder="Material" autocomplete="off" style="font-size:0.82rem"/>
            <div class="combo-drop" id="he-mat-drop-${i}"></div>
          </div>
          <input class="finput he-qty" id="he-qty-${i}" type="number" min="0" step="0.01" value="${h.qty}" placeholder="0" style="width:90px;font-size:0.82rem"/>
          <div class="combo-wrap" style="width:80px">
            <input class="finput he-unit" id="he-unit-${i}" value="${h.unit}" placeholder="unit" autocomplete="off" style="font-size:0.82rem"/>
            <div class="combo-drop" id="he-unit-drop-${i}"></div>
          </div>
          <button class="row-del" onclick="heDelRow(${i})">×</button>
        </div>`).join('')}
      ${!rows.length?'<div id="he-empty-hint" style="font-size:0.78rem;color:var(--text-light);padding:0.4rem 0;text-align:center">No holdings — add a row below</div>':''}
    </div>
    <button class="add-row-btn" style="margin-top:0.5rem" onclick="heAddRow('${wid}')">+ Add Row</button>
    <div style="display:flex;gap:0.5rem;margin-top:0.6rem">
      <button class="btn btn-primary btn-sm" style="flex:1" onclick="saveHoldingEdit('${wid}')">💾 Save & Balance Stock</button>
    </div>`;
}

let _heRowCount = 0;
function _wireHoldingEditForm(wid){
  const mats = DB.all('materials').map(m=>m.name);
  document.querySelectorAll('.he-mat').forEach((inp,i)=>{
    buildCombo(inp.id, `he-mat-drop-${i}`, mats, val=>{
      inp.value = val;
      const m = DB.all('materials').find(m=>m.name===val);
      const uEl = document.getElementById(`he-unit-${i}`);
      if(m && uEl && !uEl.value) uEl.value = m.unit||'';
    });
  });
  document.querySelectorAll('.he-unit').forEach((inp,i)=>{
    buildCombo(inp.id, `he-unit-drop-${i}`, DB.savedUnits());
  });
  _heRowCount = document.querySelectorAll('.he-row').length;
}

function heAddRow(wid){
  const hint = document.getElementById('he-empty-hint');
  if(hint) hint.remove();
  const wrap = document.getElementById('he-rows');
  if(!wrap) return;
  const i = _heRowCount++;
  const div = document.createElement('div');
  div.className='he-row'; div.id=`he-row-${i}`;
  div.innerHTML=`
    <div class="combo-wrap" style="flex:1">
      <input class="finput he-mat" id="he-mat-${i}" value="" placeholder="Material" autocomplete="off" style="font-size:0.82rem"/>
      <div class="combo-drop" id="he-mat-drop-${i}"></div>
    </div>
    <input class="finput he-qty" id="he-qty-${i}" type="number" min="0" step="0.01" value="" placeholder="0" style="width:90px;font-size:0.82rem"/>
    <div class="combo-wrap" style="width:80px">
      <input class="finput he-unit" id="he-unit-${i}" value="" placeholder="unit" autocomplete="off" style="font-size:0.82rem"/>
      <div class="combo-drop" id="he-unit-drop-${i}"></div>
    </div>
    <button class="row-del" onclick="heDelRow(${i})">×</button>`;
  wrap.appendChild(div);
  const mats = DB.all('materials').map(m=>m.name);
  buildCombo(`he-mat-${i}`,`he-mat-drop-${i}`,mats,val=>{
    document.getElementById(`he-mat-${i}`).value=val;
    const m=DB.all('materials').find(m=>m.name===val);
    const uEl=document.getElementById(`he-unit-${i}`);
    if(m&&uEl&&!uEl.value) uEl.value=m.unit||'';
  });
  buildCombo(`he-unit-${i}`,`he-unit-drop-${i}`,DB.savedUnits());
  setTimeout(()=>document.getElementById(`he-mat-${i}`)?.focus(),50);
}

function heDelRow(i){
  const el=document.getElementById(`he-row-${i}`);
  if(el) el.remove();
}

function saveHoldingEdit(wid){
  const newRows=[];
  document.querySelectorAll('#he-rows .he-row').forEach(row=>{
    const id=row.id.replace('he-row-','');
    const mat=(document.getElementById(`he-mat-${id}`)?.value||'').trim();
    const qty=parseFloat(document.getElementById(`he-qty-${id}`)?.value||0);
    const unit=(document.getElementById(`he-unit-${id}`)?.value||'').trim();
    if(mat&&qty>0) newRows.push({mat,qty,unit});
  });

  const oldMap = {};
  _holdingEditOldSnapshot.forEach(h=>{ oldMap[h.mat]=(oldMap[h.mat]||0)+parseFloat(h.qty||0); });
  const newMap = {};
  newRows.forEach(h=>{ newMap[h.mat]=(newMap[h.mat]||0)+parseFloat(h.qty||0); });

  const allMats = new Set([...Object.keys(oldMap),...Object.keys(newMap)]);
  const adjustments = [];

  allMats.forEach(mat=>{
    const oldQty = oldMap[mat]||0;
    const newQty = newMap[mat]||0;
    const delta = newQty - oldQty;
    if(Math.abs(delta) < 0.0001) return;
    const stockDelta = -delta;
    DB.adjustStock(mat, stockDelta);
    adjustments.push({mat, delta, stockDelta});
  });

  DB.update('workers',wid,{holdings:newRows});
  _holdingEditMode=false;
  _holdingEditOldSnapshot=[];

  const msgs = adjustments.map(a=>{
    if(a.stockDelta>0) return `+${fmtNum(a.stockDelta)} ${a.mat} returned to stock`;
    if(a.stockDelta<0) return `-${fmtNum(Math.abs(a.stockDelta))} ${a.mat} deducted from stock`;
  }).filter(Boolean);

  toast(msgs.length ? `Holdings saved · ${msgs.join('; ')}` : 'Holdings updated (no stock change)');
  renderWorkerProfile();
  renderMaterials();
  updateCounts();
}

/* ═══════════════════════════════════════════════════
   RETURN TO STOCK — Searchable popup modal
   ═══════════════════════════════════════════════════ */
let _retStockWid = null;
let _retStockRows = [];

function openReturnStockModal(wid){
  _retStockWid = wid;
  const worker = DB.find('workers', wid);
  if(!worker){ toast('Worker not found','danger'); return; }
  const holdings = worker.holdings||[];

  document.getElementById('rs-worker-name').textContent = worker.name;
  document.getElementById('rs-search').value = '';

  _retStockRows = holdings.map(h=>({
    mat: h.mat,
    unit: h.unit,
    maxQty: parseFloat(h.qty||0),
    retQty: 0,
  }));

  _renderRetStockList('');

  const srch = document.getElementById('rs-search');
  const fresh = srch.cloneNode(true); srch.parentNode.replaceChild(fresh,srch);
  document.getElementById('rs-search').addEventListener('input', e=>_renderRetStockList(e.target.value));

  const confirmBtn = document.getElementById('rs-confirm');
  const cfresh = confirmBtn.cloneNode(true); confirmBtn.parentNode.replaceChild(cfresh,confirmBtn);
  document.getElementById('rs-confirm').addEventListener('click', saveReturnStock);

  openModal('modal-return-stock');
  setTimeout(()=>document.getElementById('rs-search')?.focus(),150);
}

function _renderRetStockList(search){
  const q = (search||'').toLowerCase();
  const wrap = document.getElementById('rs-rows-body');
  if(!wrap) return;

  const filtered = _retStockRows.filter(r=>r.mat.toLowerCase().includes(q));

  if(!filtered.length){
    wrap.innerHTML = q
      ? `<div class="t-empty" style="padding:1.5rem 0"><span class="t-empty-ico">🔍</span>No materials match "<em>${q}</em>"</div>`
      : `<div class="t-empty" style="padding:1.5rem 0"><span class="t-empty-ico">📭</span>Worker is not holding any materials</div>`;
    return;
  }

  wrap.innerHTML = filtered.map(r=>{
    const globalIdx = _retStockRows.indexOf(r);
    const pct = r.maxQty>0 ? Math.min(100,Math.round((r.retQty/r.maxQty)*100)) : 0;
    return `
      <div class="rs-row" id="rs-row-${globalIdx}">
        <div class="rs-row-info">
          <div class="rs-mat-name">${r.mat}</div>
          <div class="rs-mat-holding">Holding: <strong>${fmtNum(r.maxQty)} ${r.unit}</strong></div>
          <div class="rs-progress-bar"><div class="rs-progress-fill" id="rs-pbar-${globalIdx}" style="width:${pct}%"></div></div>
        </div>
        <div class="rs-row-input">
          <div class="rs-qty-wrap">
            <button class="rs-qty-btn" onclick="rsAdjQty(${globalIdx},-1)">−</button>
            <input class="finput rs-qty-inp" id="rs-qty-${globalIdx}" type="number" min="0" max="${r.maxQty}" step="0.01" value="${r.retQty||''}" placeholder="0"
              oninput="_onRetStockQtyChange(${globalIdx},this.value)"/>
            <button class="rs-qty-btn" onclick="rsAdjQty(${globalIdx},1)">+</button>
          </div>
          <div class="rs-unit-tag">${r.unit}</div>
          <button class="rs-all-btn" onclick="rsSetAll(${globalIdx})">All</button>
        </div>
      </div>`;
  }).join('');
}

function _onRetStockQtyChange(idx, val){
  const r = _retStockRows[idx]; if(!r)return;
  r.retQty = Math.min(r.maxQty, Math.max(0, parseFloat(val)||0));
  const pct = r.maxQty>0 ? Math.min(100,Math.round((r.retQty/r.maxQty)*100)) : 0;
  const pb = document.getElementById(`rs-pbar-${idx}`);
  if(pb) pb.style.width = pct+'%';
  _updateRetStockSummary();
}

function rsAdjQty(idx, dir){
  const r = _retStockRows[idx]; if(!r)return;
  const step = r.maxQty >= 10 ? 1 : 0.1;
  r.retQty = Math.min(r.maxQty, Math.max(0, parseFloat((r.retQty+(dir*step)).toFixed(3))));
  const inp = document.getElementById(`rs-qty-${idx}`);
  if(inp) inp.value = r.retQty||'';
  const pct = r.maxQty>0 ? Math.min(100,Math.round((r.retQty/r.maxQty)*100)) : 0;
  const pb = document.getElementById(`rs-pbar-${idx}`);
  if(pb) pb.style.width = pct+'%';
  _updateRetStockSummary();
}

function rsSetAll(idx){
  const r = _retStockRows[idx]; if(!r)return;
  r.retQty = r.maxQty;
  const inp = document.getElementById(`rs-qty-${idx}`);
  if(inp) inp.value = r.retQty;
  const pb = document.getElementById(`rs-pbar-${idx}`);
  if(pb) pb.style.width = '100%';
  _updateRetStockSummary();
}

function _updateRetStockSummary(){
  const toReturn = _retStockRows.filter(r=>r.retQty>0);
  const sumEl = document.getElementById('rs-summary');
  if(!sumEl)return;
  if(!toReturn.length){
    sumEl.innerHTML=`<span style="color:var(--text-light);font-size:0.78rem">Select quantities to return</span>`;
    return;
  }
  sumEl.innerHTML=`<strong style="font-size:0.78rem;color:var(--text-primary)">Returning:</strong> `+
    toReturn.map(r=>`<span class="badge badge-amber" style="font-size:0.7rem">${fmtNum(r.retQty)} ${r.unit} ${r.mat}</span>`).join(' ');
}

function saveReturnStock(){
  const worker = DB.find('workers',_retStockWid); if(!worker)return;
  const toReturn = _retStockRows.filter(r=>r.retQty>0);
  if(!toReturn.length){ toast('Enter at least one quantity to return','warning'); return; }

  const h = [...(worker.holdings||[])];
  let n = 0;
  toReturn.forEach(r=>{
    const holding = h.find(x=>x.mat===r.mat);
    if(holding){
      const actualReturn = Math.min(parseFloat(holding.qty||0), r.retQty);
      holding.qty = Math.max(0, parseFloat(holding.qty||0)-actualReturn);
      DB.adjustStock(r.mat, actualReturn);
      n++;
    }
  });

  const remaining = h.filter(x=>parseFloat(x.qty||0)>0);
  DB.update('workers',_retStockWid,{holdings:remaining});

  closeModal('modal-return-stock');
  renderWorkerProfile();
  renderMaterials();
  updateCounts();
  toast(`${n} material(s) returned to stock — stock updated`);
}

/* ═══════════════════════════════════════════════════
   EDIT ISSUANCE — Timeline card edit
   ═══════════════════════════════════════════════════ */
let _editIssId = null;
let _editIssRows = [];

function openEditIssuanceModal(issId){
  _editIssId = issId;
  const iss = DB.find('issuances', issId);
  if(!iss){ toast('Issuance not found','danger'); return; }

  document.getElementById('ei-worker-name').textContent = iss.workerName||'Unknown';
  document.getElementById('ei-date').value = iss.date||todayStr();
  document.getElementById('ei-notes').value = iss.notes||'';

  _editIssRows = (iss.materials||[]).map(m=>({...m}));
  _renderEditIssRows();

  const addBtn = document.getElementById('ei-add-row');
  const afresh = addBtn.cloneNode(true); addBtn.parentNode.replaceChild(afresh,addBtn);
  document.getElementById('ei-add-row').addEventListener('click',()=>{
    _editIssRows.push({mat:'',qty:0,unit:''});
    _renderEditIssRows();
  });

  const saveBtn = document.getElementById('ei-save');
  const sfresh = saveBtn.cloneNode(true); saveBtn.parentNode.replaceChild(sfresh,saveBtn);
  document.getElementById('ei-save').addEventListener('click',saveEditIssuance);

  openModal('modal-edit-issuance');
}

function _renderEditIssRows(){
  const wrap = document.getElementById('ei-mat-rows'); if(!wrap)return;
  if(!_editIssRows.length){
    wrap.innerHTML=`<div style="text-align:center;padding:.7rem;border:1px dashed var(--border);border-radius:8px;font-size:0.78rem;color:var(--text-light)">No materials — click "+ Add Row"</div>`;
    return;
  }
  const mats = DB.all('materials');
  wrap.innerHTML=_editIssRows.map((r,i)=>`
    <div class="mat-row" id="ei-row-${i}">
      <div class="combo-wrap"><input class="finput" id="ei-mat-${i}" value="${r.mat||''}" placeholder="Material" autocomplete="off"/><div class="combo-drop" id="ei-mat-drop-${i}"></div></div>
      <input class="finput" id="ei-qty-${i}" type="number" min="0" step="0.01" value="${r.qty||''}" placeholder="0"/>
      <div class="combo-wrap"><input class="finput" id="ei-unit-${i}" value="${r.unit||''}" placeholder="unit" autocomplete="off"/><div class="combo-drop" id="ei-unit-drop-${i}"></div></div>
      <button class="row-del" onclick="eiDelRow(${i})">×</button>
    </div>`).join('');

  _editIssRows.forEach((_,i)=>{
    document.getElementById(`ei-mat-${i}`)?.addEventListener('input',e=>_editIssRows[i].mat=e.target.value);
    document.getElementById(`ei-qty-${i}`)?.addEventListener('input',e=>_editIssRows[i].qty=parseFloat(e.target.value)||0);
    document.getElementById(`ei-unit-${i}`)?.addEventListener('input',e=>_editIssRows[i].unit=e.target.value);
    buildCombo(`ei-mat-${i}`,`ei-mat-drop-${i}`,mats.map(m=>m.name),val=>{
      _editIssRows[i].mat=val;
      const m=mats.find(m=>m.name===val);
      if(m){ _editIssRows[i].unit=m.unit||''; const u=document.getElementById(`ei-unit-${i}`); if(u)u.value=m.unit||''; }
    });
    buildCombo(`ei-unit-${i}`,`ei-unit-drop-${i}`,DB.savedUnits(),val=>{ _editIssRows[i].unit=val; });
  });
}

function eiDelRow(i){ _editIssRows.splice(i,1); _renderEditIssRows(); }

function saveEditIssuance(){
  const iss = DB.find('issuances', _editIssId); if(!iss){ toast('Not found','danger'); return; }
  const newDate = document.getElementById('ei-date').value;
  const newNotes = document.getElementById('ei-notes').value.trim();
  const newValid = _editIssRows.filter(r=>r.mat&&parseFloat(r.qty)>0);
  if(!newValid.length){ toast('Add at least one material row','danger'); return; }

  const oldRows = iss.materials||[];

  const oldMap={}, newMap={};
  oldRows.forEach(r=>{ oldMap[r.mat]=(oldMap[r.mat]||0)+parseFloat(r.qty||0); });
  newValid.forEach(r=>{ newMap[r.mat]=(newMap[r.mat]||0)+parseFloat(r.qty||0); });

  const allMats = new Set([...Object.keys(oldMap),...Object.keys(newMap)]);

  const worker = iss.workerId ? DB.find('workers', iss.workerId) : null;
  const holdings = worker ? [...(worker.holdings||[])] : null;

  allMats.forEach(mat=>{
    const oldQty = oldMap[mat]||0;
    const newQty = newMap[mat]||0;
    const delta = newQty - oldQty;
    if(Math.abs(delta)<0.0001) return;

    DB.adjustStock(mat, -delta);

    if(holdings){
      const h = holdings.find(x=>x.mat===mat);
      if(delta>0){
        if(h) h.qty = parseFloat(h.qty||0)+delta;
        else {
          const unit = newValid.find(r=>r.mat===mat)?.unit||oldRows.find(r=>r.mat===mat)?.unit||'';
          holdings.push({mat, qty:delta, unit});
        }
      } else {
        if(h){ h.qty = Math.max(0, parseFloat(h.qty||0)+delta); }
      }
    }
  });

  if(worker && holdings){
    const remaining = holdings.filter(h=>parseFloat(h.qty||0)>0);
    DB.update('workers', worker.id, {holdings:remaining});
  }

  DB.update('issuances', _editIssId, {
    date: newDate,
    notes: newNotes,
    materials: newValid.map(r=>({mat:r.mat,qty:parseFloat(r.qty||0),unit:r.unit}))
  });

  closeModal('modal-edit-issuance');
  renderWorkerProfile();
  renderMaterials();
  updateCounts();
  toast('Issuance updated — stock & holdings balanced');
}

/* ── Redesigned Issuance Timeline with Edit button ── */
function _renderIssuanceTimeline(issuances, worker){
  if(!issuances.length) return `
    <div class="card" style="margin-top:1.2rem">
      <div class="card-hdr">
        <span class="card-title">📅 Material Issuance Timeline</span>
      </div>
      <div class="card-body">
        <div class="t-empty" style="padding:2rem 0"><span class="t-empty-ico">📭</span>No materials have been issued yet</div>
      </div>
    </div>`;

  const sorted=[...issuances].sort((a,b)=>new Date(b.date+'T00:00:00')-new Date(a.date+'T00:00:00'));
  const totalItems=issuances.reduce((s,i)=>s+(i.materials||[]).length,0);
  const totalQtyByMat={};
  issuances.forEach(iss=>(iss.materials||[]).forEach(m=>{totalQtyByMat[m.mat]=(totalQtyByMat[m.mat]||0)+parseFloat(m.qty||0);}));

  const summaryChips=Object.entries(totalQtyByMat).slice(0,6).map(([mat,qty])=>`
    <div class="tl2-summary-chip">
      <span class="tl2-sc-mat">${mat}</span>
      <span class="tl2-sc-qty">${fmtNum(qty)}</span>
    </div>`).join('');

  const cards=sorted.map((iss,idx)=>{
    const isFirst=idx===0;
    return `
      <div class="tl2-card ${isFirst?'tl2-card-latest':''}">
        <div class="tl2-card-top">
          <div class="tl2-card-date">
            ${isFirst?'<span class="tl2-latest-badge">Latest</span>':''}
            <span class="tl2-date-text">${fmtDate(iss.date)}</span>
          </div>
          <div style="display:flex;align-items:center;gap:0.35rem">
            <span class="tl2-item-count">${(iss.materials||[]).length} item${(iss.materials||[]).length>1?'s':''}</span>
            <button class="tl2-edit-btn" onclick="openEditIssuanceModal('${iss.id}')" title="Edit this issuance">✏️</button>
          </div>
        </div>
        ${iss.notes?`<div class="tl2-note">💬 ${iss.notes}</div>`:''}
        <div class="tl2-mats">
          ${(iss.materials||[]).map(m=>`
            <div class="tl2-mat-row">
              <div class="tl2-mat-icon">📦</div>
              <div class="tl2-mat-info">
                <span class="tl2-mat-name">${m.mat}</span>
                <span class="tl2-mat-unit">${m.unit}</span>
              </div>
              <span class="tl2-mat-qty">${fmtNum(m.qty)}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }).join('');

  return `
    <div class="card" style="margin-top:1.2rem;overflow:visible">
      <div class="card-hdr" style="background:linear-gradient(135deg,var(--sidebar-bg),#2e3650);border-radius:11px 11px 0 0">
        <div>
          <span class="card-title" style="color:#fff">📅 Material Issuance Timeline</span>
          <div style="font-size:0.68rem;color:rgba(255,255,255,0.4);margin-top:0.15rem;font-family:var(--font-mono)">${issuances.length} issuance${issuances.length>1?'s':''} · ${totalItems} line${totalItems>1?'s':''} total</div>
        </div>
        <button class="btn btn-sm" style="background:rgba(255,255,255,0.1);color:#fff;border:1px solid rgba(255,255,255,0.15)" onclick="openIssueModal('${worker.id}')">+ Issue More</button>
      </div>

      ${Object.keys(totalQtyByMat).length?`
      <div style="padding:0.8rem 1.1rem;background:var(--amber-pale);border-bottom:1px solid var(--border-light)">
        <div style="font-size:0.62rem;font-weight:700;text-transform:uppercase;letter-spacing:0.8px;color:var(--amber-dark);margin-bottom:0.5rem">All-time totals issued</div>
        <div class="tl2-summary-chips">${summaryChips}${Object.keys(totalQtyByMat).length>6?`<div class="tl2-summary-chip" style="opacity:0.6">+${Object.keys(totalQtyByMat).length-6} more</div>`:''}</div>
      </div>`:''}

      <div class="tl2-scroll-wrap">
        <div class="tl2-cards-track">${cards}</div>
      </div>
    </div>`;
}

/* ═══════════════════════════════════════════════════
   ISSUE MATERIALS
   ═══════════════════════════════════════════════════ */
let _issueRows=[], _issueWorkerId=null;
function openIssueModal(preWid=null){
  _issueRows=[]; _issueWorkerId=preWid||null;
  document.getElementById('fi-date').value=todayStr();
  document.getElementById('fi-notes').value='';
  document.getElementById('fi-worker-search').value='';
  document.getElementById('fi-worker-id').value='';
  document.getElementById('fi-worker-holdings').innerHTML='';
  renderIssueRows();
  if(preWid){ const w=DB.find('workers',preWid); if(w){ document.getElementById('fi-worker-search').value=w.name; document.getElementById('fi-worker-id').value=w.id; _renderHoldingsBanner(w,'fi-worker-holdings'); } }
  buildCombo('fi-worker-search','fi-worker-drop',DB.all('workers').map(w=>w.name),val=>{
    const w=DB.all('workers').find(w=>w.name===val); if(!w)return;
    document.getElementById('fi-worker-id').value=w.id; _issueWorkerId=w.id;
    _renderHoldingsBanner(w,'fi-worker-holdings');
  });
  openModal('modal-issue');
}
function _renderHoldingsBanner(worker,containerId){
  const el=document.getElementById(containerId); if(!el)return;
  const h=worker.holdings||[];
  el.innerHTML=h.length?`<div class="banner banner-warning" style="margin-bottom:0.5rem"><span class="banner-ico">📦</span><div><strong>Currently holding:</strong> ${h.map(h=>`${fmtNum(h.qty)} ${h.unit} ${h.mat}`).join(' · ')}</div></div>`:'';
}
function renderIssueRows(){
  const mats=DB.all('materials').filter(m=>parseFloat(m.qty||0)>0);
  const wrap=document.getElementById('fi-mat-rows'), warnEl=document.getElementById('fi-stock-warn'); if(!wrap)return;
  if(!_issueRows.length){ wrap.innerHTML=`<div style="text-align:center;padding:.7rem;border:1px dashed var(--border);border-radius:8px;font-size:0.78rem;color:var(--text-light)">Click "+ Add Material" to issue from stock</div>`; if(warnEl)warnEl.innerHTML=''; return; }
  let warns=[];
  wrap.innerHTML=_issueRows.map((r,i)=>{
    const m=DB.all('materials').find(m=>m.name===r.mat);
    const avail=parseFloat(m?.qty||0);
    const ok=!r.mat||(avail>0&&avail>=parseFloat(r.qty||0));
    if(r.mat&&!ok) warns.push(`${r.mat}: requested ${r.qty||0}, available ${fmtNum(avail)} ${m?.unit||''}`);
    const border=!ok&&r.mat?'border-color:var(--danger)':'';
    return `<div class="mat-row">
      <div class="combo-wrap"><input class="finput" id="fi-mat-${i}" value="${r.mat||''}" placeholder="Material name" autocomplete="off" style="${border}"/><div class="combo-drop" id="fi-mat-drop-${i}"></div></div>
      <input class="finput" id="fi-qty-${i}" type="number" min="0.01" step="0.01" value="${r.qty||''}" placeholder="0" style="${border}"/>
      <input class="finput" id="fi-unit-${i}" value="${r.unit||''}" placeholder="unit" readonly/>
      <button class="row-del" onclick="issueDelRow(${i})">×</button>
    </div>`;
  }).join('');
  _issueRows.forEach((_,i)=>{
    document.getElementById(`fi-qty-${i}`)?.addEventListener('input',e=>{_issueRows[i].qty=parseFloat(e.target.value)||0;renderIssueRows();});
    document.getElementById(`fi-mat-${i}`)?.addEventListener('input',e=>_issueRows[i].mat=e.target.value);
    buildCombo(`fi-mat-${i}`,`fi-mat-drop-${i}`,mats.map(m=>m.name),val=>{
      _issueRows[i].mat=val;
      const m=mats.find(m=>m.name===val);
      if(m){ _issueRows[i].unit=m.unit||''; const u=document.getElementById(`fi-unit-${i}`); if(u)u.value=m.unit||''; }
      renderIssueRows();
    });
  });
  if(warnEl)warnEl.innerHTML=warns.length?`<div class="banner banner-danger"><span class="banner-ico">⚠️</span><div><strong>Stock issues:</strong><br>${warns.join('<br>')}</div></div>`:'';
}
function issueDelRow(i){_issueRows.splice(i,1);renderIssueRows();}
function saveIssuance(){
  const workerId=document.getElementById('fi-worker-id').value, workerTxt=document.getElementById('fi-worker-search').value.trim(), date=document.getElementById('fi-date').value;
  if(!workerId&&!workerTxt){toast('Select a worker','danger');return;}
  if(!date){toast('Select a date','danger');return;}
  const valid=_issueRows.filter(r=>r.mat&&parseFloat(r.qty)>0);
  if(!valid.length){toast('Add at least one material','danger');return;}
  const errors=valid.filter(r=>{ const m=DB.all('materials').find(m=>m.name===r.mat); return !m||parseFloat(m.qty||0)<parseFloat(r.qty||0)||parseFloat(m.qty||0)<=0; });
  if(errors.length){toast('Insufficient stock: '+errors.map(r=>r.mat).join(', '),'danger');return;}
  const worker=workerId?DB.find('workers',workerId):null, wName=worker?.name||workerTxt;
  valid.forEach(r=>DB.adjustStock(r.mat,-r.qty));
  if(worker){
    const h=[...(worker.holdings||[])];
    valid.forEach(r=>{ const ex=h.find(x=>x.mat===r.mat&&x.unit===r.unit); if(ex)ex.qty=parseFloat(ex.qty)+parseFloat(r.qty); else h.push({mat:r.mat,qty:parseFloat(r.qty),unit:r.unit}); });
    DB.update('workers',worker.id,{holdings:h});
  }
  DB.insert('issuances',{workerId:workerId||null,workerName:wName,date,materials:valid.map(r=>({...r})),notes:document.getElementById('fi-notes').value.trim()});
  closeModal('modal-issue'); renderMaterials(); updateCounts();
  if(document.getElementById('page-worker-profile')?.classList.contains('active')) renderWorkerProfile();
  toast(`Materials issued to ${wName} — stock updated`);
}

/* ═══════════════════════════════════════════════════
   DIRECT RETURN (legacy)
   ═══════════════════════════════════════════════════ */
let _retWid=null;
function openDirectReturn(wid){
  _retWid=wid; const worker=DB.find('workers',wid); if(!worker)return;
  document.getElementById('dr-sub').textContent=`Worker: ${worker.name}`;
  const rows=document.getElementById('dr-rows');
  rows.innerHTML=(worker.holdings||[]).length
    ?(worker.holdings||[]).map((h,i)=>`<div style="display:grid;grid-template-columns:1fr 90px 90px;gap:0.4rem;align-items:center;margin-top:0.5rem">
        <span class="td-name">${h.mat}</span>
        <span style="text-align:right;font-family:var(--font-mono);font-size:0.74rem;color:var(--text-tertiary)">${fmtNum(h.qty)} ${h.unit}</span>
        <input class="finput" id="dr-qty-${i}" type="number" min="0" max="${h.qty}" step="0.01" value="${h.qty}"/>
      </div>`).join('')
    :'<div style="color:var(--text-tertiary);padding:0.5rem 0">No holdings</div>';
  const btn=document.getElementById('dr-confirm'), cl=btn.cloneNode(true); btn.parentNode.replaceChild(cl,btn);
  document.getElementById('dr-confirm').addEventListener('click',saveDirectReturn);
  openModal('modal-direct-return');
}
function saveDirectReturn(){
  const worker=DB.find('workers',_retWid); if(!worker)return;
  const h=[...(worker.holdings||[])], remaining=[]; let n=0;
  h.forEach((hd,i)=>{ const rq=Math.min(parseFloat(document.getElementById(`dr-qty-${i}`)?.value)||0,parseFloat(hd.qty)); const lq=Math.max(0,parseFloat(hd.qty)-rq); if(rq>0){DB.adjustStock(hd.mat,rq);n++;} if(lq>0)remaining.push({...hd,qty:lq}); });
  if(!n){toast('No quantities entered','warning');return;}
  DB.update('workers',_retWid,{holdings:remaining});
  closeModal('modal-direct-return'); renderWorkerProfile(); renderMaterials(); updateCounts();
  toast(`${n} material(s) returned to stock`);
}

/* ═══════════════════════════════════════════════════
   PRODUCT TEMPLATES
   ═══════════════════════════════════════════════════ */
let _tplMatRows=[], _tplOverheadRows=[], _editTplId=null;
function openTemplateModal(id){
  _editTplId=id; _tplMatRows=[]; _tplOverheadRows=[];
  const t=id?DB.find('templates',id):null;
  document.getElementById('tpl-modal-ttl').textContent=t?'Edit Template':'New Product Template';
  document.getElementById('ftpl-name').value=t?.name||'';
  document.getElementById('ftpl-desc').value=t?.desc||'';
  _tplMatRows=(t?.materials||[]).map(r=>({...r}));
  _tplOverheadRows=(t?.overheads||[]).map(r=>({...r}));
  renderTplMatRows(); renderTplOverheadRows();
  openModal('modal-template'); setTimeout(()=>document.getElementById('ftpl-name')?.focus(),100);
}
function renderTplMatRows(){
  const mats=DB.all('materials'), wrap=document.getElementById('tpl-mat-rows'); if(!wrap)return;
  if(!_tplMatRows.length){ wrap.innerHTML=`<div style="text-align:center;padding:.7rem;border:1px dashed var(--border);border-radius:8px;font-size:0.78rem;color:var(--text-light)">Click "+ Add Material" to define what's needed</div>`; return; }
  wrap.innerHTML=_tplMatRows.map((r,i)=>`<div class="mat-row">
    <div class="combo-wrap"><input class="finput" id="tpl-mat-${i}" value="${r.mat||''}" placeholder="Material" autocomplete="off"/><div class="combo-drop" id="tpl-mat-drop-${i}"></div></div>
    <input class="finput" id="tpl-qty-${i}" type="number" min="0" step="0.01" value="${r.qty||''}" placeholder="0"/>
    <div class="combo-wrap"><input class="finput" id="tpl-unit-${i}" value="${r.unit||''}" placeholder="unit" autocomplete="off"/><div class="combo-drop" id="tpl-unit-drop-${i}"></div></div>
    <button class="row-del" onclick="tplDelRow(${i})">×</button>
  </div>`).join('');
  _tplMatRows.forEach((_,i)=>{
    document.getElementById(`tpl-qty-${i}`)?.addEventListener('input',e=>{_tplMatRows[i].qty=parseFloat(e.target.value)||0;_updateTplCostPreview();});
    document.getElementById(`tpl-mat-${i}`)?.addEventListener('input',e=>_tplMatRows[i].mat=e.target.value);
    document.getElementById(`tpl-unit-${i}`)?.addEventListener('input',e=>{_tplMatRows[i].unit=e.target.value;DB.saveUnit(e.target.value);});
    buildCombo(`tpl-unit-${i}`,`tpl-unit-drop-${i}`,DB.savedUnits(),val=>{_tplMatRows[i].unit=val;DB.saveUnit(val);});
    buildCombo(`tpl-mat-${i}`,`tpl-mat-drop-${i}`,mats.map(m=>m.name),val=>{
      _tplMatRows[i].mat=val;
      const m=mats.find(m=>m.name===val);
      if(m){_tplMatRows[i].unit=m.unit||''; const u=document.getElementById(`tpl-unit-${i}`); if(u)u.value=m.unit||'';}
      _updateTplCostPreview();
    });
  });
  _updateTplCostPreview();
}
function tplDelRow(i){_tplMatRows.splice(i,1);renderTplMatRows();}

function renderTplOverheadRows(){
  const wrap=document.getElementById('tpl-overhead-rows'); if(!wrap) return;
  if(!_tplOverheadRows.length){
    wrap.innerHTML=`<div style="text-align:center;padding:.6rem;border:1px dashed var(--border);border-radius:8px;font-size:0.78rem;color:var(--text-light)">Click "+ Add Overhead Cost"</div>`;
    document.getElementById('tpl-total-cost-preview').innerHTML=''; return;
  }
  wrap.innerHTML=_tplOverheadRows.map((r,i)=>`<div style="display:grid;grid-template-columns:1fr 120px 28px;gap:0.4rem;align-items:center;margin-bottom:0.35rem">
    <input class="finput" id="toh-label-${i}" value="${r.label||''}" placeholder="e.g. Electricity share, Rent share…"/>
    <input class="finput" id="toh-amt-${i}" type="number" min="0" step="0.01" value="${r.amount||''}" placeholder="0.00"/>
    <button class="row-del" onclick="tplDelOverhead(${i})">×</button>
  </div>`).join('');
  _tplOverheadRows.forEach((_,i)=>{
    document.getElementById(`toh-label-${i}`)?.addEventListener('input',e=>_tplOverheadRows[i].label=e.target.value);
    document.getElementById(`toh-amt-${i}`)?.addEventListener('input',e=>{_tplOverheadRows[i].amount=parseFloat(e.target.value)||0; _updateTplCostPreview();});
  });
  _updateTplCostPreview();
}
function _updateTplCostPreview(){
  const mats=DB.all('materials');
  const matCost=_tplMatRows.reduce((s,r)=>{const m=mats.find(m=>m.name===r.mat);return s+parseFloat(r.qty||0)*parseFloat(m?.unitCost||0);},0);
  const ohCost=_tplOverheadRows.reduce((s,r)=>s+parseFloat(r.amount||0),0);
  const total=matCost+ohCost;
  const el=document.getElementById('tpl-total-cost-preview'); if(!el) return;
  if(total>0) el.innerHTML=`<div style="display:flex;gap:1rem;flex-wrap:wrap;padding:0.5rem 0.7rem;background:var(--amber-pale);border-radius:7px;font-size:0.78rem">
    ${matCost>0?`<span>📦 Materials: <strong style="color:var(--amber-dark)">${fmtMoney(matCost)}</strong></span>`:''}
    ${ohCost>0?`<span>💡 Overhead: <strong style="color:var(--amber-dark)">${fmtMoney(ohCost)}</strong></span>`:''}
    <span>✅ <strong style="color:var(--text-primary)">Total per piece: ${fmtMoney(total)}</strong></span>
  </div>`;
  else el.innerHTML='';
}
function tplDelOverhead(i){_tplOverheadRows.splice(i,1);renderTplOverheadRows();}
function saveTemplate(){
  const name=document.getElementById('ftpl-name').value.trim();
  if(!name){toast('Template name required','danger');return;}
  const mats=_tplMatRows.filter(r=>r.mat);
  mats.forEach(r=>{ if(r.unit) DB.saveUnit(r.unit); });
  const overheads=_tplOverheadRows.filter(r=>r.label&&parseFloat(r.amount)>0);
  const d={name,desc:document.getElementById('ftpl-desc').value.trim(),materials:mats,overheads};
  if(_editTplId) DB.update('templates',_editTplId,d); else DB.insert('templates',d);
  closeModal('modal-template'); renderTemplates(); updateCounts(); toast(`"${name}" ${_editTplId?'updated':'created'}`);
}
function renderTemplates(){
  const tpls=DB.all('templates'), search=(document.getElementById('tpl-search')?.value||'').toLowerCase();
  const filtered=tpls.filter(t=>t.name.toLowerCase().includes(search));
  const grid=document.getElementById('tpl-grid'); if(!grid)return;
  if(!filtered.length){grid.innerHTML=`<div class="table-card"><div class="t-empty"><span class="t-empty-ico">🗂️</span>${tpls.length?'No results':'No templates yet — create one to pre-fill production entries'}</div></div>`;return;}
  const mats=DB.all('materials');
  grid.innerHTML=`<div class="template-grid">${filtered.map(t=>{
    const matCost=(t.materials||[]).reduce((s,r)=>{const m=mats.find(m=>m.name===r.mat);return s+parseFloat(r.qty||0)*parseFloat(m?.unitCost||0);},0);
    const ohCost=(t.overheads||[]).reduce((s,r)=>s+parseFloat(r.amount||0),0);
    const totalCost=matCost+ohCost;
    return `<div class="template-card">
      <div class="template-card-hdr">
        <div>
          <div class="template-name">${t.name}</div>
          ${t.desc?`<div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:0.1rem">${t.desc}</div>`:''}
        </div>
        <div class="acts">
          <button class="act-btn" onclick="openTemplateModal('${t.id}')">✏️</button>
          <button class="act-btn danger" onclick="deleteTemplate('${t.id}')">🗑</button>
        </div>
      </div>
      <div class="template-body">
        <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-tertiary);margin-bottom:0.4rem">Materials Required</div>
        ${(t.materials||[]).length?(t.materials||[]).map(m=>`<div class="iss-mat-row"><span class="imr-name">${m.mat}</span><span class="imr-qty">${fmtNum(m.qty)} ${m.unit}</span></div>`).join(''):'<div style="font-size:0.78rem;color:var(--text-light)">None defined</div>'}
        ${(t.overheads||[]).length?`
          <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-tertiary);margin:0.6rem 0 0.3rem">Overhead Costs</div>
          ${t.overheads.map(oh=>`<div class="iss-mat-row"><span class="imr-name">${oh.label}</span><span class="imr-qty">${fmtMoney(oh.amount)}</span></div>`).join('')}`:''}
        ${totalCost>0?`<div style="display:flex;justify-content:space-between;padding:0.45rem 0;border-top:1px solid var(--border-light);margin-top:0.4rem;font-size:0.8rem"><span style="font-weight:700;color:var(--text-primary)">Total cost / piece</span><strong style="font-family:var(--font-mono);color:var(--amber-dark)">${fmtMoney(totalCost)}</strong></div>`:''}
      </div>
    </div>`;
  }).join('')}</div>`;
}
function deleteTemplate(id){ if(!confirm('Delete this template?'))return; DB.delete('templates',id); renderTemplates(); updateCounts(); toast('Deleted','warning'); }

/* ═══════════════════════════════════════════════════
   PRODUCTION ENTRY
   ═══════════════════════════════════════════════════ */
let _prodMatRows=[], _prodPreWid=null, _prodOverheadsSnapshot=[];
function openProductionModal(preWid=null){
  _prodMatRows=[]; _prodPreWid=preWid||null; _prodOverheadsSnapshot=[];
  ['fp-product','fp-notes'].forEach(id=>{ const el=document.getElementById(id); if(el)el.value=''; });
  document.getElementById('fp-date').value=todayStr();
  document.getElementById('fp-pieces').value=1;
  document.getElementById('fp-wage-per').value='';
  document.getElementById('fp-wage-pcs').value=1;
  document.getElementById('fp-wage-total').value='';
  document.getElementById('fp-worker-search').value='';
  document.getElementById('fp-worker-id').value='';
  document.getElementById('fp-template-search').value='';
  document.getElementById('fp-holdings-hint').textContent='Select a worker to see their materials.';
  document.getElementById('fp-holdings-list').innerHTML='';
  document.getElementById('fp-mat-cost').innerHTML='';
  document.getElementById('fp-overhead-preview').innerHTML='';
  renderSerialRows(1);
  renderProdMatRows();

  if(preWid){ const w=DB.find('workers',preWid); if(w){ document.getElementById('fp-worker-search').value=w.name; document.getElementById('fp-worker-id').value=w.id; _loadWorkerForProd(w); } }

  buildCombo('fp-worker-search','fp-worker-drop',DB.all('workers').map(w=>w.name),val=>{
    const w=DB.all('workers').find(w=>w.name===val); if(!w)return;
    document.getElementById('fp-worker-id').value=w.id; _loadWorkerForProd(w);
  });
  buildCombo('fp-template-search','fp-template-drop',DB.all('templates').map(t=>t.name),val=>{
    const t=DB.all('templates').find(t=>t.name===val); if(!t)return;
    _applyTemplateToProd(t);
  });

  const piecesEl=document.getElementById('fp-pieces');
  const pClone=piecesEl.cloneNode(true); piecesEl.parentNode.replaceChild(pClone,piecesEl);
  document.getElementById('fp-pieces').addEventListener('input',e=>{
    const n=Math.max(1,parseInt(e.target.value)||1);
    document.getElementById('fp-wage-pcs').value=n;
    renderSerialRows(n); calcWage();
  });

  const calcWage=()=>{ const per=parseFloat(document.getElementById('fp-wage-per').value)||0, pcs=parseFloat(document.getElementById('fp-wage-pcs').value)||1; document.getElementById('fp-wage-total').value=(per*pcs).toFixed(0); };
  const wEl=document.getElementById('fp-wage-per'), wCl=wEl.cloneNode(true); wEl.parentNode.replaceChild(wCl,wEl);
  document.getElementById('fp-wage-per').addEventListener('input',calcWage);

  openModal('modal-production'); setTimeout(()=>document.getElementById('fp-product')?.focus(),100);
}

function renderSerialRows(n){
  const wrap=document.getElementById('fp-serial-rows'); if(!wrap)return;
  const existing=[...wrap.querySelectorAll('.fp-sn-input')].map(el=>el.value);
  wrap.innerHTML=Array.from({length:n},(_,i)=>{
    const prev=existing[i]||''; const statusId=`fp-sn-st-${i}`;
    return `<div style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem">
      <span style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-tertiary);min-width:52px">Piece ${i+1}</span>
      <input class="finput fp-sn-input" data-idx="${i}" type="text" value="${prev}" placeholder="e.g. VI-CH-00${i+1}" style="flex:1"/>
      <span id="${statusId}" style="font-size:0.7rem;min-width:70px"></span>
    </div>`;
  }).join('');
  wrap.querySelectorAll('.fp-sn-input').forEach(inp=>{
    inp.addEventListener('input',()=>{
      const v=inp.value.trim(), st=document.getElementById(`fp-sn-st-${inp.dataset.idx}`); if(!st)return;
      if(!v){st.innerHTML='';return;}
      const allVals=[...wrap.querySelectorAll('.fp-sn-input')].map(x=>x.value.trim()).filter(x=>x);
      const dupeInForm=allVals.filter(x=>x===v).length>1;
      if(dupeInForm) st.innerHTML=`<span style="color:var(--danger)">✕ Duplicate</span>`;
      else if(!DB.isSerialUnique(v)) st.innerHTML=`<span style="color:var(--danger)">✕ Used</span>`;
      else st.innerHTML=`<span style="color:var(--success)">✓</span>`;
    });
  });
}
function _loadWorkerForProd(worker){
  const holdings=worker.holdings||[];
  const hint=document.getElementById('fp-holdings-hint'), list=document.getElementById('fp-holdings-list');
  if(!holdings.length){
    if(hint)hint.textContent=`${worker.name} has no materials. Issue materials to them first.`;
    if(list)list.innerHTML=`<div class="banner banner-warning"><span class="banner-ico">⚠️</span><div>No materials with this worker. Go to their profile and issue materials first.</div></div>`;
    _prodMatRows=[]; renderProdMatRows(); return;
  }
  if(hint)hint.textContent=`${worker.name} is holding ${holdings.length} material(s). Enter qty used from each:`;
  if(list)list.innerHTML=`<div class="banner" style="background:var(--amber-pale);border-left:3px solid var(--amber);padding:0.5rem 0.75rem;border-radius:6px;margin-bottom:0.5rem;font-size:0.78rem">
    📦 <strong>Holding:</strong> ${holdings.map(h=>`${fmtNum(h.qty)} ${h.unit} ${h.mat}`).join(' · ')}
  </div>`;
  _prodMatRows=holdings.map(h=>({mat:h.mat,maxQty:parseFloat(h.qty),qty:parseFloat(h.qty),unit:h.unit}));
  renderProdMatRows();
}
function _applyTemplateToProd(template){
  const wid=document.getElementById('fp-worker-id').value;
  const worker=wid?DB.find('workers',wid):null;
  if(template.materials&&template.materials.length){
    _prodMatRows=(template.materials||[]).map(tm=>{
      const holding=worker?.holdings?.find(h=>h.mat===tm.mat);
      return {mat:tm.mat,qty:tm.qty,unit:tm.unit||holding?.unit||'',maxQty:parseFloat(holding?.qty||0)};
    });
    renderProdMatRows();
  }
  _prodOverheadsSnapshot=(template.overheads||[]).map(o=>({label:o.label,amount:parseFloat(o.amount||0)}));
  _renderOverheadPreview();
}
function _renderOverheadPreview(){
  const el=document.getElementById('fp-overhead-preview'); if(!el)return;
  if(!_prodOverheadsSnapshot.length){el.innerHTML='';return;}
  const total=_prodOverheadsSnapshot.reduce((s,o)=>s+parseFloat(o.amount||0),0);
  el.innerHTML=`<div style="background:var(--info-light);border-left:3px solid var(--info);border-radius:6px;padding:0.5rem 0.75rem;font-size:0.78rem;margin-top:0.5rem">
    <div style="font-weight:700;color:var(--info);margin-bottom:0.3rem">💡 Overhead from Template</div>
    ${_prodOverheadsSnapshot.map(o=>`<div style="display:flex;justify-content:space-between;padding:0.15rem 0;color:var(--text-secondary)"><span>${o.label}</span><strong style="font-family:var(--font-mono)">${fmtMoney(o.amount)}</strong></div>`).join('')}
    <div style="display:flex;justify-content:space-between;padding:0.3rem 0 0;border-top:1px solid rgba(37,99,235,0.2);margin-top:0.2rem;font-weight:700;color:var(--info)"><span>Total Overhead / piece</span><span style="font-family:var(--font-mono)">${fmtMoney(total)}</span></div>
  </div>`;
}
function renderProdMatRows(){
  const wrap=document.getElementById('fp-mat-rows'); if(!wrap)return;
  if(!_prodMatRows.length){wrap.innerHTML=`<div style="text-align:center;padding:.7rem;border:1px dashed var(--border);border-radius:8px;font-size:0.78rem;color:var(--text-light)">Select a worker first, or click "+ Add Row"</div>`;
    const costEl=document.getElementById('fp-mat-cost'); if(costEl)costEl.innerHTML=''; return;}
  wrap.innerHTML=_prodMatRows.map((r,i)=>{
    const overuse=r.mat&&parseFloat(r.qty||0)>parseFloat(r.maxQty||0);
    const border=overuse?'border-color:var(--danger)':'';
    return `<div style="display:grid;grid-template-columns:1fr 90px 90px 30px;gap:0.4rem;align-items:center;margin-bottom:0.4rem">
      <input class="finput" id="fp-mat-${i}" value="${r.mat||''}" placeholder="Material" style="font-size:0.82rem"/>
      <span style="text-align:center;font-family:var(--font-mono);font-size:0.7rem;color:${overuse?'var(--danger)':'var(--text-tertiary)'}">max ${fmtNum(r.maxQty||0)} ${r.unit}</span>
      <input class="finput" id="fp-qty-${i}" type="number" min="0" step="0.01" value="${r.qty||''}" placeholder="0" style="${border}"/>
      <button class="row-del" onclick="prodDelRow(${i})">×</button>
    </div>${overuse?`<div style="font-size:0.68rem;color:var(--danger);margin-bottom:0.3rem">⚠ ${r.mat}: worker only holds ${fmtNum(r.maxQty||0)} ${r.unit}</div>`:''}`;
  }).join('');
  _prodMatRows.forEach((_,i)=>{
    document.getElementById(`fp-mat-${i}`)?.addEventListener('input',e=>{_prodMatRows[i].mat=e.target.value; renderProdMatRows();});
    document.getElementById(`fp-qty-${i}`)?.addEventListener('input',e=>{_prodMatRows[i].qty=parseFloat(e.target.value)||0; renderProdMatRows();});
  });
  const matCost=_prodMatRows.reduce((s,r)=>{ if(!r.mat||!r.qty)return s; const m=DB.all('materials').find(m=>m.name===r.mat); return s+parseFloat(r.qty||0)*parseFloat(m?.unitCost||0); },0);
  const costEl=document.getElementById('fp-mat-cost');
  if(costEl && matCost>0) costEl.innerHTML=`<div style="display:flex;justify-content:space-between;align-items:center;padding:0.5rem 0.75rem;background:var(--amber-pale);border-radius:8px;font-size:0.8rem"><span style="color:var(--text-tertiary)">Raw material cost per piece</span><strong style="font-family:var(--font-mono);color:var(--amber-dark)">${fmtMoney(matCost)}</strong></div>`;
  else if(costEl) costEl.innerHTML='';
}
function prodDelRow(i){_prodMatRows.splice(i,1);renderProdMatRows();}
function saveProduction(){
  const workerId=document.getElementById('fp-worker-id').value, workerTxt=document.getElementById('fp-worker-search').value.trim();
  const product=document.getElementById('fp-product').value.trim();
  const date=document.getElementById('fp-date').value;
  const pieces=parseInt(document.getElementById('fp-pieces').value)||1;
  const wagePer=parseFloat(document.getElementById('fp-wage-per').value)||0;
  const totalWageAll=parseFloat(document.getElementById('fp-wage-total').value)||wagePer*pieces;
  const wagePerPiece=pieces>0?totalWageAll/pieces:totalWageAll;
  if(!workerId&&!workerTxt){toast('Select a worker','danger');return;}
  if(!product){toast('Enter the product name','danger');return;}
  if(!date){toast('Select a date','danger');return;}

  const snInputs=[...document.querySelectorAll('.fp-sn-input')].map(el=>el.value.trim());
  const serials=snInputs.slice(0,pieces);
  const emptySerials=serials.filter(s=>!s);
  if(emptySerials.length){toast(`Enter serial numbers for all ${pieces} piece(s)`,'danger');return;}
  const uniqueCheck=new Set(serials);
  if(uniqueCheck.size!==serials.length){toast('All serial numbers must be unique within this batch','danger');return;}
  const alreadyUsed=serials.filter(s=>!DB.isSerialUnique(s));
  if(alreadyUsed.length){toast('Already used: '+alreadyUsed.join(', '),'danger');return;}

  const used=_prodMatRows.filter(r=>r.mat&&parseFloat(r.qty)>0);
  const worker=workerId?DB.find('workers',workerId):null;

  if(worker){
    const totalNeeded={};
    used.forEach(u=>{ totalNeeded[u.mat]=(totalNeeded[u.mat]||0)+parseFloat(u.qty)*pieces; });
    const overuse=Object.entries(totalNeeded).filter(([mat,needed])=>{ const h=worker.holdings?.find(h=>h.mat===mat); return !h||parseFloat(h.qty)<needed; });
    if(overuse.length){toast(`Worker does not hold enough for ${pieces} piece(s): `+overuse.map(([m])=>m).join(', '),'danger');return;}
  }

  const wName=worker?.name||workerTxt;
  const matCostSnapshot={};
  DB.all('materials').forEach(m=>{matCostSnapshot[m.name]=parseFloat(m.unitCost||0);});
  const matCostPerPiece=used.reduce((s,u)=>s+parseFloat(u.qty||0)*parseFloat(matCostSnapshot[u.mat]||0),0);

  if(worker){
    const holdings=[...(worker.holdings||[])];
    used.forEach(u=>{ const h=holdings.find(h=>h.mat===u.mat); if(h)h.qty=Math.max(0,parseFloat(h.qty)-parseFloat(u.qty)*pieces); });
    const remaining=holdings.filter(h=>parseFloat(h.qty)>0);
    DB.update('workers',worker.id,{holdings:remaining,totalJobs:(worker.totalJobs||0)+pieces,totalEarned:(worker.totalEarned||0)+totalWageAll});
  }

  const overheadsSnapshot=[..._prodOverheadsSnapshot];
  const ohCostPerPiece=overheadsSnapshot.reduce((s,o)=>s+parseFloat(o.amount||0),0);

  const prod=DB.insert('productions',{
    workerId:workerId||null, workerName:wName, product, serialNumbers:serials, date,
    piecesCount:pieces, wagePerPiece:wagePer, totalWage:totalWageAll,
    materialsUsed:used, matCostPerPiece, matCostSnapshot,
    overheadsSnapshot, ohCostPerPiece,
    notes:document.getElementById('fp-notes').value.trim()
  });

  serials.forEach(sn=>{
    DB.insert('finished',{
      productionId:prod.id, workerId:workerId||null, workerName:wName,
      product, serialNumber:sn, date, totalWage:wagePerPiece,
      materialsUsed:used, matCostPerPiece, ohCostPerPiece,
      overheadsSnapshot, sold:false
    });
  });

  closeModal('modal-production'); renderProductions(); renderWorkers(); renderFinished(); updateCounts();
  if(document.getElementById('page-worker-profile')?.classList.contains('active')) renderWorkerProfile();
  toast(`${pieces} × "${product}" recorded — SN: ${serials.join(', ')}`);
}

/* ═══════════════════════════════════════════════════
   DELETE PRODUCTION LOG ENTRY
   Returns materials to worker holdings + removes finished goods
   ═══════════════════════════════════════════════════ */
function deleteProduction(prodId){
  const prod = DB.find('productions', prodId);
  if(!prod){ toast('Production not found','danger'); return; }

  const serials = prod.serialNumbers || [prod.serialNumber].filter(Boolean);
  const soldSerials = serials.filter(sn=>{
    const fg = DB.all('finished').find(f=>f.serialNumber===sn && f.productionId===prodId);
    return fg?.sold;
  });

  if(soldSerials.length){
    toast(`Cannot delete — ${soldSerials.length} piece(s) already sold: ${soldSerials.join(', ')}`, 'danger');
    return;
  }

  const pieces = prod.piecesCount || 1;
  const confirmMsg = `Delete production batch?\n\n` +
    `Product: ${prod.product}\n` +
    `Worker: ${prod.workerName}\n` +
    `Pieces: ${pieces}\n` +
    `Serials: ${serials.join(', ')}\n\n` +
    `Materials used (per piece) will be returned to the worker's holdings.\n` +
    `Finished goods records will be removed.`;

  if(!confirm(confirmMsg)) return;

  // Return materials back to worker holdings
  const worker = prod.workerId ? DB.find('workers', prod.workerId) : null;
  if(worker && (prod.materialsUsed||[]).length){
    const holdings = [...(worker.holdings||[])];
    prod.materialsUsed.forEach(u=>{
      const returnQty = parseFloat(u.qty||0) * pieces;
      const h = holdings.find(h=>h.mat===u.mat);
      if(h){
        h.qty = parseFloat(h.qty||0) + returnQty;
      } else {
        holdings.push({ mat:u.mat, qty:returnQty, unit:u.unit||'' });
      }
    });
    // Reverse worker stats
    const newJobs  = Math.max(0, (worker.totalJobs||0) - pieces);
    const newEarned = Math.max(0, (worker.totalEarned||0) - parseFloat(prod.totalWage||0));
    DB.update('workers', worker.id, { holdings, totalJobs:newJobs, totalEarned:newEarned });
  }

  // Remove finished goods records for this production
  serials.forEach(sn=>{
    const fg = DB.all('finished').find(f=>f.serialNumber===sn && f.productionId===prodId);
    if(fg) DB.delete('finished', fg.id);
  });

  // Delete the production record
  DB.delete('productions', prodId);

  renderProductions();
  renderFinished();
  renderWorkers();
  updateCounts();
  if(document.getElementById('page-worker-profile')?.classList.contains('active')) renderWorkerProfile();
  toast(`Production batch deleted — materials returned to ${prod.workerName||'worker'}`, 'warning');
}

/* ═══════════════════════════════════════════════════
   PRODUCTION LOG
   ═══════════════════════════════════════════════════ */
function renderProductions(){
  const prods=DB.all('productions'), search=(document.getElementById('prod-search')?.value||'').toLowerCase();
  const fl=prods.filter(p=>(p.product||'').toLowerCase().includes(search)||(p.workerName||'').toLowerCase().includes(search)||((p.serialNumbers||[p.serialNumber||'']).join(' ')).toLowerCase().includes(search));
  const listEl=document.getElementById('prod-list'); if(!listEl)return;

  if(!fl.length){
    listEl.innerHTML=`<div class="prod-empty-state"><div class="prod-empty-ico">🏭</div><div class="prod-empty-title">${prods.length?'No results found':'No production recorded yet'}</div><div class="prod-empty-sub">${prods.length?'Try a different search term':'Click "+ Record Production" to log your first entry'}</div></div>`;
    return;
  }

  const totalPieces=fl.reduce((s,p)=>s+(p.piecesCount||1),0);
  const totalWages=fl.reduce((s,p)=>s+parseFloat(p.totalWage||0),0);
  const totalMatCost=fl.reduce((s,p)=>s+parseFloat(p.matCostPerPiece||0)*(p.piecesCount||1),0);
  const totalOhCost=fl.reduce((s,p)=>s+parseFloat(p.ohCostPerPiece||0)*(p.piecesCount||1),0);

  listEl.innerHTML=`
    <div class="prod-summary-bar">
      <div class="psb-stat"><span class="psb-val">${fl.length}</span><span class="psb-lbl">Batches</span></div>
      <div class="psb-divider"></div>
      <div class="psb-stat"><span class="psb-val">${totalPieces}</span><span class="psb-lbl">Pieces</span></div>
      <div class="psb-divider"></div>
      <div class="psb-stat"><span class="psb-val psb-amber">${fmtMoney(totalWages)}</span><span class="psb-lbl">Wages</span></div>
      <div class="psb-divider"></div>
      <div class="psb-stat"><span class="psb-val psb-blue">${fmtMoney(totalMatCost)}</span><span class="psb-lbl">Mat. Cost</span></div>
      <div class="psb-divider"></div>
      <div class="psb-stat"><span class="psb-val psb-green">${fmtMoney(totalWages+totalMatCost+totalOhCost)}</span><span class="psb-lbl">Total Cost</span></div>
    </div>
    <div class="prod-cards">
      ${fl.map(p=>{
        const serials=p.serialNumbers||[p.serialNumber||'—'];
        const matCost=parseFloat(p.matCostPerPiece||0);
        const ohCost=parseFloat(p.ohCostPerPiece||(p.overheadsSnapshot||[]).reduce((s,o)=>s+parseFloat(o.amount||0),0)||0);
        const totalCostPc=matCost+ohCost;
        const pieces=p.piecesCount||1;
        const wagePerPc=parseFloat(p.wagePerPiece||0)||(parseFloat(p.totalWage||0)/pieces);
        const grandCostPc=totalCostPc+wagePerPc;
        const ohTitle=(p.overheadsSnapshot||[]).map(o=>`${o.label}: ${fmtMoney(o.amount)}`).join('\n');
        // Check if any serial is sold
        const anySold = serials.some(sn=>DB.all('finished').find(f=>f.serialNumber===sn&&f.productionId===p.id)?.sold);
        return `
        <div class="prod-card">
          <div class="prod-card-left">
            <div class="prod-card-icon">🏭</div>
          </div>
          <div class="prod-card-body">
            <div class="prod-card-top">
              <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:0.5rem">
                <div class="prod-card-title">${p.product}</div>
                <button class="act-btn danger" style="flex-shrink:0;font-size:0.72rem;padding:0.25rem 0.5rem" onclick="deleteProduction('${p.id}')" title="${anySold?'Some pieces sold — cannot fully delete':'Delete production batch'}">🗑 Delete</button>
              </div>
              <div class="prod-card-meta">
                <span class="prod-meta-chip prod-chip-worker" onclick="nav('worker-profile','${p.workerId}')">
                  <span class="pmc-icon">👷</span>${p.workerName}
                </span>
                <span class="prod-meta-chip">📅 ${fmtDate(p.date)}</span>
                <span class="prod-meta-chip prod-chip-count">${pieces} pc${pieces>1?'s':''}</span>
              </div>
            </div>
            <div class="prod-serials">
              ${serials.map(s=>`<span class="prod-sn-tag">📟 ${s}</span>`).join('')}
            </div>
            <div class="prod-card-costs">
              <div class="pcc-item">
                <span class="pcc-label">Wage / pc</span>
                <span class="pcc-value pcc-amber">${fmtMoney(wagePerPc)}</span>
              </div>
              ${matCost>0?`<div class="pcc-item">
                <span class="pcc-label">Mat. cost / pc</span>
                <span class="pcc-value pcc-blue">${fmtMoney(matCost)}</span>
              </div>`:''}
              ${ohCost>0?`<div class="pcc-item" title="${ohTitle}" style="cursor:help">
                <span class="pcc-label">Overhead / pc ℹ</span>
                <span class="pcc-value pcc-purple">${fmtMoney(ohCost)}</span>
              </div>`:''}
              ${grandCostPc>0?`<div class="pcc-item pcc-total">
                <span class="pcc-label">Total / pc</span>
                <span class="pcc-value pcc-total-val">${fmtMoney(grandCostPc)}</span>
              </div>`:''}
              <div class="pcc-item pcc-total-wages">
                <span class="pcc-label">Total wages</span>
                <span class="pcc-value pcc-amber">${fmtMoney(p.totalWage||0)}</span>
              </div>
            </div>
            ${(p.materialsUsed||[]).length?`<div class="prod-mats-used">
              <span class="pmu-label">Materials used (per pc):</span>
              ${p.materialsUsed.map(m=>`<span class="pmu-tag">${fmtNum(m.qty)} ${m.unit} ${m.mat}</span>`).join('')}
            </div>`:''}
            ${p.notes?`<div class="prod-notes">💬 ${p.notes}</div>`:''}
          </div>
        </div>`;
      }).join('')}
    </div>`;
}

/* ═══════════════════════════════════════════════════
   FINISHED GOODS
   ═══════════════════════════════════════════════════ */
function renderFinished(){
  const fin=DB.all('finished'), search=(document.getElementById('fg-search')?.value||'').toLowerCase();
  const fl=fin.filter(f=>(f.product||'').toLowerCase().includes(search)||(f.workerName||'').toLowerCase().includes(search)||(f.serialNumber||'').toLowerCase().includes(search));
  const inStock=fin.filter(f=>!f.sold).length;
  const totalWage=fin.reduce((s,f)=>s+parseFloat(f.totalWage||0),0);
  const totalMatCost=fin.reduce((s,f)=>s+parseFloat(f.matCostPerPiece||0),0);
  const statsEl=document.getElementById('fg-stats');
  if(statsEl)statsEl.innerHTML=`
    <div class="stat-card"><span class="sc-ico">✅</span><div class="sc-lbl">Total Produced</div><div class="sc-val">${fin.length}</div></div>
    <div class="stat-card"><span class="sc-ico">📦</span><div class="sc-lbl">In Stock</div><div class="sc-val" style="color:var(--info)">${inStock}</div></div>
    <div class="stat-card"><span class="sc-ico">🧾</span><div class="sc-lbl">Sold</div><div class="sc-val" style="color:var(--success)">${fin.length-inStock}</div></div>
    <div class="stat-card"><span class="sc-ico">💳</span><div class="sc-lbl">Wages Paid</div><div class="sc-val" style="font-size:1.2rem">${fmtMoney(totalWage)}</div></div>
    <div class="stat-card" style="border-color:var(--amber-light)"><span class="sc-ico">📦</span><div class="sc-lbl">Raw Mat. Cost</div><div class="sc-val" style="font-size:1.2rem;color:var(--amber-dark)">${fmtMoney(totalMatCost)}</div><div class="sc-sub">all finished goods</div></div>
  `;
  const pmap={};
  fin.forEach(f=>{ const k=f.product; if(!pmap[k])pmap[k]={name:k,total:0,inStock:0,sold:0,matCost:0,wageTotal:0}; pmap[k].total++; f.sold?pmap[k].sold++:pmap[k].inStock++; pmap[k].matCost+=parseFloat(f.matCostPerPiece||0); pmap[k].wageTotal+=parseFloat(f.totalWage||0); });
  const summaryRows=Object.values(pmap).sort((a,b)=>b.total-a.total);
  const list=document.getElementById('fg-list'); if(!list)return;
  list.innerHTML=(summaryRows.length?`
    <div class="card" style="margin-bottom:1.2rem">
      <div class="card-hdr"><span class="card-title">📊 Product Summary</span></div>
      <div class="card-body" style="padding:0">
        <table class="data-table"><thead><tr><th>Product</th><th style="text-align:center">Total</th><th style="text-align:center">In Stock</th><th style="text-align:center">Sold</th><th style="text-align:right">Total Mat. Cost</th><th style="text-align:right">Total Wages</th></tr></thead>
        <tbody>${summaryRows.map(p=>`<tr>
          <td class="td-name">${p.name}</td>
          <td class="td-mono" style="text-align:center"><strong>${p.total}</strong></td>
          <td class="td-mono" style="text-align:center;color:var(--info)">${p.inStock}</td>
          <td class="td-mono" style="text-align:center;color:var(--success)">${p.sold}</td>
          <td class="td-mono" style="text-align:right;color:var(--amber-dark)">${fmtMoney(p.matCost)}</td>
          <td class="td-mono" style="text-align:right">${fmtMoney(p.wageTotal)}</td>
        </tr>`).join('')}</tbody></table>
      </div>
    </div>`:'')+(fl.length?fl.map(f=>{
    const matCost=parseFloat(f.matCostPerPiece||0);
    const ohCost=parseFloat(f.ohCostPerPiece||0);
    return `<div class="fg-card">
      <div class="fg-icon">🪑</div>
      <div class="fg-body">
        <div class="fg-product">${f.product}</div>
        <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-tertiary);margin-bottom:0.25rem">📟 ${f.serialNumber||'—'}</div>
        <div class="fg-meta"><span>👷 ${f.workerName}</span><span>📅 ${fmtDate(f.date)}</span>${f.sold?`<span class="badge badge-success" style="font-size:0.65rem">🧾 Sold</span>`:`<span class="badge badge-info" style="font-size:0.65rem">📦 In Stock</span>`}</div>
        <div style="display:flex;gap:1rem;margin-top:0.3rem;font-size:0.75rem;flex-wrap:wrap">
          <span>💳 Wage: <strong>${fmtMoney(f.totalWage||0)}</strong></span>
          ${matCost>0?`<span>📦 Mat.: <strong style="color:var(--amber-dark)">${fmtMoney(matCost)}</strong></span>`:''}
          ${ohCost>0?`<span>💡 Overhead: <strong style="color:var(--info)">${fmtMoney(ohCost)}</strong></span>`:''}
          ${(matCost+ohCost+(f.totalWage||0))>0?`<span>Total: <strong style="color:var(--text-primary)">${fmtMoney(matCost+ohCost+(f.totalWage||0))}</strong></span>`:''}
        </div>
        ${(f.materialsUsed||[]).length?`<div style="font-size:0.72rem;color:var(--text-light);margin-top:0.2rem">${f.materialsUsed.map(m=>`${fmtNum(m.qty)} ${m.unit} ${m.mat}`).join(' · ')}</div>`:''}
      </div>
      <div class="acts" style="flex-direction:column;gap:0.4rem">
        ${!f.sold?`<button class="btn btn-primary btn-sm" onclick="openSalesModal('${f.id}')">🧾 Sell</button>`:''}
        <button class="act-btn danger" onclick="deleteFG('${f.id}')">🗑</button>
      </div>
    </div>`;}).join(''):`<div class="table-card"><div class="t-empty"><span class="t-empty-ico">✅</span>${fin.length?'No results':'No finished goods yet'}</div></div>`);
}
function deleteFG(id){ if(!confirm('Delete this record?'))return; DB.delete('finished',id); renderFinished(); updateCounts(); toast('Deleted','warning'); }

/* ═══════════════════════════════════════════════════
   SALES
   ═══════════════════════════════════════════════════ */
let _cartItems = [];
let _editSaleId = null;

function openSalesModal(preloadFgId=null, editSaleId=null){
  _cartItems = [];
  _editSaleId = editSaleId || null;
  ['fsl-buyer-name','fsl-buyer-phone','fsl-buyer-addr','fsl-billno'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('fsl-date').value = todayStr();
  document.getElementById('fsl-buyer-type').value = 'Shop';
  document.getElementById('fsl-tax-pct').value = '0';
  document.getElementById('fsl-prod-search').value = '';
  document.getElementById('fsl-serial-results').innerHTML = '';

  if(editSaleId){
    const sl = DB.find('sales', editSaleId);
    if(sl){
      document.getElementById('fsl-buyer-name').value  = sl.buyerName||'';
      document.getElementById('fsl-buyer-phone').value = sl.buyerPhone||'';
      document.getElementById('fsl-buyer-addr').value  = sl.buyerAddr||'';
      document.getElementById('fsl-billno').value      = sl.billno||'';
      document.getElementById('fsl-date').value        = sl.date||todayStr();
      document.getElementById('fsl-buyer-type').value  = sl.buyerType||'Shop';
      document.getElementById('fsl-tax-pct').value     = sl.taxPct||0;
      (sl.items||[]).forEach(it=>{
        const fg = DB.find('finished', it.fgId);
        if(fg){
          _cartItems.push({fgId:it.fgId,product:it.product,serialNumber:it.serialNumber,workerName:it.workerName,date:fg.date,matCostPerPiece:parseFloat(it.matCostPerPiece||0),ohCostPerPiece:parseFloat(it.ohCostPerPiece||fg.ohCostPerPiece||0),totalWage:parseFloat(it.totalWage||0),price:parseFloat(it.price||0)});
        }
      });
      const titleEl=document.querySelector('#modal-sales .modal-title');
      if(titleEl) titleEl.textContent='Edit Sales Bill';
    }
  } else {
    const titleEl=document.querySelector('#modal-sales .modal-title');
    if(titleEl) titleEl.textContent='New Sales Bill';
  }

  _renderCart();
  if(preloadFgId && !editSaleId){ const fg=DB.find('finished',preloadFgId); if(fg&&!fg.sold) _addToCart(fg); }
  const psEl=document.getElementById('fsl-prod-search'), psCl=psEl.cloneNode(true); psEl.parentNode.replaceChild(psCl,psEl);
  document.getElementById('fsl-prod-search').addEventListener('input',_onProductSearch);
  const txEl=document.getElementById('fsl-tax-pct'), txCl=txEl.cloneNode(true); txEl.parentNode.replaceChild(txCl,txEl);
  document.getElementById('fsl-tax-pct').addEventListener('input',_recalcTotals);
  const btn=document.getElementById('sl-save'), cl=btn.cloneNode(true); btn.parentNode.replaceChild(cl,btn);
  document.getElementById('sl-save').addEventListener('click',saveSalesBill);
  document.getElementById('sl-save').textContent = editSaleId ? '💾 Update Bill' : '🧾 Save Bill';
  openModal('modal-sales');
  setTimeout(()=>document.getElementById('fsl-prod-search')?.focus(),150);
}

function _onProductSearch(){
  const q=(document.getElementById('fsl-prod-search')?.value||'').toLowerCase().trim();
  const resEl=document.getElementById('fsl-serial-results'); if(!resEl)return;
  if(!q){resEl.innerHTML='';return;}
  const unsold=DB.all('finished').filter(f=>{
    if(_cartItems.find(c=>c.fgId===f.id)) return false;
    if(!f.sold) return true;
    if(_editSaleId && f.saleId===_editSaleId) return true;
    return false;
  });
  const byProduct=unsold.filter(f=>f.product.toLowerCase().includes(q));
  const bySerial=unsold.filter(f=>f.serialNumber.toLowerCase().includes(q)&&!byProduct.find(p=>p.id===f.id));
  const results=[...byProduct,...bySerial];
  if(!results.length){resEl.innerHTML=`<div style="font-size:0.76rem;color:var(--text-tertiary);padding:0.5rem 0.2rem">No unsold products match "<em>${q}</em>"</div>`;return;}
  const grouped={};
  results.forEach(f=>{if(!grouped[f.product])grouped[f.product]=[];grouped[f.product].push(f);});
  resEl.innerHTML=Object.entries(grouped).map(([name,items])=>`
    <div style="margin-bottom:0.6rem">
      <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-tertiary);padding:0.2rem 0;margin-bottom:0.2rem">${name} · ${items.length} available</div>
      ${items.map(fg=>{
        const internalCost = parseFloat(fg.matCostPerPiece||0) + parseFloat(fg.ohCostPerPiece||0) + parseFloat(fg.totalWage||0);
        return `<div style="display:flex;align-items:center;gap:0.6rem;padding:0.45rem 0.65rem;background:var(--bg-secondary);border:1px solid var(--border);border-radius:7px;margin-bottom:0.25rem">
          <div style="flex:1;min-width:0">
            <span style="font-family:var(--font-mono);font-size:0.8rem;font-weight:600;color:var(--text-primary)">SN: ${fg.serialNumber}</span>
            <span style="font-size:0.72rem;color:var(--text-tertiary);margin-left:0.5rem">👷 ${fg.workerName} · ${fmtDate(fg.date)}</span>
            ${internalCost>0?`<div style="font-size:0.69rem;color:var(--amber-dark)">Internal cost: ${fmtMoney(internalCost)}</div>`:''}
          </div>
          <button onclick="_addToCart_byId('${fg.id}')" class="sn-add-btn" title="Add to bill">+</button>
        </div>`;
      }).join('')}
    </div>`).join('');
}

function _addToCart_byId(fgId){ const fg=DB.find('finished',fgId); if(fg)_addToCart(fg); }

function _addToCart(fg){
  if(_cartItems.find(c=>c.fgId===fg.id)){toast('Already in cart','warning');return;}
  _cartItems.push({
    fgId:fg.id,
    product:fg.product,
    serialNumber:fg.serialNumber,
    workerName:fg.workerName,
    date:fg.date,
    matCostPerPiece:parseFloat(fg.matCostPerPiece||0),
    ohCostPerPiece:parseFloat(fg.ohCostPerPiece||0),
    totalWage:parseFloat(fg.totalWage||0),
    price:0
  });
  _onProductSearch(); _renderCart();
  toast(`Added: ${fg.product} (${fg.serialNumber})`);
}

function _renderCart(){
  const wrap=document.getElementById('fsl-cart-wrap'), totWrap=document.getElementById('fsl-totals-wrap'), cntEl=document.getElementById('fsl-cart-count');
  if(!wrap)return;
  if(cntEl)cntEl.textContent=_cartItems.length?`(${_cartItems.length} item${_cartItems.length>1?'s':''})` :'';
  if(!_cartItems.length){
    wrap.innerHTML=`<div style="color:var(--text-tertiary);font-size:0.78rem;padding:0.6rem 0;text-align:center;border:1px dashed var(--border);border-radius:8px">No items yet — search and add products above</div>`;
    if(totWrap)totWrap.style.display='none'; return;
  }
  wrap.innerHTML=`<div style="border:1px solid var(--border);border-radius:9px;overflow:hidden">
    <div style="display:grid;grid-template-columns:1fr 130px 28px;gap:0.4rem;padding:0.4rem 0.75rem;background:var(--bg-secondary);font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.5px;color:var(--text-tertiary)"><span>Product · Serial</span><span>Sale Price ₹</span><span></span></div>
    ${_cartItems.map((it,i)=>{
      const totalInternalCost = it.matCostPerPiece + it.ohCostPerPiece + it.totalWage;
      return `<div style="display:grid;grid-template-columns:1fr 130px 28px;gap:0.4rem;padding:0.5rem 0.75rem;align-items:center;border-top:1px solid var(--border-light)">
        <div>
          <div style="font-weight:600;font-size:0.83rem">${it.product}</div>
          <div style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-tertiary)">SN: ${it.serialNumber} · ${it.workerName}</div>
          <div style="display:flex;flex-wrap:wrap;gap:0.3rem 0.75rem;margin-top:0.2rem">
            ${it.matCostPerPiece>0?`<span style="font-size:0.68rem;color:var(--amber-dark)">📦 Mat: ${fmtMoney(it.matCostPerPiece)}</span>`:''}
            ${it.ohCostPerPiece>0?`<span style="font-size:0.68rem;color:var(--info)">💡 OH: ${fmtMoney(it.ohCostPerPiece)}</span>`:''}
            ${it.totalWage>0?`<span style="font-size:0.68rem;color:var(--text-tertiary)">💳 Wage: ${fmtMoney(it.totalWage)}</span>`:''}
            ${totalInternalCost>0?`<span style="font-size:0.68rem;font-weight:700;color:var(--text-primary);background:var(--amber-pale);padding:0.05rem 0.35rem;border-radius:4px;border:1px solid var(--amber-light)">Total cost: ${fmtMoney(totalInternalCost)}</span>`:''}
          </div>
        </div>
        <input class="finput" id="cart-price-${i}" type="number" min="0" step="0.01" value="${it.price||''}" placeholder="0.00" style="text-align:right;font-weight:600"/>
        <button class="row-del" onclick="removeFromCart(${i})">×</button>
      </div>`;
    }).join('')}
  </div>`;
  _cartItems.forEach((_,i)=>{ document.getElementById(`cart-price-${i}`)?.addEventListener('input',e=>{ _cartItems[i].price=parseFloat(e.target.value)||0; _recalcTotals(); }); });
  if(totWrap)totWrap.style.display=''; _recalcTotals();
}

function removeFromCart(i){ _cartItems.splice(i,1); _renderCart(); _onProductSearch(); }

function _recalcTotals(){
  const sub=_cartItems.reduce((s,it)=>s+parseFloat(it.price||0),0);
  const pct=parseFloat(document.getElementById('fsl-tax-pct')?.value||0), tax=sub*pct/100, tot=sub+tax;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('fsl-subtotal',fmtMoney(sub)); set('fsl-tax-display',fmtMoney(tax)); set('fsl-tax-pct-display',pct); set('fsl-grand-total',fmtMoney(tot));
}

function saveSalesBill(){
  const buyerName=document.getElementById('fsl-buyer-name').value.trim(), date=document.getElementById('fsl-date').value;
  if(!_cartItems.length){toast('Add at least one product','danger');return;}
  if(!buyerName){toast('Enter buyer name','danger');return;}
  if(!date){toast('Select date','danger');return;}
  if(_cartItems.some(it=>!(it.price>0))){toast('Enter sale price for all items','danger');return;}
  const taxPct=parseFloat(document.getElementById('fsl-tax-pct').value)||0;
  const subtotal=_cartItems.reduce((s,it)=>s+parseFloat(it.price||0),0);
  const taxAmt=subtotal*taxPct/100, totalAmount=subtotal+taxAmt;
  const buyerType=document.getElementById('fsl-buyer-type').value;

  if(_editSaleId){
    const oldSale = DB.find('sales', _editSaleId);
    if(oldSale){
      (oldSale.items||[]).forEach(it=>{ if(it.fgId) DB.update('finished',it.fgId,{sold:false,soldDate:null,buyerName:null,buyerType:null,saleId:null}); });
      DB.delete('sales', _editSaleId);
    }
  }

  const saleDoc=DB.insert('sales',{
    billno:document.getElementById('fsl-billno').value.trim(), date, buyerType, buyerName,
    buyerPhone:document.getElementById('fsl-buyer-phone').value.trim(),
    buyerAddr:document.getElementById('fsl-buyer-addr').value.trim(),
    items:_cartItems.map(it=>({fgId:it.fgId,product:it.product,serialNumber:it.serialNumber,workerName:it.workerName,matCostPerPiece:it.matCostPerPiece,ohCostPerPiece:it.ohCostPerPiece,totalWage:it.totalWage,price:it.price})),
    subtotal, taxPct, taxAmt, totalAmount,
    product:_cartItems.map(it=>it.product).join(', '),
    serialNumber:_cartItems.map(it=>it.serialNumber).join(', ')
  });
  _cartItems.forEach(it=>{ DB.update('finished',it.fgId,{sold:true,soldDate:date,buyerName,buyerType,saleId:saleDoc.id}); });
  closeModal('modal-sales'); renderSales(); renderFinished(); updateCounts();
  toast(`Bill ${_editSaleId?'updated':'saved'} — ${_cartItems.length} item(s) · ${fmtMoney(totalAmount)}`);
  _editSaleId = null;
}

function renderSales(){
  const allSales=DB.all('sales'), search=(document.getElementById('sales-search')?.value||'').toLowerCase();
  const sales=allSales.filter(sl=>(sl.product||'').toLowerCase().includes(search)||(sl.serialNumber||'').toLowerCase().includes(search)||(sl.buyerName||'').toLowerCase().includes(search));
  const totalRev=allSales.reduce((s,sl)=>s+parseFloat(sl.totalAmount||sl.amount||0),0);
  const statsEl=document.getElementById('sales-stats');
  if(statsEl)statsEl.innerHTML=`
    <div class="stat-card"><span class="sc-ico">🧾</span><div class="sc-lbl">Bills</div><div class="sc-val">${allSales.length}</div></div>
    <div class="stat-card"><span class="sc-ico">💰</span><div class="sc-lbl">Revenue</div><div class="sc-val" style="font-size:1.2rem;color:var(--success)">${fmtMoney(totalRev)}</div></div>
    <div class="stat-card"><span class="sc-ico">🏪</span><div class="sc-lbl">Shops</div><div class="sc-val">${allSales.filter(s=>s.buyerType==='Shop').length}</div></div>
    <div class="stat-card"><span class="sc-ico">👤</span><div class="sc-lbl">Customers</div><div class="sc-val">${allSales.filter(s=>s.buyerType==='Customer').length}</div></div>
  `;
  const listEl=document.getElementById('sales-list'); if(!listEl)return;
  if(!allSales.length){listEl.innerHTML=`<div class="table-card"><div class="t-empty"><span class="t-empty-ico">🧾</span>No sales bills yet</div></div>`;return;}
  if(!sales.length){listEl.innerHTML=`<div class="table-card"><div class="t-empty"><span class="t-empty-ico">🔍</span>No results</div></div>`;return;}
  listEl.innerHTML=sales.map(sl=>{
    const items=sl.items||[{product:sl.product,serialNumber:sl.serialNumber,price:sl.amount||sl.totalAmount,workerName:sl.workerName}];
    return `<div class="wo-card">
      <div class="wo-card-hdr">
        <div class="wc-left">
          <div class="wc-worker">${sl.buyerType==='Shop'?'🏪':'👤'} ${sl.buyerName}${sl.buyerPhone?' · '+sl.buyerPhone:''}</div>
          <div class="wc-notes">${sl.billno?'Bill #'+sl.billno+' · ':''}${fmtDate(sl.date)} · ${items.length} item${items.length>1?'s':''}</div>
          ${sl.buyerAddr?`<div class="wc-notes">${sl.buyerAddr}</div>`:''}
        </div>
        <div style="text-align:right">
          <div style="font-weight:700;color:var(--success);font-family:var(--font-mono);font-size:1rem">${fmtMoney(sl.totalAmount||sl.amount)}</div>
          ${sl.taxPct>0?`<div style="font-size:0.68rem;color:var(--text-tertiary)">${fmtMoney(sl.subtotal||sl.amount)} + ${sl.taxPct}% tax</div>`:''}
        </div>
      </div>
      <div style="padding:0.3rem 1rem 0.6rem;border-top:1px solid var(--border-light)">
        ${items.map(it=>{
          const internalCost = parseFloat(it.matCostPerPiece||0) + parseFloat(it.ohCostPerPiece||0) + parseFloat(it.totalWage||0);
          return `<div class="iss-mat-row">
            <div>
              <span class="imr-name">${it.product}</span>
              <span style="font-family:var(--font-mono);font-size:0.7rem;color:var(--text-tertiary);margin-left:0.4rem">SN:${it.serialNumber}</span>
              ${internalCost>0?`<div style="font-size:0.68rem;margin-top:0.1rem;display:flex;gap:0.5rem;flex-wrap:wrap">
                ${parseFloat(it.matCostPerPiece||0)>0?`<span style="color:var(--amber-dark)">📦 ${fmtMoney(it.matCostPerPiece)}</span>`:''}
                ${parseFloat(it.ohCostPerPiece||0)>0?`<span style="color:var(--info)">💡 ${fmtMoney(it.ohCostPerPiece)}</span>`:''}
                ${parseFloat(it.totalWage||0)>0?`<span style="color:var(--text-tertiary)">💳 ${fmtMoney(it.totalWage)}</span>`:''}
                <span style="font-weight:700;color:var(--text-primary)">Cost: ${fmtMoney(internalCost)}</span>
              </div>`:''}
            </div>
            <span class="imr-qty" style="font-weight:600">${fmtMoney(it.price||0)}</span>
          </div>`;
        }).join('')}
      </div>
      <div class="wo-card-foot"><div class="acts">
        <button class="btn btn-ghost btn-sm" onclick="openSalesModal(null,'${sl.id}')">✏️ Edit</button>
        <button class="btn btn-ghost btn-sm" onclick="printSalesBill('${sl.id}')">🖨 Print Bill</button>
        <button class="act-btn danger" onclick="deleteSale('${sl.id}')">🗑</button>
      </div></div>
    </div>`;
  }).join('');
}

function printSalesBill(id){
  const sl=DB.find('sales',id); if(!sl)return;
  const items=sl.items||[{product:sl.product,serialNumber:sl.serialNumber,price:sl.amount||sl.totalAmount,workerName:sl.workerName||''}];
  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Bill ${sl.billno||sl.id}</title>
  <style>*{margin:0;padding:0;box-sizing:border-box}body{font-family:'DM Sans',Arial,sans-serif;padding:32px;color:#111;font-size:13px}.hdr{border-bottom:2px solid #1e3a5f;padding-bottom:14px;margin-bottom:20px}.brand{font-size:1.4rem;font-weight:700;color:#1e3a5f;font-family:Georgia,serif}.sub{color:#777;font-size:11px;margin-top:2px}.block{border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin-bottom:12px}.lbl{font-size:10px;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;color:#9ca3af;margin-bottom:4px}.val{font-size:13px}.brow{display:flex;gap:24px;flex-wrap:wrap}.bcol{flex:1;min-width:100px}table{width:100%;border-collapse:collapse;margin-top:8px}th{padding:7px 9px;text-align:left;font-size:10px;text-transform:uppercase;letter-spacing:0.5px;background:#f8fafc;color:#64748b;font-weight:700}td{padding:8px 9px;border-bottom:1px solid #f1f5f9;font-size:12px}.tr{text-align:right;font-weight:600}.total-sec{text-align:right;margin-top:14px;padding-top:14px;border-top:2px solid #e2e8f0}.tl{font-size:10px;color:#9ca3af;text-transform:uppercase}.tv{font-size:1.5rem;font-weight:700;color:#16a34a}.footer{margin-top:26px;text-align:center;font-size:10px;color:#cbd5e1;border-top:1px solid #f1f5f9;padding-top:10px}</style>
  </head><body>
  <div class="hdr"><div class="brand">Vishnupriyaa Industries</div><div class="sub">Sales Bill${sl.billno?' · #'+sl.billno:''} &nbsp;·&nbsp; ${fmtDate(sl.date)}</div></div>
  <div class="block"><div class="lbl">Buyer Details</div><div class="brow" style="margin-top:8px"><div class="bcol"><div class="lbl">Type</div><div class="val">${sl.buyerType}</div></div><div class="bcol"><div class="lbl">Name</div><div class="val" style="font-weight:600">${sl.buyerName}</div></div>${sl.buyerPhone?`<div class="bcol"><div class="lbl">Phone</div><div class="val">${sl.buyerPhone}</div></div>`:''}</div>${sl.buyerAddr?`<div style="margin-top:8px"><div class="lbl">Address</div><div class="val">${sl.buyerAddr}</div></div>`:''}</div>
  <div class="block"><div class="lbl">Products Sold</div>
    <table><thead><tr><th>#</th><th>Product</th><th>Serial Number</th><th>Produced By</th><th class="tr">Price</th></tr></thead>
    <tbody>${items.map((it,idx)=>`<tr><td>${idx+1}</td><td>${it.product}</td><td style="font-family:monospace;font-size:11px">${it.serialNumber||'—'}</td><td>${it.workerName||'—'}</td><td class="tr">₹${parseFloat(it.price||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</td></tr>`).join('')}</tbody>
    </table></div>
  <div class="total-sec">${sl.taxPct>0?`<div style="font-size:11px;color:#9ca3af;margin-bottom:4px">Subtotal: ₹${parseFloat(sl.subtotal||0).toLocaleString('en-IN',{minimumFractionDigits:2})} + Tax (${sl.taxPct}%): ₹${parseFloat(sl.taxAmt||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</div>`:''}<div class="tl">Total Amount</div><div class="tv">₹${parseFloat(sl.totalAmount||sl.amount||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</div></div>
  <div class="footer">Vishnupriyaa Industries BMS &nbsp;·&nbsp; ${new Date().toLocaleDateString('en-IN')}</div>
  </body></html>`);
  win.document.close(); setTimeout(()=>win.print(),400);
}

function deleteSale(id){
  const sl=DB.find('sales',id); if(!sl)return;
  if(!confirm('Delete this bill? Products will be marked unsold.'))return;
  DB.delete('sales',id);
  const items=sl.items||[{fgId:sl.fgId}];
  items.forEach(it=>{ if(it.fgId)DB.update('finished',it.fgId,{sold:false,soldDate:null,buyerName:null,buyerType:null,saleId:null}); });
  renderSales(); renderFinished(); updateCounts(); toast('Deleted','warning');
}

/* ═══════════════════════════════════════════════════
   REPORTS
   ═══════════════════════════════════════════════════ */
function renderReports(){
  const mats=DB.all('materials'), workers=DB.all('workers'), prods=DB.all('productions'), fin=DB.all('finished'), sales=DB.all('sales');
  const stockVal=mats.reduce((s,m)=>s+parseFloat(m.qty||0)*parseFloat(m.unitCost||0),0);
  const wages=prods.reduce((s,p)=>s+parseFloat(p.totalWage||0),0);
  const revenue=sales.reduce((s,sl)=>s+parseFloat(sl.totalAmount||sl.amount||0),0);
  const body=document.getElementById('report-summary-body'); if(!body)return;
  body.innerHTML=`<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.9rem">
    <div class="stat-card"><span class="sc-ico">📦</span><div class="sc-lbl">Stock Value</div><div class="sc-val" style="font-size:1.1rem">${fmtMoney(stockVal)}</div></div>
    <div class="stat-card"><span class="sc-ico">👷</span><div class="sc-lbl">Workers</div><div class="sc-val">${workers.length}</div></div>
    <div class="stat-card"><span class="sc-ico">🏭</span><div class="sc-lbl">Productions</div><div class="sc-val">${prods.length}</div></div>
    <div class="stat-card"><span class="sc-ico">💳</span><div class="sc-lbl">Wages</div><div class="sc-val" style="font-size:1.1rem">${fmtMoney(wages)}</div></div>
    <div class="stat-card"><span class="sc-ico">💰</span><div class="sc-lbl">Revenue</div><div class="sc-val" style="font-size:1.1rem;color:var(--success)">${fmtMoney(revenue)}</div></div>
    <div class="stat-card" style="border-color:${revenue-wages>=0?'var(--success-light)':'var(--danger-light)'}">
      <span class="sc-ico">${revenue-wages>=0?'📈':'📉'}</span>
      <div class="sc-lbl">Gross Profit</div>
      <div class="sc-val" style="font-size:1.1rem;color:${revenue-wages>=0?'var(--success)':'var(--danger)'}">${fmtMoney(revenue-wages)}</div>
    </div>
    <div class="stat-card"><span class="sc-ico">⚠️</span><div class="sc-lbl">Low/Out Stock</div><div class="sc-val" style="color:${mats.filter(m=>stockStatus(m)!=='ok').length?'var(--warning)':'var(--success)'}">${mats.filter(m=>stockStatus(m)!=='ok').length}</div></div>
    <div class="stat-card"><span class="sc-ico">✅</span><div class="sc-lbl">In Stock</div><div class="sc-val">${fin.filter(f=>!f.sold).length}</div></div>
  </div>`;
}
function exportDataJSON(){
  const d=DB.exportAll();
  const blob=new Blob([JSON.stringify(d,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  Object.assign(document.createElement('a'),{href:url,download:`VI-BMS-backup-${todayStr()}.json`}).click();
  URL.revokeObjectURL(url); toast('Backup exported');
}
function importDataJSON(file){
  if(!file)return;
  const r=new FileReader();
  r.onload=e=>{ try{ const d=JSON.parse(e.target.result); if(!confirm(`Import from ${d.exportedAt?new Date(d.exportedAt).toLocaleString('en-IN'):'unknown date'}?\nThis will REPLACE all current data.`))return; DB.importAll(d); location.reload(); }catch{toast('Invalid backup file','danger');} };
  r.readAsText(file);
}
function confirmDeleteAllData(){
  if(!confirm('⚠ Delete ALL data? Cannot be undone.'))return;
  if(!confirm('Last chance — click OK.'))return;
  DB.clearAll(); updateCounts(); renderDashboard(); toast('All data deleted','warning');
}

/* ═══════════════════════════════════════════════════
   MODALS HTML
   ═══════════════════════════════════════════════════ */
function createModals(){
  document.getElementById('modals-container').innerHTML=`

  <div class="modal-backdrop" id="modal-material">
    <div class="modal"><div class="modal-hdr"><div><h3 class="modal-title" id="mat-modal-ttl">Add Raw Material</h3><p class="modal-sub">Define an inventory material</p></div><button class="modal-close" onclick="closeModal('modal-material')">×</button></div>
    <div class="modal-body">
      <div class="form-row"><div class="field-group fg-full"><label>Material Name *</label><input class="finput" id="fm-name" type="text" placeholder="e.g. Teak Wood…"/></div></div>
      <div class="form-row"><div class="field-group"><label>Category</label><div class="combo-wrap"><input class="finput" id="fm-cat" type="text" placeholder="Wood, Polish…" autocomplete="off"/><div class="combo-drop" id="fm-cat-drop"></div></div></div><div class="field-group"><label>Unit * <span style="font-weight:400;text-transform:none;font-size:0.7rem">(type freely)</span></label><div class="combo-wrap"><input class="finput" id="fm-unit" type="text" placeholder="kg, feet, pcs…" autocomplete="off"/><div class="combo-drop" id="fm-unit-drop"></div></div></div></div>
      <div class="form-row three"><div class="field-group"><label>Opening Qty</label><input class="finput" id="fm-qty" type="number" min="0" step="0.01" placeholder="0"/></div><div class="field-group"><label>Unit Cost (₹)</label><input class="finput" id="fm-cost" type="number" min="0" step="0.01" placeholder="0.00"/></div><div class="field-group"><label>Min Alert Level</label><input class="finput" id="fm-min" type="number" min="0" step="1" placeholder="10"/></div></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal('modal-material')">Cancel</button><button class="btn btn-primary" id="mat-save">Save Material</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="modal-supplier">
    <div class="modal modal-lg"><div class="modal-hdr"><div><h3 class="modal-title">New Supplier Bill</h3><p class="modal-sub">Stock updates automatically on save. New material names are auto-created.</p></div><button class="modal-close" onclick="closeModal('modal-supplier')">×</button></div>
    <div class="modal-body">
      <div class="form-row three">
        <div class="field-group"><label>Supplier *</label><div class="combo-wrap"><input class="finput" id="fs-supplier" type="text" placeholder="Supplier name" autocomplete="off"/><div class="combo-drop" id="fs-supplier-drop"></div></div></div>
        <div class="field-group"><label>Bill No.</label><input class="finput" id="fs-billno" type="text" placeholder="INV-001"/></div>
        <div class="field-group"><label>Date *</label><input class="finput" id="fs-date" type="date"/></div>
      </div>
      <div class="bill-table-hdr"><span>Material</span><span>Qty</span><span>Unit</span><span>Unit Price ₹</span><span></span></div>
      <div id="sup-rows-wrap"></div>
      <button class="add-row-btn" id="sup-add-row">+ Add Row</button>
      <div class="bill-total-row"><span>Total Bill Amount</span><span class="bill-total-val" id="sup-total">₹0.00</span></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal('modal-supplier')">Cancel</button><button class="btn btn-primary" id="sup-save">Save Bill &amp; Update Stock</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="modal-worker">
    <div class="modal"><div class="modal-hdr"><div><h3 class="modal-title" id="worker-modal-ttl">Add Worker</h3></div><button class="modal-close" onclick="closeModal('modal-worker')">×</button></div>
    <div class="modal-body">
      <div class="form-row"><div class="field-group fg-full"><label>Full Name *</label><input class="finput" id="fw-name" type="text" placeholder="Worker full name"/></div></div>
      <div class="form-row"><div class="field-group"><label>Phone</label><input class="finput" id="fw-phone" type="tel" placeholder="Phone number"/></div><div class="field-group"><label>Skill *</label><div class="combo-wrap"><input class="finput" id="fw-skill" type="text" placeholder="Carpenter…" autocomplete="off"/><div class="combo-drop" id="fw-skill-drop"></div></div></div></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal('modal-worker')">Cancel</button><button class="btn btn-primary" id="worker-save">Save Worker</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="modal-template">
    <div class="modal modal-lg"><div class="modal-hdr"><div><h3 class="modal-title" id="tpl-modal-ttl">New Product Template</h3><p class="modal-sub">Define expected materials and overhead costs for this product type</p></div><button class="modal-close" onclick="closeModal('modal-template')">×</button></div>
    <div class="modal-body">
      <div class="form-row"><div class="field-group fg-full"><label>Template Name *</label><input class="finput" id="ftpl-name" type="text" placeholder="e.g. Teak Dining Chair, 3-Seater Sofa…"/></div></div>
      <div class="form-row"><div class="field-group fg-full"><label>Description</label><input class="finput" id="ftpl-desc" type="text" placeholder="Optional notes…"/></div></div>
      <div class="approve-section" style="margin-top:0.5rem">
        <p class="section-label">Expected Materials (per piece)</p>
        <div class="mat-recipe-hdr"><span>Material</span><span>Qty</span><span>Unit</span><span></span></div>
        <div id="tpl-mat-rows"></div>
        <button class="add-row-btn" id="tpl-add-row">+ Add Material</button>
      </div>
      <div class="approve-section">
        <p class="section-label">Additional Overhead Costs (per piece)</p>
        <p class="section-hint">Add fixed costs like electricity, rent, fuel that go into making this product</p>
        <div style="display:grid;grid-template-columns:1fr 120px 28px;gap:0.4rem;padding:0.25rem 0;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-tertiary);margin-bottom:0.2rem"><span>Cost Label</span><span>Amount ₹</span><span></span></div>
        <div id="tpl-overhead-rows"></div>
        <button class="add-row-btn" id="tpl-add-overhead">+ Add Overhead Cost</button>
        <div id="tpl-total-cost-preview" style="margin-top:0.4rem"></div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal('modal-template')">Cancel</button><button class="btn btn-primary" id="tpl-save">Save Template</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="modal-issue">
    <div class="modal modal-lg"><div class="modal-hdr"><div><h3 class="modal-title">Issue Materials to Worker</h3><p class="modal-sub">Materials deducted from stock — only items with stock can be issued</p></div><button class="modal-close" onclick="closeModal('modal-issue')">×</button></div>
    <div class="modal-body">
      <div class="form-row">
        <div class="field-group"><label>Worker *</label><div class="combo-wrap"><input class="finput" id="fi-worker-search" type="text" placeholder="Search worker…" autocomplete="off"/><div class="combo-drop" id="fi-worker-drop"></div><input type="hidden" id="fi-worker-id"/></div></div>
        <div class="field-group"><label>Date *</label><input class="finput" id="fi-date" type="date"/></div>
      </div>
      <div id="fi-worker-holdings"></div>
      <div class="mat-recipe-hdr"><span>Material (from stock)</span><span>Qty</span><span>Unit</span><span></span></div>
      <div id="fi-mat-rows"></div>
      <button class="add-row-btn" id="fi-add-row">+ Add Material</button>
      <div id="fi-stock-warn"></div>
      <div class="form-row" style="margin-top:0.6rem"><div class="field-group fg-full"><label>Notes</label><input class="finput" id="fi-notes" type="text" placeholder="Optional notes…"/></div></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal('modal-issue')">Cancel</button><button class="btn btn-primary" id="fi-save">📦 Issue Materials</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="modal-production">
    <div class="modal modal-lg"><div class="modal-hdr"><div><h3 class="modal-title">Record Production</h3><p class="modal-sub">Worker reports product made — materials deducted from their holdings</p></div><button class="modal-close" onclick="closeModal('modal-production')">×</button></div>
    <div class="modal-body">
      <div class="approve-section">
        <p class="section-label">Product Details</p>
        <div class="form-row three">
          <div class="field-group"><label>Worker *</label><div class="combo-wrap"><input class="finput" id="fp-worker-search" type="text" placeholder="Select worker…" autocomplete="off"/><div class="combo-drop" id="fp-worker-drop"></div><input type="hidden" id="fp-worker-id"/></div></div>
          <div class="field-group"><label>Product Template (optional)</label><div class="combo-wrap"><input class="finput" id="fp-template-search" type="text" placeholder="Load template…" autocomplete="off"/><div class="combo-drop" id="fp-template-drop"></div></div></div>
          <div class="field-group"><label>Date *</label><input class="finput" id="fp-date" type="date"/></div>
        </div>
        <div class="form-row">
          <div class="field-group"><label>Actual Product Name *</label><input class="finput" id="fp-product" type="text" placeholder="e.g. Teak Chair, Dining Table…"/></div>
          <div class="field-group"><label>No. of Pieces *</label><input class="finput" id="fp-pieces" type="number" min="1" step="1" value="1" placeholder="1"/></div>
        </div>
        <div style="margin-top:0.4rem">
          <div style="font-size:0.68rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--amber-dark);margin-bottom:0.5rem">Serial Numbers</div>
          <div id="fp-serial-rows"></div>
        </div>
      </div>
      <div class="approve-section">
        <p class="section-label">Wage</p>
        <div class="form-row three">
          <div class="field-group"><label>Wage per Piece (₹)</label><input class="finput" id="fp-wage-per" type="number" min="0" step="1" placeholder="0"/></div>
          <div class="field-group"><label>Pieces</label><input class="finput" id="fp-wage-pcs" type="number" min="1" step="1" value="1" readonly style="background:var(--bg-secondary)"/></div>
          <div class="field-group"><label>Total Wage (₹)</label><input class="finput" id="fp-wage-total" type="number" min="0" step="1" placeholder="0" style="font-weight:700"/></div>
        </div>
      </div>
      <div class="approve-section">
        <p class="section-label">Materials Used <span style="font-weight:400;font-size:0.7rem;color:var(--text-tertiary)">(per piece)</span></p>
        <p class="section-hint" id="fp-holdings-hint">Select a worker first.</p>
        <div id="fp-holdings-list"></div>
        <div id="fp-mat-rows"></div>
        <button class="add-row-btn" id="fp-add-row">+ Add Row</button>
        <div id="fp-mat-cost" style="margin-top:0.6rem"></div>
        <div id="fp-overhead-preview"></div>
      </div>
      <div class="form-row"><div class="field-group fg-full"><label>Notes</label><input class="finput" id="fp-notes" type="text" placeholder="Optional…"/></div></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal('modal-production')">Cancel</button><button class="btn btn-success" id="fp-save">✅ Record Production</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="modal-direct-return">
    <div class="modal"><div class="modal-hdr"><div><h3 class="modal-title">Return to Stock</h3><p class="modal-sub" id="dr-sub"></p></div><button class="modal-close" onclick="closeModal('modal-direct-return')">×</button></div>
    <div class="modal-body">
      <p class="section-hint">Enter quantity to return. Stock updates immediately.</p>
      <div style="margin-top:0.6rem;display:grid;grid-template-columns:1fr 90px 90px;gap:0.4rem;padding:0.3rem 0;font-size:0.65rem;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--text-tertiary)"><span>Material</span><span style="text-align:right">Holding</span><span>Return Qty</span></div>
      <div id="dr-rows"></div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal('modal-direct-return')">Cancel</button><button class="btn btn-primary" id="dr-confirm">📦 Return to Stock</button></div>
    </div>
  </div>

  <div class="modal-backdrop" id="modal-return-stock">
    <div class="modal modal-lg">
      <div class="modal-hdr">
        <div>
          <h3 class="modal-title">↩ Return Materials to Stock</h3>
          <p class="modal-sub">Worker: <strong id="rs-worker-name"></strong></p>
        </div>
        <button class="modal-close" onclick="closeModal('modal-return-stock')">×</button>
      </div>
      <div class="modal-body" style="gap:0.7rem">
        <div class="field-group">
          <label>Search Material</label>
          <div class="search-wrap" style="max-width:100%">
            <span class="search-ico">⌕</span>
            <input type="text" class="search-input" id="rs-search" placeholder="Filter materials…" style="width:100%;max-width:100%"/>
          </div>
        </div>
        <div id="rs-rows-body" style="max-height:320px;overflow-y:auto;display:flex;flex-direction:column;gap:0.5rem;padding-right:0.2rem"></div>
        <div id="rs-summary" style="display:flex;flex-wrap:wrap;gap:0.4rem;align-items:center;padding:0.6rem 0.75rem;background:var(--amber-pale);border-radius:8px;border:1px solid var(--amber-light);min-height:38px">
          <span style="color:var(--text-light);font-size:0.78rem">Select quantities to return</span>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="closeModal('modal-return-stock')">Cancel</button>
        <button class="btn btn-primary" id="rs-confirm">↩ Return to Stock</button>
      </div>
    </div>
  </div>

  <div class="modal-backdrop" id="modal-edit-issuance">
    <div class="modal modal-lg">
      <div class="modal-hdr">
        <div>
          <h3 class="modal-title">✏️ Edit Issuance</h3>
          <p class="modal-sub">Worker: <strong id="ei-worker-name"></strong> · Stock &amp; holdings auto-balanced on save</p>
        </div>
        <button class="modal-close" onclick="closeModal('modal-edit-issuance')">×</button>
      </div>
      <div class="modal-body">
        <div class="banner banner-info" style="margin-bottom:0.7rem;font-size:0.77rem">
          <span class="banner-ico">⚖️</span>
          <div>Changes are automatically applied to <strong>worker holdings</strong> and <strong>raw material stock</strong> — only the delta is adjusted.</div>
        </div>
        <div class="form-row">
          <div class="field-group"><label>Date</label><input class="finput" id="ei-date" type="date"/></div>
          <div class="field-group"><label>Notes</label><input class="finput" id="ei-notes" type="text" placeholder="Optional…"/></div>
        </div>
        <div class="mat-recipe-hdr"><span>Material</span><span>Qty</span><span>Unit</span><span></span></div>
        <div id="ei-mat-rows"></div>
        <button class="add-row-btn" id="ei-add-row">+ Add Row</button>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="closeModal('modal-edit-issuance')">Cancel</button>
        <button class="btn btn-primary" id="ei-save">💾 Save &amp; Balance</button>
      </div>
    </div>
  </div>

  <div class="modal-backdrop" id="modal-sales">
    <div class="modal modal-lg"><div class="modal-hdr"><div><h3 class="modal-title">New Sales Bill</h3><p class="modal-sub">Search by product name — select serial numbers to add to cart</p></div><button class="modal-close" onclick="closeModal('modal-sales')">×</button></div>
    <div class="modal-body">
      <div class="approve-section">
        <p class="section-label">Add Products to Bill</p>
        <div class="field-group" style="margin-bottom:0.6rem">
          <label>Search by Product Name</label>
          <input class="finput" id="fsl-prod-search" type="text" placeholder="Type product name (e.g. Teak Chair)…" autocomplete="off"/>
        </div>
        <div id="fsl-serial-results" style="margin-bottom:0.5rem"></div>
      </div>
      <div class="approve-section">
        <p class="section-label">Cart <span id="fsl-cart-count" style="font-weight:400;font-size:0.7rem;color:var(--text-tertiary)"></span></p>
        <div id="fsl-cart-wrap">
          <div style="color:var(--text-tertiary);font-size:0.78rem;padding:0.6rem 0;text-align:center;border:1px dashed var(--border);border-radius:8px">No items yet — search and add products above</div>
        </div>
        <div id="fsl-totals-wrap" style="display:none;margin-top:0.6rem;background:var(--bg-secondary);border-radius:8px;padding:0.7rem 0.9rem">
          <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.3rem"><span style="color:var(--text-tertiary)">Subtotal</span><strong id="fsl-subtotal" style="font-family:var(--font-mono)">₹0.00</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:0.8rem;margin-bottom:0.3rem"><span style="color:var(--text-tertiary)">Tax (<span id="fsl-tax-pct-display">0</span>%)</span><strong id="fsl-tax-display" style="font-family:var(--font-mono)">₹0.00</strong></div>
          <div style="display:flex;justify-content:space-between;font-size:0.95rem;padding-top:0.4rem;border-top:1px solid var(--border)"><span style="font-weight:700">Total</span><strong id="fsl-grand-total" style="font-family:var(--font-mono);color:var(--success);font-size:1.05rem">₹0.00</strong></div>
        </div>
      </div>
      <div class="approve-section">
        <p class="section-label">Buyer Details</p>
        <div class="form-row three"><div class="field-group"><label>Type *</label><select class="finput" id="fsl-buyer-type"><option value="Shop">🏪 Shop</option><option value="Customer">👤 Customer</option></select></div><div class="field-group"><label>Name *</label><input class="finput" id="fsl-buyer-name" type="text" placeholder="Name or shop name"/></div><div class="field-group"><label>Phone</label><input class="finput" id="fsl-buyer-phone" type="tel" placeholder="Phone"/></div></div>
        <div class="form-row"><div class="field-group fg-full"><label>Address</label><input class="finput" id="fsl-buyer-addr" type="text" placeholder="Address…"/></div></div>
      </div>
      <div class="approve-section">
        <p class="section-label">Bill Details</p>
        <div class="form-row three">
          <div class="field-group"><label>Tax %</label><input class="finput" id="fsl-tax-pct" type="number" min="0" max="100" step="0.01" placeholder="0" value="0"/></div>
          <div class="field-group"><label>Date *</label><input class="finput" id="fsl-date" type="date"/></div>
          <div class="field-group"><label>Bill Number</label><input class="finput" id="fsl-billno" type="text" placeholder="SB-001"/></div>
        </div>
      </div>
    </div>
    <div class="modal-foot"><button class="btn btn-ghost" onclick="closeModal('modal-sales')">Cancel</button><button class="btn btn-primary" id="sl-save">🧾 Save Bill</button></div>
    </div>
  </div>
  `;
  document.querySelectorAll('.modal-backdrop').forEach(el=>el.addEventListener('click',e=>{ if(e.target===el)el.classList.remove('open'); }));
}

/* ═══════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',()=>{
  createModals();
  document.getElementById('menu-toggle')?.addEventListener('click',()=>{ document.getElementById('sidebar').classList.toggle('open'); document.getElementById('page-overlay').classList.toggle('show'); });
  document.getElementById('page-overlay')?.addEventListener('click',()=>{ document.getElementById('sidebar').classList.remove('open'); document.getElementById('page-overlay').classList.remove('show'); });
  document.querySelectorAll('.nav-btn[data-page]').forEach(b=>b.addEventListener('click',()=>nav(b.dataset.page)));

  document.getElementById('mat-search')?.addEventListener('input',renderMaterials);
  document.querySelectorAll('#mat-pills .tpill').forEach(b=>b.addEventListener('click',()=>{ document.querySelectorAll('#mat-pills .tpill').forEach(x=>x.classList.remove('active')); b.classList.add('active'); _matFilter=b.dataset.val; renderMaterials(); }));
  document.getElementById('mat-save')?.addEventListener('click',saveMat);

  document.getElementById('sup-search')?.addEventListener('input',renderSuppliers);

  document.getElementById('worker-search')?.addEventListener('input',renderWorkers);
  document.querySelectorAll('#worker-pills .tpill').forEach(b=>b.addEventListener('click',()=>{ document.querySelectorAll('#worker-pills .tpill').forEach(x=>x.classList.remove('active')); b.classList.add('active'); _workerFilter=b.dataset.val; renderWorkers(); }));
  document.getElementById('worker-save')?.addEventListener('click',saveWorker);

  document.getElementById('tpl-search')?.addEventListener('input',renderTemplates);
  document.getElementById('tpl-add-row')?.addEventListener('click',()=>{ _tplMatRows.push({mat:'',qty:'',unit:''}); renderTplMatRows(); });
  document.getElementById('tpl-add-overhead')?.addEventListener('click',()=>{ _tplOverheadRows.push({label:'',amount:0}); renderTplOverheadRows(); });
  document.getElementById('tpl-save')?.addEventListener('click',saveTemplate);

  document.getElementById('fi-add-row')?.addEventListener('click',()=>{ _issueRows.push({mat:'',qty:0,unit:''}); renderIssueRows(); });
  document.getElementById('fi-save')?.addEventListener('click',saveIssuance);

  document.getElementById('fp-add-row')?.addEventListener('click',()=>{ _prodMatRows.push({mat:'',qty:'',unit:'',maxQty:0}); renderProdMatRows(); });
  document.getElementById('fp-save')?.addEventListener('click',saveProduction);

  document.getElementById('prod-search')?.addEventListener('input',renderProductions);
  document.getElementById('fg-search')?.addEventListener('input',renderFinished);
  document.getElementById('sales-search')?.addEventListener('input',renderSales);
  document.getElementById('import-file-input')?.addEventListener('change',e=>importDataJSON(e.target.files[0]));

  updateDate(); setInterval(updateDate,60000); updateCounts(); nav('dashboard');
});
