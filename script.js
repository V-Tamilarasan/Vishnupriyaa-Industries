'use strict';

/* ═══════════════════════════════════════════════════════════════════════════
   DATABASE LAYER
   ═══════════════════════════════════════════════════════════════════════════ */
const DB = (() => {
  const PREFIX = 'vi_bms_';
  const COLS = ['materials', 'bills', 'presets', 'workers', 'workorders', 'finished', 'sales'];

  const _cache = {};
  COLS.forEach(c => {
    try { _cache[c] = JSON.parse(localStorage.getItem(PREFIX + c) || '[]'); }
    catch { _cache[c] = []; }
  });

  const persist = col => {
    try {
      localStorage.setItem(PREFIX + col, JSON.stringify(_cache[col]));
    } catch (e) {
      console.warn('Storage full:', e);
      // toast is defined later — use setTimeout to call it after init
      setTimeout(() => toast('Storage full — data may not be saved!', 'danger'), 100);
    }
  };

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  return {
    all: col => [...(_cache[col] || [])],
    find: (col, id) => (_cache[col] || []).find(d => d.id === id) || null,
    insert: (col, data) => {
      const doc = { id: uid(), createdAt: Date.now(), ...data };
      _cache[col].unshift(doc);
      persist(col);
      return doc;
    },
    update: (col, id, data) => {
      const idx = (_cache[col] || []).findIndex(d => d.id === id);
      if (idx === -1) return null;
      _cache[col][idx] = { ..._cache[col][idx], ...data, updatedAt: Date.now() };
      persist(col);
      return _cache[col][idx];
    },
    delete: (col, id) => {
      const before = (_cache[col] || []).length;
      _cache[col] = (_cache[col] || []).filter(d => d.id !== id);
      persist(col);
      return (_cache[col] || []).length < before;
    },
    where: (col, fn) => (_cache[col] || []).filter(fn),
    uid,
    adjustStock: (materialName, delta) => {
      const m = (_cache.materials || []).find(m => m.name === materialName);
      if (!m) return;
      m.qty = Math.max(0, parseFloat(m.qty || 0) + parseFloat(delta));
      persist('materials');
    },
    applyBill: items => {
      items.forEach(item => {
        const existing = (_cache.materials || []).find(m => m.name === item.mat);
        if (existing) {
          existing.qty = parseFloat(existing.qty || 0) + parseFloat(item.qty);
          if (item.unit && !existing.unit) existing.unit = item.unit;
          if (item.price && !existing.unitCost) existing.unitCost = item.price;
        } else {
          _cache.materials.unshift({
            id: uid(),
            createdAt: Date.now(),
            name: item.mat,
            category: '',
            unit: item.unit || '',
            qty: parseFloat(item.qty),
            minLevel: 10,
            unitCost: item.price || 0,
          });
        }
      });
      persist('materials');
    },
    clearAll: () => {
      COLS.forEach(c => { _cache[c] = []; localStorage.removeItem(PREFIX + c); });
    },
    isSerialUnique: (serial) => {
      return !(_cache.finished || []).some(f => f.serialNumber === serial);
    }
  };
})();

/* ═══════════════════════════════════════════════════════════════════════════
   HELPERS & UTILITIES
   ═══════════════════════════════════════════════════════════════════════════ */
const fmtMoney = v => '₹' + parseFloat(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtNum   = v => parseFloat(v || 0).toLocaleString('en-IN');
const fmtDate  = ds => ds ? new Date(ds + 'T12:00:00').toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
const todayStr = () => new Date().toISOString().slice(0, 10);

function stockStatus(m) {
  const q = parseFloat(m.qty || 0);
  const mn = parseFloat(m.minLevel || 0);
  if (q <= 0) return 'out';
  if (q <= mn) return 'low';
  return 'ok';
}

function stockBadge(m) {
  const s = stockStatus(m);
  if (s === 'out') return `<span class="badge badge-danger">✕ Out</span>`;
  if (s === 'low') return `<span class="badge badge-warning">⚠ Low</span>`;
  return `<span class="badge badge-success">✓ Ok</span>`;
}

function statusBadge(status) {
  const map = {
    'Materials Issued': ['badge-info',    '📦 Materials Issued'],
    'Assigned':         ['badge-info',    '📦 Materials Issued'],   /* legacy compat */
    'In Progress':      ['badge-warning', '📦 Materials Issued'],   /* legacy compat */
    'Done':             ['badge-primary', '🏁 Done'],
    'Approved':         ['badge-success', '✅ Approved'],
  };
  const [cls, lbl] = map[status] || ['badge-gray', status];
  return `<span class="badge ${cls}">${lbl}</span>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   TOAST NOTIFICATIONS
   ═══════════════════════════════════════════════════════════════════════════ */
function toast(msg, type = 'success') {
  const wrap = document.getElementById('toast-wrap');
  if (!wrap) return;
  const el = document.createElement('div');
  el.className = `toast t-${type}`;
  const icons = { success: '✅', danger: '❌', warning: '⚠️' };
  el.innerHTML = `<span>${icons[type] || '✅'}</span><span>${msg}</span>`;
  wrap.appendChild(el);
  requestAnimationFrame(() => { requestAnimationFrame(() => el.classList.add('show')); });
  setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 400); }, 3800);
}

/* ═══════════════════════════════════════════════════════════════════════════
   MODAL MANAGEMENT
   ═══════════════════════════════════════════════════════════════════════════ */
function openModal(id)  { document.getElementById(id)?.classList.add('open'); }
function closeModal(id) { document.getElementById(id)?.classList.remove('open'); }

/* Close any open modal on Escape key */
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal-backdrop.open').forEach(m => m.classList.remove('open'));
  }
});

function createModals() {
  const container = document.getElementById('modals-container');
  container.innerHTML = `
    <!-- MATERIAL MODAL -->
    <div class="modal-backdrop" id="modal-material">
      <div class="modal">
        <div class="modal-hdr">
          <div><h3 class="modal-title" id="mat-modal-ttl">Add Raw Material</h3><p class="modal-sub">Define a new inventory material</p></div>
          <button class="modal-close" onclick="closeModal('modal-material')">×</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="field-group fg-full">
              <label>Material Name *</label>
              <input class="finput" id="fm-name" type="text" placeholder="e.g. Teak Wood, Plywood…"/>
            </div>
          </div>
          <div class="form-row">
            <div class="field-group">
              <label>Category *</label>
              <div class="combo-wrap">
                <input class="finput" id="fm-cat" type="text" placeholder="Wood, Polish…" autocomplete="off"/>
                <div class="combo-drop" id="fm-cat-drop"></div>
              </div>
            </div>
            <div class="field-group">
              <label>Unit *</label>
              <div class="combo-wrap">
                <input class="finput" id="fm-unit" type="text" placeholder="kg, feet, pcs…" autocomplete="off"/>
                <div class="combo-drop" id="fm-unit-drop"></div>
              </div>
            </div>
          </div>
          <div class="form-row">
            <div class="field-group">
              <label>Initial Quantity</label>
              <input class="finput" id="fm-qty" type="number" min="0" step="0.01" placeholder="0"/>
            </div>
            <div class="field-group">
              <label>Unit Cost (₹)</label>
              <input class="finput" id="fm-cost" type="number" min="0" step="0.01" placeholder="0.00"/>
            </div>
          </div>
          <div class="form-row">
            <div class="field-group">
              <label>Min Stock Alert Level</label>
              <input class="finput" id="fm-min" type="number" min="0" step="1" placeholder="10"/>
            </div>
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
          <div><h3 class="modal-title">New Supplier Bill</h3><p class="modal-sub">Record incoming material purchase</p></div>
          <button class="modal-close" onclick="closeModal('modal-supplier')">×</button>
        </div>
        <div class="modal-body">
          <div class="form-row three">
            <div class="field-group">
              <label>Supplier Name *</label>
              <div class="combo-wrap">
                <input class="finput" id="fs-supplier" type="text" placeholder="Supplier name" autocomplete="off"/>
                <div class="combo-drop" id="fs-supplier-drop"></div>
              </div>
            </div>
            <div class="field-group">
              <label>Bill Number</label>
              <input class="finput" id="fs-billno" type="text" placeholder="INV-001"/>
            </div>
            <div class="field-group">
              <label>Date *</label>
              <input class="finput" id="fs-date" type="date"/>
            </div>
          </div>
          <div class="bill-table-hdr">
            <span>Material</span><span>Qty</span><span>Unit</span><span>Unit Price ₹</span><span></span>
          </div>
          <div id="sup-rows-wrap"></div>
          <button class="add-row-btn" id="sup-add-row">+ Add Row</button>
          <div class="bill-total-row">
            <span>Total Bill Amount</span>
            <span class="bill-total-val" id="sup-total">₹0.00</span>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="closeModal('modal-supplier')">Cancel</button>
          <button class="btn btn-primary" id="sup-save">Save Bill &amp; Update Stock</button>
        </div>
      </div>
    </div>

    <!-- MATERIAL SET MODAL -->
    <div class="modal-backdrop" id="modal-predef">
      <div class="modal modal-lg">
        <div class="modal-hdr">
          <div><h3 class="modal-title" id="predef-modal-ttl">New Material Set</h3><p class="modal-sub">Bundle of materials for quick issuance</p></div>
          <button class="modal-close" onclick="closeModal('modal-predef')">×</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="field-group fg-full">
              <label>Set Name *</label>
              <input class="finput" id="fpd-name" type="text" placeholder="e.g. Standard Chair Bundle…"/>
            </div>
          </div>
          <div class="form-row">
            <div class="field-group fg-full">
              <label>Description</label>
              <input class="finput" id="fpd-desc" type="text" placeholder="Optional description"/>
            </div>
          </div>
          <div class="mat-recipe-hdr">
            <span>Material</span><span>Quantity</span><span>Unit</span><span></span>
          </div>
          <div id="predef-mat-rows"></div>
          <button class="add-row-btn" id="predef-add-mat">+ Add Material</button>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="closeModal('modal-predef')">Cancel</button>
          <button class="btn btn-primary" id="predef-save">Save Set</button>
        </div>
      </div>
    </div>

    <!-- WORKER MODAL -->
    <div class="modal-backdrop" id="modal-worker">
      <div class="modal">
        <div class="modal-hdr">
          <div><h3 class="modal-title" id="worker-modal-ttl">Add Worker</h3><p class="modal-sub">Register a new factory worker</p></div>
          <button class="modal-close" onclick="closeModal('modal-worker')">×</button>
        </div>
        <div class="modal-body">
          <div class="form-row">
            <div class="field-group fg-full">
              <label>Full Name *</label>
              <input class="finput" id="fw-name" type="text" placeholder="Worker full name"/>
            </div>
          </div>
          <div class="form-row">
            <div class="field-group">
              <label>Phone Number</label>
              <input class="finput" id="fw-phone" type="tel" placeholder="Phone number"/>
            </div>
            <div class="field-group">
              <label>Skill / Role *</label>
              <div class="combo-wrap">
                <input class="finput" id="fw-skill" type="text" placeholder="Carpenter, Polisher…" autocomplete="off"/>
                <div class="combo-drop" id="fw-skill-drop"></div>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="closeModal('modal-worker')">Cancel</button>
          <button class="btn btn-primary" id="worker-save">Save Worker</button>
        </div>
      </div>
    </div>

    <!-- WORK ORDER MODAL -->
    <div class="modal-backdrop" id="modal-wo">
      <div class="modal modal-lg">
        <div class="modal-hdr">
          <div><h3 class="modal-title">Create Work Order</h3><p class="modal-sub">Assign job to worker and issue materials</p></div>
          <button class="modal-close" onclick="closeModal('modal-wo')">×</button>
        </div>
        <div class="modal-body">
          <div class="form-row three">
            <div class="field-group">
              <label>Assign Worker *</label>
              <div class="combo-wrap">
                <input class="finput" id="fwo-worker-search" type="text" placeholder="Search worker…" autocomplete="off"/>
                <div class="combo-drop" id="fwo-worker-drop"></div>
                <input type="hidden" id="fwo-worker-id"/>
              </div>
            </div>
            <div class="field-group">
              <label>Material Set (optional)</label>
              <div class="combo-wrap">
                <input class="finput" id="fwo-set-search" type="text" placeholder="Select preset…" autocomplete="off"/>
                <div class="combo-drop" id="fwo-set-drop"></div>
                <input type="hidden" id="fwo-set-id"/>
              </div>
            </div>
            <div class="field-group">
              <label>Deadline *</label>
              <input class="finput" id="fwo-deadline" type="date"/>
            </div>
          </div>
          <div class="form-row">
            <div class="field-group fg-full">
              <label>Notes</label>
              <input class="finput" id="fwo-notes" type="text" placeholder="Special instructions…"/>
            </div>
          </div>
          <div id="wo-worker-unused"></div>
          <div class="mat-recipe-hdr" style="margin-top:.8rem">
            <span>New Materials to Issue</span><span>Quantity</span><span>Unit</span><span></span>
          </div>
          <div id="wo-mat-rows"></div>
          <button class="add-row-btn" id="wo-add-mat">+ Add Material</button>
          <div id="wo-stock-warn" style="margin-top:.7rem"></div>
          <button class="btn btn-ghost btn-sm" id="wo-clear-mat" style="margin-top:0.5rem; display:none">Clear Materials</button>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="closeModal('modal-wo')">Cancel</button>
          <button class="btn btn-primary" id="wo-save">🚀 Issue Materials &amp; Start</button>
        </div>
      </div>
    </div>

    <!-- DIRECT STOCK RETURN MODAL (from Worker Profile) -->
    <div class="modal-backdrop" id="modal-direct-return">
      <div class="modal">
        <div class="modal-hdr">
          <div><h3 class="modal-title">Return Materials to Stock</h3><p class="modal-sub" id="dr-sub">Unused materials held by worker</p></div>
          <button class="modal-close" onclick="closeModal('modal-direct-return')">×</button>
        </div>
        <div class="modal-body">
          <div class="approve-section">
            <p class="section-label">Quantities to Return</p>
            <p class="section-hint">Set qty to 0 to skip any material. Stock updates immediately.</p>
            <div id="dr-rows"></div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="closeModal('modal-direct-return')">Cancel</button>
          <button class="btn btn-primary" id="dr-confirm">📦 Return to Stock Now</button>
        </div>
      </div>
    </div>
    <div class="modal-backdrop" id="modal-approve">
      <div class="modal modal-lg">
        <div class="modal-hdr">
          <div><h3 class="modal-title">Approve Completed Job</h3><p class="modal-sub" id="approve-sub">Review and finalize</p></div>
          <button class="modal-close" onclick="closeModal('modal-approve')">×</button>
        </div>
        <div class="modal-body">
          <div class="approve-section">
            <p class="section-label">Product Details *</p>
            <div class="form-row">
              <div class="field-group">
                <label>Product Name(s) *</label>
                <input class="finput" id="fa-product" type="text" placeholder="e.g. Teak Chair, Coffee Table…"/>
              </div>
              <div class="field-group">
                <label>Serial Number * <span style="font-size:0.68rem;color:var(--text-tertiary)">(must be unique)</span></label>
                <input class="finput" id="fa-serial" type="text" placeholder="e.g. VI-2024-001"/>
                <div id="fa-serial-status" style="font-size:0.7rem;margin-top:0.2rem"></div>
              </div>
            </div>
          </div>
          <div class="approve-section">
            <p class="section-label">Actual Material Usage</p>
            <p class="section-hint">Enter how much of each material was actually consumed. Unused quantity stays with the worker.</p>
            <div id="excess-rows"></div>
            <div id="approve-unused-summary" style="margin-top:0.6rem"></div>
          </div>
          <div class="approve-section">
            <p class="section-label">Wage Details</p>
            <div class="form-row three">
              <div class="field-group">
                <label>Wage per Piece (₹)</label>
                <input class="finput" id="fa-wage-per" type="number" min="0" step="1" placeholder="0"/>
              </div>
              <div class="field-group">
                <label>Pieces Completed</label>
                <input class="finput" id="fa-pieces" type="number" min="1" step="1" placeholder="1"/>
              </div>
              <div class="field-group">
                <label>Total Wage (₹)</label>
                <input class="finput" id="fa-wage-total" type="number" min="0" step="1" placeholder="0" style="font-weight:700"/>
              </div>
            </div>
          </div>
          <div class="approve-section">
            <p class="section-label">Deduct Wastage from Wage?</p>
            <div class="form-row">
              <div class="field-group fg-full">
                <label style="display:flex; gap:0.5rem; align-items:center; margin-bottom:0.3rem">
                  <input type="checkbox" id="fa-deduct-waste" style="width:18px; height:18px; cursor:pointer"/>
                  <span>Deduct material wastage cost from worker wage</span>
                </label>
                <input class="finput" id="fa-waste-cost" type="number" min="0" step="1" placeholder="₹0" disabled/>
              </div>
            </div>
          </div>
        </div>
        <div class="modal-foot">
          <button class="btn btn-ghost" onclick="closeModal('modal-approve')">Cancel</button>
          <button class="btn btn-success" id="approve-confirm">✔ Confirm &amp; Approve</button>
        </div>
      </div>
    </div>

    <!-- SALES BILL MODAL -->
    <div class="modal-backdrop" id="modal-sales">
      <div class="modal modal-lg">
        <div class="modal-hdr">
          <div><h3 class="modal-title">New Sales Bill</h3><p class="modal-sub">Generate a bill for a finished product</p></div>
          <button class="modal-close" onclick="closeModal('modal-sales')">×</button>
        </div>
        <div class="modal-body">
          <div class="approve-section">
            <p class="section-label">Product (by Serial Number)</p>
            <div class="form-row">
              <div class="field-group">
                <label>Serial Number *</label>
                <div class="combo-wrap">
                  <input class="finput" id="fsl-serial" type="text" placeholder="Enter or search serial…" autocomplete="off"/>
                  <div class="combo-drop" id="fsl-serial-drop"></div>
                </div>
              </div>
              <div class="field-group">
                <label>Date *</label>
                <input class="finput" id="fsl-date" type="date"/>
              </div>
            </div>
            <div id="fsl-product-preview" style="margin-top:0.5rem"></div>
          </div>
          <div class="approve-section">
            <p class="section-label">Buyer Details</p>
            <div class="form-row three">
              <div class="field-group">
                <label>Buyer Type *</label>
                <select class="finput" id="fsl-buyer-type">
                  <option value="Shop">🏪 Shop</option>
                  <option value="Customer">👤 Direct Customer</option>
                </select>
              </div>
              <div class="field-group">
                <label>Buyer Name *</label>
                <input class="finput" id="fsl-buyer-name" type="text" placeholder="Name or shop name"/>
              </div>
              <div class="field-group">
                <label>Phone</label>
                <input class="finput" id="fsl-buyer-phone" type="tel" placeholder="Phone number"/>
              </div>
            </div>
            <div class="form-row">
              <div class="field-group fg-full">
                <label>Address / Notes</label>
                <input class="finput" id="fsl-buyer-addr" type="text" placeholder="Address or notes…"/>
              </div>
            </div>
          </div>
          <div class="approve-section">
            <p class="section-label">Bill Amount</p>
            <div class="form-row three">
              <div class="field-group">
                <label>Base Amount (₹) *</label>
                <input class="finput" id="fsl-amount" type="number" min="0" step="0.01" placeholder="0.00"/>
              </div>
              <div class="field-group">
                <label>Tax %</label>
                <input class="finput" id="fsl-tax-pct" type="number" min="0" max="100" step="0.01" placeholder="0" value="0"/>
              </div>
              <div class="field-group">
                <label>Total (incl. Tax)</label>
                <input class="finput" id="fsl-total" type="number" readonly style="font-weight:700;background:var(--bg-secondary)" placeholder="0.00"/>
              </div>
            </div>
            <div class="form-row">
              <div class="field-group">
                <label>Bill Number</label>
                <input class="finput" id="fsl-billno" type="text" placeholder="SB-001"/>
              </div>
              <div class="field-group">
                <div id="fsl-tax-breakdown" style="padding:0.5rem 0.75rem;background:var(--primary-light);border-radius:6px;font-size:0.75rem;margin-top:1.5rem;display:none"></div>
              </div>
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

  /* Close on backdrop click */
  document.querySelectorAll('.modal-backdrop').forEach(el => {
    el.addEventListener('click', e => { if (e.target === el) el.classList.remove('open'); });
  });
}

/* ═══════════════════════════════════════════════════════════════════════════
   NAVIGATION & SIDEBAR
   ═══════════════════════════════════════════════════════════════════════════ */
const PAGE_CONFIG = {
  dashboard:          { label: 'Dashboard',           btn: null },
  materials:          { label: 'Raw Materials',       btn: { text: '+ Add Material',   fn: () => openMatModal(null) } },
  suppliers:          { label: 'Supplier Bills',      btn: { text: '+ New Bill',        fn: openSupModal } },
  'materials-predef': { label: 'Material Sets',       btn: { text: '+ New Set',         fn: () => openPredefModal(null) } },
  workers:            { label: 'Workers',             btn: { text: '+ Add Worker',      fn: () => openWorkerModal(null) } },
  workorders:         { label: 'Work Orders',         btn: { text: '+ New Work Order',  fn: openWOModal } },
  finished:           { label: 'Finished Goods',      btn: null },
  reports:            { label: 'Reports',             btn: null },
  'worker-profile':   { label: 'Worker Profile',      btn: null },
  sales:              { label: 'Sales Bills',         btn: { text: '+ New Sales Bill',  fn: openSalesModal } },
};

const RENDERERS = {
  dashboard:          renderDashboard,
  materials:          renderMaterials,
  suppliers:          renderSuppliers,
  'materials-predef': renderPredef,
  workers:            renderWorkers,
  workorders:         renderWorkOrders,
  finished:           renderFinished,
  reports:            renderReports,
  'worker-profile':   renderWorkerProfile,
  sales:              renderSales,
};

function toggleNavSection(sec) {
  const items = document.getElementById(`section-${sec}`);
  const btn   = document.getElementById(`collapse-${sec}`);
  if (!items || !btn) return;
  const collapsed = items.classList.toggle('collapsed');
  btn.textContent = collapsed ? '▶' : '▼';
  localStorage.setItem(`nav-${sec}`, collapsed ? 'closed' : 'open');
}

function nav(page, param) {
  if (page === 'worker-profile' && param) _currentWorkerProfileId = param;
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.page === page));
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  const pageEl = document.getElementById('page-' + page);
  if (pageEl) pageEl.classList.add('active');

  const cfg = PAGE_CONFIG[page] || {};
  document.getElementById('bc-page').textContent = cfg.label || page;
  const btn = document.getElementById('top-action-btn');
  if (cfg.btn) {
    btn.textContent = cfg.btn.text;
    btn.style.display = '';
    btn.onclick = cfg.btn.fn;
  } else {
    btn.style.display = 'none';
  }

  if (RENDERERS[page]) RENDERERS[page]();
  closeMobileSidebar();
}

