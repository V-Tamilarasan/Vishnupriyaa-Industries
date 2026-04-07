'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   DATABASE
   Collections: materials, bills, workers, issuances, productions, finished, sales
   ═══════════════════════════════════════════════════════════════════════════ */
const DB = (() => {
  const PFX  = 'vi_bms2_';
  const COLS = ['materials','bills','workers','issuances','productions','finished','sales'];
  const _c   = {};
  COLS.forEach(c => { try { _c[c] = JSON.parse(localStorage.getItem(PFX+c)||'[]'); } catch { _c[c]=[]; } });
  const save = col => { try { localStorage.setItem(PFX+col, JSON.stringify(_c[col])); } catch(e) { setTimeout(()=>toast('Storage full!','danger'),100); } };
  const uid  = () => Date.now().toString(36) + Math.random().toString(36).slice(2,6);
  return {
    all:    col      => [...(_c[col]||[])],
    find:   (col,id) => (_c[col]||[]).find(d=>d.id===id)||null,
    insert: (col,d)  => { const doc={id:uid(),createdAt:Date.now(),...d}; _c[col].unshift(doc); save(col); return doc; },
    update: (col,id,d) => { const i=(_c[col]||[]).findIndex(x=>x.id===id); if(i===-1)return null; _c[col][i]={..._c[col][i],...d,updatedAt:Date.now()}; save(col); return _c[col][i]; },
    delete: (col,id) => { const b=(_c[col]||[]).length; _c[col]=(_c[col]||[]).filter(d=>d.id!==id); save(col); return (_c[col]||[]).length<b; },
    where:  (col,fn) => (_c[col]||[]).filter(fn),
    uid,
    adjustStock(name,delta) {
      const m=(_c.materials||[]).find(m=>m.name===name); if(!m)return;
      m.qty=Math.max(0,parseFloat(m.qty||0)+parseFloat(delta)); save('materials');
    },
    applyBill(items) {
      items.forEach(it=>{
        const ex=(_c.materials||[]).find(m=>m.name===it.mat);
        if(ex){ ex.qty=parseFloat(ex.qty||0)+parseFloat(it.qty); if(!ex.unitCost&&it.price)ex.unitCost=it.price; }
        else _c.materials.unshift({id:uid(),createdAt:Date.now(),name:it.mat,category:'',unit:it.unit||'',qty:parseFloat(it.qty),minLevel:10,unitCost:it.price||0});
      }); save('materials');
    },
    isSerialUnique: sn => !(_c.finished||[]).some(f=>f.serialNumber===sn),
    clearAll() { COLS.forEach(c=>{ _c[c]=[]; localStorage.removeItem(PFX+c); }); },
    exportAll() {
      return { exportedAt:new Date().toISOString(), ...Object.fromEntries(COLS.map(c=>[c,_c[c]])) };
    },
    importAll(data) {
      COLS.forEach(c=>{ if(data[c]){ _c[c]=data[c]; localStorage.setItem(PFX+c,JSON.stringify(data[c])); } });
    }
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */
const fmtMoney = v => '₹'+parseFloat(v||0).toLocaleString('en-IN',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmtNum   = v => parseFloat(v||0).toLocaleString('en-IN');
const fmtDate  = ds => ds ? new Date(ds+'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—';
const todayStr = () => new Date().toISOString().slice(0,10);

function stockStatus(m){
  const q=parseFloat(m.qty||0), mn=parseFloat(m.minLevel||0);
  return q<=0?'out':q<=mn?'low':'ok';
}
function stockBadge(m){
  const s=stockStatus(m);
  return s==='out'?'<span class="badge badge-danger">✕ Out</span>':
         s==='low'?'<span class="badge badge-warning">⚠ Low</span>':
                   '<span class="badge badge-success">✓ OK</span>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOAST
   ═══════════════════════════════════════════════════════════════════════════ */
function toast(msg,type='success'){
  const wrap=document.getElementById('toast-wrap'); if(!wrap)return;
  const el=document.createElement('div');
  el.className=`toast t-${type}`;
  el.innerHTML=`<span>${{success:'✅',danger:'❌',warning:'⚠️'}[type]||'✅'}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  requestAnimationFrame(()=>requestAnimationFrame(()=>el.classList.add('show')));
  setTimeout(()=>{ el.classList.remove('show'); setTimeout(()=>el.remove(),400); },3800);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODALS
   ═══════════════════════════════════════════════════════════════════════════ */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }
document.addEventListener('keydown',e=>{ if(e.key==='Escape') document.querySelectorAll('.modal-backdrop.open').forEach(m=>m.classList.remove('open')); });

function createModals(){
  document.getElementById('modals-container').innerHTML = `

  <!-- MATERIAL MODAL -->
  <div class="modal-backdrop" id="modal-material">
    <div class="modal">
      <div class="modal-hdr">
        <div><h3 class="modal-title" id="mat-modal-ttl">Add Raw Material</h3><p class="modal-sub">Define an inventory material</p></div>
        <button class="modal-close" onclick="closeModal('modal-material')">×</button>
      </div>
      <div class="modal-body">
        <div class="form-row"><div class="field-group fg-full"><label>Material Name *</label><input class="finput" id="fm-name" type="text" placeholder="e.g. Teak Wood, Plywood…"/></div></div>
        <div class="form-row">
          <div class="field-group"><label>Category</label><div class="combo-wrap"><input class="finput" id="fm-cat" type="text" placeholder="Wood, Polish…" autocomplete="off"/><div class="combo-drop" id="fm-cat-drop"></div></div></div>
          <div class="field-group"><label>Unit *</label><div class="combo-wrap"><input class="finput" id="fm-unit" type="text" placeholder="kg, feet, pcs…" autocomplete="off"/><div class="combo-drop" id="fm-unit-drop"></div></div></div>
        </div>
        <div class="form-row">
          <div class="field-group"><label>Opening Quantity</label><input class="finput" id="fm-qty" type="number" min="0" step="0.01" placeholder="0"/></div>
          <div class="field-group"><label>Unit Cost (₹)</label><input class="finput" id="fm-cost" type="number" min="0" step="0.01" placeholder="0.00"/></div>
          <div class="field-group"><label>Min Alert Level</label><input class="finput" id="fm-min" type="number" min="0" step="1" placeholder="10"/></div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="closeModal('modal-material')">Cancel</button>
        <button class="btn btn-primary" id="mat-save">Save Material</button>
      </div>
    </div>
  </div>

  <!-- SUPPLIER BILL MODAL -->
  <div class="modal-backdrop" id="modal-supplier">
    <div class="modal modal-lg">
      <div class="modal-hdr">
        <div><h3 class="modal-title">New Supplier Bill</h3><p class="modal-sub">Record incoming material purchase — stock updates automatically</p></div>
        <button class="modal-close" onclick="closeModal('modal-supplier')">×</button>
      </div>
      <div class="modal-body">
        <div class="form-row three">
          <div class="field-group"><label>Supplier Name *</label><div class="combo-wrap"><input class="finput" id="fs-supplier" type="text" placeholder="Supplier name" autocomplete="off"/><div class="combo-drop" id="fs-supplier-drop"></div></div></div>
          <div class="field-group"><label>Bill Number</label><input class="finput" id="fs-billno" type="text" placeholder="INV-001"/></div>
          <div class="field-group"><label>Date *</label><input class="finput" id="fs-date" type="date"/></div>
        </div>
        <div class="bill-table-hdr"><span>Material</span><span>Qty</span><span>Unit</span><span>Unit Price ₹</span><span></span></div>
        <div id="sup-rows-wrap"></div>
        <button class="add-row-btn" id="sup-add-row">+ Add Row</button>
        <div class="bill-total-row"><span>Total Bill Amount</span><span class="bill-total-val" id="sup-total">₹0.00</span></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="closeModal('modal-supplier')">Cancel</button>
        <button class="btn btn-primary" id="sup-save">Save Bill &amp; Update Stock</button>
      </div>
    </div>
  </div>

  <!-- WORKER MODAL -->
  <div class="modal-backdrop" id="modal-worker">
    <div class="modal">
      <div class="modal-hdr">
        <div><h3 class="modal-title" id="worker-modal-ttl">Add Worker</h3><p class="modal-sub">Register a factory worker</p></div>
        <button class="modal-close" onclick="closeModal('modal-worker')">×</button>
      </div>
      <div class="modal-body">
        <div class="form-row"><div class="field-group fg-full"><label>Full Name *</label><input class="finput" id="fw-name" type="text" placeholder="Worker full name"/></div></div>
        <div class="form-row">
          <div class="field-group"><label>Phone</label><input class="finput" id="fw-phone" type="tel" placeholder="Phone number"/></div>
          <div class="field-group"><label>Skill / Role *</label><div class="combo-wrap"><input class="finput" id="fw-skill" type="text" placeholder="Carpenter, Polisher…" autocomplete="off"/><div class="combo-drop" id="fw-skill-drop"></div></div></div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="closeModal('modal-worker')">Cancel</button>
        <button class="btn btn-primary" id="worker-save">Save Worker</button>
      </div>
    </div>
  </div>

  <!-- ISSUE MATERIALS MODAL -->
  <div class="modal-backdrop" id="modal-issue">
    <div class="modal modal-lg">
      <div class="modal-hdr">
        <div><h3 class="modal-title">Issue Materials to Worker</h3><p class="modal-sub">Materials deducted from stock and added to worker's holding</p></div>
        <button class="modal-close" onclick="closeModal('modal-issue')">×</button>
      </div>
      <div class="modal-body">
        <div class="form-row">
          <div class="field-group"><label>Worker *</label><div class="combo-wrap"><input class="finput" id="fi-worker-search" type="text" placeholder="Search worker…" autocomplete="off"/><div class="combo-drop" id="fi-worker-drop"></div><input type="hidden" id="fi-worker-id"/></div></div>
          <div class="field-group"><label>Date *</label><input class="finput" id="fi-date" type="date"/></div>
        </div>
        <div id="fi-worker-holdings" style="margin-bottom:0.8rem"></div>
        <div class="mat-recipe-hdr"><span>Material</span><span>Quantity</span><span>Unit</span><span></span></div>
        <div id="fi-mat-rows"></div>
        <button class="add-row-btn" id="fi-add-row">+ Add Material</button>
        <div id="fi-stock-warn" style="margin-top:0.6rem"></div>
        <div class="form-row" style="margin-top:0.8rem"><div class="field-group fg-full"><label>Notes</label><input class="finput" id="fi-notes" type="text" placeholder="Optional notes…"/></div></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="closeModal('modal-issue')">Cancel</button>
        <button class="btn btn-primary" id="fi-save">📦 Issue Materials</button>
      </div>
    </div>
  </div>

  <!-- PRODUCTION ENTRY MODAL -->
  <div class="modal-backdrop" id="modal-production">
    <div class="modal modal-lg">
      <div class="modal-hdr">
        <div><h3 class="modal-title">Record Production</h3><p class="modal-sub">Worker reports what they made and which materials were used</p></div>
        <button class="modal-close" onclick="closeModal('modal-production')">×</button>
      </div>
      <div class="modal-body">
        <div class="approve-section">
          <p class="section-label">Product Details</p>
          <div class="form-row three">
            <div class="field-group"><label>Worker *</label><div class="combo-wrap"><input class="finput" id="fp-worker-search" type="text" placeholder="Search worker…" autocomplete="off"/><div class="combo-drop" id="fp-worker-drop"></div><input type="hidden" id="fp-worker-id"/></div></div>
            <div class="field-group"><label>Product Name *</label><input class="finput" id="fp-product" type="text" placeholder="e.g. Teak Chair, Sofa…"/></div>
            <div class="field-group"><label>Date *</label><input class="finput" id="fp-date" type="date"/></div>
          </div>
          <div class="form-row">
            <div class="field-group"><label>Serial Number * <span style="font-size:0.68rem;color:var(--text-tertiary)">(unique per item)</span></label><input class="finput" id="fp-serial" type="text" placeholder="e.g. VI-2024-001"/><div id="fp-serial-status" style="font-size:0.7rem;margin-top:0.2rem"></div></div>
            <div class="field-group"><label>No. of Pieces</label><input class="finput" id="fp-pieces" type="number" min="1" step="1" value="1" placeholder="1"/></div>
          </div>
        </div>
        <div class="approve-section">
          <p class="section-label">Wage</p>
          <div class="form-row three">
            <div class="field-group"><label>Wage per Piece (₹)</label><input class="finput" id="fp-wage-per" type="number" min="0" step="1" placeholder="0"/></div>
            <div class="field-group"><label>Pieces Completed</label><input class="finput" id="fp-wage-pcs" type="number" min="0" step="1" placeholder="1"/></div>
            <div class="field-group"><label>Total Wage (₹)</label><input class="finput" id="fp-wage-total" type="number" min="0" step="1" placeholder="0" style="font-weight:700"/></div>
          </div>
        </div>
        <div class="approve-section">
          <p class="section-label">Materials Used</p>
          <p class="section-hint" id="fp-holdings-hint">Select a worker to see their current holdings.</p>
          <div id="fp-holdings-preview" style="margin-bottom:0.6rem"></div>
          <div class="mat-recipe-hdr"><span>Material</span><span>Worker Holds</span><span>Qty Used</span><span></span></div>
          <div id="fp-mat-rows"></div>
          <button class="add-row-btn" id="fp-add-row">+ Add Material Used</button>
        </div>
        <div class="approve-section">
          <div class="form-row"><div class="field-group fg-full"><label>Notes</label><input class="finput" id="fp-notes" type="text" placeholder="Optional notes…"/></div></div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="closeModal('modal-production')">Cancel</button>
        <button class="btn btn-success" id="fp-save">✅ Record Production</button>
      </div>
    </div>
  </div>

  <!-- DIRECT RETURN MODAL (from Worker Profile) -->
  <div class="modal-backdrop" id="modal-direct-return">
    <div class="modal">
      <div class="modal-hdr">
        <div><h3 class="modal-title">Return Materials to Stock</h3><p class="modal-sub" id="dr-sub"></p></div>
        <button class="modal-close" onclick="closeModal('modal-direct-return')">×</button>
      </div>
      <div class="modal-body">
        <p class="section-hint">Enter quantity to return. Stock updates immediately.</p>
        <div class="mat-recipe-hdr" style="margin-top:0.6rem"><span>Material</span><span>Holding</span><span>Return Qty</span></div>
        <div id="dr-rows"></div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="closeModal('modal-direct-return')">Cancel</button>
        <button class="btn btn-primary" id="dr-confirm">📦 Return to Stock</button>
      </div>
    </div>
  </div>

  <!-- SALES BILL MODAL -->
  <div class="modal-backdrop" id="modal-sales">
    <div class="modal modal-lg">
      <div class="modal-hdr">
        <div><h3 class="modal-title">New Sales Bill</h3><p class="modal-sub">Issue invoice for a finished product</p></div>
        <button class="modal-close" onclick="closeModal('modal-sales')">×</button>
      </div>
      <div class="modal-body">
        <div class="approve-section">
          <p class="section-label">Product</p>
          <div class="form-row">
            <div class="field-group"><label>Serial Number *</label><div class="combo-wrap"><input class="finput" id="fsl-serial" type="text" placeholder="Search serial…" autocomplete="off"/><div class="combo-drop" id="fsl-serial-drop"></div></div></div>
            <div class="field-group"><label>Date *</label><input class="finput" id="fsl-date" type="date"/></div>
          </div>
          <div id="fsl-product-preview" style="margin-top:0.4rem"></div>
        </div>
        <div class="approve-section">
          <p class="section-label">Buyer</p>
          <div class="form-row three">
            <div class="field-group"><label>Buyer Type *</label><select class="finput" id="fsl-buyer-type"><option value="Shop">🏪 Shop</option><option value="Customer">👤 Direct Customer</option></select></div>
            <div class="field-group"><label>Buyer Name *</label><input class="finput" id="fsl-buyer-name" type="text" placeholder="Name or shop name"/></div>
            <div class="field-group"><label>Phone</label><input class="finput" id="fsl-buyer-phone" type="tel" placeholder="Phone"/></div>
          </div>
          <div class="form-row"><div class="field-group fg-full"><label>Address / Notes</label><input class="finput" id="fsl-buyer-addr" type="text" placeholder="Address…"/></div></div>
        </div>
        <div class="approve-section">
          <p class="section-label">Amount</p>
          <div class="form-row three">
            <div class="field-group"><label>Base Amount (₹) *</label><input class="finput" id="fsl-amount" type="number" min="0" step="0.01" placeholder="0.00"/></div>
            <div class="field-group"><label>Tax %</label><input class="finput" id="fsl-tax-pct" type="number" min="0" max="100" step="0.01" placeholder="0" value="0"/></div>
            <div class="field-group"><label>Total (incl. Tax)</label><input class="finput" id="fsl-total" type="number" readonly style="font-weight:700;background:var(--bg-secondary)" placeholder="0.00"/></div>
          </div>
          <div class="form-row">
            <div class="field-group"><label>Bill Number</label><input class="finput" id="fsl-billno" type="text" placeholder="SB-001"/></div>
            <div class="field-group"><div id="fsl-tax-breakdown" style="padding:0.5rem 0.75rem;background:var(--primary-light);border-radius:6px;font-size:0.75rem;margin-top:1.5rem;display:none"></div></div>
          </div>
        </div>
      </div>
      <div class="modal-foot">
        <button class="btn btn-ghost" onclick="closeModal('modal-sales')">Cancel</button>
        <button class="btn btn-primary" id="sl-save">🧾 Save Sales Bill</button>
      </div>
    </div>
  </div>
  `;

  document.querySelectorAll('.modal-backdrop').forEach(el=>{
    el.addEventListener('click', e=>{ if(e.target===el) el.classList.remove('open'); });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMBO DROPDOWN
   ═══════════════════════════════════════════════════════════════════════════ */
function buildCombo(inputId, dropId, items, onSelect, hiddenId=null){
  const input=document.getElementById(inputId), drop=document.getElementById(dropId);
  if(!input||!drop) return;
  const ni=input.cloneNode(true); input.parentNode.replaceChild(ni,input);
  const inp=document.getElementById(inputId);
  const render=filter=>{
    const lf=filter.toLowerCase();
    const filtered=items.filter(i=>{ const s=typeof i==='string'?i:(i.label||i.name||''); return s.toLowerCase().includes(lf); });
    if(!filtered.length){drop.classList.remove('open');return;}
    drop.innerHTML=filtered.map(i=>{ const t=typeof i==='string'?i:(i.label||i.name||''); return `<div class="combo-item" data-value="${t.replace(/"/g,'&quot;')}">${t}</div>`; }).join('');
    drop.classList.add('open');
    drop.querySelectorAll('.combo-item').forEach(el=>el.addEventListener('mousedown',e=>{
      e.preventDefault(); const val=el.getAttribute('data-value');
      inp.value=val; if(hiddenId){const h=document.getElementById(hiddenId);if(h)h.value=val;}
      drop.classList.remove('open'); onSelect?.(val);
    }));
  };
  inp.addEventListener('input',  e=>render(e.target.value));
  inp.addEventListener('focus',  ()=>render(inp.value));
  inp.addEventListener('blur',   ()=>setTimeout(()=>drop.classList.remove('open'),200));
}

/* ═══════════════════════════════════════════════════════════════════════════
   NAVIGATION
   ═══════════════════════════════════════════════════════════════════════════ */
const PAGE_CONFIG = {
  dashboard:      { label:'Dashboard',        btn:null },
  materials:      { label:'Raw Materials',    btn:{ text:'+ Add Material',    fn:()=>openMatModal(null) } },
  suppliers:      { label:'Supplier Bills',   btn:{ text:'+ New Bill',         fn:openSupModal } },
  workers:        { label:'Workers',          btn:{ text:'+ Add Worker',       fn:()=>openWorkerModal(null) } },
  'worker-profile':{ label:'Worker Profile', btn:null },
  productions:    { label:'Production Log',   btn:{ text:'+ Record Production', fn:openProductionModal } },
  finished:       { label:'Finished Goods',   btn:null },
  sales:          { label:'Sales Bills',      btn:{ text:'+ New Sales Bill',   fn:()=>openSalesModal(null) } },
  reports:        { label:'Reports',          btn:null },
};
const RENDERERS = {
  dashboard:       renderDashboard,
  materials:       renderMaterials,
  suppliers:       renderSuppliers,
  workers:         renderWorkers,
  'worker-profile':renderWorkerProfile,
  productions:     renderProductions,
  finished:        renderFinished,
  sales:           renderSales,
  reports:         renderReports,
};

let _profileWorkerId = null;
function nav(page, param){
  if(page==='worker-profile'&&param) _profileWorkerId=param;
  document.querySelectorAll('.nav-btn').forEach(b=>b.classList.toggle('active', b.dataset.page===page));
  document.querySelectorAll('.page').forEach(p=>p.classList.remove('active'));
  document.getElementById('page-'+page)?.classList.add('active');
  const cfg=PAGE_CONFIG[page]||{};
  const bc=document.getElementById('bc-page'); if(bc) bc.textContent=cfg.label||page;
  const btn=document.getElementById('top-action-btn');
  if(btn){ if(cfg.btn){btn.textContent=cfg.btn.text;btn.style.display='';btn.onclick=cfg.btn.fn;}else btn.style.display='none'; }
  if(RENDERERS[page]) RENDERERS[page]();
  document.getElementById('sidebar')?.classList.remove('open');
  document.getElementById('page-overlay')?.classList.remove('show');
}

function toggleNavSection(sec){
  const items=document.getElementById(`section-${sec}`), btn=document.getElementById(`collapse-${sec}`);
  if(!items||!btn) return;
  const col=items.classList.toggle('collapsed');
  btn.textContent=col?'▶':'▼';
  localStorage.setItem(`nav-${sec}`,col?'closed':'open');
}

/* ═══════════════════════════════════════════════════════════════════════════
   DATE + COUNTS
   ═══════════════════════════════════════════════════════════════════════════ */
function updateDate(){
  const el=document.getElementById('topbar-date');
  if(el) el.textContent=new Date().toLocaleDateString('en-IN',{weekday:'short',day:'2-digit',month:'short',year:'numeric'});
}
function scheduleDateRefresh(){
  const now=new Date(), mid=new Date(now.getFullYear(),now.getMonth(),now.getDate()+1);
  setTimeout(()=>{updateDate();scheduleDateRefresh();},mid-now);
}
function updateCounts(){
  const mats=DB.all('materials'), workers=DB.all('workers'), prods=DB.all('productions');
  const fin=DB.all('finished'), sales=DB.all('sales'), issuances=DB.all('issuances');
  const low=mats.filter(m=>stockStatus(m)!=='ok').length;
  const set=(id,v)=>{const el=document.getElementById(id);if(el)el.textContent=v;};
  set('nc-materials', mats.length);
  set('nc-suppliers', DB.all('bills').length);
  set('nc-workers',   workers.length);
  set('nc-productions',prods.length);
  set('nc-finished',  fin.filter(f=>!f.sold).length);
  set('nc-sales',     sales.length);
  set('sf-active',    workers.filter(w=>(w.holdings||[]).length>0).length);
  set('sf-low-stock', low);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: DASHBOARD
   ═══════════════════════════════════════════════════════════════════════════ */
function renderDashboard(){
  const mats=DB.all('materials'), workers=DB.all('workers');
  const fin=DB.all('finished'), sales=DB.all('sales'), issuances=DB.all('issuances');
  const inStock=fin.filter(f=>!f.sold).length;
  const totalSales=sales.reduce((s,sl)=>s+parseFloat(sl.totalAmount||sl.amount||0),0);
  const totalWages=DB.all('productions').reduce((s,p)=>s+parseFloat(p.totalWage||0),0);
  const lowMats=mats.filter(m=>stockStatus(m)!=='ok');
  const workersHolding=workers.filter(w=>(w.holdings||[]).length>0);

  const statsEl=document.getElementById('dash-stats');
  if(statsEl) statsEl.innerHTML=`
    <div class="stat-card"><span class="sc-ico">📦</span><div class="sc-lbl">Materials</div><div class="sc-val">${mats.length}</div><div class="sc-sub">${lowMats.length} low/out</div></div>
    <div class="stat-card"><span class="sc-ico">👷</span><div class="sc-lbl">Workers Holding</div><div class="sc-val">${workersHolding.length}</div><div class="sc-sub">of ${workers.length} workers</div></div>
    <div class="stat-card"><span class="sc-ico">✅</span><div class="sc-lbl">In Stock (Finished)</div><div class="sc-val">${inStock}</div><div class="sc-sub">${fin.length-inStock} sold</div></div>
    <div class="stat-card"><span class="sc-ico">💳</span><div class="sc-lbl">Wages Paid</div><div class="sc-val" style="font-size:1.2rem">${fmtMoney(totalWages)}</div></div>
    <div class="stat-card" style="border-color:var(--success)"><span class="sc-ico">💰</span><div class="sc-lbl">Sales Revenue</div><div class="sc-val" style="font-size:1.2rem;color:var(--success)">${fmtMoney(totalSales)}</div></div>
  `;

  let banners='';
  if(lowMats.length) banners+=`<div class="banner banner-warning"><span class="banner-ico">⚠️</span><div><strong>${lowMats.filter(m=>stockStatus(m)==='out').length} out of stock, ${lowMats.filter(m=>stockStatus(m)==='low').length} low:</strong> ${lowMats.slice(0,3).map(m=>m.name).join(', ')}${lowMats.length>3?` +${lowMats.length-3} more`:''}</div></div>`;
  if(workersHolding.length) banners+=`<div class="banner" style="background:var(--warning-light);border-left:3px solid var(--warning);padding:0.7rem 1rem;border-radius:8px;margin-bottom:0.8rem;font-size:0.82rem"><span class="banner-ico">📦</span><div><strong>${workersHolding.length} worker(s) holding materials:</strong> ${workersHolding.map(w=>`<button class="card-link" onclick="nav('worker-profile','${w.id}')">${w.name}</button>`).join(', ')}</div></div>`;
  const be=document.getElementById('dash-banners'); if(be) be.innerHTML=banners;

  const recentIssuances=issuances.slice(0,5);
  const riEl=document.getElementById('dash-issuances');
  if(riEl) riEl.innerHTML=recentIssuances.length
    ? recentIssuances.map(i=>`<div class="dash-row"><span class="dr-name">📦 ${i.workerName}</span><span class="dr-val">${fmtDate(i.date)} · ${(i.materials||[]).length} items</span></div>`).join('')
    : '<div class="dash-empty">No issuances yet</div>';

  const recentSales=sales.slice(0,5);
  const rsEl=document.getElementById('dash-sales');
  if(rsEl) rsEl.innerHTML=recentSales.length
    ? recentSales.map(sl=>`<div class="dash-row"><span class="dr-name">${sl.product}</span><span class="dr-val" style="color:var(--success)">${fmtMoney(sl.totalAmount||sl.amount)}</span></div>`).join('')
    : '<div class="dash-empty">No sales yet</div>';

  const topWorkers=[...workers].sort((a,b)=>(b.totalEarned||0)-(a.totalEarned||0)).slice(0,5);
  const twEl=document.getElementById('dash-workers-top');
  if(twEl) twEl.innerHTML=topWorkers.length
    ? topWorkers.map(w=>`<div class="dash-row"><span class="dr-name">${w.name}</span><span class="dr-val">${fmtMoney(w.totalEarned||0)}</span></div>`).join('')
    : '<div class="dash-empty">No workers yet</div>';

  const stockAlEl=document.getElementById('dash-stock-alerts');
  if(stockAlEl) stockAlEl.innerHTML=lowMats.length
    ? lowMats.slice(0,6).map(m=>`<div class="dash-row"><span class="dr-name">${m.name}</span><span class="dr-val">${fmtNum(m.qty)} ${m.unit}</span></div>`).join('')
    : '<div class="dash-empty" style="color:var(--success)">✓ All stocked</div>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: RAW MATERIALS
   ═══════════════════════════════════════════════════════════════════════════ */
let _matFilter='all';
function renderMaterials(){
  const mats=DB.all('materials');
  const search=(document.getElementById('mat-search')?.value||'').toLowerCase();
  const filtered=mats.filter(m=>{
    const ms=_matFilter==='all'||stockStatus(m)===_matFilter;
    const ss=m.name.toLowerCase().includes(search)||(m.category||'').toLowerCase().includes(search);
    return ms&&ss;
  });
  const tbody=document.getElementById('mat-tbody'); if(!tbody)return;
  tbody.innerHTML=filtered.length?filtered.map(m=>{
    const sv=parseFloat(m.qty||0)*parseFloat(m.unitCost||0);
    return `<tr>
      <td class="td-name">${m.name}</td>
      <td><span class="badge badge-primary">${m.category||'—'}</span></td>
      <td class="td-mono">${fmtNum(m.qty)}</td>
      <td class="td-mono">${m.unit||'—'}</td>
      <td class="td-mono">${fmtMoney(m.unitCost||0)}</td>
      <td class="td-mono">${fmtMoney(sv)}</td>
      <td>${stockBadge(m)}</td>
      <td><div class="acts">
        <button class="act-btn" onclick="openMatModal('${m.id}')">✏️</button>
        <button class="act-btn danger" onclick="deleteMat('${m.id}')">🗑</button>
      </div></td>
    </tr>`;
  }).join(''):`<tr><td colspan="8"><div class="t-empty"><span class="t-empty-ico">📦</span>${mats.length?'No results':'No materials yet'}</div></td></tr>`;
  const fl=document.getElementById('mat-foot-l'); if(fl) fl.textContent=`${filtered.length} of ${mats.length} materials`;
  const fr=document.getElementById('mat-foot-r');
  if(fr){ const tv=mats.reduce((s,m)=>s+parseFloat(m.qty||0)*parseFloat(m.unitCost||0),0); fr.textContent=`Total stock value: ${fmtMoney(tv)}`; }
}

let _editMatId=null;
function openMatModal(id){
  _editMatId=id;
  const m=id?DB.find('materials',id):null;
  document.getElementById('mat-modal-ttl').textContent=m?'Edit Material':'Add Raw Material';
  document.getElementById('fm-name').value=m?.name||'';
  document.getElementById('fm-cat').value=m?.category||'';
  document.getElementById('fm-unit').value=m?.unit||'';
  document.getElementById('fm-qty').value=m?.qty||0;
  document.getElementById('fm-cost').value=m?.unitCost||0;
  document.getElementById('fm-min').value=m?.minLevel||10;
  const cats=[...new Set(DB.all('materials').map(m=>m.category).filter(Boolean))];
  const units=[...new Set([...DB.all('materials').map(m=>m.unit).filter(Boolean),'kg','g','litre','ml','pieces','feet','metre'])];
  buildCombo('fm-cat','fm-cat-drop',cats);
  buildCombo('fm-unit','fm-unit-drop',units);
  openModal('modal-material');
  setTimeout(()=>document.getElementById('fm-name')?.focus(),100);
}
function saveMat(){
  const name=document.getElementById('fm-name').value.trim();
  const unit=document.getElementById('fm-unit').value.trim();
  if(!name){toast('Material name required','danger');return;}
  if(!unit){toast('Unit required','danger');return;}
  const data={name,category:document.getElementById('fm-cat').value.trim(),unit,qty:parseFloat(document.getElementById('fm-qty').value)||0,unitCost:parseFloat(document.getElementById('fm-cost').value)||0,minLevel:parseFloat(document.getElementById('fm-min').value)||10};
  if(_editMatId){DB.update('materials',_editMatId,data);toast(`"${name}" updated`);}
  else{DB.insert('materials',data);toast(`"${name}" added`);}
  closeModal('modal-material'); renderMaterials(); updateCounts();
}
function deleteMat(id){
  if(!confirm('Delete this material?'))return;
  DB.delete('materials',id); renderMaterials(); updateCounts(); toast('Material deleted','warning');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: SUPPLIER BILLS
   ═══════════════════════════════════════════════════════════════════════════ */
let _supRows=[];
function openSupModal(){
  _supRows=[];
  document.getElementById('fs-supplier').value='';
  document.getElementById('fs-billno').value='';
  document.getElementById('fs-date').value=todayStr();
  renderSupRows();
  buildCombo('fs-supplier','fs-supplier-drop',[...new Set(DB.all('bills').map(b=>b.supplier).filter(Boolean))]);
  openModal('modal-supplier');
}
function renderSupRows(){
  const mats=DB.all('materials');
  const wrap=document.getElementById('sup-rows-wrap'); if(!wrap)return;
  if(!_supRows.length){ wrap.innerHTML=`<div style="color:var(--text-tertiary);font-size:.72rem;text-align:center;padding:.8rem;border:1px dashed var(--border);border-radius:7px">Click "+ Add Row"</div>`; document.getElementById('sup-total').textContent='₹0.00'; return; }
  wrap.innerHTML=_supRows.map((row,i)=>`
    <div class="bill-row">
      <div class="combo-wrap"><input class="finput" id="sr-mat-${i}" value="${row.mat||''}" placeholder="Material" autocomplete="off"/><div class="combo-drop" id="sr-mat-drop-${i}"></div></div>
      <input class="finput" id="sr-qty-${i}" type="number" min="0" step="0.01" value="${row.qty||''}" placeholder="0"/>
      <input class="finput" id="sr-unit-${i}" value="${row.unit||''}" placeholder="unit" readonly/>
      <div style="position:relative"><span style="position:absolute;left:.75rem;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-size:.78rem;pointer-events:none">₹</span><input class="finput" id="sr-price-${i}" type="number" min="0" step="0.01" value="${row.price||''}" placeholder="0.00" style="padding-left:1.6rem"/></div>
      <button class="row-del" onclick="supDelRow(${i})">×</button>
    </div>`).join('');
  _supRows.forEach((_,i)=>{
    document.getElementById(`sr-qty-${i}`)?.addEventListener('input',e=>{_supRows[i].qty=parseFloat(e.target.value)||0;calcSupTotal();});
    document.getElementById(`sr-price-${i}`)?.addEventListener('input',e=>{_supRows[i].price=parseFloat(e.target.value)||0;calcSupTotal();});
    document.getElementById(`sr-mat-${i}`)?.addEventListener('input',e=>{_supRows[i].mat=e.target.value;});
    buildCombo(`sr-mat-${i}`,`sr-mat-drop-${i}`,mats.map(m=>m.name),val=>{
      _supRows[i].mat=val;
      const m=mats.find(m=>m.name===val);
      if(m){ const u=document.getElementById(`sr-unit-${i}`); if(u) u.value=m.unit||''; const p=document.getElementById(`sr-price-${i}`); if(p&&!_supRows[i].price){p.value=m.unitCost||'';} _supRows[i].unit=m.unit||''; }
      calcSupTotal();
    });
  });
  calcSupTotal();
}
function supDelRow(i){_supRows.splice(i,1);renderSupRows();}
function calcSupTotal(){ const t=_supRows.reduce((s,r)=>s+(parseFloat(r.qty)||0)*(parseFloat(r.price)||0),0); const el=document.getElementById('sup-total'); if(el)el.textContent=fmtMoney(t); }
function saveSupplierBill(){
  const supplier=document.getElementById('fs-supplier').value.trim();
  const date=document.getElementById('fs-date').value;
  if(!supplier){toast('Supplier name required','danger');return;}
  if(!date){toast('Select a date','danger');return;}
  const valid=_supRows.filter(r=>r.mat&&parseFloat(r.qty)>0);
  if(!valid.length){toast('Add at least one material row','danger');return;}
  const total=valid.reduce((s,r)=>s+(parseFloat(r.qty)||0)*(parseFloat(r.price)||0),0);
  DB.insert('bills',{supplier,billno:document.getElementById('fs-billno').value.trim(),date,items:valid.map(r=>({...r})),total});
  DB.applyBill(valid);
  closeModal('modal-supplier'); renderSuppliers(); renderMaterials(); updateCounts();
  toast(`Bill from "${supplier}" saved — ${fmtMoney(total)}`);
}
function renderSuppliers(){
  const bills=DB.all('bills');
  const search=(document.getElementById('sup-search')?.value||'').toLowerCase();
  const filtered=bills.filter(b=>b.supplier.toLowerCase().includes(search)||(b.billno||'').toLowerCase().includes(search));
  const list=document.getElementById('sup-list'); if(!list)return;
  if(!filtered.length){list.innerHTML=`<div class="table-card"><div class="t-empty"><span class="t-empty-ico">🧾</span>${bills.length?'No results':'No bills yet'}</div></div>`;return;}
  list.innerHTML=filtered.map(b=>`
    <div class="wo-card">
      <div class="wo-card-hdr">
        <div class="wc-left"><div class="wc-worker">${b.supplier}</div><div class="wc-notes">${b.billno?'Bill #'+b.billno+' · ':''}${fmtDate(b.date)} · ${b.items?.length||0} items</div></div>
        <div style="display:flex;gap:0.5rem;align-items:center"><span style="font-weight:700;color:var(--primary)">${fmtMoney(b.total)}</span><button class="act-btn danger" onclick="deleteBill('${b.id}')">🗑</button></div>
      </div>
      <div class="wo-card-body" style="flex-direction:column;gap:0.4rem">
        ${(b.items||[]).map(it=>`<div class="iss-mat-row"><span class="imr-name">${it.mat}</span><span class="imr-qty">${fmtNum(it.qty)} ${it.unit} @ ${fmtMoney(it.price)}</span></div>`).join('')}
      </div>
    </div>`).join('');
}
function deleteBill(id){ if(!confirm('Delete bill? Stock will NOT be reversed.'))return; DB.delete('bills',id); renderSuppliers(); updateCounts(); toast('Bill deleted','warning'); }

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: WORKERS
   ═══════════════════════════════════════════════════════════════════════════ */
let _workerFilter='all', _editWorkerId=null;
function openWorkerModal(id){
  _editWorkerId=id;
  const w=id?DB.find('workers',id):null;
  document.getElementById('worker-modal-ttl').textContent=w?'Edit Worker':'Add Worker';
  document.getElementById('fw-name').value=w?.name||'';
  document.getElementById('fw-phone').value=w?.phone||'';
  document.getElementById('fw-skill').value=w?.skill||'';
  buildCombo('fw-skill','fw-skill-drop',[...new Set(DB.all('workers').map(w=>w.skill).filter(Boolean))]);
  openModal('modal-worker');
  setTimeout(()=>document.getElementById('fw-name')?.focus(),100);
}
function saveWorker(){
  const name=document.getElementById('fw-name').value.trim();
  const skill=document.getElementById('fw-skill').value.trim();
  if(!name){toast('Name required','danger');return;}
  if(!skill){toast('Skill required','danger');return;}
  const data={name,phone:document.getElementById('fw-phone').value.trim(),skill};
  if(_editWorkerId){ const ex=DB.find('workers',_editWorkerId); DB.update('workers',_editWorkerId,{...data,totalJobs:ex?.totalJobs||0,totalEarned:ex?.totalEarned||0,holdings:ex?.holdings||[]}); toast(`"${name}" updated`); }
  else { DB.insert('workers',{...data,totalJobs:0,totalEarned:0,holdings:[]}); toast(`"${name}" added`); }
  closeModal('modal-worker'); renderWorkers(); updateCounts();
}
function renderWorkers(){
  const workers=DB.all('workers');
  const search=(document.getElementById('worker-search')?.value||'').toLowerCase();
  let filtered=workers.filter(w=>w.name.toLowerCase().includes(search)||(w.skill||'').toLowerCase().includes(search));
  if(_workerFilter==='holding') filtered=filtered.filter(w=>(w.holdings||[]).length>0);
  if(_workerFilter==='free')    filtered=filtered.filter(w=>!(w.holdings||[]).length);
  const tbody=document.getElementById('worker-tbody'); if(!tbody)return;
  tbody.innerHTML=filtered.length?filtered.map(w=>{
    const holdingCount=(w.holdings||[]).length;
    const status=holdingCount?`<span class="badge badge-warning">📦 ${holdingCount} material${holdingCount>1?'s':''}</span>`:`<span class="badge badge-success">✓ Free</span>`;
    return `<tr>
      <td class="td-name">${w.name}</td>
      <td class="td-mono">${w.phone||'—'}</td>
      <td><span class="badge badge-primary">${w.skill||'—'}</span></td>
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
  const wf=document.getElementById('worker-foot'); if(wf) wf.textContent=`${filtered.length} of ${workers.length} workers`;
}
function deleteWorker(id){
  const w=DB.find('workers',id); if(!w)return;
  if((w.holdings||[]).length){toast('Cannot delete — worker is holding materials. Return stock first.','danger');return;}
  if(!confirm('Delete this worker?'))return;
  DB.delete('workers',id); renderWorkers(); updateCounts(); toast('Worker deleted','warning');
}

/* ═══════════════════════════════════════════════════════════════════════════
   WORKER PROFILE
   ═══════════════════════════════════════════════════════════════════════════ */
function renderWorkerProfile(){
  const wid=_profileWorkerId;
  const pageEl=document.getElementById('page-worker-profile'); if(!pageEl)return;
  if(!wid){pageEl.innerHTML='<div class="page-inner"><div class="t-empty">No worker selected</div></div>';return;}
  const worker=DB.find('workers',wid);
  if(!worker){pageEl.innerHTML='<div class="page-inner"><div class="t-empty">Worker not found</div></div>';return;}
  const bc=document.getElementById('bc-page'); if(bc) bc.textContent=`Profile — ${worker.name}`;
  const holdings=worker.holdings||[];
  const prods=DB.where('productions',p=>p.workerId===wid);
  const fin=DB.where('finished',f=>f.workerId===wid);

  pageEl.innerHTML=`<div class="page-inner">
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.2rem">
      <button class="btn btn-ghost btn-sm" onclick="nav('workers')">← Workers</button>
      <button class="btn btn-primary btn-sm" onclick="openIssueModal('${wid}')">📦 Issue Materials</button>
      <button class="btn btn-ghost btn-sm" onclick="openProductionModal('${wid}')">✅ Record Production</button>
    </div>

    <div class="card" style="margin-bottom:1.2rem">
      <div class="card-hdr" style="background:var(--primary-light)">
        <div style="display:flex;align-items:center;gap:1rem">
          <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;font-family:var(--font-display);font-size:1.5rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">${worker.name.charAt(0).toUpperCase()}</div>
          <div>
            <div class="card-title" style="font-size:1.2rem">${worker.name}</div>
            <div style="font-size:0.78rem;color:var(--text-tertiary)">${worker.skill||'—'} · ${worker.phone||'No phone'}</div>
          </div>
        </div>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
          <div class="stat-card" style="min-width:90px;padding:0.6rem"><div class="sc-lbl">Jobs Done</div><div class="sc-val">${worker.totalJobs||0}</div></div>
          <div class="stat-card" style="min-width:90px;padding:0.6rem"><div class="sc-lbl">Total Earned</div><div class="sc-val" style="font-size:1rem">${fmtMoney(worker.totalEarned||0)}</div></div>
        </div>
      </div>
    </div>

    <div class="two-col">
      <div class="card" style="border-color:${holdings.length?'var(--warning)':'var(--border)'}">
        <div class="card-hdr" style="${holdings.length?'background:var(--warning-light)':''}">
          <span class="card-title" style="${holdings.length?'color:var(--warning)':''}">📦 Currently Holding</span>
          ${holdings.length?`<button class="btn btn-primary btn-sm" onclick="openDirectReturn('${wid}')">↩ Return to Stock</button>`:''}
        </div>
        <div class="card-body">
          ${holdings.length
            ?`<table class="data-table" style="font-size:0.8rem"><thead><tr><th>Material</th><th>Qty</th><th>Unit</th></tr></thead><tbody>
              ${holdings.map(h=>`<tr><td class="td-name">${h.mat}</td><td class="td-mono">${fmtNum(h.qty)}</td><td class="td-mono">${h.unit}</td></tr>`).join('')}
              </tbody></table>`
            :'<div class="dash-empty" style="color:var(--success)">✓ Not holding any materials</div>'}
        </div>
      </div>

      <div class="card">
        <div class="card-hdr"><span class="card-title">🪑 Finished Products</span></div>
        <div class="card-body">
          ${fin.length
            ?fin.slice(0,8).map(f=>`<div class="dash-row">
                <div><div style="font-weight:600">${f.product}</div><div style="font-size:0.7rem;font-family:var(--font-mono);color:var(--text-tertiary)">SN: ${f.serialNumber||'—'} · ${fmtDate(f.date)}</div></div>
                ${f.sold?`<span class="badge badge-success" style="font-size:0.65rem">Sold</span>`:`<button class="btn btn-primary btn-sm" onclick="openSalesModal('${f.id}')">🧾 Sell</button>`}
              </div>`).join('')
            :'<div class="dash-empty">No products yet</div>'}
        </div>
      </div>
    </div>

    <div class="card" style="margin-top:1.2rem">
      <div class="card-hdr"><span class="card-title">📋 Production History</span></div>
      <div class="card-body">
        ${prods.length
          ?`<table class="data-table" style="font-size:0.8rem"><thead><tr><th>Product</th><th>Serial</th><th>Date</th><th>Pieces</th><th>Wage</th><th>Materials Used</th></tr></thead><tbody>
            ${prods.map(p=>`<tr>
              <td class="td-name">${p.product}</td>
              <td style="font-family:var(--font-mono);font-size:0.72rem">${p.serialNumber||'—'}</td>
              <td class="td-mono">${fmtDate(p.date)}</td>
              <td class="td-mono">${p.piecesCount||1}</td>
              <td class="td-mono">${fmtMoney(p.totalWage||0)}</td>
              <td style="font-size:0.72rem">${(p.materialsUsed||[]).map(m=>`${fmtNum(m.qty)} ${m.unit} ${m.mat}`).join(', ')||'—'}</td>
            </tr>`).join('')}
            </tbody></table>`
          :'<div class="dash-empty">No production recorded yet</div>'}
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   ISSUE MATERIALS MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
let _issueRows=[], _issueWorkerId=null;
function openIssueModal(preselectedWorkerId=null){
  _issueRows=[];
  _issueWorkerId=preselectedWorkerId||null;
  document.getElementById('fi-date').value=todayStr();
  document.getElementById('fi-notes').value='';
  document.getElementById('fi-worker-search').value='';
  document.getElementById('fi-worker-id').value='';
  document.getElementById('fi-worker-holdings').innerHTML='';
  renderIssueRows();

  if(preselectedWorkerId){
    const w=DB.find('workers',preselectedWorkerId);
    if(w){ document.getElementById('fi-worker-search').value=w.name; document.getElementById('fi-worker-id').value=w.id; renderWorkerHoldingsPreview(w.id,'fi-worker-holdings'); }
  }
  const workers=DB.all('workers');
  buildCombo('fi-worker-search','fi-worker-drop',workers.map(w=>w.name),val=>{
    const w=workers.find(w=>w.name===val); if(!w)return;
    document.getElementById('fi-worker-id').value=w.id;
    _issueWorkerId=w.id;
    renderWorkerHoldingsPreview(w.id,'fi-worker-holdings');
  });
  openModal('modal-issue');
}

function renderWorkerHoldingsPreview(wid, containerId){
  const el=document.getElementById(containerId); if(!el)return;
  const w=DB.find('workers',wid); const holdings=w?.holdings||[];
  if(!holdings.length){el.innerHTML='';return;}
  el.innerHTML=`<div class="banner" style="background:var(--warning-light);border-left:3px solid var(--warning);padding:0.5rem 0.75rem;border-radius:6px;margin-bottom:0.6rem;font-size:0.78rem">
    <strong>📦 Already holding:</strong> ${holdings.map(h=>`${fmtNum(h.qty)} ${h.unit} ${h.mat}`).join(' · ')}
  </div>`;
}

function renderIssueRows(){
  const mats=DB.all('materials');
  const wrap=document.getElementById('fi-mat-rows'); if(!wrap)return;
  const warnEl=document.getElementById('fi-stock-warn');
  if(!_issueRows.length){ wrap.innerHTML=`<div style="color:var(--text-tertiary);font-size:.72rem;text-align:center;padding:.7rem;border:1px dashed var(--border);border-radius:7px">Click "+ Add Material"</div>`; if(warnEl)warnEl.innerHTML=''; return; }
  let warns=[];
  wrap.innerHTML=_issueRows.map((row,i)=>{
    const m=mats.find(m=>m.name===row.mat);
    const ok=m&&parseFloat(m.qty||0)>=parseFloat(row.qty||0);
    if(!ok&&row.mat) warns.push(`⚠ ${row.mat}: need ${row.qty}, have ${m?fmtNum(m.qty):0}`);
    const borderStyle=!ok&&row.mat?'border-color:var(--danger)':'';
    return `<div class="mat-row">
      <div class="combo-wrap"><input class="finput" id="fi-mat-${i}" value="${row.mat||''}" placeholder="Material" autocomplete="off" style="${borderStyle}"/><div class="combo-drop" id="fi-mat-drop-${i}"></div></div>
      <input class="finput" id="fi-qty-${i}" type="number" min="0" step="0.01" value="${row.qty||''}" placeholder="0" style="${borderStyle}"/>
      <input class="finput" id="fi-unit-${i}" value="${row.unit||''}" placeholder="unit" readonly/>
      <button class="row-del" onclick="issueDelRow(${i})">×</button>
    </div>`;
  }).join('');
  _issueRows.forEach((_,i)=>{
    document.getElementById(`fi-qty-${i}`)?.addEventListener('input',e=>{_issueRows[i].qty=parseFloat(e.target.value)||0;renderIssueRows();});
    document.getElementById(`fi-mat-${i}`)?.addEventListener('input',e=>{_issueRows[i].mat=e.target.value;});
    buildCombo(`fi-mat-${i}`,`fi-mat-drop-${i}`,mats.map(m=>m.name),val=>{
      _issueRows[i].mat=val;
      const m=mats.find(m=>m.name===val);
      if(m){_issueRows[i].unit=m.unit||''; const u=document.getElementById(`fi-unit-${i}`); if(u)u.value=m.unit||'';}
      renderIssueRows();
    });
  });
  if(warnEl) warnEl.innerHTML=warns.length?`<div class="banner banner-danger"><span class="banner-ico">⚠️</span><div>${warns.join('<br>')}</div></div>`:'';
}
function issueDelRow(i){_issueRows.splice(i,1);renderIssueRows();}

function saveIssuance(){
  const workerId=document.getElementById('fi-worker-id').value;
  const workerTxt=document.getElementById('fi-worker-search').value.trim();
  const date=document.getElementById('fi-date').value;
  if(!workerId&&!workerTxt){toast('Select a worker','danger');return;}
  if(!date){toast('Select a date','danger');return;}
  const valid=_issueRows.filter(r=>r.mat&&parseFloat(r.qty)>0);
  if(!valid.length){toast('Add at least one material','danger');return;}
  const outOfStock=valid.filter(r=>{const m=DB.all('materials').find(m=>m.name===r.mat);return !m||parseFloat(m.qty||0)<parseFloat(r.qty||0);});
  if(outOfStock.length){toast('Insufficient stock: '+outOfStock.map(r=>r.mat).join(', '),'danger');return;}
  const worker=workerId?DB.find('workers',workerId):null;
  const wName=worker?.name||workerTxt;
  // Deduct from stock
  valid.forEach(r=>DB.adjustStock(r.mat,-r.qty));
  // Update worker holdings
  if(worker){
    const holdings=[...(worker.holdings||[])];
    valid.forEach(r=>{
      const ex=holdings.find(h=>h.mat===r.mat&&h.unit===r.unit);
      if(ex) ex.qty=parseFloat(ex.qty)+parseFloat(r.qty);
      else holdings.push({mat:r.mat,qty:parseFloat(r.qty),unit:r.unit});
    });
    DB.update('workers',worker.id,{holdings});
  }
  // Record issuance
  DB.insert('issuances',{workerId:workerId||null,workerName:wName,date,materials:valid.map(r=>({...r})),notes:document.getElementById('fi-notes').value.trim()});
  closeModal('modal-issue');
  renderMaterials(); updateCounts();
  if(document.getElementById('page-worker-profile')?.classList.contains('active')) renderWorkerProfile();
  toast(`Materials issued to ${wName}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   DIRECT RETURN (Worker Profile → back to stock)
   ═══════════════════════════════════════════════════════════════════════════ */
let _returnWorkerId=null;
function openDirectReturn(wid){
  _returnWorkerId=wid;
  const worker=DB.find('workers',wid); if(!worker)return;
  const holdings=worker.holdings||[];
  document.getElementById('dr-sub').textContent=`Worker: ${worker.name}`;
  const rows=document.getElementById('dr-rows');
  rows.innerHTML=holdings.length
    ?holdings.map((h,i)=>`<div style="display:grid;grid-template-columns:1fr 90px 90px;gap:0.4rem;align-items:center;margin-top:0.5rem">
        <span class="er-name">${h.mat}</span>
        <span style="text-align:right;font-family:var(--font-mono);font-size:0.74rem">${fmtNum(h.qty)} ${h.unit}</span>
        <input class="finput" id="dr-qty-${i}" type="number" min="0" max="${h.qty}" step="0.01" value="${h.qty}"/>
      </div>`).join('')
    :'<div style="color:var(--text-tertiary)">No holdings</div>';
  const btn=document.getElementById('dr-confirm');
  const clone=btn.cloneNode(true); btn.parentNode.replaceChild(clone,btn);
  document.getElementById('dr-confirm').addEventListener('click',saveDirectReturn);
  openModal('modal-direct-return');
}
function saveDirectReturn(){
  const worker=DB.find('workers',_returnWorkerId); if(!worker)return;
  const holdings=[...(worker.holdings||[])];
  const remaining=[];
  let returned=0;
  holdings.forEach((h,i)=>{
    const retQty=Math.min(parseFloat(document.getElementById(`dr-qty-${i}`)?.value)||0,parseFloat(h.qty));
    const leftQty=Math.max(0,parseFloat(h.qty)-retQty);
    if(retQty>0){DB.adjustStock(h.mat,retQty);returned++;}
    if(leftQty>0) remaining.push({...h,qty:leftQty});
  });
  if(!returned){toast('No quantities entered','warning');return;}
  DB.update('workers',_returnWorkerId,{holdings:remaining});
  closeModal('modal-direct-return');
  renderWorkerProfile(); renderMaterials(); updateCounts();
  toast(`${returned} material(s) returned to stock`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: PRODUCTIONS
   ═══════════════════════════════════════════════════════════════════════════ */
let _prodMatRows=[], _prodPreselectedWorker=null;
function openProductionModal(preselectedWid=null){
  _prodMatRows=[];
  _prodPreselectedWorker=preselectedWid||null;
  document.getElementById('fp-product').value='';
  document.getElementById('fp-serial').value='';
  document.getElementById('fp-serial-status').innerHTML='';
  document.getElementById('fp-date').value=todayStr();
  document.getElementById('fp-pieces').value=1;
  document.getElementById('fp-wage-per').value='';
  document.getElementById('fp-wage-pcs').value=1;
  document.getElementById('fp-wage-total').value='';
  document.getElementById('fp-notes').value='';
  document.getElementById('fp-worker-search').value='';
  document.getElementById('fp-worker-id').value='';
  document.getElementById('fp-holdings-hint').textContent='Select a worker to see their current holdings.';
  document.getElementById('fp-holdings-preview').innerHTML='';
  renderProdMatRows();

  if(preselectedWid){
    const w=DB.find('workers',preselectedWid);
    if(w){ document.getElementById('fp-worker-search').value=w.name; document.getElementById('fp-worker-id').value=w.id; loadWorkerHoldingsForProd(w); }
  }

  const workers=DB.all('workers');
  buildCombo('fp-worker-search','fp-worker-drop',workers.map(w=>w.name),val=>{
    const w=workers.find(w=>w.name===val); if(!w)return;
    document.getElementById('fp-worker-id').value=w.id;
    loadWorkerHoldingsForProd(w);
  });

  // Serial uniqueness
  const serialEl=document.getElementById('fp-serial');
  const sc=serialEl.cloneNode(true); serialEl.parentNode.replaceChild(sc,serialEl);
  document.getElementById('fp-serial').addEventListener('input',e=>{
    const val=e.target.value.trim(), st=document.getElementById('fp-serial-status');
    if(!val){st.innerHTML='';return;}
    st.innerHTML=DB.isSerialUnique(val)?`<span style="color:var(--success)">✓ Available</span>`:`<span style="color:var(--danger)">✕ Already used</span>`;
  });

  // Wage calc
  const calcWage=()=>{
    const per=parseFloat(document.getElementById('fp-wage-per').value)||0;
    const pcs=parseFloat(document.getElementById('fp-wage-pcs').value)||1;
    document.getElementById('fp-wage-total').value=(per*pcs).toFixed(0);
  };
  ['fp-wage-per','fp-wage-pcs'].forEach(id=>{
    const el=document.getElementById(id); const cl=el.cloneNode(true); el.parentNode.replaceChild(cl,el);
    document.getElementById(id).addEventListener('input',calcWage);
  });

  openModal('modal-production');
  setTimeout(()=>document.getElementById('fp-product')?.focus(),100);
}

function loadWorkerHoldingsForProd(worker){
  const holdings=worker.holdings||[];
  const hint=document.getElementById('fp-holdings-hint');
  const preview=document.getElementById('fp-holdings-preview');
  if(!holdings.length){
    if(hint) hint.textContent=`${worker.name} has no materials currently. Issue materials first.`;
    if(preview) preview.innerHTML='';
    _prodMatRows=[];
    renderProdMatRows();
    return;
  }
  if(hint) hint.textContent=`Select which materials ${worker.name} used from their current holdings:`;
  if(preview) preview.innerHTML=`<div class="banner" style="background:var(--primary-light);border-left:3px solid var(--primary);padding:0.5rem 0.75rem;border-radius:6px;margin-bottom:0.5rem;font-size:0.78rem">
    <strong>📦 Holdings:</strong> ${holdings.map(h=>`${fmtNum(h.qty)} ${h.unit} ${h.mat}`).join(' · ')}
  </div>`;
  // Pre-populate rows from holdings
  _prodMatRows=holdings.map(h=>({mat:h.mat,qty:h.qty,unit:h.unit,maxQty:h.qty}));
  renderProdMatRows();
}

function renderProdMatRows(){
  const wrap=document.getElementById('fp-mat-rows'); if(!wrap)return;
  if(!_prodMatRows.length){wrap.innerHTML=`<div style="color:var(--text-tertiary);font-size:.72rem;text-align:center;padding:.7rem;border:1px dashed var(--border);border-radius:7px">Click "+ Add Material Used"</div>`;return;}
  wrap.innerHTML=_prodMatRows.map((row,i)=>`
    <div style="display:grid;grid-template-columns:1fr 100px 100px 30px;gap:0.4rem;align-items:center;margin-top:0.4rem">
      <input class="finput" id="fm-pmat-${i}" value="${row.mat||''}" placeholder="Material name" style="font-size:0.82rem"/>
      <span style="text-align:right;font-family:var(--font-mono);font-size:0.72rem;color:var(--text-tertiary)">${row.maxQty?`max ${fmtNum(row.maxQty)} ${row.unit}`:''}</span>
      <input class="finput" id="fm-pqty-${i}" type="number" min="0" max="${row.maxQty||99999}" step="0.01" value="${row.qty||''}" placeholder="0"/>
      <button class="row-del" onclick="prodDelRow(${i})">×</button>
    </div>`).join('');
  _prodMatRows.forEach((_,i)=>{
    document.getElementById(`fm-pmat-${i}`)?.addEventListener('input',e=>{_prodMatRows[i].mat=e.target.value;});
    document.getElementById(`fm-pqty-${i}`)?.addEventListener('input',e=>{_prodMatRows[i].qty=parseFloat(e.target.value)||0;});
  });
}
function prodDelRow(i){_prodMatRows.splice(i,1);renderProdMatRows();}

function saveProduction(){
  const workerId=document.getElementById('fp-worker-id').value;
  const workerTxt=document.getElementById('fp-worker-search').value.trim();
  const product=document.getElementById('fp-product').value.trim();
  const serial=document.getElementById('fp-serial').value.trim();
  const date=document.getElementById('fp-date').value;
  const pieces=parseInt(document.getElementById('fp-pieces').value)||1;
  const wagePer=parseFloat(document.getElementById('fp-wage-per').value)||0;
  const wagePcs=parseFloat(document.getElementById('fp-wage-pcs').value)||1;
  const totalWage=parseFloat(document.getElementById('fp-wage-total').value)||wagePer*wagePcs;

  if(!workerId&&!workerTxt){toast('Select a worker','danger');return;}
  if(!product){toast('Enter product name','danger');return;}
  if(!serial){toast('Enter a serial number','danger');return;}
  if(!DB.isSerialUnique(serial)){toast('Serial number already used!','danger');return;}
  if(!date){toast('Select a date','danger');return;}

  const materialsUsed=_prodMatRows.filter(r=>r.mat&&parseFloat(r.qty)>0).map(r=>({mat:r.mat,qty:parseFloat(r.qty),unit:r.unit||''}));

  const worker=workerId?DB.find('workers',workerId):null;
  const wName=worker?.name||workerTxt;

  // Deduct from worker holdings
  if(worker){
    const holdings=[...(worker.holdings||[])];
    materialsUsed.forEach(mu=>{
      const h=holdings.find(h=>h.mat===mu.mat);
      if(h){h.qty=Math.max(0,parseFloat(h.qty)-parseFloat(mu.qty));}
    });
    const remaining=holdings.filter(h=>parseFloat(h.qty)>0);
    DB.update('workers',worker.id,{
      holdings:remaining,
      totalJobs:(worker.totalJobs||0)+1,
      totalEarned:(worker.totalEarned||0)+totalWage,
    });
  }

  // Create production record
  const prod=DB.insert('productions',{workerId:workerId||null,workerName:wName,product,serialNumber:serial,date,piecesCount:pieces,wagePerPiece:wagePer,totalWage,materialsUsed,notes:document.getElementById('fp-notes').value.trim()});

  // Create finished goods record
  DB.insert('finished',{productionId:prod.id,workerId:workerId||null,workerName:wName,product,serialNumber:serial,date,totalWage,materialsUsed,sold:false});

  closeModal('modal-production');
  renderProductions(); renderWorkers(); renderFinished(); updateCounts();
  if(document.getElementById('page-worker-profile')?.classList.contains('active')) renderWorkerProfile();
  toast(`"${product}" (SN:${serial}) recorded — ${wName}`);
}

function renderProductions(){
  const prods=DB.all('productions');
  const search=(document.getElementById('prod-search')?.value||'').toLowerCase();
  const filtered=prods.filter(p=>(p.product||'').toLowerCase().includes(search)||(p.workerName||'').toLowerCase().includes(search)||(p.serialNumber||'').toLowerCase().includes(search));
  const listEl=document.getElementById('prod-list'); if(!listEl)return;
  if(!filtered.length){listEl.innerHTML=`<div class="table-card"><div class="t-empty"><span class="t-empty-ico">🏭</span>${prods.length?'No results':'No production recorded yet'}</div></div>`;return;}
  listEl.innerHTML=`<div class="table-card"><table class="data-table">
    <thead><tr><th>Product</th><th>Serial</th><th>Worker</th><th>Date</th><th>Pieces</th><th>Wage</th><th>Materials Used</th></tr></thead>
    <tbody>${filtered.map(p=>`<tr>
      <td class="td-name">${p.product}</td>
      <td style="font-family:var(--font-mono);font-size:0.75rem">${p.serialNumber||'—'}</td>
      <td><button class="card-link" onclick="nav('worker-profile','${p.workerId}')">${p.workerName}</button></td>
      <td class="td-mono">${fmtDate(p.date)}</td>
      <td class="td-mono">${p.piecesCount||1}</td>
      <td class="td-mono">${fmtMoney(p.totalWage||0)}</td>
      <td style="font-size:0.75rem">${(p.materialsUsed||[]).map(m=>`${fmtNum(m.qty)} ${m.unit} ${m.mat}`).join(', ')||'—'}</td>
    </tr>`).join('')}
    </tbody>
  </table><div class="table-foot"><span>${filtered.length} of ${prods.length} entries</span></div></div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: FINISHED GOODS
   ═══════════════════════════════════════════════════════════════════════════ */
function renderFinished(){
  const fin=DB.all('finished');
  const search=(document.getElementById('fg-search')?.value||'').toLowerCase();
  const filtered=fin.filter(f=>(f.product||'').toLowerCase().includes(search)||(f.workerName||'').toLowerCase().includes(search)||(f.serialNumber||'').toLowerCase().includes(search));

  const totalWage=fin.reduce((s,f)=>s+parseFloat(f.totalWage||0),0);
  const inStock=fin.filter(f=>!f.sold).length;

  const statsEl=document.getElementById('fg-stats');
  if(statsEl) statsEl.innerHTML=`
    <div class="stat-card"><span class="sc-ico">✅</span><div class="sc-lbl">Total Produced</div><div class="sc-val">${fin.length}</div></div>
    <div class="stat-card"><span class="sc-ico">📦</span><div class="sc-lbl">In Stock</div><div class="sc-val" style="color:var(--primary)">${inStock}</div></div>
    <div class="stat-card"><span class="sc-ico">🧾</span><div class="sc-lbl">Sold</div><div class="sc-val" style="color:var(--success)">${fin.length-inStock}</div></div>
    <div class="stat-card"><span class="sc-ico">💳</span><div class="sc-lbl">Wages Paid</div><div class="sc-val" style="font-size:1.2rem">${fmtMoney(totalWage)}</div></div>
  `;

  // Product summary table
  const productMap={};
  fin.forEach(f=>{ const k=f.product; if(!productMap[k]) productMap[k]={name:k,total:0,inStock:0,sold:0}; productMap[k].total++; f.sold?productMap[k].sold++:productMap[k].inStock++; });
  const summaryRows=Object.values(productMap).sort((a,b)=>b.total-a.total);

  const list=document.getElementById('fg-list'); if(!list)return;
  list.innerHTML=(summaryRows.length?`
    <div class="card" style="margin-bottom:1.2rem">
      <div class="card-hdr"><span class="card-title">📊 Product Summary</span></div>
      <div class="card-body" style="padding:0">
        <table class="data-table">
          <thead><tr><th>Product Name</th><th style="text-align:center">Total</th><th style="text-align:center">In Stock</th><th style="text-align:center">Sold</th></tr></thead>
          <tbody>${summaryRows.map(p=>`<tr>
            <td class="td-name">${p.name}</td>
            <td class="td-mono" style="text-align:center"><strong>${p.total}</strong></td>
            <td class="td-mono" style="text-align:center;color:var(--primary)">${p.inStock}</td>
            <td class="td-mono" style="text-align:center;color:var(--success)">${p.sold}</td>
          </tr>`).join('')}</tbody>
        </table>
      </div>
    </div>`:'')
  +(filtered.length?filtered.map(f=>`
    <div class="fg-card">
      <div class="fg-icon">🪑</div>
      <div class="fg-body">
        <div class="fg-product">${f.product}</div>
        <div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-tertiary);margin-bottom:0.2rem">📟 SN: ${f.serialNumber||'—'}</div>
        <div class="fg-meta">
          <span>👷 ${f.workerName}</span>
          <span>📅 ${fmtDate(f.date)}</span>
          ${f.sold?`<span class="badge badge-success" style="font-size:0.65rem">🧾 Sold</span>`:`<span class="badge badge-info" style="font-size:0.65rem">📦 In Stock</span>`}
        </div>
        <div class="fg-wage">💳 Wage: ${fmtMoney(f.totalWage||0)}</div>
        ${(f.materialsUsed||[]).length?`<div style="font-size:0.72rem;color:var(--text-tertiary);margin-top:0.2rem">📦 ${f.materialsUsed.map(m=>`${fmtNum(m.qty)} ${m.unit} ${m.mat}`).join(', ')}</div>`:''}
      </div>
      <div class="acts" style="flex-shrink:0;flex-direction:column;gap:0.4rem">
        ${!f.sold?`<button class="btn btn-primary btn-sm" onclick="openSalesModal('${f.id}')">🧾 Sell</button>`:''}
        <button class="act-btn danger" onclick="deleteFG('${f.id}')">🗑</button>
      </div>
    </div>`).join('')
  :`<div class="table-card"><div class="t-empty"><span class="t-empty-ico">✅</span>${fin.length?'No results':'No finished goods yet'}</div></div>`);
}
function deleteFG(id){ if(!confirm('Delete this record?'))return; DB.delete('finished',id); renderFinished(); updateCounts(); toast('Record deleted','warning'); }

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: SALES
   ═══════════════════════════════════════════════════════════════════════════ */
let _salesFGId=null;
function openSalesModal(fgId){
  _salesFGId=fgId||null;
  ['fsl-buyer-name','fsl-buyer-phone','fsl-buyer-addr','fsl-billno'].forEach(id=>{const el=document.getElementById(id);if(el)el.value='';});
  document.getElementById('fsl-date').value=todayStr();
  document.getElementById('fsl-buyer-type').value='Shop';
  document.getElementById('fsl-serial').value='';
  document.getElementById('fsl-amount').value='';
  document.getElementById('fsl-tax-pct').value='0';
  document.getElementById('fsl-total').value='';
  document.getElementById('fsl-product-preview').innerHTML='';
  document.getElementById('fsl-tax-breakdown').style.display='none';

  const calcTotal=()=>{
    const base=parseFloat(document.getElementById('fsl-amount').value)||0;
    const pct=parseFloat(document.getElementById('fsl-tax-pct').value)||0;
    const tax=base*pct/100; const tot=base+tax;
    document.getElementById('fsl-total').value=tot.toFixed(2);
    const bd=document.getElementById('fsl-tax-breakdown');
    if(pct>0&&base>0){bd.style.display='block';bd.innerHTML=`Base: ${fmtMoney(base)} + Tax (${pct}%): ${fmtMoney(tax)} = <strong>${fmtMoney(tot)}</strong>`;}
    else bd.style.display='none';
  };
  ['fsl-amount','fsl-tax-pct'].forEach(id=>{
    const el=document.getElementById(id); const cl=el.cloneNode(true); el.parentNode.replaceChild(cl,el);
    document.getElementById(id).addEventListener('input',calcTotal);
  });

  const unsold=DB.all('finished').filter(f=>!f.sold);
  if(fgId){ const fg=DB.find('finished',fgId); if(fg?.serialNumber){document.getElementById('fsl-serial').value=fg.serialNumber; showSalesPreview(fg);} }
  buildCombo('fsl-serial','fsl-serial-drop',unsold.map(f=>f.serialNumber).filter(Boolean),val=>{
    const fg=unsold.find(f=>f.serialNumber===val); if(fg){_salesFGId=fg.id;showSalesPreview(fg);}
  });

  const btn=document.getElementById('sl-save'); const cl=btn.cloneNode(true); btn.parentNode.replaceChild(cl,btn);
  document.getElementById('sl-save').addEventListener('click',saveSalesBill);
  openModal('modal-sales');
}
function showSalesPreview(fg){
  document.getElementById('fsl-product-preview').innerHTML=`<div class="banner" style="background:var(--primary-light);border-left:3px solid var(--primary);padding:0.5rem 0.75rem;border-radius:6px;font-size:0.78rem">
    <strong>${fg.product}</strong> · Worker: ${fg.workerName} · Date: ${fmtDate(fg.date)}
    ${(fg.materialsUsed||[]).length?`<div style="margin-top:0.2rem;color:var(--text-tertiary)">Materials: ${fg.materialsUsed.map(m=>`${fmtNum(m.qty)} ${m.unit} ${m.mat}`).join(', ')}</div>`:''}
  </div>`;
}
function saveSalesBill(){
  const serial=document.getElementById('fsl-serial').value.trim();
  const buyerName=document.getElementById('fsl-buyer-name').value.trim();
  const date=document.getElementById('fsl-date').value;
  const baseAmt=parseFloat(document.getElementById('fsl-amount').value)||0;
  if(!serial){toast('Enter serial number','danger');return;}
  if(!buyerName){toast('Enter buyer name','danger');return;}
  if(!date){toast('Select date','danger');return;}
  if(!baseAmt){toast('Enter sale amount','danger');return;}
  let fg=_salesFGId?DB.find('finished',_salesFGId):null;
  if(!fg) fg=DB.all('finished').find(f=>f.serialNumber===serial);
  if(!fg){toast('Product not found','danger');return;}
  if(fg.sold){toast('Already sold!','danger');return;}
  const taxPct=parseFloat(document.getElementById('fsl-tax-pct').value)||0;
  const taxAmt=baseAmt*taxPct/100;
  const totalAmount=baseAmt+taxAmt;
  const buyerType=document.getElementById('fsl-buyer-type').value;
  const billno=document.getElementById('fsl-billno').value.trim();
  DB.insert('sales',{billno,date,buyerType,buyerName,buyerPhone:document.getElementById('fsl-buyer-phone').value.trim(),buyerAddr:document.getElementById('fsl-buyer-addr').value.trim(),serialNumber:serial,product:fg.product,workerId:fg.workerId,workerName:fg.workerName,materialsUsed:fg.materialsUsed,fgId:fg.id,amount:baseAmt,taxPct,taxAmt,totalAmount});
  DB.update('finished',fg.id,{sold:true,soldDate:date,buyerName,buyerType});
  closeModal('modal-sales'); renderSales(); renderFinished(); updateCounts();
  toast(`Bill created — ${fg.product} → ${buyerType}: ${buyerName} · ${fmtMoney(totalAmount)}`);
}
function renderSales(){
  const allSales=DB.all('sales');
  const search=(document.getElementById('sales-search')?.value||'').toLowerCase();
  const sales=allSales.filter(sl=>(sl.product||'').toLowerCase().includes(search)||(sl.serialNumber||'').toLowerCase().includes(search)||(sl.buyerName||'').toLowerCase().includes(search));
  const totalRev=allSales.reduce((s,sl)=>s+parseFloat(sl.totalAmount||sl.amount||0),0);
  const statsEl=document.getElementById('sales-stats');
  if(statsEl) statsEl.innerHTML=`
    <div class="stat-card"><span class="sc-ico">🧾</span><div class="sc-lbl">Total Bills</div><div class="sc-val">${allSales.length}</div></div>
    <div class="stat-card"><span class="sc-ico">💰</span><div class="sc-lbl">Revenue</div><div class="sc-val" style="font-size:1.2rem;color:var(--success)">${fmtMoney(totalRev)}</div></div>
    <div class="stat-card"><span class="sc-ico">🏪</span><div class="sc-lbl">Shops</div><div class="sc-val">${allSales.filter(s=>s.buyerType==='Shop').length}</div></div>
    <div class="stat-card"><span class="sc-ico">👤</span><div class="sc-lbl">Customers</div><div class="sc-val">${allSales.filter(s=>s.buyerType==='Customer').length}</div></div>
  `;
  const listEl=document.getElementById('sales-list'); if(!listEl)return;
  if(!allSales.length){listEl.innerHTML=`<div class="table-card"><div class="t-empty"><span class="t-empty-ico">🧾</span>No sales bills yet</div></div>`;return;}
  if(!sales.length){listEl.innerHTML=`<div class="table-card"><div class="t-empty"><span class="t-empty-ico">🔍</span>No results</div></div>`;return;}
  listEl.innerHTML=sales.map(sl=>`
    <div class="wo-card">
      <div class="wo-card-hdr">
        <div class="wc-left">
          <div class="wc-id" style="font-family:var(--font-mono)">${sl.serialNumber}</div>
          <div class="wc-worker">${sl.buyerType==='Shop'?'🏪':'👤'} ${sl.buyerName} ${sl.buyerPhone?'· '+sl.buyerPhone:''}</div>
          ${sl.buyerAddr?`<div class="wc-notes">${sl.buyerAddr}</div>`:''}
        </div>
        <div class="wc-badges"><div style="text-align:right">
          ${sl.taxPct>0?`<div style="font-size:0.68rem;color:var(--text-tertiary)">${fmtMoney(sl.amount)} + ${sl.taxPct}% tax</div>`:''}
          <div style="font-weight:700;color:var(--primary);font-family:var(--font-mono);font-size:1rem">${fmtMoney(sl.totalAmount||sl.amount)}</div>
        </div></div>
      </div>
      <div class="wo-card-body">
        <div class="wo-meta"><div class="wm-lbl">Product</div><div class="wm-val">${sl.product}</div></div>
        <div class="wo-meta"><div class="wm-lbl">Worker</div><div class="wm-val">${sl.workerName}</div></div>
        <div class="wo-meta"><div class="wm-lbl">Date</div><div class="wm-val">${fmtDate(sl.date)}</div></div>
        ${sl.billno?`<div class="wo-meta"><div class="wm-lbl">Bill No.</div><div class="wm-val">${sl.billno}</div></div>`:''}
      </div>
      <div class="wo-card-foot"><div class="acts">
        <button class="btn btn-ghost btn-sm" onclick="printSalesBill('${sl.id}')">🖨 Print</button>
        <button class="act-btn danger" onclick="deleteSale('${sl.id}')">🗑</button>
      </div></div>
    </div>`).join('');
}
function printSalesBill(id){
  const sl=DB.find('sales',id); if(!sl)return;
  const win=window.open('','_blank');
  win.document.write(`<!DOCTYPE html><html><head><title>Bill — ${sl.serialNumber}</title>
  <style>body{font-family:Arial,sans-serif;padding:30px;color:#000;font-size:13px}h1{color:#0d47a1;margin-bottom:4px}.sub{color:#555;margin-bottom:20px;font-size:11px}.block{border:1px solid #ddd;border-radius:8px;padding:14px;margin-bottom:14px}.label{font-weight:bold;color:#555;font-size:11px;text-transform:uppercase;letter-spacing:1px}.val{font-size:14px;margin-top:2px}.row{display:flex;gap:30px;flex-wrap:wrap}.col{flex:1;min-width:120px}.total{font-size:1.4rem;font-weight:bold;color:#0d47a1;margin-top:10px;text-align:right}.mat-row{display:flex;justify-content:space-between;padding:4px 0;border-bottom:1px solid #eee}.footer{margin-top:30px;font-size:10px;color:#999;text-align:center}</style>
  </head><body>
  <h1>Vishnupriyaa Industries</h1>
  <div class="sub">Sales Bill${sl.billno?' · #'+sl.billno:''} · ${fmtDate(sl.date)}</div>
  <div class="block"><div class="label">Product</div><div class="val">${sl.product}</div><div style="font-size:11px;font-family:monospace;color:#555;margin-top:3px">Serial: ${sl.serialNumber}</div></div>
  <div class="block"><div class="label">Buyer</div><div class="row" style="margin-top:6px">
    <div class="col"><div class="label">Type</div><div class="val">${sl.buyerType}</div></div>
    <div class="col"><div class="label">Name</div><div class="val">${sl.buyerName}</div></div>
    ${sl.buyerPhone?`<div class="col"><div class="label">Phone</div><div class="val">${sl.buyerPhone}</div></div>`:''}
  </div>${sl.buyerAddr?`<div style="margin-top:8px"><div class="label">Address</div><div class="val">${sl.buyerAddr}</div></div>`:''}</div>
  ${(sl.materialsUsed||[]).length?`<div class="block"><div class="label">Materials Used</div><div style="margin-top:8px">${sl.materialsUsed.map(m=>`<div class="mat-row"><span>${m.mat}</span><span>${m.qty} ${m.unit}</span></div>`).join('')}</div></div>`:''}
  <div class="block"><div class="label">Worker</div><div class="val">${sl.workerName}</div></div>
  <div class="total">
    ${sl.taxPct>0?`<div style="font-size:0.9rem;font-weight:normal;color:#555;margin-bottom:4px">Base: ₹${parseFloat(sl.amount).toLocaleString('en-IN',{minimumFractionDigits:2})}</div><div style="font-size:0.9rem;font-weight:normal;color:#555;margin-bottom:4px">Tax (${sl.taxPct}%): ₹${parseFloat(sl.taxAmt||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</div>`:''}
    Total: ₹${parseFloat(sl.totalAmount||sl.amount).toLocaleString('en-IN',{minimumFractionDigits:2})}
  </div>
  <div class="footer">Vishnupriyaa Industries BMS · ${new Date().toLocaleDateString('en-IN')}</div>
  </body></html>`);
  win.document.close(); setTimeout(()=>win.print(),400);
}
function deleteSale(id){
  const sl=DB.find('sales',id); if(!sl)return;
  if(!confirm('Delete this sales bill? Product will be marked as unsold.'))return;
  DB.delete('sales',id);
  if(sl.fgId) DB.update('finished',sl.fgId,{sold:false,soldDate:null,buyerName:null,buyerType:null});
  renderSales(); renderFinished(); updateCounts(); toast('Sales bill deleted','warning');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: REPORTS
   ═══════════════════════════════════════════════════════════════════════════ */
function renderReports(){
  const mats=DB.all('materials'), workers=DB.all('workers'), fin=DB.all('finished'), sales=DB.all('sales');
  const stockVal=mats.reduce((s,m)=>s+parseFloat(m.qty||0)*parseFloat(m.unitCost||0),0);
  const totalWages=DB.all('productions').reduce((s,p)=>s+parseFloat(p.totalWage||0),0);
  const totalSales=sales.reduce((s,sl)=>s+parseFloat(sl.totalAmount||sl.amount||0),0);
  const body=document.getElementById('report-summary-body'); if(!body)return;
  body.innerHTML=`
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:.9rem">
      <div class="stat-card"><span class="sc-ico">📦</span><div class="sc-lbl">Stock Value</div><div class="sc-val" style="font-size:1.1rem">${fmtMoney(stockVal)}</div></div>
      <div class="stat-card"><span class="sc-ico">👷</span><div class="sc-lbl">Workers</div><div class="sc-val">${workers.length}</div></div>
      <div class="stat-card"><span class="sc-ico">🏭</span><div class="sc-lbl">Productions</div><div class="sc-val">${DB.all('productions').length}</div></div>
      <div class="stat-card"><span class="sc-ico">💳</span><div class="sc-lbl">Total Wages</div><div class="sc-val" style="font-size:1.1rem">${fmtMoney(totalWages)}</div></div>
      <div class="stat-card"><span class="sc-ico">💰</span><div class="sc-lbl">Sales Revenue</div><div class="sc-val" style="font-size:1.1rem;color:var(--success)">${fmtMoney(totalSales)}</div></div>
      <div class="stat-card" style="border-color:${totalSales-totalWages>=0?'var(--success)':'var(--danger)'}">
        <span class="sc-ico">${totalSales-totalWages>=0?'📈':'📉'}</span>
        <div class="sc-lbl">Gross Profit</div>
        <div class="sc-val" style="font-size:1.1rem;color:${totalSales-totalWages>=0?'var(--success)':'var(--danger)'}">${fmtMoney(totalSales-totalWages)}</div>
        <div class="sc-sub">Revenue − Wages</div>
      </div>
      <div class="stat-card"><span class="sc-ico">⚠️</span><div class="sc-lbl">Low/Out Stock</div><div class="sc-val" style="color:${mats.filter(m=>stockStatus(m)!=='ok').length?'var(--warning)':'var(--success)'}">${mats.filter(m=>stockStatus(m)!=='ok').length}</div></div>
    </div>`;
}
function exportDataJSON(){
  const data=DB.exportAll();
  const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
  const url=URL.createObjectURL(blob);
  const a=Object.assign(document.createElement('a'),{href:url,download:`VI-BMS-backup-${todayStr()}.json`});
  a.click(); URL.revokeObjectURL(url);
  toast('Data exported as backup');
}
function importDataJSON(file){
  if(!file)return;
  const reader=new FileReader();
  reader.onload=e=>{
    try{
      const data=JSON.parse(e.target.result);
      if(!confirm(`Import data from ${data.exportedAt?new Date(data.exportedAt).toLocaleString('en-IN'):'unknown date'}?\nThis will REPLACE all current data.`))return;
      DB.importAll(data);
      location.reload();
    }catch{toast('Invalid backup file','danger');}
  };
  reader.readAsText(file);
}
function confirmDeleteAllData(){
  if(!confirm('⚠ Delete ALL data? This CANNOT be undone.'))return;
  if(!confirm('Last chance — click OK to erase everything.'))return;
  DB.clearAll(); updateCounts(); renderDashboard(); toast('All data deleted','warning');
}

/* ═══════════════════════════════════════════════════════════════════════════
   INIT
   ═══════════════════════════════════════════════════════════════════════════ */
document.addEventListener('DOMContentLoaded',()=>{
  createModals();

  // Sidebar toggle
  document.getElementById('menu-toggle')?.addEventListener('click',()=>{
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('page-overlay').classList.toggle('show');
  });
  document.getElementById('page-overlay')?.addEventListener('click',()=>{
    document.getElementById('sidebar').classList.remove('open');
    document.getElementById('page-overlay').classList.remove('show');
  });

  // Nav
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn=>btn.addEventListener('click',()=>nav(btn.dataset.page)));

  // Materials
  document.getElementById('mat-search')?.addEventListener('input',renderMaterials);
  document.querySelectorAll('#mat-pills .tpill').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('#mat-pills .tpill').forEach(x=>x.classList.remove('active')); b.classList.add('active'); _matFilter=b.dataset.val; renderMaterials();
  }));
  document.getElementById('mat-save')?.addEventListener('click',saveMat);

  // Suppliers
  document.getElementById('sup-search')?.addEventListener('input',renderSuppliers);
  document.getElementById('sup-add-row')?.addEventListener('click',()=>{_supRows.push({mat:'',qty:0,unit:'',price:0});renderSupRows();});
  document.getElementById('sup-save')?.addEventListener('click',saveSupplierBill);

  // Workers
  document.getElementById('worker-search')?.addEventListener('input',renderWorkers);
  document.querySelectorAll('#worker-pills .tpill').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('#worker-pills .tpill').forEach(x=>x.classList.remove('active')); b.classList.add('active'); _workerFilter=b.dataset.val; renderWorkers();
  }));
  document.getElementById('worker-save')?.addEventListener('click',saveWorker);

  // Issue
  document.getElementById('fi-add-row')?.addEventListener('click',()=>{_issueRows.push({mat:'',qty:0,unit:''});renderIssueRows();});
  document.getElementById('fi-save')?.addEventListener('click',saveIssuance);

  // Production
  document.getElementById('fp-add-row')?.addEventListener('click',()=>{_prodMatRows.push({mat:'',qty:'',unit:''});renderProdMatRows();});
  document.getElementById('fp-save')?.addEventListener('click',saveProduction);

  // Production search
  document.getElementById('prod-search')?.addEventListener('input',renderProductions);

  // Finished
  document.getElementById('fg-search')?.addEventListener('input',renderFinished);

  // Sales
  document.getElementById('sales-search')?.addEventListener('input',renderSales);

  // Import
  document.getElementById('import-file-input')?.addEventListener('change',e=>importDataJSON(e.target.files[0]));

  updateDate(); scheduleDateRefresh(); updateCounts(); nav('dashboard');
});