function closeMobileSidebar() {
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('page-overlay').classList.remove('show');
}

/* ═══════════════════════════════════════════════════════════════════════════
   UI HELPERS
   ═══════════════════════════════════════════════════════════════════════════ */
function updateDate() {
  const d = new Date();
  const el = document.getElementById('topbar-date');
  if (el) el.textContent = d.toLocaleDateString('en-IN', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' });
}

/* Refresh date at midnight */
function scheduleDateRefresh() {
  const now = new Date();
  const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
  const msUntil = midnight - now;
  setTimeout(() => { updateDate(); scheduleDateRefresh(); }, msUntil);
}

function updateCounts() {
  const mats    = DB.all('materials');
  const bills   = DB.all('bills');
  const presets = DB.all('presets');
  const workers = DB.all('workers');
  const wos     = DB.all('workorders');
  const fin     = DB.all('finished');

  const active = wos.filter(w => w.status !== 'Approved').length;
  const low    = mats.filter(m => stockStatus(m) !== 'ok').length;

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('nc-materials',  mats.length);
  set('nc-suppliers',  bills.length);
  set('nc-predef',     presets.length);
  set('nc-workers',    workers.length);
  set('nc-workorders', active);
  set('nc-finished',   fin.length);
  set('nc-sales',      DB.all('sales').length);
  set('sf-active-jobs', active);
  set('sf-low-stock',   low);
}

/* ═══════════════════════════════════════════════════════════════════════════
   COMBO DROPDOWN — built fresh each call, no stacking listeners
   ═══════════════════════════════════════════════════════════════════════════ */
function buildCombo(inputId, dropId, items, onSelect, hiddenId = null) {
  const input  = document.getElementById(inputId);
  const drop   = document.getElementById(dropId);
  if (!input || !drop) return;

  /* Remove old listeners by cloning */
  const newInput = input.cloneNode(true);
  input.parentNode.replaceChild(newInput, input);
  const inp = document.getElementById(inputId); /* re-get after clone */

  const render = (filter = '') => {
    const lf = filter.toLowerCase();
    const filtered = items.filter(i => {
      const s = typeof i === 'string' ? i : (i.name || '');
      return s.toLowerCase().includes(lf);
    });
    if (!filtered.length) { drop.classList.remove('open'); return; }
    drop.innerHTML = filtered.map(i => {
      const txt = typeof i === 'string' ? i : (i.name || '');
      return `<div class="combo-item" data-value="${txt.replace(/"/g, '&quot;')}">${txt}</div>`;
    }).join('');
    drop.classList.add('open');
    drop.querySelectorAll('.combo-item').forEach(el => {
      el.addEventListener('mousedown', e => {
        e.preventDefault();
        const val = el.getAttribute('data-value');
        inp.value = val;
        if (hiddenId) { const h = document.getElementById(hiddenId); if (h) h.value = val; }
        drop.classList.remove('open');
        onSelect?.(val);
      });
    });
  };

  inp.addEventListener('input',  e => render(e.target.value));
  inp.addEventListener('focus',  () => render(inp.value));
  inp.addEventListener('blur',   () => setTimeout(() => drop.classList.remove('open'), 200));
}

/* ═══════════════════════════════════════════════════════════════════════════
   DELETE ALL DATA
   ═══════════════════════════════════════════════════════════════════════════ */
function confirmDeleteAllData() {
  if (!confirm('⚠ This will permanently delete ALL data — materials, workers, orders, bills, and goods.\n\nThis CANNOT be undone. Are you absolutely sure?')) return;
  if (!confirm('Last chance: click OK to erase everything.')) return;
  DB.clearAll();
  updateCounts();
  renderDashboard();
  toast('All data deleted', 'warning');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: DASHBOARD
   ═══════════════════════════════════════════════════════════════════════════ */
function renderDashboard() {
  const mats    = DB.all('materials');
  const bills   = DB.all('bills');
  const workers = DB.all('workers');
  const wos     = DB.all('workorders');
  const fin     = DB.all('finished');
  const sales   = DB.all('sales');

  const active      = wos.filter(w => w.status !== 'Approved');
  const lowMats     = mats.filter(m => stockStatus(m) !== 'ok');
  const totalWages  = fin.reduce((s, f) => s + parseFloat(f.totalWage || 0), 0);
  const totalSales  = sales.reduce((s, sl) => s + parseFloat(sl.amount || 0), 0);
  const unsoldCount = fin.filter(f => !f.sold).length;

  const statsEl = document.getElementById('dash-stats');
  if (statsEl) statsEl.innerHTML = `
    <div class="stat-card"><span class="sc-ico">📦</span><div class="sc-lbl">Materials</div><div class="sc-val">${mats.length}</div><div class="sc-sub">${lowMats.length} need restocking</div></div>
    <div class="stat-card"><span class="sc-ico">📋</span><div class="sc-lbl">Active Jobs</div><div class="sc-val">${active.length}</div><div class="sc-sub">${wos.filter(w => w.status === 'Done').length} awaiting approval</div></div>
    <div class="stat-card"><span class="sc-ico">✅</span><div class="sc-lbl">Finished Goods</div><div class="sc-val">${fin.length}</div><div class="sc-sub">${unsoldCount} in stock · ${fin.length - unsoldCount} sold</div></div>
    <div class="stat-card"><span class="sc-ico">💳</span><div class="sc-lbl">Wages Paid</div><div class="sc-val" style="font-size:1.3rem">${fmtMoney(totalWages)}</div><div class="sc-sub">to all workers</div></div>
    <div class="stat-card" style="border-color:var(--success);"><span class="sc-ico">💰</span><div class="sc-lbl">Sales Revenue</div><div class="sc-val" style="font-size:1.3rem;color:var(--success)">${fmtMoney(totalSales)}</div><div class="sc-sub">${sales.length} bill${sales.length !== 1 ? 's' : ''}</div></div>
  `;

  let banners = '';
  if (lowMats.length) {
    const out = lowMats.filter(m => stockStatus(m) === 'out').length;
    const low = lowMats.filter(m => stockStatus(m) === 'low').length;
    banners += `<div class="banner banner-warning"><span class="banner-ico">⚠️</span><div><strong>${out} out of stock, ${low} low stock:</strong> ${lowMats.slice(0, 3).map(m => m.name).join(', ')}${lowMats.length > 3 ? ` +${lowMats.length - 3} more` : ''}</div></div>`;
  }
  /* Banner: workers holding unused materials */
  const workersWithUnused = workers.filter(w => (w.unusedMaterials || []).length > 0);
  if (workersWithUnused.length) {
    banners += `<div class="banner banner-warning" style="border-left-color:var(--warning)"><span class="banner-ico">📦</span><div><strong>${workersWithUnused.length} worker(s) holding unused materials:</strong> ${workersWithUnused.map(w => `<button class="card-link" onclick="nav('worker-profile','${w.id}')">${w.name}</button>`).join(', ')} — go to profile to return to stock</div></div>`;
  }
  const bannersEl = document.getElementById('dash-banners');
  if (bannersEl) bannersEl.innerHTML = banners;

  const jobsEl = document.getElementById('dash-jobs');
  if (jobsEl) jobsEl.innerHTML = active.length
    ? active.slice(0, 6).map(w => `<div class="dash-row"><span class="dr-name">${w.workerName}</span><span class="dr-val">${statusBadge(w.status)}</span></div>`).join('')
    : '<div class="dash-empty">No active jobs</div>';

  const saEl = document.getElementById('dash-stock-alerts');
  if (saEl) saEl.innerHTML = lowMats.length
    ? lowMats.slice(0, 6).map(m => `<div class="dash-row"><span class="dr-name">${m.name}</span><span class="dr-val">${fmtNum(m.qty)} ${m.unit}</span></div>`).join('')
    : '<div class="dash-empty" style="color:var(--success)">✓ All stocked</div>';

  const billsEl = document.getElementById('dash-bills');
  if (billsEl) billsEl.innerHTML = bills.length
    ? bills.slice(0, 5).map(b => `<div class="dash-row"><span class="dr-name">${b.supplier}</span><span class="dr-val">${fmtMoney(b.total)}</span></div>`).join('')
    : '<div class="dash-empty">No bills yet</div>';

  const topWorkers = [...workers].sort((a, b) => (b.totalJobs || 0) - (a.totalJobs || 0)).slice(0, 5);
  const wrkEl = document.getElementById('dash-workers-top');
  if (wrkEl) wrkEl.innerHTML = topWorkers.length
    ? topWorkers.map(w => `<div class="dash-row"><span class="dr-name">${w.name}</span><span class="dr-val">${w.totalJobs || 0} jobs · ${fmtMoney(w.totalEarned || 0)}</span></div>`).join('')
    : '<div class="dash-empty">No workers</div>';

  /* Recent Sales panel */
  const salesEl = document.getElementById('dash-recent-sales');
  if (salesEl) salesEl.innerHTML = sales.length
    ? sales.slice(0, 5).map(sl => `<div class="dash-row">
        <span class="dr-name">${sl.product} <span style="font-size:0.68rem;color:var(--text-tertiary);font-family:var(--font-mono)">${sl.serialNumber}</span></span>
        <span class="dr-val" style="color:var(--success)">${fmtMoney(sl.amount)}</span>
      </div>`).join('')
    : '<div class="dash-empty">No sales yet</div>';
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: RAW MATERIALS
   ═══════════════════════════════════════════════════════════════════════════ */
let matFilter = 'all';

function renderMaterials() {
  const mats   = DB.all('materials');
  const search = (document.getElementById('mat-search')?.value || '').toLowerCase();
  const filtered = mats.filter(m => {
    const ms = matFilter === 'all' || stockStatus(m) === matFilter;
    const ss = m.name.toLowerCase().includes(search) || (m.category || '').toLowerCase().includes(search);
    return ms && ss;
  });

  const tbody = document.getElementById('mat-tbody');
  if (!tbody) return;
  tbody.innerHTML = filtered.length ? filtered.map(m => {
    const stockVal = parseFloat(m.qty || 0) * parseFloat(m.unitCost || 0);
    return `<tr>
      <td class="td-name">${m.name}</td>
      <td><span class="badge badge-primary">${m.category || '—'}</span></td>
      <td class="td-mono">${fmtNum(m.qty)}</td>
      <td class="td-mono">${m.unit || '—'}</td>
      <td class="td-mono">${fmtMoney(m.unitCost || 0)}</td>
      <td class="td-mono">${fmtMoney(stockVal)}</td>
      <td>${stockBadge(m)}</td>
      <td><div class="acts">
        <button class="act-btn" onclick="openMatModal('${m.id}')">✏️ Edit</button>
        <button class="act-btn danger" onclick="deleteMat('${m.id}')">🗑</button>
      </div></td>
    </tr>`;
  }).join('')
  : `<tr><td colspan="8"><div class="t-empty"><span class="t-empty-ico">📦</span>${mats.length ? 'No results' : 'No materials yet'}</div></td></tr>`;

  const fl = document.getElementById('mat-foot-l');
  if (fl) fl.textContent = `${filtered.length} of ${mats.length} materials`;
}

let _editMatId = null;
function openMatModal(id) {
  _editMatId = id;
  const m = id ? DB.find('materials', id) : null;
  document.getElementById('mat-modal-ttl').textContent = m ? 'Edit Material' : 'Add Raw Material';
  document.getElementById('fm-name').value   = m?.name      || '';
  document.getElementById('fm-cat').value    = m?.category  || '';
  document.getElementById('fm-unit').value   = m?.unit      || '';
  document.getElementById('fm-qty').value    = m?.qty       || 0;
  document.getElementById('fm-cost').value   = m?.unitCost  || 0;
  document.getElementById('fm-min').value    = m?.minLevel  || 10;

  const cats  = [...new Set(DB.all('materials').map(m => m.category).filter(Boolean))];
  const units = [...new Set([...DB.all('materials').map(m => m.unit).filter(Boolean), 'kg', 'g', 'litre', 'ml', 'pieces', 'feet', 'metre'])];
  buildCombo('fm-cat',  'fm-cat-drop',  cats);
  buildCombo('fm-unit', 'fm-unit-drop', units);

  openModal('modal-material');
  setTimeout(() => document.getElementById('fm-name')?.focus(), 100);
}

function saveMat() {
  const name = document.getElementById('fm-name').value.trim();
  const unit = document.getElementById('fm-unit').value.trim();
  if (!name) { toast('Material name required', 'danger'); return; }
  if (!unit) { toast('Unit required', 'danger'); return; }
  const data = {
    name,
    category: document.getElementById('fm-cat').value.trim(),
    unit,
    qty:      parseFloat(document.getElementById('fm-qty').value)  || 0,
    unitCost: parseFloat(document.getElementById('fm-cost').value) || 0,
    minLevel: parseFloat(document.getElementById('fm-min').value)  || 10,
  };
  if (_editMatId) {
    DB.update('materials', _editMatId, data);
    toast(`"${name}" updated`);
  } else {
    DB.insert('materials', data);
    toast(`"${name}" added`);
  }
  closeModal('modal-material');
  renderMaterials();
  updateCounts();
}

function deleteMat(id) {
  if (!confirm('Delete this material?')) return;
  DB.delete('materials', id);
  renderMaterials();
  updateCounts();
  toast('Material deleted', 'warning');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: SUPPLIER BILLS
   ═══════════════════════════════════════════════════════════════════════════ */
let _supRows = [];

function openSupModal() {
  _supRows = [];
  document.getElementById('fs-supplier').value = '';
  document.getElementById('fs-billno').value   = '';
  document.getElementById('fs-date').value     = todayStr();
  renderSupRows();

  const suppliers = [...new Set(DB.all('bills').map(b => b.supplier).filter(Boolean))];
  buildCombo('fs-supplier', 'fs-supplier-drop', suppliers);
  openModal('modal-supplier');
}

function renderSupRows() {
  const mats = DB.all('materials');
  const wrap = document.getElementById('sup-rows-wrap');
  if (!wrap) return;
  if (!_supRows.length) {
    wrap.innerHTML = `<div style="color:var(--text-tertiary);font-family:var(--font-mono);font-size:.72rem;text-align:center;padding:.8rem;border:1px dashed var(--border);border-radius:7px;margin-bottom:.4rem">Click "+ Add Row" to add materials</div>`;
    document.getElementById('sup-total').textContent = '₹0.00';
    return;
  }
  wrap.innerHTML = _supRows.map((row, i) => `
    <div class="bill-row" id="sr-${i}">
      <div class="combo-wrap">
        <input class="finput" id="sr-mat-${i}" value="${row.mat || ''}" placeholder="Material name" autocomplete="off"/>
        <div class="combo-drop" id="sr-mat-drop-${i}"></div>
      </div>
      <input class="finput" id="sr-qty-${i}"   type="number" min="0" step="0.01" value="${row.qty   || ''}" placeholder="0"/>
      <input class="finput" id="sr-unit-${i}"  value="${row.unit || ''}" placeholder="unit" readonly/>
      <div style="position:relative">
        <span style="position:absolute;left:.75rem;top:50%;transform:translateY(-50%);color:var(--text-tertiary);font-family:var(--font-mono);font-size:.78rem;pointer-events:none">₹</span>
        <input class="finput" id="sr-price-${i}" type="number" min="0" step="0.01" value="${row.price || ''}" placeholder="0.00" style="padding-left:1.6rem"/>
      </div>
      <button class="row-del" onclick="supDelRow(${i})">×</button>
    </div>`).join('');

  /* Wire qty/price inputs */
  _supRows.forEach((_, i) => {
    document.getElementById(`sr-qty-${i}`)?.addEventListener('input', e => { _supRows[i].qty   = parseFloat(e.target.value) || 0; calcSupTotal(); });
    document.getElementById(`sr-price-${i}`)?.addEventListener('input', e => { _supRows[i].price = parseFloat(e.target.value) || 0; calcSupTotal(); });
    document.getElementById(`sr-mat-${i}`)?.addEventListener('input', e => { _supRows[i].mat = e.target.value; });
    buildCombo(`sr-mat-${i}`, `sr-mat-drop-${i}`, mats.map(m => m.name), val => {
      _supRows[i].mat = val;
      const m = mats.find(m => m.name === val);
      if (m) {
        const unitEl  = document.getElementById(`sr-unit-${i}`);
        const priceEl = document.getElementById(`sr-price-${i}`);
        if (unitEl)  unitEl.value  = m.unit || '';
        if (priceEl) priceEl.value = m.unitCost || '';
        _supRows[i].unit  = m.unit     || '';
        _supRows[i].price = parseFloat(m.unitCost || 0);
      }
      calcSupTotal();
    });
  });
  calcSupTotal();
}

function supDelRow(i) { _supRows.splice(i, 1); renderSupRows(); }

function calcSupTotal() {
  const t = _supRows.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
  const el = document.getElementById('sup-total');
  if (el) el.textContent = fmtMoney(t);
}

function saveSupplierBill() {
  const supplier = document.getElementById('fs-supplier').value.trim();
  const billno   = document.getElementById('fs-billno').value.trim();
  const date     = document.getElementById('fs-date').value;
  if (!supplier) { toast('Supplier name required', 'danger'); return; }
  if (!date)     { toast('Select a date', 'danger'); return; }
  const valid = _supRows.filter(r => r.mat && parseFloat(r.qty) > 0);
  if (!valid.length) { toast('Add at least one material row', 'danger'); return; }

  const total = valid.reduce((s, r) => s + (parseFloat(r.qty) || 0) * (parseFloat(r.price) || 0), 0);
  DB.insert('bills', { supplier, billno, date, items: valid.map(r => ({ ...r })), total });
  DB.applyBill(valid);

  closeModal('modal-supplier');
  renderSuppliers();
  renderMaterials();
  updateCounts();
  toast(`Bill from "${supplier}" saved — ${fmtMoney(total)}`);
}

function renderSuppliers() {
  const bills  = DB.all('bills');
  const search = (document.getElementById('sup-search')?.value || '').toLowerCase();
  const filtered = bills.filter(b => b.supplier.toLowerCase().includes(search) || (b.billno || '').toLowerCase().includes(search));
  const list = document.getElementById('sup-list');
  if (!list) return;
  if (!filtered.length) {
    list.innerHTML = `<div class="table-card"><div class="t-empty"><span class="t-empty-ico">🧾</span>${bills.length ? 'No results' : 'No bills yet'}</div></div>`;
    return;
  }
  list.innerHTML = filtered.map(b => `
    <div class="wo-card">
      <div class="wo-card-hdr">
        <div class="wc-left">
          <div class="wc-worker">${b.supplier}</div>
          <div class="wc-notes">${b.billno ? 'Bill # ' + b.billno + ' · ' : ''}${fmtDate(b.date)} · ${b.items?.length || 0} items</div>
        </div>
        <div style="display:flex; gap:0.5rem; align-items:center">
          <span style="font-weight:700; color:var(--primary)">${fmtMoney(b.total)}</span>
          <button class="act-btn danger" onclick="deleteBill('${b.id}')">🗑</button>
        </div>
      </div>
      <div class="wo-card-body" style="flex-direction:column; gap:0.5rem">
        ${(b.items || []).map(it => `<div class="iss-mat-row"><span class="imr-name">${it.mat}</span><span class="imr-qty">${fmtNum(it.qty)} ${it.unit} @ ${fmtMoney(it.price)}</span></div>`).join('')}
      </div>
    </div>`).join('');
}

function deleteBill(id) {
  if (!confirm('Delete this bill?\n\nNote: stock levels will NOT be reversed automatically.')) return;
  DB.delete('bills', id);
  renderSuppliers();
  updateCounts();
  toast('Bill deleted', 'warning');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: MATERIAL SETS
   ═══════════════════════════════════════════════════════════════════════════ */
let _predefMatRows = [];
let _editPredefId  = null;

function openPredefModal(id) {
  _editPredefId  = id;
  _predefMatRows = [];
  const p = id ? DB.find('presets', id) : null;
  document.getElementById('predef-modal-ttl').textContent = p ? 'Edit Material Set' : 'New Material Set';
  document.getElementById('fpd-name').value = p?.name || '';
  document.getElementById('fpd-desc').value = p?.desc || '';
  _predefMatRows = (p?.materials || []).map(r => ({ ...r }));
  renderPredefMatRows();
  openModal('modal-predef');
  setTimeout(() => document.getElementById('fpd-name')?.focus(), 100);
}

function renderPredefMatRows() {
  const mats = DB.all('materials');
  const wrap = document.getElementById('predef-mat-rows');
  if (!wrap) return;
  if (!_predefMatRows.length) {
    wrap.innerHTML = `<div style="color:var(--text-tertiary);font-family:var(--font-mono);font-size:.72rem;text-align:center;padding:.7rem;border:1px dashed var(--border);border-radius:7px;margin-bottom:.4rem">No materials in set yet</div>`;
    return;
  }
  wrap.innerHTML = _predefMatRows.map((row, i) => `
    <div class="mat-row">
      <div class="combo-wrap">
        <input class="finput" id="pd-mat-${i}" value="${row.mat || ''}" placeholder="Material name" autocomplete="off"/>
        <div class="combo-drop" id="pd-mat-drop-${i}"></div>
      </div>
      <input class="finput" id="pd-qty-${i}"  type="number" min="0" step="0.01" value="${row.qty  || ''}" placeholder="0"/>
      <input class="finput" id="pd-unit-${i}" value="${row.unit || ''}" placeholder="unit" readonly/>
      <button class="row-del" onclick="predefDelRow(${i})">×</button>
    </div>`).join('');

  _predefMatRows.forEach((_, i) => {
    document.getElementById(`pd-qty-${i}`)?.addEventListener('input', e => { _predefMatRows[i].qty = parseFloat(e.target.value) || 0; });
    document.getElementById(`pd-mat-${i}`)?.addEventListener('input', e => { _predefMatRows[i].mat = e.target.value; });
    buildCombo(`pd-mat-${i}`, `pd-mat-drop-${i}`, mats.map(m => m.name), val => {
      _predefMatRows[i].mat = val;
      const m = mats.find(m => m.name === val);
      if (m) {
        _predefMatRows[i].unit = m.unit || '';
        const unitEl = document.getElementById(`pd-unit-${i}`);
        if (unitEl) unitEl.value = m.unit || '';
      }
    });
  });
}

function predefDelRow(i) { _predefMatRows.splice(i, 1); renderPredefMatRows(); }

function savePredef() {
  const name = document.getElementById('fpd-name').value.trim();
  if (!name) { toast('Set name required', 'danger'); return; }
  const mats = _predefMatRows.filter(r => r.mat);
  const data = { name, desc: document.getElementById('fpd-desc').value.trim(), materials: mats };
  if (_editPredefId) {
    DB.update('presets', _editPredefId, data);
    toast(`"${name}" updated`);
  } else {
    DB.insert('presets', data);
    toast(`Set "${name}" created`);
  }
  closeModal('modal-predef');
  renderPredef();
  updateCounts();
}

function renderPredef() {
  const presets = DB.all('presets');
  const search  = (document.getElementById('predef-search')?.value || '').toLowerCase();
  const filtered = presets.filter(p => p.name.toLowerCase().includes(search));
  const grid = document.getElementById('predef-grid');
  if (!grid) return;
  if (!filtered.length) {
    grid.innerHTML = `<div class="table-card"><div class="t-empty"><span class="t-empty-ico">📋</span>${presets.length ? 'No results' : 'No material sets yet'}</div></div>`;
    return;
  }
  grid.innerHTML = `<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(280px,1fr));gap:1rem">
    ${filtered.map(p => `
      <div class="card">
        <div class="card-hdr">
          <div>
            <div class="card-title">${p.name}</div>
            ${p.desc ? `<div style="font-size:.7rem;color:var(--text-tertiary);margin-top:.1rem">${p.desc}</div>` : ''}
          </div>
          <div class="acts">
            <button class="act-btn" onclick="openPredefModal('${p.id}')">✏️</button>
            <button class="act-btn danger" onclick="deletePredef('${p.id}')">🗑</button>
          </div>
        </div>
        <div class="card-body">
          ${(p.materials || []).length
            ? (p.materials || []).map(m => `<div class="iss-mat-row"><span class="imr-name">${m.mat}</span><span class="imr-qty">${fmtNum(m.qty)} ${m.unit}</span></div>`).join('')
            : '<div style="color:var(--text-tertiary);font-size:.78rem">No materials</div>'}
        </div>
      </div>`).join('')}
  </div>`;
}

function deletePredef(id) {
  if (!confirm('Delete this material set?')) return;
  DB.delete('presets', id);
  renderPredef();
  updateCounts();
  toast('Set deleted', 'warning');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: WORKERS
   ═══════════════════════════════════════════════════════════════════════════ */
let _workerFilter = 'all';
let _editWorkerId = null;

function openWorkerModal(id) {
  _editWorkerId = id;
  const w = id ? DB.find('workers', id) : null;
  document.getElementById('worker-modal-ttl').textContent = w ? 'Edit Worker' : 'Add Worker';
  document.getElementById('fw-name').value  = w?.name  || '';
  document.getElementById('fw-phone').value = w?.phone || '';
  document.getElementById('fw-skill').value = w?.skill || '';
  const skills = [...new Set(DB.all('workers').map(w => w.skill).filter(Boolean))];
  buildCombo('fw-skill', 'fw-skill-drop', skills);
  openModal('modal-worker');
  setTimeout(() => document.getElementById('fw-name')?.focus(), 100);
}

function saveWorker() {
  const name  = document.getElementById('fw-name').value.trim();
  const phone = document.getElementById('fw-phone').value.trim();
  const skill = document.getElementById('fw-skill').value.trim();
  if (!name)  { toast('Name required', 'danger'); return; }
  if (!skill) { toast('Skill required', 'danger'); return; }
  const data = { name, phone, skill };
  if (_editWorkerId) {
    const existing = DB.find('workers', _editWorkerId);
    DB.update('workers', _editWorkerId, { ...data, totalJobs: existing?.totalJobs || 0, totalEarned: existing?.totalEarned || 0 });
    toast(`"${name}" updated`);
  } else {
    DB.insert('workers', { ...data, totalJobs: 0, totalEarned: 0 });
    toast(`"${name}" added`);
  }
  closeModal('modal-worker');
  renderWorkers();
  updateCounts();
}

function renderWorkers() {
  const wos    = DB.all('workorders');
  const workers = DB.all('workers');
  const search  = (document.getElementById('worker-search')?.value || '').toLowerCase();
  let filtered  = workers.filter(w =>
    w.name.toLowerCase().includes(search) ||
    (w.skill  || '').toLowerCase().includes(search) ||
    (w.phone  || '').includes(search)
  );
  if (_workerFilter === 'active') filtered = filtered.filter(w => wos.some(j => j.status !== 'Approved' && j.workerId === w.id));
  if (_workerFilter === 'free')   filtered = filtered.filter(w => !wos.some(j => j.status !== 'Approved' && j.workerId === w.id));

  const tbody = document.getElementById('worker-tbody');
  if (!tbody) return;
  tbody.innerHTML = filtered.length ? filtered.map(w => {
    const activeJobs = wos.filter(j => j.status !== 'Approved' && j.workerId === w.id);
    const status = activeJobs.length
      ? `<span class="badge badge-warning">⚙ ${activeJobs.length} job${activeJobs.length > 1 ? 's' : ''}</span>`
      : `<span class="badge badge-success">✓ Available</span>`;
    return `<tr>
      <td class="td-name">${w.name}</td>
      <td class="td-mono">${w.phone || '—'}</td>
      <td><span class="badge badge-primary">${w.skill || '—'}</span></td>
      <td class="td-mono">${w.totalJobs || 0}</td>
      <td class="td-mono">${fmtMoney(w.totalEarned || 0)}</td>
      <td>${status}</td>
      <td><div class="acts">
        <button class="act-btn" onclick="nav('worker-profile','${w.id}')">👤 Profile</button>
        <button class="act-btn" onclick="openWorkerModal('${w.id}')">✏️</button>
        <button class="act-btn danger" onclick="deleteWorker('${w.id}')">🗑</button>
      </div></td>
    </tr>`;
  }).join('')
  : `<tr><td colspan="7"><div class="t-empty"><span class="t-empty-ico">👷</span>${workers.length ? 'No results' : 'No workers'}</div></td></tr>`;

  const wf = document.getElementById('worker-foot');
  if (wf) wf.textContent = `${filtered.length} of ${workers.length} workers`;
}

function deleteWorker(id) {
  const hasActive = DB.all('workorders').some(w => w.workerId === id && w.status !== 'Approved');
  if (hasActive) { toast('Cannot delete — worker has active work orders', 'danger'); return; }
  if (!confirm('Delete this worker?')) return;
  DB.delete('workers', id);
  renderWorkers();
  updateCounts();
  toast('Worker deleted', 'warning');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: WORK ORDERS
   KEY FIX: WO stores display ref (woRef) separate from DB id.
   All DB lookups use doc.id; display uses doc.woRef.
   ═══════════════════════════════════════════════════════════════════════════ */
let _woFilter  = 'all';
let _woMatRows = [];

function openWOModal() {
  _woMatRows = [];
  document.getElementById('fwo-worker-search').value = '';
  document.getElementById('fwo-worker-id').value     = '';
  document.getElementById('fwo-set-search').value    = '';
  document.getElementById('fwo-set-id').value        = '';
  document.getElementById('fwo-deadline').value      = '';
  document.getElementById('fwo-notes').value         = '';
  renderWOMatRows();
  _renderWorkerUnused(null);

  const workers = DB.all('workers');
  buildCombo('fwo-worker-search', 'fwo-worker-drop', workers.map(w => w.name), val => {
    const w = workers.find(w => w.name === val);
    const h = document.getElementById('fwo-worker-id');
    if (w && h) { h.value = w.id; _renderWorkerUnused(w.id); }
  });

  const presets = DB.all('presets');
  buildCombo('fwo-set-search', 'fwo-set-drop', presets.map(p => p.name), val => {
    const p = presets.find(p => p.name === val);
    if (p) {
      const h = document.getElementById('fwo-set-id');
      if (h) h.value = p.id;
      _woMatRows = (p.materials || []).map(r => ({ ...r }));
      renderWOMatRows();
      const clrBtn = document.getElementById('wo-clear-mat');
      if (clrBtn) clrBtn.style.display = 'inline-flex';
    }
  });

  openModal('modal-wo');
}

function _renderWorkerUnused(workerId) {
  const el = document.getElementById('wo-worker-unused');
  if (!el) return;
  if (!workerId) { el.innerHTML = ''; return; }
  const worker = DB.find('workers', workerId);
  const unused = worker?.unusedMaterials || [];
  if (!unused.length) { el.innerHTML = ''; return; }
  el.innerHTML = `
    <div class="banner" style="background:#fff8e1;border-left:3px solid var(--warning);padding:0.6rem 0.8rem;border-radius:6px;margin-bottom:0.6rem">
      <div style="font-size:0.72rem;font-weight:600;color:var(--warning);margin-bottom:0.4rem">📦 Materials already with ${worker.name}</div>
      <div style="display:flex;flex-wrap:wrap;gap:0.3rem">
        ${unused.map(m => `<span class="badge badge-warning" style="font-size:0.68rem">${m.mat}: ${fmtNum(m.qty)} ${m.unit}</span>`).join('')}
      </div>
      <div style="font-size:0.68rem;color:var(--text-tertiary);margin-top:0.3rem">These remain with the worker — new materials issued below will be added on top.</div>
    </div>`;
}

function renderWOMatRows() {
  const mats   = DB.all('materials');
  const wrap   = document.getElementById('wo-mat-rows');
  const warnEl = document.getElementById('wo-stock-warn');
  if (!wrap) return;
  let warns = [];

  if (!_woMatRows.length) {
    wrap.innerHTML = `<div style="color:var(--text-tertiary);font-family:var(--font-mono);font-size:.72rem;text-align:center;padding:.7rem;border:1px dashed var(--border);border-radius:7px;margin-bottom:.4rem">Select a material set or click "+ Add Material"</div>`;
    if (warnEl) warnEl.innerHTML = '';
    return;
  }

  wrap.innerHTML = _woMatRows.map((row, i) => {
    const m = mats.find(m => m.name === row.mat);
    const hasEnough = m && parseFloat(m.qty || 0) >= parseFloat(row.qty || 0);
    if (!hasEnough && row.mat) warns.push(`⚠ ${row.mat}: need ${row.qty} ${row.unit}, have ${m ? fmtNum(m.qty) : 0}`);
    const borderStyle = !hasEnough && row.mat ? 'border-color:var(--danger)' : '';
    return `<div class="mat-row">
      <div class="combo-wrap">
        <input class="finput" id="wm-mat-${i}" value="${row.mat || ''}" placeholder="Material name" autocomplete="off" style="${borderStyle}"/>
        <div class="combo-drop" id="wm-mat-drop-${i}"></div>
      </div>
      <input class="finput" id="wm-qty-${i}"  type="number" min="0" step="0.01" value="${row.qty  || ''}" placeholder="0" style="${borderStyle}"/>
      <input class="finput" id="wm-unit-${i}" value="${row.unit || ''}" placeholder="unit" readonly/>
      <button class="row-del" onclick="woDelRow(${i})">×</button>
    </div>`;
  }).join('');

  _woMatRows.forEach((_, i) => {
    document.getElementById(`wm-qty-${i}`)?.addEventListener('input', e => {
      _woMatRows[i].qty = parseFloat(e.target.value) || 0;
      renderWOMatRows();
    });
    document.getElementById(`wm-mat-${i}`)?.addEventListener('input', e => { _woMatRows[i].mat = e.target.value; });
    buildCombo(`wm-mat-${i}`, `wm-mat-drop-${i}`, mats.map(m => m.name), val => {
      _woMatRows[i].mat = val;
      const m = mats.find(m => m.name === val);
      if (m) {
        _woMatRows[i].unit = m.unit || '';
        const unitEl = document.getElementById(`wm-unit-${i}`);
        if (unitEl) unitEl.value = m.unit || '';
      }
      renderWOMatRows();
    });
  });

  if (warnEl) warnEl.innerHTML = warns.length
    ? `<div class="banner banner-danger"><span class="banner-ico">⚠️</span><div><strong>Stock Issues:</strong><br>${warns.join('<br>')}</div></div>`
    : '';
}

function woDelRow(i) { _woMatRows.splice(i, 1); renderWOMatRows(); }

function saveWorkOrder() {
  const workerId  = document.getElementById('fwo-worker-id').value;
  const workerTxt = document.getElementById('fwo-worker-search').value.trim();
  const deadline  = document.getElementById('fwo-deadline').value;

  if (!workerId && !workerTxt) { toast('Select a worker', 'danger'); return; }
  if (!deadline)               { toast('Set a deadline', 'danger'); return; }

  const valid = _woMatRows.filter(r => r.mat && parseFloat(r.qty) > 0);
  if (!valid.length) { toast('Add at least one material', 'danger'); return; }

  const outOfStock = valid.filter(r => {
    const m = DB.all('materials').find(m => m.name === r.mat);
    return !m || parseFloat(m.qty || 0) < parseFloat(r.qty || 0);
  });
  if (outOfStock.length) { toast('Insufficient stock for: ' + outOfStock.map(r => r.mat).join(', '), 'danger'); return; }

  const worker = workerId ? DB.find('workers', workerId) : null;
  /* FIX: woRef is the human-readable display code; doc.id is used for all DB lookups */
  const woRef = 'WO-' + Date.now().toString(36).toUpperCase().slice(-5);

  valid.forEach(r => DB.adjustStock(r.mat, -r.qty));

  const saved = DB.insert('workorders', {
    woRef,
    workerId:   workerId || null,
    workerName: worker?.name || workerTxt,
    deadline,
    notes:    document.getElementById('fwo-notes').value.trim(),
    status:   'Materials Issued',
    materials: valid.map(r => ({ ...r })),
    setId:    document.getElementById('fwo-set-id').value || null,
  });

  closeModal('modal-wo');
  renderWorkOrders();
  renderMaterials();
  updateCounts();
  toast(`${saved.woRef} created — materials issued`);
}

function renderWorkOrders() {
  const wos    = DB.all('workorders');
  const search = (document.getElementById('wo-search')?.value || '').toLowerCase();
  const today  = todayStr();
  let filtered = wos.filter(w => {
    const ms = _woFilter === 'all' || w.status === _woFilter;
    const ref = (w.woRef || w.id || '').toLowerCase();
    const ss  = w.workerName.toLowerCase().includes(search) ||
                ref.includes(search) ||
                (w.notes || '').toLowerCase().includes(search);
    return ms && ss;
  });

  const listEl = document.getElementById('wo-list');
  if (!listEl) return;
  if (!filtered.length) {
    listEl.innerHTML = `<div class="table-card"><div class="t-empty"><span class="t-empty-ico">📋</span>${wos.length ? 'No results' : 'No work orders'}</div></div>`;
    return;
  }

  listEl.innerHTML = filtered.map(wo => {
    const isOverdue  = wo.status !== 'Approved' && wo.deadline && wo.deadline < today;
    const displayId  = wo.woRef || wo.id;
    const isActive   = wo.status !== 'Approved' && wo.status !== 'Done';
    const isDone     = wo.status === 'Done';
    const isApproved = wo.status === 'Approved';
    return `
      <div class="wo-card">
        <div class="wo-card-hdr">
          <div class="wc-left">
            <div class="wc-id">${displayId}</div>
            <div class="wc-worker">👷 ${wo.workerName}</div>
            ${wo.notes ? `<div class="wc-notes">${wo.notes}</div>` : ''}
          </div>
          <div class="wc-badges">
            ${statusBadge(wo.status)}
            ${isOverdue ? `<span class="overdue-tag">⏰ Overdue</span>` : ''}
          </div>
        </div>
        <div class="wo-card-body">
          <div class="wo-meta"><div class="wm-lbl">Deadline</div><div class="wm-val">${fmtDate(wo.deadline)}</div></div>
          <div class="wo-meta"><div class="wm-lbl">Materials Issued</div><div class="wm-val">${(wo.materials || []).length} item${(wo.materials||[]).length !== 1 ? 's' : ''}</div></div>
          ${isApproved && wo.serialNumber ? `<div class="wo-meta"><div class="wm-lbl">Serial</div><div class="wm-val" style="font-family:var(--font-mono);font-size:0.75rem">${wo.serialNumber}</div></div>` : ''}
        </div>
        <div class="wo-card-body" style="flex-direction:column;padding-top:0;gap:0.3rem">
          ${(wo.materials || []).map(m => `<div class="iss-mat-row" style="padding:0.3rem 0"><span class="imr-name">${m.mat}</span><span class="imr-qty">${fmtNum(m.qty)} ${m.unit}</span></div>`).join('')}
        </div>
        <div class="wo-card-foot">
          <div class="acts">
            ${isActive  ? `<button class="btn btn-primary btn-sm" onclick="markWODone('${wo.id}')">✅ Mark as Done</button>` : ''}
            ${isDone    ? `<button class="btn btn-success btn-sm" onclick="openApprove('${wo.id}')">✔ Approve &amp; Record Product</button>` : ''}
            ${!isApproved ? `<button class="act-btn danger" onclick="deleteWorkOrder('${wo.id}')">🗑</button>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

function markWODone(id) {
  const wo = DB.find('workorders', id);
  if (!wo) return;
  DB.update('workorders', id, { status: 'Done' });
  renderWorkOrders();
  updateCounts();
  const displayId = wo.woRef || wo.id;
  toast(`${displayId} — marked as Done. Ready for approval.`);
}

function deleteWorkOrder(id) {
  const wo = DB.find('workorders', id);
  if (!wo) return;
  if (!confirm('Delete this work order? Materials will NOT be returned to stock.')) return;
  DB.delete('workorders', id);
  renderWorkOrders();
  updateCounts();
  toast('Work order deleted', 'warning');
}

/* ═══════════════════════════════════════════════════════════════════════════
   TIMELINE MODAL
   ═══════════════════════════════════════════════════════════════════════════ */
const STAGES      = ['Assigned', 'In Progress', 'Done'];
const STAGE_ICONS = { 'Assigned': '📋', 'In Progress': '⚙️', 'Done': '🏁' };

function openTimeline(id) {
  const wo = DB.find('workorders', id);
  if (!wo) return;

  const displayId = wo.woRef || wo.id;
  document.getElementById('tl-title').textContent = `Timeline — ${wo.workerName}`;
  document.getElementById('tl-sub').textContent   = `${displayId} · Deadline: ${fmtDate(wo.deadline)}`;

  const curIdx = STAGES.indexOf(wo.status);
  document.getElementById('tl-track').innerHTML = STAGES.map((s, i) => {
    const cls = i < curIdx ? 'done' : i === curIdx ? 'cur' : '';
    return `<div class="tl-stage ${cls}">
      <div class="tl-dot ${cls}">${i < curIdx ? '✓' : STAGE_ICONS[s]}</div>
      <div class="tl-lbl ${cls}">${s}</div>
    </div>`;
  }).join('');

  document.getElementById('tl-stage-btns').innerHTML = STAGES.map(s =>
    `<button class="btn ${s === wo.status ? 'btn-primary' : 'btn-ghost'} btn-sm" onclick="setTimelineStage('${id}','${s}')">${STAGE_ICONS[s]} ${s}</button>`
  ).join('');

  document.getElementById('tl-mats').innerHTML = (wo.materials || []).map(m =>
    `<div class="iss-mat-row"><span class="imr-name">${m.mat}</span><span class="imr-qty">${fmtNum(m.qty)} ${m.unit}</span></div>`
  ).join('') || `<div style="color:var(--text-tertiary);font-size:.78rem">No materials</div>`;

  document.getElementById('tl-foot').innerHTML = `
    <button class="btn btn-ghost" onclick="closeModal('modal-timeline')">Close</button>
    ${wo.status === 'Done' ? `<button class="btn btn-success" onclick="closeModal('modal-timeline');openApprove('${id}')">✔ Approve Job</button>` : ''}`;

  openModal('modal-timeline');
}

function setTimelineStage(id, stage) {
  const wo = DB.find('workorders', id);
  if (!wo) return;
  DB.update('workorders', id, { status: stage });
  openTimeline(id);       /* re-render modal */
  renderWorkOrders();
  updateCounts();
  const displayId = wo.woRef || wo.id;
  toast(`${displayId} → ${stage}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   APPROVAL MODAL
   KEY FIX: Use index-based IDs for excess material inputs, not name-based.
   ═══════════════════════════════════════════════════════════════════════════ */
let _activeApproveId = null;

function openApprove(id) {
  _activeApproveId = id;
  const wo = DB.find('workorders', id);
  if (!wo) return;
  const displayId = wo.woRef || wo.id;
  document.getElementById('approve-sub').textContent = `${displayId} — Worker: ${wo.workerName}`;

  document.getElementById('fa-product').value     = '';
  document.getElementById('fa-serial').value      = '';
  document.getElementById('fa-serial-status').innerHTML = '';
  document.getElementById('fa-wage-per').value    = 0;
  document.getElementById('fa-pieces').value      = 1;
  document.getElementById('fa-wage-total').value  = 0;
  document.getElementById('fa-waste-cost').value  = 0;
  document.getElementById('fa-deduct-waste').checked = false;
  document.getElementById('fa-waste-cost').disabled  = true;

  const excessEl = document.getElementById('excess-rows');
  excessEl.innerHTML = (wo.materials || []).length
    ? `<div class="mat-recipe-hdr" style="margin-bottom:0.4rem">
        <span>Material</span><span>Assigned</span><span>Used</span><span>Unused</span>
       </div>` +
      (wo.materials || []).map((m, i) => `
        <div style="display:grid;grid-template-columns:1fr 80px 90px 80px;gap:0.4rem;align-items:center;margin-bottom:0.4rem">
          <span class="er-name">${m.mat}</span>
          <span class="er-info" style="text-align:right;font-family:var(--font-mono);font-size:0.74rem">${fmtNum(m.qty)} ${m.unit}</span>
          <input class="er-input finput" id="ex-used-${i}" type="number" min="0" max="${m.qty}" step="0.01" value="${m.qty}" title="Qty consumed"/>
          <span id="ex-unused-${i}" style="text-align:right;font-family:var(--font-mono);font-size:0.74rem;color:var(--success)">0 ${m.unit}</span>
        </div>
      `).join('')
    : '<div style="color:var(--text-tertiary);font-size:.78rem">No materials</div>';

  const updateUnused = () => {
    let hasUnused = false;
    (wo.materials || []).forEach((m, i) => {
      const usedEl   = document.getElementById(`ex-used-${i}`);
      const unusedEl = document.getElementById(`ex-unused-${i}`);
      if (!usedEl || !unusedEl) return;
      const used   = Math.min(parseFloat(usedEl.value) || 0, parseFloat(m.qty));
      const unused = Math.max(0, parseFloat(m.qty) - used);
      unusedEl.textContent = `${fmtNum(unused)} ${m.unit}`;
      unusedEl.style.color = unused > 0 ? 'var(--warning)' : 'var(--success)';
      if (unused > 0) hasUnused = true;
    });
    const summary = document.getElementById('approve-unused-summary');
    if (summary) summary.innerHTML = hasUnused
      ? `<div class="banner banner-warning" style="padding:0.5rem 0.75rem;font-size:0.78rem"><span class="banner-ico">📦</span><div>Unused materials will stay <strong>with the worker</strong>. Return them to stock manually via the Worker Profile.</div></div>`
      : `<div style="font-size:0.75rem;color:var(--success)">✓ All materials accounted for as consumed</div>`;
  };

  (wo.materials || []).forEach((_, i) => {
    const el = document.getElementById(`ex-used-${i}`);
    if (el) el.addEventListener('input', updateUnused);
  });
  updateUnused();

  /* Serial number uniqueness check */
  const serialEl = document.getElementById('fa-serial');
  const serialClone = serialEl.cloneNode(true);
  serialEl.parentNode.replaceChild(serialClone, serialEl);
  document.getElementById('fa-serial').addEventListener('input', e => {
    const val = e.target.value.trim();
    const statusEl = document.getElementById('fa-serial-status');
    if (!val) { statusEl.innerHTML = ''; return; }
    statusEl.innerHTML = DB.isSerialUnique(val)
      ? `<span style="color:var(--success)">✓ Available</span>`
      : `<span style="color:var(--danger)">✕ Serial already in use</span>`;
  });

  const calcWage = () => {
    const per    = parseFloat(document.getElementById('fa-wage-per').value)  || 0;
    const pieces = parseFloat(document.getElementById('fa-pieces').value)    || 1;
    document.getElementById('fa-wage-total').value = (per * pieces).toFixed(0);
  };
  ['fa-wage-per', 'fa-pieces'].forEach(elId => {
    const el = document.getElementById(elId);
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    document.getElementById(elId).addEventListener('input', calcWage);
  });

  const deductEl = document.getElementById('fa-deduct-waste');
  const deductClone = deductEl.cloneNode(true);
  deductEl.parentNode.replaceChild(deductClone, deductEl);
  document.getElementById('fa-deduct-waste').addEventListener('change', function () {
    document.getElementById('fa-waste-cost').disabled = !this.checked;
  });

  openModal('modal-approve');
  setTimeout(() => document.getElementById('fa-product')?.focus(), 100);
}

function saveApproval() {
  const wo = DB.find('workorders', _activeApproveId);
  if (!wo) return;

  const product  = document.getElementById('fa-product').value.trim();
  const serial   = document.getElementById('fa-serial').value.trim();
  if (!product) { toast('Enter product name', 'danger'); return; }
  if (!serial)  { toast('Enter a serial number', 'danger'); return; }
  if (!DB.isSerialUnique(serial)) { toast('Serial number already in use!', 'danger'); return; }

  const totalWage   = parseFloat(document.getElementById('fa-wage-total').value)  || 0;
  const deductWaste = document.getElementById('fa-deduct-waste').checked;
  const wasteCost   = parseFloat(document.getElementById('fa-waste-cost').value)   || 0;
  const finalWage   = deductWaste ? Math.max(0, totalWage - wasteCost) : totalWage;

  /* Compute used / unused per material */
  const usedMaterials   = [];
  const unusedMaterials = [];
  (wo.materials || []).forEach((m, i) => {
    const used   = Math.min(parseFloat(document.getElementById(`ex-used-${i}`)?.value) || 0, parseFloat(m.qty));
    const unused = Math.max(0, parseFloat(m.qty) - used);
    if (used   > 0) usedMaterials.push({ mat: m.mat, qty: used,   unit: m.unit });
    if (unused > 0) unusedMaterials.push({ mat: m.mat, qty: unused, unit: m.unit, status: 'With Worker' });
  });

  /* Update worker stats — store unused materials on worker record */
  const worker = wo.workerId ? DB.find('workers', wo.workerId) : null;
  if (worker) {
    const existingUnused = worker.unusedMaterials || [];
    /* merge with any existing unused from prior jobs */
    const merged = [...existingUnused];
    unusedMaterials.forEach(um => {
      const ex = merged.find(e => e.mat === um.mat && e.unit === um.unit);
      if (ex) ex.qty = parseFloat(ex.qty) + parseFloat(um.qty);
      else merged.push({ ...um, woRef: wo.woRef || wo.id, assignedDate: todayStr() });
    });
    DB.update('workers', wo.workerId, {
      totalJobs:       (worker.totalJobs   || 0) + 1,
      totalEarned:     (worker.totalEarned || 0) + finalWage,
      unusedMaterials: merged,
    });
  }

  /* Build material cost snapshot */
  const matCostMap = {};
  DB.all('materials').forEach(m => { matCostMap[m.name] = parseFloat(m.unitCost || 0); });

  /* Add to finished goods */
  DB.insert('finished', {
    woId:            wo.woRef || wo.id,
    woDbId:          wo.id,
    workerId:        wo.workerId || null,
    workerName:      wo.workerName,
    product,
    serialNumber:    serial,
    totalWage:       finalWage,
    wastageDeducted: deductWaste ? wasteCost : 0,
    approvedDate:    todayStr(),
    materials:       usedMaterials,
    assignedMaterials: wo.materials,
    matCostSnapshot: JSON.parse(JSON.stringify(matCostMap)),
    sold:            false,
  });

  /* Mark WO approved */
  DB.update('workorders', _activeApproveId, { status: 'Approved' });

  closeModal('modal-approve');
  renderWorkOrders();
  renderWorkers();
  renderFinished();
  renderMaterials();
  updateCounts();
  const displayId = wo.woRef || wo.id;
  const unusedNote = unusedMaterials.length ? ` — ${unusedMaterials.length} material(s) remain with worker` : '';
  toast(`${displayId} approved — "${product}" · SN:${serial}${unusedNote}`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: FINISHED GOODS
   KEY FIX: Use matCostSnapshot stored at approval time instead of live lookup
   ═══════════════════════════════════════════════════════════════════════════ */
function renderFinished() {
  const fin    = DB.all('finished');
  const search = (document.getElementById('fg-search')?.value || '').toLowerCase();
  const filtered = fin.filter(f =>
    (f.product    || '').toLowerCase().includes(search) ||
    (f.workerName || '').toLowerCase().includes(search) ||
    (f.woId       || '').toLowerCase().includes(search)
  );

  const totalWage = fin.reduce((s, f) => s + parseFloat(f.totalWage || 0), 0);

  /* FIX: use snapshot stored at approval, fallback to live lookup */
  const totalMatCost = fin.reduce((s, f) => {
    const snapshot = f.matCostSnapshot || {};
    return s + (f.materials || []).reduce((ss, m) => {
      const cost = snapshot[m.mat] ?? DB.all('materials').find(ma => ma.name === m.mat)?.unitCost ?? 0;
      return ss + parseFloat(m.qty || 0) * parseFloat(cost);
    }, 0);
  }, 0);

  const statsEl = document.getElementById('fg-stats');
  if (statsEl) statsEl.innerHTML = `
    <div class="stat-card"><span class="sc-ico">✅</span><div class="sc-lbl">Items Completed</div><div class="sc-val">${fin.length}</div><div class="sc-sub">approved goods</div></div>
    <div class="stat-card"><span class="sc-ico">💳</span><div class="sc-lbl">Total Wages Paid</div><div class="sc-val" style="font-size:1.3rem">${fmtMoney(totalWage)}</div><div class="sc-sub">to workers</div></div>
    <div class="stat-card"><span class="sc-ico">👷</span><div class="sc-lbl">Workers Paid</div><div class="sc-val">${new Set(fin.map(f => f.workerName)).size}</div><div class="sc-sub">unique workers</div></div>
    <div class="stat-card"><span class="sc-ico">📦</span><div class="sc-lbl">Material Cost</div><div class="sc-val" style="font-size:1.3rem">${fmtMoney(totalMatCost)}</div><div class="sc-sub">issued materials</div></div>
  `;

  const list = document.getElementById('fg-list');
  if (!list) return;

  /* Product summary table — group by product name */
  const productMap = {};
  fin.forEach(f => {
    const key = f.product;
    if (!productMap[key]) productMap[key] = { name: key, total: 0, inStock: 0, sold: 0 };
    productMap[key].total++;
    if (f.sold) productMap[key].sold++; else productMap[key].inStock++;
  });
  const summaryRows = Object.values(productMap).sort((a,b) => b.total - a.total);
  const summaryTable = summaryRows.length ? `
    <div class="card" style="margin-bottom:1.2rem">
      <div class="card-hdr"><span class="card-title">📊 Product Summary</span></div>
      <div class="card-body" style="padding:0">
        <table class="data-table">
          <thead><tr><th>Product Name</th><th>Total Qty</th><th>In Stock</th><th>Sold</th></tr></thead>
          <tbody>
            ${summaryRows.map(p => `<tr>
              <td class="td-name">${p.name}</td>
              <td class="td-mono" style="text-align:center"><strong>${p.total}</strong></td>
              <td class="td-mono" style="text-align:center;color:var(--primary)">${p.inStock}</td>
              <td class="td-mono" style="text-align:center;color:var(--success)">${p.sold}</td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
    </div>` : '';

  list.innerHTML = summaryTable + (filtered.length ? filtered.map(f => `
    <div class="fg-card">
      <div class="fg-icon">🪑</div>
      <div class="fg-body">
        <div class="fg-product">${f.product}</div>
        ${f.serialNumber ? `<div style="font-family:var(--font-mono);font-size:0.72rem;color:var(--text-tertiary);margin-bottom:0.2rem">📟 SN: ${f.serialNumber}</div>` : ''}
        <div class="fg-meta">
          <span>👷 ${f.workerName}</span>
          <span>📋 ${f.woId}</span>
          <span>📅 ${fmtDate(f.approvedDate)}</span>
          ${f.sold ? `<span class="badge badge-success" style="font-size:0.65rem">🧾 Sold</span>` : `<span class="badge badge-info" style="font-size:0.65rem">📦 In Stock</span>`}
        </div>
        <div class="fg-wage">💳 Wage: ${fmtMoney(f.totalWage || 0)}${f.wastageDeducted ? ` (−${fmtMoney(f.wastageDeducted)})` : ''}</div>
      </div>
      <div class="acts" style="flex-shrink:0;flex-direction:column;gap:0.4rem">
        ${!f.sold ? `<button class="btn btn-primary btn-sm" onclick="openSalesModal('${f.id}')">🧾 Sell</button>` : ''}
        <button class="act-btn danger" onclick="deleteFG('${f.id}')">🗑</button>
      </div>
    </div>`).join('')
    : `<div class="table-card"><div class="t-empty"><span class="t-empty-ico">✅</span>${fin.length ? 'No results' : 'No finished goods'}</div></div>`);
}

function deleteFG(id) {
  if (!confirm('Delete this finished goods record?')) return;
  DB.delete('finished', id);
  renderFinished();
  updateCounts();
  toast('Record deleted', 'warning');
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: REPORTS
   ═══════════════════════════════════════════════════════════════════════════ */
function renderReports() {
  const mats    = DB.all('materials');
  const wos     = DB.all('workorders');
  const fin     = DB.all('finished');
  const workers = DB.all('workers');
  const sales   = DB.all('sales');

  const stockVal    = mats.reduce((s, m) => s + parseFloat(m.qty || 0) * parseFloat(m.unitCost || 0), 0);
  const totalWages  = fin.reduce((s, f) => s + parseFloat(f.totalWage || 0), 0);
  const totalSales  = sales.reduce((s, sl) => s + parseFloat(sl.totalAmount || sl.amount || 0), 0);
  const grossProfit = totalSales - totalWages;
  const lowCount    = mats.filter(m => stockStatus(m) !== 'ok').length;
  const workersWithUnused = workers.filter(w => (w.unusedMaterials || []).length > 0).length;

  const body = document.getElementById('report-summary-body');
  if (!body) return;
  body.innerHTML = `
    <div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:.9rem">
      <div class="stat-card"><span class="sc-ico">📦</span><div class="sc-lbl">Stock Value</div><div class="sc-val" style="font-size:1.1rem">${fmtMoney(stockVal)}</div></div>
      <div class="stat-card"><span class="sc-ico">👷</span><div class="sc-lbl">Workers</div><div class="sc-val">${workers.length}</div></div>
      <div class="stat-card"><span class="sc-ico">📋</span><div class="sc-lbl">Total Orders</div><div class="sc-val">${wos.length}</div></div>
      <div class="stat-card"><span class="sc-ico">💳</span><div class="sc-lbl">Total Wages</div><div class="sc-val" style="font-size:1.1rem">${fmtMoney(totalWages)}</div></div>
      <div class="stat-card"><span class="sc-ico">💰</span><div class="sc-lbl">Sales Revenue</div><div class="sc-val" style="font-size:1.1rem;color:var(--success)">${fmtMoney(totalSales)}</div></div>
      <div class="stat-card" style="border-color:${grossProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">
        <span class="sc-ico">${grossProfit >= 0 ? '📈' : '📉'}</span>
        <div class="sc-lbl">Gross Profit</div>
        <div class="sc-val" style="font-size:1.1rem;color:${grossProfit >= 0 ? 'var(--success)' : 'var(--danger)'}">${fmtMoney(grossProfit)}</div>
        <div class="sc-sub">Revenue - Wages</div>
      </div>
      <div class="stat-card"><span class="sc-ico">\u26a0\ufe0f</span><div class="sc-lbl">Low/Out Stock</div><div class="sc-val" style="color:${lowCount ? 'var(--warning)' : 'var(--success)'}">${lowCount}</div></div>
      <div class="stat-card"><span class="sc-ico">📦</span><div class="sc-lbl">Workers w/ Unused</div><div class="sc-val" style="color:${workersWithUnused ? 'var(--warning)' : 'var(--success)'}">${workersWithUnused}</div></div>
    </div>`;
}

function exportDataJSON() {
  const data = {
    exportedAt: new Date().toISOString(),
    materials:  DB.all('materials'),
    bills:      DB.all('bills'),
    presets:    DB.all('presets'),
    workers:    DB.all('workers'),
    workorders: DB.all('workorders'),
    finished:   DB.all('finished'),
    sales:      DB.all('sales'),
  };
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = Object.assign(document.createElement('a'), { href: url, download: `VI-BMS-backup-${todayStr()}.json` });
  a.click();
  URL.revokeObjectURL(url);
  toast('Data exported as JSON backup');
}

function importDataJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!confirm('Import data from ' + (data.exportedAt ? new Date(data.exportedAt).toLocaleString('en-IN') : 'unknown date') + '?\n\nThis will REPLACE all current data.')) return;
      const PREFIX = 'vi_bms_';
      ['materials','bills','presets','workers','workorders','finished','sales'].forEach(col => {
        if (data[col]) localStorage.setItem(PREFIX + col, JSON.stringify(data[col]));
      });
      location.reload();
    } catch(err) {
      toast('Invalid backup file', 'danger');
    }
  };
  reader.readAsText(file);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: WORKER PROFILE
   Shows assigned, used, and unused materials per worker with manual return.
   ═══════════════════════════════════════════════════════════════════════════ */
let _currentWorkerProfileId = null;

function renderWorkerProfile() {
  const wid = _currentWorkerProfileId;
  const pageEl = document.getElementById('page-worker-profile');
  if (!pageEl) return;
  if (!wid) { pageEl.innerHTML = '<div class="page-inner"><div class="t-empty">No worker selected</div></div>'; return; }

  const worker = DB.find('workers', wid);
  if (!worker) { pageEl.innerHTML = '<div class="page-inner"><div class="t-empty">Worker not found</div></div>'; return; }

  const wos        = DB.where('workorders', w => w.workerId === wid);
  const activeWOs  = wos.filter(w => w.status !== 'Approved');
  const fin        = DB.where('finished',   f => f.workerId === wid);
  const unusedMats = worker.unusedMaterials || [];

  /* Gather all assigned materials from active WOs */
  const assignedMats = [];
  activeWOs.forEach(wo => {
    (wo.materials || []).forEach(m => {
      assignedMats.push({ ...m, woRef: wo.woRef || wo.id, assignedDate: wo.createdAt });
    });
  });

  /* Gather all used materials from finished records */
  const usedMats = [];
  fin.forEach(f => {
    (f.materials || []).forEach(m => {
      usedMats.push({ ...m, product: f.product, serial: f.serialNumber, date: f.approvedDate });
    });
  });

  /* Update breadcrumb with worker's name */
  const bcEl = document.getElementById('bc-page');
  if (bcEl) bcEl.textContent = `Worker Profile — ${worker.name}`;

  pageEl.innerHTML = `<div class="page-inner">
    <!-- Back + Header -->
    <div style="display:flex;align-items:center;gap:1rem;margin-bottom:1.5rem">
      <button class="btn btn-ghost btn-sm" onclick="nav('workers')">← Back to Workers</button>
    </div>

    <!-- Worker card -->
    <div class="card" style="margin-bottom:1.2rem">
      <div class="card-hdr" style="background:var(--primary-light)">
        <div style="display:flex;align-items:center;gap:1rem">
          <div style="width:52px;height:52px;border-radius:50%;background:linear-gradient(135deg,var(--primary),var(--accent));color:#fff;font-family:var(--font-display);font-size:1.5rem;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0">
            ${worker.name.charAt(0).toUpperCase()}
          </div>
          <div>
            <div class="card-title" style="font-size:1.2rem">${worker.name}</div>
            <div style="font-size:0.78rem;color:var(--text-tertiary)">${worker.skill || '—'} &nbsp;·&nbsp; ${worker.phone || 'No phone'}</div>
          </div>
        </div>
        <div style="display:flex;gap:0.6rem;flex-wrap:wrap">
          <div class="stat-card" style="min-width:90px;padding:0.6rem">
            <div class="sc-lbl">Jobs Done</div><div class="sc-val">${worker.totalJobs || 0}</div>
          </div>
          <div class="stat-card" style="min-width:90px;padding:0.6rem">
            <div class="sc-lbl">Total Earned</div><div class="sc-val" style="font-size:1rem">${fmtMoney(worker.totalEarned || 0)}</div>
          </div>
        </div>
      </div>
    </div>

    <div class="two-col">

      <!-- A. Assigned Materials (from active WOs) -->
      <div class="card">
        <div class="card-hdr"><span class="card-title">📋 Assigned Materials</span><span style="font-size:0.7rem;color:var(--text-tertiary)">From active work orders</span></div>
        <div class="card-body">
          ${assignedMats.length
            ? `<table class="data-table" style="font-size:0.8rem">
                <thead><tr><th>Material</th><th>Qty</th><th>Unit</th><th>Work Order</th></tr></thead>
                <tbody>${assignedMats.map(m => `<tr>
                  <td class="td-name">${m.mat}</td>
                  <td class="td-mono">${fmtNum(m.qty)}</td>
                  <td class="td-mono">${m.unit}</td>
                  <td><span class="badge badge-info" style="font-size:0.65rem">${m.woRef}</span></td>
                </tr>`).join('')}</tbody>
               </table>`
            : '<div class="dash-empty">No active assignments</div>'}
        </div>
      </div>

      <!-- C. Unused Materials (with worker) -->
      <div class="card" style="border:1px solid rgba(245,127,23,0.3)">
        <div class="card-hdr" style="background:var(--warning-light)">
          <span class="card-title" style="color:var(--warning)">📦 Unused Materials — With Worker</span>
          ${unusedMats.length ? `<button class="btn btn-primary btn-sm" onclick="openDirectReturn('${wid}')">↩ Return to Stock</button>` : ''}
        </div>
        <div class="card-body">
          ${unusedMats.length
            ? `<table class="data-table" style="font-size:0.8rem">
                <thead><tr><th>Material</th><th>Qty</th><th>Unit</th><th>Status</th></tr></thead>
                <tbody>${unusedMats.map(m => `<tr>
                  <td class="td-name">${m.mat}</td>
                  <td class="td-mono">${fmtNum(m.qty)}</td>
                  <td class="td-mono">${m.unit}</td>
                  <td><span class="badge badge-warning" style="font-size:0.65rem">With Worker</span></td>
                </tr>`).join('')}</tbody>
               </table>`
            : '<div class="dash-empty" style="color:var(--success)">✓ No unused materials</div>'}
        </div>
      </div>
    </div>

    <!-- B. Used Materials -->
    <div class="card" style="margin-top:1.2rem">
      <div class="card-hdr"><span class="card-title">✅ Used Materials — Consumed in Production</span></div>
      <div class="card-body">
        ${usedMats.length
          ? `<table class="data-table" style="font-size:0.8rem">
              <thead><tr><th>Material</th><th>Qty Consumed</th><th>Unit</th><th>Product</th><th>Serial No.</th><th>Date</th></tr></thead>
              <tbody>${usedMats.map(m => `<tr>
                <td class="td-name">${m.mat}</td>
                <td class="td-mono">${fmtNum(m.qty)}</td>
                <td class="td-mono">${m.unit}</td>
                <td>${m.product || '—'}</td>
                <td><span class="badge badge-primary" style="font-size:0.65rem;font-family:var(--font-mono)">${m.serial || '—'}</span></td>
                <td class="td-mono">${fmtDate(m.date)}</td>
              </tr>`).join('')}</tbody>
             </table>`
          : '<div class="dash-empty">No completed production yet</div>'}
      </div>
    </div>

    <!-- Final Products + Add Final Product -->
    <div class="card" style="margin-top:1.2rem">
      <div class="card-hdr">
        <span class="card-title">🪑 Finished Products by This Worker</span>
        <button class="btn btn-primary btn-sm" onclick="nav('finished')">+ Add Final Product</button>
      </div>
      <div class="card-body">
        ${fin.length
          ? fin.map(f => `<div class="dash-row" style="align-items:flex-start;gap:0.5rem">
              <div>
                <div style="font-weight:600">${f.product}</div>
                ${f.serialNumber ? `<div style="font-size:0.7rem;font-family:var(--font-mono);color:var(--text-tertiary)">SN: ${f.serialNumber}</div>` : ''}
                <div style="font-size:0.72rem;color:var(--text-tertiary)">${fmtDate(f.approvedDate)}</div>
              </div>
              <div style="display:flex;gap:0.4rem;align-items:center">
                ${f.sold ? `<span class="badge badge-success" style="font-size:0.65rem">🧾 Sold</span>` : `<span class="badge badge-info" style="font-size:0.65rem">📦 In Stock</span>`}
                ${!f.sold ? `<button class="btn btn-primary btn-sm" onclick="openSalesModal('${f.id}')">🧾 Sell</button>` : ''}
              </div>
            </div>`).join('')
          : '<div class="dash-empty">No finished products yet</div>'}
      </div>
    </div>
  </div>`;
}

/* ═══════════════════════════════════════════════════════════════════════════
   DIRECT STOCK RETURN — from Worker Profile, no approval needed
   ═══════════════════════════════════════════════════════════════════════════ */
let _directReturnWorkerId = null;

function openDirectReturn(wid) {
  _directReturnWorkerId = wid;
  const worker = DB.find('workers', wid);
  if (!worker) return;
  const unused = worker.unusedMaterials || [];
  document.getElementById('dr-sub').textContent = `Worker: ${worker.name}`;

  const rows = document.getElementById('dr-rows');
  rows.innerHTML = unused.length
    ? `<div class="mat-recipe-hdr" style="margin-bottom:0.4rem">
        <span>Material</span><span>With Worker</span><span>Return Qty</span>
       </div>` +
      unused.map((m, i) => `
        <div style="display:grid;grid-template-columns:1fr 90px 90px;gap:0.4rem;align-items:center;margin-bottom:0.4rem">
          <span class="er-name">${m.mat}</span>
          <span style="text-align:right;font-family:var(--font-mono);font-size:0.74rem">${fmtNum(m.qty)} ${m.unit}</span>
          <input class="finput er-input" id="dr-qty-${i}" type="number" min="0" max="${m.qty}" step="0.01" value="${m.qty}"/>
        </div>`).join('')
    : '<div style="color:var(--text-tertiary)">No unused materials</div>';

  const btn = document.getElementById('dr-confirm');
  const clone = btn.cloneNode(true);
  btn.parentNode.replaceChild(clone, btn);
  document.getElementById('dr-confirm').addEventListener('click', saveDirectReturn);

  openModal('modal-direct-return');
}

function saveDirectReturn() {
  const worker = DB.find('workers', _directReturnWorkerId);
  if (!worker) return;
  const unused = worker.unusedMaterials || [];
  const remaining = [];
  let returnedCount = 0;

  unused.forEach((m, i) => {
    const retQty  = Math.min(parseFloat(document.getElementById(`dr-qty-${i}`)?.value) || 0, parseFloat(m.qty));
    const leftQty = Math.max(0, parseFloat(m.qty) - retQty);
    if (retQty > 0) {
      DB.adjustStock(m.mat, retQty);   /* add directly back to stock */
      returnedCount++;
    }
    if (leftQty > 0) remaining.push({ ...m, qty: leftQty });
  });

  if (!returnedCount) { toast('No quantities entered', 'warning'); return; }

  DB.update('workers', _directReturnWorkerId, { unusedMaterials: remaining });
  closeModal('modal-direct-return');
  renderWorkerProfile();
  renderMaterials();
  updateCounts();
  toast(`${returnedCount} material(s) returned to stock`);
}

/* ═══════════════════════════════════════════════════════════════════════════
   PAGE: SALES BILLS
   ═══════════════════════════════════════════════════════════════════════════ */
let _salesLinkedFGId = null;

function openSalesModal(fgId) {
  _salesLinkedFGId = fgId || null;
  document.getElementById('fsl-date').value        = todayStr();
  document.getElementById('fsl-buyer-name').value  = '';
  document.getElementById('fsl-buyer-phone').value = '';
  document.getElementById('fsl-buyer-addr').value  = '';
  document.getElementById('fsl-amount').value      = '';
  document.getElementById('fsl-tax-pct').value     = '0';
  document.getElementById('fsl-total').value       = '';
  document.getElementById('fsl-billno').value      = '';
  document.getElementById('fsl-buyer-type').value  = 'Shop';
  document.getElementById('fsl-serial').value      = '';
  document.getElementById('fsl-product-preview').innerHTML = '';
  document.getElementById('fsl-tax-breakdown').style.display = 'none';

  /* Tax live calc */
  const calcTotal = () => {
    const base = parseFloat(document.getElementById('fsl-amount').value) || 0;
    const pct  = parseFloat(document.getElementById('fsl-tax-pct').value) || 0;
    const tax  = base * pct / 100;
    const tot  = base + tax;
    document.getElementById('fsl-total').value = tot.toFixed(2);
    const bd = document.getElementById('fsl-tax-breakdown');
    if (pct > 0 && base > 0) {
      bd.style.display = 'block';
      bd.innerHTML = `Base: ${fmtMoney(base)} + Tax (${pct}%): ${fmtMoney(tax)} = <strong>${fmtMoney(tot)}</strong>`;
    } else { bd.style.display = 'none'; }
  };
  ['fsl-amount', 'fsl-tax-pct'].forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const clone = el.cloneNode(true);
    el.parentNode.replaceChild(clone, el);
    document.getElementById(id).addEventListener('input', calcTotal);
  });

  const finGoods = DB.all('finished').filter(f => !f.sold);
  if (fgId) {
    const fg = DB.find('finished', fgId);
    if (fg?.serialNumber) {
      document.getElementById('fsl-serial').value = fg.serialNumber;
      showProductPreview(fg);
    }
  }

  buildCombo('fsl-serial', 'fsl-serial-drop', finGoods.map(f => f.serialNumber).filter(Boolean), val => {
    const fg = finGoods.find(f => f.serialNumber === val);
    if (fg) { _salesLinkedFGId = fg.id; showProductPreview(fg); }
  });

  const btn = document.getElementById('sl-save');
  const clone = btn.cloneNode(true);
  btn.parentNode.replaceChild(clone, btn);
  document.getElementById('sl-save').addEventListener('click', saveSalesBill);

  openModal('modal-sales');
}

function showProductPreview(fg) {
  document.getElementById('fsl-product-preview').innerHTML = `
    <div class="banner banner-info" style="padding:0.5rem 0.75rem;font-size:0.78rem;background:var(--primary-light);border-left:3px solid var(--primary)">
      <div><strong>Product:</strong> ${fg.product} &nbsp;·&nbsp; <strong>Worker:</strong> ${fg.workerName} &nbsp;·&nbsp; <strong>Date:</strong> ${fmtDate(fg.approvedDate)}</div>
      ${(fg.materials||[]).length ? `<div style="margin-top:0.2rem;color:var(--text-tertiary)">Materials: ${fg.materials.map(m=>`${fmtNum(m.qty)} ${m.unit} ${m.mat}`).join(', ')}</div>` : ''}
    </div>`;
}

function saveSalesBill() {
  const serial    = document.getElementById('fsl-serial').value.trim();
  const buyerName = document.getElementById('fsl-buyer-name').value.trim();
  const buyerType = document.getElementById('fsl-buyer-type').value;
  const date      = document.getElementById('fsl-date').value;
  const baseAmt   = parseFloat(document.getElementById('fsl-amount').value) || 0;
  const taxPct    = parseFloat(document.getElementById('fsl-tax-pct').value) || 0;
  const taxAmt    = baseAmt * taxPct / 100;
  const totalAmt  = baseAmt + taxAmt;
  const billno    = document.getElementById('fsl-billno').value.trim();

  if (!serial)    { toast('Enter a serial number', 'danger'); return; }
  if (!buyerName) { toast('Enter buyer name', 'danger'); return; }
  if (!date)      { toast('Select a date', 'danger'); return; }
  if (!baseAmt)   { toast('Enter sale amount', 'danger'); return; }

  let fg = _salesLinkedFGId ? DB.find('finished', _salesLinkedFGId) : null;
  if (!fg) fg = DB.all('finished').find(f => f.serialNumber === serial);
  if (!fg) { toast('Product with this serial not found in finished goods', 'danger'); return; }
  if (fg.sold) { toast('This product has already been sold!', 'danger'); return; }

  DB.insert('sales', {
    billno,
    date,
    buyerType,
    buyerName,
    buyerPhone:  document.getElementById('fsl-buyer-phone').value.trim(),
    buyerAddr:   document.getElementById('fsl-buyer-addr').value.trim(),
    serialNumber: serial,
    product:     fg.product,
    workerId:    fg.workerId,
    workerName:  fg.workerName,
    materials:   fg.materials,
    fgId:        fg.id,
    amount:      baseAmt,
    taxPct,
    taxAmt,
    totalAmount: totalAmt,
  });

  DB.update('finished', fg.id, { sold: true, soldDate: date, buyerName, buyerType });

  closeModal('modal-sales');
  renderSales();
  renderFinished();
  updateCounts();
  toast(`Bill created — ${fg.product} · SN:${serial} → ${buyerType}: ${buyerName} · ${fmtMoney(totalAmt)}`);
}

function renderSales() {
  const allSales = DB.all('sales');
  const search   = (document.getElementById('sales-search')?.value || '').toLowerCase();
  const sales    = allSales.filter(sl =>
    (sl.product     || '').toLowerCase().includes(search) ||
    (sl.serialNumber|| '').toLowerCase().includes(search) ||
    (sl.buyerName   || '').toLowerCase().includes(search) ||
    (sl.billno      || '').toLowerCase().includes(search)
  );
  const listEl = document.getElementById('sales-list');
  if (!listEl) return;

  const totalSales = allSales.reduce((s, sl) => s + parseFloat(sl.totalAmount || sl.amount || 0), 0);
  const statsEl = document.getElementById('sales-stats');
  if (statsEl) statsEl.innerHTML = `
    <div class="stat-card"><span class="sc-ico">🧾</span><div class="sc-lbl">Total Bills</div><div class="sc-val">${allSales.length}</div></div>
    <div class="stat-card"><span class="sc-ico">💰</span><div class="sc-lbl">Total Sales</div><div class="sc-val" style="font-size:1.2rem;color:var(--success)">${fmtMoney(totalSales)}</div></div>
    <div class="stat-card"><span class="sc-ico">🏪</span><div class="sc-lbl">Shops</div><div class="sc-val">${allSales.filter(s=>s.buyerType==='Shop').length}</div></div>
    <div class="stat-card"><span class="sc-ico">👤</span><div class="sc-lbl">Direct Customers</div><div class="sc-val">${allSales.filter(s=>s.buyerType==='Customer').length}</div></div>
  `;

  if (!allSales.length) {
    listEl.innerHTML = `<div class="table-card"><div class="t-empty"><span class="t-empty-ico">🧾</span>No sales bills yet</div></div>`;
    return;
  }
  if (!sales.length) {
    listEl.innerHTML = `<div class="table-card"><div class="t-empty"><span class="t-empty-ico">🔍</span>No results for "${search}"</div></div>`;
    return;
  }

  listEl.innerHTML = sales.map(sl => `
    <div class="wo-card">
      <div class="wo-card-hdr">
        <div class="wc-left">
          <div class="wc-id" style="font-family:var(--font-mono)">${sl.serialNumber}</div>
          <div class="wc-worker">${sl.buyerType === 'Shop' ? '🏪' : '👤'} ${sl.buyerName} ${sl.buyerPhone ? '· ' + sl.buyerPhone : ''}</div>
          ${sl.buyerAddr ? `<div class="wc-notes">${sl.buyerAddr}</div>` : ''}
        </div>
        <div class="wc-badges">
          <div style="text-align:right">
            ${sl.taxPct > 0 ? `<div style="font-size:0.68rem;color:var(--text-tertiary);font-family:var(--font-mono)">${fmtMoney(sl.amount)} + ${sl.taxPct}% tax</div>` : ''}
            <div style="font-weight:700;color:var(--primary);font-family:var(--font-mono);font-size:1rem">${fmtMoney(sl.totalAmount || sl.amount)}</div>
          </div>
        </div>
      </div>
      <div class="wo-card-body">
        <div class="wo-meta"><div class="wm-lbl">Product</div><div class="wm-val">${sl.product}</div></div>
        <div class="wo-meta"><div class="wm-lbl">Worker</div><div class="wm-val">${sl.workerName}</div></div>
        <div class="wo-meta"><div class="wm-lbl">Date</div><div class="wm-val">${fmtDate(sl.date)}</div></div>
        ${sl.billno ? `<div class="wo-meta"><div class="wm-lbl">Bill No.</div><div class="wm-val">${sl.billno}</div></div>` : ''}
      </div>
      <div class="wo-card-foot">
        <div class="acts">
          <button class="btn btn-ghost btn-sm" onclick="printSalesBill('${sl.id}')">🖨 Print Bill</button>
          <button class="act-btn danger" onclick="deleteSale('${sl.id}')">🗑</button>
        </div>
      </div>
    </div>`).join('');
}

function printSalesBill(id) {
  const sl  = DB.find('sales', id);
  if (!sl) return;
  const win = window.open('', '_blank');
  win.document.write(`
    <!DOCTYPE html><html><head><title>Sales Bill — ${sl.serialNumber}</title>
    <style>
      body { font-family: Arial, sans-serif; padding: 30px; color: #000; font-size: 13px; }
      h1 { color: #0d47a1; margin-bottom: 4px; }
      .sub { color: #555; margin-bottom: 20px; font-size: 11px; }
      .block { border: 1px solid #ddd; border-radius: 8px; padding: 14px; margin-bottom: 14px; }
      .label { font-weight: bold; color: #555; font-size: 11px; text-transform: uppercase; letter-spacing: 1px; }
      .val { font-size: 14px; margin-top: 2px; }
      .row { display: flex; gap: 30px; flex-wrap: wrap; }
      .col { flex: 1; min-width: 120px; }
      .total { font-size: 1.4rem; font-weight: bold; color: #0d47a1; margin-top: 10px; text-align: right; }
      .mat-row { display: flex; justify-content: space-between; padding: 4px 0; border-bottom: 1px solid #eee; }
      .footer { margin-top: 30px; font-size: 10px; color: #999; text-align: center; }
    </style></head><body>
    <h1>Vishnupriyaa Industries</h1>
    <div class="sub">Sales Bill ${sl.billno ? '· #' + sl.billno : ''} &nbsp;·&nbsp; ${new Date(sl.date+'T12:00:00').toLocaleDateString('en-IN',{day:'2-digit',month:'long',year:'numeric'})}</div>
    <div class="block">
      <div class="label">Product</div>
      <div class="val">${sl.product}</div>
      <div style="font-size:11px;font-family:monospace;color:#555;margin-top:3px">Serial: ${sl.serialNumber}</div>
    </div>
    <div class="block">
      <div class="label">Buyer</div>
      <div class="row" style="margin-top:6px">
        <div class="col"><div class="label">Type</div><div class="val">${sl.buyerType}</div></div>
        <div class="col"><div class="label">Name</div><div class="val">${sl.buyerName}</div></div>
        ${sl.buyerPhone ? `<div class="col"><div class="label">Phone</div><div class="val">${sl.buyerPhone}</div></div>` : ''}
      </div>
      ${sl.buyerAddr ? `<div style="margin-top:8px"><div class="label">Address</div><div class="val">${sl.buyerAddr}</div></div>` : ''}
    </div>
    ${(sl.materials||[]).length ? `
    <div class="block">
      <div class="label">Materials Used</div>
      <div style="margin-top:8px">${sl.materials.map(m=>`<div class="mat-row"><span>${m.mat}</span><span>${m.qty} ${m.unit}</span></div>`).join('')}</div>
    </div>` : ''}
    <div class="block">
      <div class="label">Worker</div>
      <div class="val">${sl.workerName}</div>
    </div>
    <div class="total">
      ${sl.taxPct > 0 ? `
        <div style="font-size:0.9rem;font-weight:normal;color:#555;margin-bottom:4px">Base Amount: ₹${parseFloat(sl.amount).toLocaleString('en-IN',{minimumFractionDigits:2})}</div>
        <div style="font-size:0.9rem;font-weight:normal;color:#555;margin-bottom:4px">Tax (${sl.taxPct}%): ₹${parseFloat(sl.taxAmt||0).toLocaleString('en-IN',{minimumFractionDigits:2})}</div>
      ` : ''}
      Total: ₹${parseFloat(sl.totalAmount||sl.amount).toLocaleString('en-IN', {minimumFractionDigits:2})}
    </div>
    <div class="footer">Generated by Vishnupriyaa Industries BMS v2 · ${new Date().toLocaleDateString('en-IN')}</div>
    </body></html>`);
  win.document.close();
  setTimeout(() => win.print(), 400);
}

function deleteSale(id) {
  const sl = DB.find('sales', id);
  if (!sl) return;
  if (!confirm('Delete this sales bill? The product will be marked as unsold.')) return;
  DB.delete('sales', id);
  /* Unmark the finished good */
  if (sl.fgId) DB.update('finished', sl.fgId, { sold: false, soldDate: null, buyerName: null, buyerType: null });
  renderSales();
  renderFinished();
  updateCounts();
  toast('Sales bill deleted', 'warning');
}


document.addEventListener('DOMContentLoaded', () => {
  /* Build modals */
  createModals();

  /* Sidebar toggle */
  document.getElementById('menu-toggle')?.addEventListener('click', () => {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('page-overlay').classList.toggle('show');
  });
  document.getElementById('page-overlay')?.addEventListener('click', closeMobileSidebar);

  /* Nav buttons */
  document.querySelectorAll('.nav-btn[data-page]').forEach(btn => {
    btn.addEventListener('click', () => nav(btn.dataset.page));
  });

  /* Material page */
  document.getElementById('mat-search')?.addEventListener('input', renderMaterials);
  document.querySelectorAll('#mat-pills .tpill').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#mat-pills .tpill').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    matFilter = b.dataset.val;
    renderMaterials();
  }));
  document.getElementById('mat-save')?.addEventListener('click', saveMat);

  /* Supplier page */
  document.getElementById('sup-search')?.addEventListener('input', renderSuppliers);
  document.getElementById('sup-add-row')?.addEventListener('click', () => {
    _supRows.push({ mat: '', qty: 0, unit: '', price: 0 });
    renderSupRows();
  });
  document.getElementById('sup-save')?.addEventListener('click', saveSupplierBill);

  /* Material Sets page */
  document.getElementById('predef-search')?.addEventListener('input', renderPredef);
  document.getElementById('predef-add-mat')?.addEventListener('click', () => {
    _predefMatRows.push({ mat: '', qty: 0, unit: '' });
    renderPredefMatRows();
  });
  document.getElementById('predef-save')?.addEventListener('click', savePredef);

  /* Workers page */
  document.getElementById('worker-search')?.addEventListener('input', renderWorkers);
  document.querySelectorAll('#worker-pills .tpill').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#worker-pills .tpill').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    _workerFilter = b.dataset.val;
    renderWorkers();
  }));
  document.getElementById('worker-save')?.addEventListener('click', saveWorker);

  /* Work Orders page */
  document.getElementById('wo-search')?.addEventListener('input', renderWorkOrders);
  document.querySelectorAll('#wo-pills .tpill').forEach(b => b.addEventListener('click', () => {
    document.querySelectorAll('#wo-pills .tpill').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    _woFilter = b.dataset.val;
    renderWorkOrders();
  }));
  document.getElementById('wo-add-mat')?.addEventListener('click', () => {
    _woMatRows.push({ mat: '', qty: 0, unit: '' });
    renderWOMatRows();
    document.getElementById('wo-clear-mat').style.display = 'inline-flex';
  });
  document.getElementById('wo-clear-mat')?.addEventListener('click', () => {
    _woMatRows = [];
    renderWOMatRows();
    document.getElementById('wo-clear-mat').style.display = 'none';
  });
  document.getElementById('wo-save')?.addEventListener('click', saveWorkOrder);

  /* Finished Goods */
  document.getElementById('fg-search')?.addEventListener('input', renderFinished);

  /* Sales */
  document.getElementById('sales-search')?.addEventListener('input', renderSales);

  /* Approval modal save */
  document.getElementById('approve-confirm')?.addEventListener('click', saveApproval);

  /* Direct return confirm */
  document.getElementById('dr-confirm')?.addEventListener('click', saveDirectReturn);

  /* Sales save */
  document.getElementById('sl-save')?.addEventListener('click', saveSalesBill);

  /* Import file input */
  document.getElementById('import-file-input')?.addEventListener('change', e => {
    importDataJSON(e.target.files[0]);
  });

  /* Init */
  updateDate();
  scheduleDateRefresh();
  updateCounts();
  nav('dashboard');
});