// ============================================
// PAINEL ADM - Main Application
// ============================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged, updateEmail
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-auth.js';
import {
  getFirestore, collection, doc, addDoc, getDoc, getDocs,
  updateDoc, deleteDoc, setDoc, query, where, onSnapshot,
  serverTimestamp, Timestamp
} from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-firestore.js';

// === Firebase Config ===
const firebaseConfig = {
  apiKey: "AIzaSyDvQ6ftCdwG5MLCwDVNmn5lUVAS3xmUdyk",
  authDomain: "paineladm-55f11.firebaseapp.com",
  projectId: "paineladm-55f11",
  storageBucket: "paineladm-55f11.firebasestorage.app",
  messagingSenderId: "578697034333",
  appId: "1:578697034333:web:e659e4226e705ed7396bb4"
};
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// === Master Admin Config ===
// O ADM Master é o único que pode promover/rebaixar outros ADMs
// Ele não aparece na lista de usuários comuns
const MASTER_EMAIL = 'ssantosmattheuss@gmail.com';

// Verifica se o usuário logado é o ADM Master
function isMasterAdmin() {
  const profileEmail = (state.userProfile?.email || '').trim().toLowerCase();
  const authEmail = (state.currentUser?.email || '').trim().toLowerCase();
  const masterLower = MASTER_EMAIL.toLowerCase();
  const isMaster = profileEmail === masterLower || authEmail === masterLower;
  console.log('[MasterAdmin] profile email:', profileEmail, '| auth email:', authEmail, '| isMaster:', isMaster);
  return isMaster;
}

// === State ===
const state = {
  currentUser: null,
  userProfile: null,
  isAdmin: false,
  allUsers: [],
  pendingUsers: [],
  drawHistory: [],
  registrationHistory: [],
  admins: [],
  currentTab: 'sorteio',
  selectedParticipants: new Set(),
  drawConfig: { valor: 0, participantes: [] },
  rouletteSpinning: false,
  nextDraw: null,
  countdownInterval: null,
  settings: { groupLink: '' },
  numberSales: []
};

// === Gold Packs Catalog (preços fixos - vide tabela de referência) ===
const GOLD_PACKS_CATALOG = [
  { id: 'pack100',  name: '100 Gold Package',  gold: 100,  cost: 7.99 },
  { id: 'pack300',  name: '300 Gold Package',  gold: 300,  cost: 23.97 },
  { id: 'pack500',  name: '500 Gold Package',  gold: 500,  cost: 33.99 },
  { id: 'pack3000', name: '3000 Gold Package', gold: 3000, cost: 129.99 },
  { id: 'pack6000', name: '6000 Gold Package', gold: 6000, cost: 259.98 },
  { id: 'pack9000', name: '9000 Gold Package', gold: 9000, cost: 389.97 },
];

// === DOM Helpers ===
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);
const show = (el) => el && el.classList.remove('hidden');
const hide = (el) => el && el.classList.add('hidden');
const toggle = (el) => el && el.classList.toggle('hidden');

// === Toast ===
function toast(msg, type = 'info') {
  const container = $('#toast-container');
  const t = document.createElement('div');
  t.className = `toast toast-${type}`;
  t.textContent = msg;
  container.appendChild(t);
  setTimeout(() => t.remove(), 3500);
}

// === Screen Management ===
function showScreen(id) {
  $$('.screen').forEach(s => s.classList.add('hidden'));
  const screen = $(`#screen-${id}`);
  if (screen) screen.classList.remove('hidden');
}

function switchTab(tabName) {
  state.currentTab = tabName;
  $$('.nav-item').forEach(n => n.classList.remove('active'));
  const activeNav = $(`.nav-item[data-tab="${tabName}"]`);
  if (activeNav) activeNav.classList.add('active');
  $$('.tab-content').forEach(t => { t.classList.add('hidden'); t.classList.remove('active'); });
  const tabEl = $(`#tab-${tabName}`);
  if (tabEl) { tabEl.classList.remove('hidden'); tabEl.classList.add('active'); }
}

// === Date/Time Utils ===
function nowFormatted() {
  const d = new Date();
  return d.toLocaleDateString('pt-BR') + ' ' + d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}
function todayStr() { return new Date().toLocaleDateString('pt-BR'); }
function timeStr() { return new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit', second: '2-digit' }); }

// === Input Masks ===
function maskOnlyLetters(e) { e.target.value = e.target.value.replace(/[^A-Za-zÀ-ÿ\s]/g, ''); }
function maskOnlyNumbers(e) { e.target.value = e.target.value.replace(/[^0-9]/g, ''); }
function maskAlphaNum(e) { e.target.value = e.target.value.replace(/[^A-Za-z0-9]/g, ''); }

// ============================================
// AUTH
// ============================================
async function handleLogin(e) {
  e.preventDefault();
  const email = $('#login-email').value.trim();
  const pass = $('#login-password').value;
  const btn = e.target.querySelector('button[type="submit"]');
  btn.querySelector('.btn-text').classList.add('hidden');
  btn.querySelector('.btn-loader').classList.remove('hidden');
  hide($('#login-error'));
  try {
    await signInWithEmailAndPassword(auth, email, pass);
  } catch (err) {
    let msg = 'Erro ao fazer login.';
    if (err.code === 'auth/user-not-found' || err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') msg = 'Email ou senha incorretos.';
    if (err.code === 'auth/too-many-requests') msg = 'Muitas tentativas. Aguarde um momento.';
    $('#login-error').textContent = msg;
    show($('#login-error'));
  }
  btn.querySelector('.btn-text').classList.remove('hidden');
  btn.querySelector('.btn-loader').classList.add('hidden');
}

async function handleLogout() {
  await signOut(auth);
  state.currentUser = null;
  state.userProfile = null;
  state.isAdmin = false;
  showScreen('login');
}

// ============================================
// USER PROFILE LOAD
// ============================================
async function loadUserProfile(uid) {
  const userDoc = await getDoc(doc(db, 'users', uid));
  if (userDoc.exists()) {
    state.userProfile = { id: uid, ...userDoc.data() };
    state.isAdmin = state.userProfile.role === 'admin';
    updateUIForRole();
    // Load settings if admin
    if (state.isAdmin) {
      loadSettings();
    }
  } else {
    // Check if there's a pending registration for this email
    const q = query(collection(db, 'pendingUsers'), where('uid', '==', uid));
    const snap = await getDocs(q);
    if (!snap.empty) {
      state.userProfile = { id: uid, ...snap.docs[0].data() };
      state.userProfile._pending = true;
    }
  }
}

async function loadSettings() {
  try {
    const settingsDoc = await getDoc(doc(db, 'settings', 'clan'));
    if (settingsDoc.exists()) {
      state.settings = settingsDoc.data();
      // Populate group link field if admin
      if (state.isAdmin) {
        const groupLinkInput = document.getElementById('group-link');
        if (groupLinkInput && state.settings.groupLink) {
          groupLinkInput.value = state.settings.groupLink;
        }
      }
    }
  } catch (err) {
    console.error('Error loading settings:', err);
  }
}

async function saveSettings(updates) {
  try {
    await setDoc(doc(db, 'settings', 'clan'), {
      ...state.settings,
      ...updates,
      updatedAt: serverTimestamp()
    }, { merge: true });
    state.settings = { ...state.settings, ...updates };
    return true;
  } catch (err) {
    console.error('Error saving settings:', err);
    return false;
  }
}

function updateUIForRole() {
  const p = state.userProfile;
  if (!p) return;
  $('#user-display-name').textContent = p.nick || p.nome || 'Usuário';
  if (isMasterAdmin()) {
    $('#user-display-role').textContent = 'ADM MASTER';
  } else if (state.isAdmin) {
    $('#user-display-role').textContent = 'ADMINISTRADOR';
  } else {
    $('#user-display-role').textContent = 'USUÁRIO';
  }
  $('#user-avatar').textContent = (p.nick || p.nome || 'U').charAt(0).toUpperCase();

  if (state.isAdmin) {
    $$('.admin-only').forEach(el => show(el));
    show($('#sorteio-admin-controls'));
    show($('#admin-settings'));
    show($('#admin-next-draw-controls'));
    show($('#numbers-admin-publish'));
    loadDrawAdminsList();
  } else {
    $$('.admin-only').forEach(el => hide(el));
    hide($('#sorteio-admin-controls'));
    hide($('#admin-settings'));
    hide($('#admin-next-draw-controls'));
    hide($('#numbers-admin-publish'));
  }

  // Fill profile
  $('#prof-nome').textContent = p.nome || '-';
  $('#prof-nick').textContent = p.nick || '-';
  $('#prof-contaid').textContent = p.contaid || '-';
  $('#prof-email').textContent = p.email || '-';
  $('#prof-whatsapp').textContent = p.whatsapp || '-';
  $('#prof-genero').textContent = p.genero || '-';
  $('#prof-nascimento').textContent = p.nascimento ? formatBirth(p.nascimento) : '-';
  $('#prof-status').textContent = p._pending ? 'Pendente' : (p.status || 'Ativo');

  // Load draw participants list
  loadParticipantsList();
  loadDrawHistory();
  loadAdminsList();
  loadNextDraw();
  switchTab('sorteio');
}

function formatBirth(b) {
  if (!b || b.length !== 8) return b || '-';
  return `${b.substring(0,2)}/${b.substring(2,4)}/${b.substring(4,8)}`;
}

// ============================================
// REGISTRATION HISTORY
// ============================================
async function saveRegistrationHistory(action, userData, reason = '', observation = '') {
  try {
    await addDoc(collection(db, 'registrationHistory'), {
      action, // 'approved', 'rejected', 'deleted'
      userName: userData.nome || userData.nick || 'Usuário',
      userNick: userData.nick || '',
      userEmail: userData.email || '',
      userContaid: userData.contaid || '',
      reason,
      observation,
      performedBy: state.userProfile?.nome || state.userProfile?.nick || 'ADM',
      performedByUid: state.currentUser?.uid || '',
      date: new Date().toISOString(),
      dateStr: nowFormatted()
    });
  } catch (err) {
    console.error('Error saving registration history:', err);
  }
}

async function loadRegistrationHistory() {
  try {
    const snap = await getDocs(collection(db, 'registrationHistory'));
    const history = [];
    snap.forEach(d => history.push({ id: d.id, ...d.data() }));
    history.sort((a, b) => new Date(b.date) - new Date(a.date));
    state.registrationHistory = history;
    renderRegistrationHistory(history);
  } catch (err) {
    console.error('Error loading registration history:', err);
  }
}

function renderRegistrationHistory(history) {
  const container = $('#history-list');
  if (!history || history.length === 0) {
    container.innerHTML = '<p class="empty-state">Nenhum registro no histórico.</p>';
    return;
  }
  
  container.innerHTML = history.map(h => {
    let actionClass = '';
    let actionLabel = '';
    if (h.action === 'approved') {
      actionClass = 'status-active';
      actionLabel = '✓ Aprovado';
    } else if (h.action === 'rejected') {
      actionClass = 'status-pending';
      actionLabel = '✗ Recusado';
    } else if (h.action === 'deleted') {
      actionClass = 'status-blocked';
      actionLabel = '⊘ Apagado';
    } else if (h.action === 'reactivated') {
      actionClass = 'status-active';
      actionLabel = '↻ Reativado';
    }
    
    return `
      <div class="history-item">
        <div>
          <span class="history-winner">${h.userName || h.userNick}</span>
          <span class="status-badge ${actionClass}" style="margin-left: 0.5rem;">${actionLabel}</span>
          ${h.reason ? `<div style="margin-top: 0.3rem; font-size: 0.85rem; color: var(--text-secondary);">Motivo: ${h.reason}</div>` : ''}
          ${h.observation ? `<div style="font-size: 0.85rem; color: var(--text-muted);">Obs: ${h.observation}</div>` : ''}
        </div>
        <div class="history-meta">
          ${h.dateStr || ''} • Por: ${h.performedBy || 'ADM'}
        </div>
      </div>
    `;
  }).join('');
}

// ============================================
// REGISTRATION
// ============================================
async function loadAdminsList() {
  try {
    const q = query(collection(db, 'users'), where('role', '==', 'admin'));
    const snap = await getDocs(q);
    state.admins = [];
    snap.forEach(d => {
      const data = d.data();
      // Só incluir ADMs com WhatsApp válido e atualizado no Firebase
      // WhatsApp deve ter números reais (mínimo 8 dígitos), não pode ser vazio, '0', ou placeholder
      const wa = (data.whatsapp || '').toString().trim();
      const hasValidWhatsapp = wa.length >= 8 && /^[0-9]+$/.test(wa);
      if (hasValidWhatsapp) {
        state.admins.push({ id: d.id, nome: data.nome, nick: data.nick, whatsapp: wa });
      }
    });
    // Also populate the register form dropdown
    const sel = $('#reg-adm-destino');
    if (sel) {
      sel.innerHTML = '<option value="">Selecione um ADM...</option>';
      state.admins.forEach(a => {
        const opt = document.createElement('option');
        opt.value = a.id;
        opt.textContent = `${a.nick || a.nome}`;
        opt.dataset.whatsapp = a.whatsapp;
        sel.appendChild(opt);
      });
    }
    // Atualizar também o dropdown de ADMs no sorteio
    loadDrawAdminsList();
  } catch (err) {
    console.error('Error loading admins:', err);
  }
}

function loadDrawAdminsList() {
  const sel = $('#draw-adm-info');
  sel.innerHTML = '<option value="">Selecione um ADM...</option>';
  state.admins.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.nick || a.nome;
    opt.dataset.nome = a.nome || a.nick;
    sel.appendChild(opt);
  });
}

async function handleRegister(e) {
  e.preventDefault();
  hide($('#register-error'));
  hide($('#register-success'));

  const nome = $('#reg-nome').value.trim();
  const nick = $('#reg-nick').value.trim();
  const contaid = $('#reg-contaid').value.trim();
  const whatsapp = $('#reg-whatsapp').value.trim();
  const email = $('#reg-email').value.trim();
  const senha = $('#reg-senha').value;
  const nascimento = $('#reg-nascimento').value.trim();
  const genero = document.querySelector('input[name="reg-genero"]:checked')?.value;
  const aceitarRegras = $('#reg-aceitar-regras').checked;
  const admDestino = $('#reg-adm-destino').value;

  // Validations
  if (!/^[A-Za-zÀ-ÿ\s]+$/.test(nome)) return showError('register-error', 'Nome deve conter apenas letras.');
  if (!/^[A-Za-z0-9]+$/.test(nick)) return showError('register-error', 'Nickname deve conter apenas letras e números.');
  if (!/^[0-9]{1,9}$/.test(contaid)) return showError('register-error', 'ID da conta deve ter até 9 números.');
  if (!/^[0-9]+$/.test(whatsapp)) return showError('register-error', 'WhatsApp deve conter apenas números.');
  if (!/^[0-9]{8}$/.test(nascimento)) return showError('register-error', 'Data de nascimento inválida (DDMMAAAA).');
  if (!genero) return showError('register-error', 'Selecione o gênero.');
  if (!aceitarRegras) return showError('register-error', 'Você deve aceitar as regras do Clan.');
  if (!admDestino) return showError('register-error', 'Selecione um ADM para enviar os dados.');

  const btn = e.target.querySelector('button[type="submit"]');
  btn.querySelector('.btn-text').classList.add('hidden');
  btn.querySelector('.btn-loader').classList.remove('hidden');

  try {
    // Preparar WhatsApp ANTES de qualquer await (evita bloqueio de popup)
    const selectedAdm = state.admins.find(a => a.id === admDestino);
    const admOption = $('#reg-adm-destino').selectedOptions[0];
    const admWhatsapp = selectedAdm?.whatsapp || admOption?.dataset.whatsapp || '';
    const waNumber = admWhatsapp;
    
    if (waNumber) {
      const waMessage = encodeURIComponent(
        `📋 *NOVO CADASTRO - NYXEN CLAN*\n\n` +
        `*Nome:* ${nome}\n` +
        `*Nick:* ${nick}\n` +
        `*ID Conta:* ${contaid}\n` +
        `*Email:* ${email}\n` +
        `*WhatsApp:* ${whatsapp}\n` +
        `*Gênero:* ${genero}\n` +
        `*Nascimento:* ${formatBirth(nascimento)}\n\n` +
        `⏳ Aguardando aprovação.`
      );
      // Usar link temporário para evitar bloqueio de popup
      const link = document.createElement('a');
      link.href = `https://wa.me/${waNumber}?text=${waMessage}`;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }

    // Check if blocked
    const blockedQ = query(collection(db, 'blockedData'));
    const blockedSnap = await getDocs(blockedQ);
    for (const bDoc of blockedSnap.docs) {
      const bd = bDoc.data();
      if (bd.email === email || bd.whatsapp === whatsapp || bd.contaid === contaid) {
        throw new Error('Este dados estão bloqueados e não podem ser cadastrados novamente.');
      }
    }

    // Create Firebase Auth user
    const cred = await createUserWithEmailAndPassword(auth, email, senha);
    const uid = cred.user.uid;

    // Save pending user data
    await addDoc(collection(db, 'pendingUsers'), {
      uid, nome, nick, contaid, whatsapp, email, nascimento, genero,
      admDestino, admWhatsapp,
      status: 'pending',
      createdAt: serverTimestamp()
    });

    $('#register-success').textContent = 'Cadastro realizado com sucesso! Aguarde a aprovação de um ADM.';
    show($('#register-success'));
    e.target.reset();
  } catch (err) {
    let msg = err.message || 'Erro ao cadastrar.';
    if (err.code === 'auth/email-already-in-use') msg = 'Este email já está em uso.';
    if (err.code === 'auth/weak-password') msg = 'Senha muito fraca (mínimo 6 caracteres).';
    showError('register-error', msg);
  }
  btn.querySelector('.btn-text').classList.remove('hidden');
  btn.querySelector('.btn-loader').classList.add('hidden');
}

function showError(id, msg) {
  const el = $(`#${id}`);
  el.textContent = msg;
  show(el);
}

// ============================================
// PARTICIPANTS LIST (for draw)
// ============================================
async function loadParticipantsList() {
  try {
    const q = query(collection(db, 'users'), where('status', '==', 'active'));
    const snap = await getDocs(q);
    state.allUsers = [];
    const list = $('#participants-list');
    list.innerHTML = '';
    
    // Carregar o último vencedor do histórico
    let lastWinnerId = null;
    const drawHistoryQ = query(collection(db, 'drawHistory'));
    const drawHistorySnap = await getDocs(drawHistoryQ);
    const drawHistory = [];
    drawHistorySnap.forEach(d => drawHistory.push({ id: d.id, ...d.data() }));
    drawHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
    
    if (drawHistory.length > 0) {
      lastWinnerId = drawHistory[0].winnerId;
    }
    
    snap.forEach(d => {
      const u = d.data();
      if (u.role === 'admin') return;
      state.allUsers.push({ id: d.id, ...u });
      
      const isLastWinner = d.id === lastWinnerId;
      
      // Se é o último vencedor, não adicionar à lista de participantes
      if (isLastWinner) {
        // Mostrar como bloqueado
        const item = document.createElement('div');
        item.className = 'participant-item participant-blocked';
        item.innerHTML = `
          <input type="checkbox" disabled style="cursor: not-allowed; opacity: 0.3;">
          <span style="opacity: 0.5; text-decoration: line-through;">${u.nick || u.nome} <small style="color:var(--text-muted)">(ID: ${u.contaid || '-'})</small></span>
          <span class="winner-badge">Vencedor anterior - bloqueado</span>
        `;
        list.appendChild(item);
        return; // Não adicionar ao state.allUsers para participação
      }
      
      const item = document.createElement('label');
      item.className = 'participant-item';
      item.innerHTML = `
        <input type="checkbox" value="${d.id}" data-nick="${u.nick || u.nome}" checked>
        <span>${u.nick || u.nome} <small style="color:var(--text-muted)">(ID: ${u.contaid || '-'})</small></span>
      `;
      
      const checkbox = item.querySelector('input');
      checkbox.addEventListener('change', (e) => {
        if (e.target.checked) state.selectedParticipants.add(d.id);
        else state.selectedParticipants.delete(d.id);
      });
      
      // Adicionar aos selecionados por padrão
      state.selectedParticipants.add(d.id);
      
      list.appendChild(item);
    });
    // Also load for user management table
    loadUsersTable();
  } catch (err) {
    console.error('Error loading participants:', err);
  }
}

// ============================================
// DRAW / ROULETTE
// ============================================
function initRoulette() {
  const canvas = $('#roulette-canvas');
  const ctx = canvas.getContext('2d');
  drawWheel(ctx, canvas, [], 0);
}

function drawWheel(ctx, canvas, names, rotation) {
  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const r = Math.min(cx, cy) - 10;
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  if (names.length === 0) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.fillStyle = '#1a2340';
    ctx.fill();
    ctx.strokeStyle = '#1e2a45';
    ctx.lineWidth = 3;
    ctx.stroke();
    ctx.fillStyle = '#556178';
    ctx.font = '14px Rajdhani';
    ctx.textAlign = 'center';
    ctx.fillText('Selecione participantes', cx, cy);
    return;
  }

  const sliceAngle = (Math.PI * 2) / names.length;
  const colors = ['#f0b429','#3498db','#e74c3c','#2ecc71','#9b59b6','#e67e22','#1abc9c','#e84393','#6c5ce7','#00cec9','#fdcb6e','#74b9ff'];

  names.forEach((name, i) => {
    const startAngle = rotation + i * sliceAngle;
    const endAngle = startAngle + sliceAngle;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    ctx.strokeStyle = '#0a0e1a';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Text
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(startAngle + sliceAngle / 2);
    ctx.textAlign = 'right';
    ctx.fillStyle = '#0a0e1a';
    ctx.font = `bold ${Math.min(13, 160 / names.length)}px Rajdhani`;
    const displayName = name.length > 10 ? name.substring(0, 9) + '…' : name;
    ctx.fillText(displayName, r - 15, 5);
    ctx.restore();
  });

  // Center circle with percentage
  const percentage = (100 / names.length).toFixed(1);
  ctx.beginPath();
  ctx.arc(cx, cy, 30, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0e1a';
  ctx.fill();
  ctx.strokeStyle = '#f0b429';
  ctx.lineWidth = 2;
  ctx.stroke();
  
  // Percentage text
  ctx.fillStyle = '#f0b429';
  ctx.font = 'bold 14px Rajdhani';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${percentage}%`, cx, cy);
}

function spinRoulette() {
  if (state.rouletteSpinning) return;
  if (state.selectedParticipants.size < 2) {
    toast('Selecione pelo menos 2 participantes.', 'error');
    return;
  }
  const valor = parseFloat($('#draw-valor').value) || 0;
  if (valor <= 0) {
    toast('Informe o valor do sorteio.', 'error');
    return;
  }
  const admSelect = $('#draw-adm-info');
  if (!admSelect.value) {
    toast('Selecione o ADM que está realizando o sorteio.', 'error');
    return;
  }

  state.rouletteSpinning = true;
  hide($('#roulette-result'));

  const canvas = $('#roulette-canvas');
  const ctx = canvas.getContext('2d');
  const participantIds = Array.from(state.selectedParticipants);
  const names = participantIds.map(id => {
    const u = state.allUsers.find(u => u.id === id);
    return u ? (u.nick || u.nome) : id;
  });

  const totalRotation = Math.PI * 2 * (5 + Math.random() * 5);
  const duration = 4000;
  const startTime = performance.now();
  const startRotation = 0;

  function animate(now) {
    const elapsed = now - startTime;
    const progress = Math.min(elapsed / duration, 1);
    const eased = 1 - Math.pow(1 - progress, 4);
    const currentRotation = startRotation + totalRotation * eased;

    drawWheel(ctx, canvas, names, currentRotation);

    if (progress < 1) {
      requestAnimationFrame(animate);
    } else {
      state.rouletteSpinning = false;
      // Determine winner: pointer is at top (270 degrees = -PI/2)
      const finalAngle = currentRotation % (Math.PI * 2);
      const sliceAngle = (Math.PI * 2) / names.length;
      const pointerAngle = (Math.PI * 2 - finalAngle + Math.PI * 1.5) % (Math.PI * 2);
      const winnerIndex = Math.floor(pointerAngle / sliceAngle) % names.length;
      const winnerId = participantIds[winnerIndex];
      const winnerUser = state.allUsers.find(u => u.id === winnerId);
      const winnerName = winnerUser ? (winnerUser.nick || winnerUser.nome) : names[winnerIndex];

      // Show result
      $('#result-winner').textContent = winnerName;
      $('#result-value').textContent = `G ${valor.toFixed(2)} Gold`;
      show($('#roulette-result'));

      // Save to history
      saveDrawHistory(winnerId, winnerName, valor, participantIds);
    }
  }
  requestAnimationFrame(animate);
}

async function saveDrawHistory(winnerId, winnerName, valor, participantIds) {
  const admSelect = $('#draw-adm-info');
  const selectedOption = admSelect.selectedOptions[0];
  const admName = selectedOption?.dataset.nome || 'ADM';
  const admUid = admSelect.value || state.currentUser.uid;
  
  try {
    await addDoc(collection(db, 'drawHistory'), {
      winnerId, winnerName, valor,
      participantIds,
      admName, admUid,
      date: new Date().toISOString(),
      dateStr: nowFormatted(),
      createdAt: serverTimestamp()
    });
    loadDrawHistory();
    toast('Sorteio salvo com sucesso!', 'success');
  } catch (err) {
    console.error('Error saving draw:', err);
    toast('Erro ao salvar sorteio.', 'error');
  }
}

async function loadDrawHistory() {
  try {
    const q = query(collection(db, 'drawHistory'));
    const snap = await getDocs(q);
    state.drawHistory = [];
    snap.forEach(d => state.drawHistory.push({ id: d.id, ...d.data() }));
    state.drawHistory.sort((a, b) => new Date(b.date) - new Date(a.date));
    renderDrawHistory();
  } catch (err) {
    console.error('Error loading history:', err);
  }
}

function renderDrawHistory() {
  const container = $('#draw-history');
  if (state.drawHistory.length === 0) {
    container.innerHTML = '<p class="empty-state">Nenhum sorteio realizado ainda.</p>';
    return;
  }
  container.innerHTML = state.drawHistory.map(h => `
    <div class="history-item">
      <div>
        <span class="history-winner">🏆 ${h.winnerName}</span>
        <span class="history-value"> — G ${(h.valor || 0).toFixed(2)} Gold</span>
      </div>
      <div class="history-meta">
        ${h.dateStr || ''} • Por: ${h.admName || 'ADM'}
      </div>
    </div>
  `).join('');
}

// ============================================
// NEXT DRAW COUNTDOWN
// ============================================
async function loadNextDraw() {
  try {
    const docRef = doc(db, 'settings', 'nextDraw');
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      state.nextDraw = docSnap.data();
      showNextDraw();
      startCountdown();
    } else {
      state.nextDraw = null;
      hide($('#next-draw-section'));
    }
  } catch (err) {
    console.error('Error loading next draw:', err);
    hide($('#next-draw-section'));
  }
}

function showNextDraw() {
  if (!state.nextDraw) {
    hide($('#next-draw-section'));
    return;
  }
  
  const drawDate = state.nextDraw.date?.toDate() || new Date(state.nextDraw.date);
  const valor = state.nextDraw.valor || 0;
  
  // Format date
  const dateStr = drawDate.toLocaleDateString('pt-BR', { 
    day: '2-digit', 
    month: '2-digit', 
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  $('#next-draw-date').textContent = dateStr;
  $('#next-draw-value').textContent = `${valor} G`;
  
  show($('#next-draw-section'));
}

function startCountdown() {
  // Clear existing interval
  if (state.countdownInterval) {
    clearInterval(state.countdownInterval);
  }
  
  // Update immediately
  updateCountdown();
  
  // Then update every second
  state.countdownInterval = setInterval(updateCountdown, 1000);
}

function updateCountdown() {
  if (!state.nextDraw) return;
  
  const drawDate = state.nextDraw.date?.toDate() || new Date(state.nextDraw.date);
  const now = new Date();
  const diff = drawDate - now;
  
  if (diff <= 0) {
    // Time's up
    $('#countdown-days').textContent = '00';
    $('#countdown-hours').textContent = '00';
    $('#countdown-minutes').textContent = '00';
    $('#countdown-seconds').textContent = '00';
    clearInterval(state.countdownInterval);
    return;
  }
  
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  $('#countdown-days').textContent = String(days).padStart(2, '0');
  $('#countdown-hours').textContent = String(hours).padStart(2, '0');
  $('#countdown-minutes').textContent = String(minutes).padStart(2, '0');
  $('#countdown-seconds').textContent = String(seconds).padStart(2, '0');
}

async function saveNextDraw() {
  const dateInput = $('#next-draw-date-input').value;
  const valor = parseFloat($('#next-draw-value-input').value) || 0;
  
  if (!dateInput) {
    toast('Selecione a data e hora do sorteio.', 'error');
    return;
  }
  
  if (valor <= 0) {
    toast('Informe o valor do prêmio.', 'error');
    return;
  }
  
  try {
    const drawDate = new Date(dateInput);
    await setDoc(doc(db, 'settings', 'nextDraw'), {
      date: Timestamp.fromDate(drawDate),
      valor: valor,
      createdBy: state.currentUser.uid,
      createdByName: state.userProfile.nome || state.userProfile.nick || 'ADM',
      createdAt: serverTimestamp()
    });
    
    toast('Próximo sorteio configurado com sucesso!', 'success');
    
    // Reload and show
    await loadNextDraw();
    
    // Clear form
    $('#next-draw-date-input').value = '';
    $('#next-draw-value-input').value = '';
  } catch (err) {
    console.error('Error saving next draw:', err);
    toast('Erro ao configurar próximo sorteio.', 'error');
  }
}

async function cancelNextDraw() {
  try {
    await deleteDoc(doc(db, 'settings', 'nextDraw'));
    state.nextDraw = null;
    hide($('#next-draw-section'));
    if (state.countdownInterval) {
      clearInterval(state.countdownInterval);
    }
    toast('Próximo sorteio cancelado.', 'info');
  } catch (err) {
    console.error('Error canceling next draw:', err);
    toast('Erro ao cancelar sorteio.', 'error');
  }
}

// ============================================
// USER MANAGEMENT (Admin)
// ============================================
async function loadUsersTable() {
  try {
    const q2 = query(collection(db, 'users'));
    const snap = await getDocs(q2);
    const users = [];
    snap.forEach(d => {
      const data = d.data();
      // Excluir o ADM Master da lista de usuários (comparação case-insensitive)
      const userEmail = (data.email || '').trim().toLowerCase();
      if (userEmail === MASTER_EMAIL.toLowerCase()) return;
      users.push({ id: d.id, ...data });
    });
    state.allUsers = users;
    
    // Apply status filter
    const statusFilter = $('#filter-user-status')?.value || 'all';
    const filteredUsers = statusFilter === 'all' 
      ? users 
      : users.filter(u => u.status === statusFilter);
    
    renderUsersTable(filteredUsers);
  } catch (err) {
    console.error('Error loading users:', err);
  }
}

function renderUsersTable(users) {
  const tbody = $('#users-tbody');
  if (!users || users.length === 0) {
    tbody.innerHTML = '';
    show($('#no-users-msg'));
    return;
  }
  hide($('#no-users-msg'));
  
  // Check if mobile
  const isMobile = window.innerWidth <= 768;
  const canManageRoles = isMasterAdmin();
  console.log('[renderUsersTable] canManageRoles:', canManageRoles, '| users count:', users.length, '| isMasterAdmin:', isMasterAdmin());
  
  // Helper para badge de cargo
  const getRoleBadge = (u) => {
    if (u.role === 'admin') {
      return '<span class="role-badge role-admin">ADM</span>';
    }
    return '<span class="role-badge role-user">Usuário</span>';
  };
  
  // Helper para botão de alteração de cargo
  const getRoleActionButton = (u) => {
    if (!canManageRoles) return ''; // ADMs comuns não podem alterar cargos
    if (u.status === 'blocked') return ''; // Não alterar cargo de bloqueados
    
    const isPromote = u.role !== 'admin';
    const actionText = isPromote ? '↑ Promover a ADM' : '↓ Rebaixar a Usuário';
    const actionClass = isPromote ? 'role-btn-promote' : 'role-btn-demote';
    const icon = isPromote ? '↑' : '↓';
    return `<button class="action-btn role-change-btn ${actionClass}" onclick="openChangeRole('${u.id}')" title="${actionText}">${icon} ${isPromote ? 'Promover' : 'Rebaixar'}</button>`;
  };
  
  if (isMobile) {
    // Mobile: render as cards in separate container
    const cardsList = $('#users-cards-list');
    cardsList.innerHTML = users.map(u => {
      const isBlocked = u.status === 'blocked';
      const cardClass = isBlocked ? 'user-card blocked' : 'user-card';
      
      const statusBadge = u.status === 'active' 
        ? '<span class="status-badge status-active">Ativo</span>'
        : u.status === 'blocked' 
        ? '<span class="status-badge status-blocked">Bloqueado</span>'
        : '<span class="status-badge status-pending">Pendente</span>';
      
      const roleAction = getRoleActionButton(u);
      
      const actions = isBlocked
        ? `<button class="btn btn-outline btn-sm" onclick="viewBlockedUser('${u.id}')" style="flex: 1;">👁️ Detalhes</button>
           <button class="btn btn-accent btn-sm" onclick="reactivateUser('${u.id}')" style="flex: 1;">✅ Reativar</button>`
        : `<button class="btn btn-outline btn-sm" onclick="openEditUser('${u.id}')" style="flex: 1;">✏️ Editar</button>
           <button class="btn btn-danger btn-sm" onclick="openDeleteUser('${u.id}')" style="flex: 1;">🗑️ Excluir</button>
           ${roleAction}`;
      
      return `
        <div class="${cardClass}">
          <div class="user-card-header">
            <div class="user-card-identity">
              <div class="user-card-nick">${u.nick || u.nome}</div>
              <div class="user-card-name">${u.nome !== u.nick ? u.nome : ''}</div>
            </div>
            <div class="user-card-badges">
              ${getRoleBadge(u)}
              ${statusBadge}
            </div>
          </div>
          <div class="user-card-info">
            <div class="user-card-info-row">
              <span class="user-card-info-label">ID Conta</span>
              <span class="user-card-info-value">${u.contaid || '-'}</span>
            </div>
            <div class="user-card-info-row">
              <span class="user-card-info-label">Email</span>
              <span class="user-card-info-value">${u.email || '-'}</span>
            </div>
            <div class="user-card-info-row">
              <span class="user-card-info-label">WhatsApp</span>
              <span class="user-card-info-value">${u.whatsapp || '-'}</span>
            </div>
          </div>
          ${isBlocked && u.deleteReason ? `<div class="user-card-reason"><strong>Motivo:</strong> ${u.deleteReason}</div>` : ''}
          <div class="user-card-actions">
            ${actions}
          </div>
        </div>
      `;
    }).join('');
    
    // CSS handles visibility via .desktop-only / .mobile-only
  } else {
    // Desktop: render as table
    tbody.innerHTML = users.map(u => {
      const isBlocked = u.status === 'blocked';
      const baseActions = isBlocked
        ? `<button class="action-btn" onclick="viewBlockedUser('${u.id}')" title="Ver Detalhes" style="background: rgba(231, 76, 60, 0.1); color: #e74c3c;">👁️</button>
           <button class="action-btn" onclick="reactivateUser('${u.id}')" title="Reativar" style="background: rgba(46, 204, 113, 0.1); color: #2ecc71;">✅</button>`
        : `<button class="action-btn" onclick="openEditUser('${u.id}')" title="Editar">✏️</button>
           <button class="action-btn delete" onclick="openDeleteUser('${u.id}')" title="Excluir">🗑️</button>`;
      
      const roleAction = getRoleActionButton(u);
      
      return `
        <tr>
          <td>${u.nome || '-'}</td>
          <td>${u.nick || '-'}</td>
          <td>${u.contaid || '-'}</td>
          <td>${u.email || '-'}</td>
          <td>${u.whatsapp || '-'}</td>
          <td>${getRoleBadge(u)}</td>
          <td><span class="status-badge status-${u.status === 'active' ? 'active' : u.status === 'blocked' ? 'blocked' : 'pending'}">${u.status === 'active' ? 'Ativo' : u.status === 'blocked' ? 'Bloqueado' : 'Pendente'}</span></td>
          <td>
            <div class="action-btns">
              ${baseActions}
              ${roleAction}
            </div>
          </td>
        </tr>
      `;
    }).join('');
  }
}

// View blocked user details
window.viewBlockedUser = function(uid) {
  const user = state.allUsers.find(u => u.id === uid);
  if (!user) return;
  
  $('#blocked-name').textContent = user.nome || user.nick || '-';
  
  // Translate reason
  const reasonMap = {
    'preconceito': 'Preconceito',
    'toxicidade': 'Toxicidade',
    'nao_ativo': 'Não Ativo',
    'pedido_saida': 'Pedido de Saída do Clan'
  };
  $('#blocked-reason').textContent = reasonMap[user.deleteReason] || user.deleteReason || 'Não informado';
  $('#blocked-observation').textContent = user.deleteObservacao || 'Nenhuma observação';
  
  // Format date if available
  if (user.deletedAt) {
    const date = user.deletedAt.toDate ? user.deletedAt.toDate() : new Date(user.deletedAt);
    $('#blocked-date').textContent = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } else {
    $('#blocked-date').textContent = 'Não informado';
  }
  
  // Store user id for reactivation
  $('#modal-view-blocked').dataset.userId = uid;
  show($('#modal-view-blocked'));
};

// Reactivate user
window.reactivateUser = async function(uid) {
  if (!confirm('Deseja realmente reativar este usuário?')) return;
  
  try {
    await updateDoc(doc(db, 'users', uid), {
      status: 'active',
      deleteReason: null,
      deleteObservacao: null,
      deletedAt: null,
      reactivatedAt: serverTimestamp(),
      reactivatedBy: state.currentUser.uid,
      reactivatedByName: state.userProfile.nome || state.userProfile.nick || 'ADM'
    });
    
    // Save to registration history
    const user = state.allUsers.find(u => u.id === uid);
    if (user) {
      await saveRegistrationHistory('reactivated', user);
    }
    
    toast('Usuário reativado com sucesso!', 'success');
    hide($('#modal-view-blocked'));
    loadUsersTable();
    loadRegistrationHistory();
  } catch (err) {
    console.error('Error reactivating user:', err);
    toast('Erro ao reativar usuário.', 'error');
  }
};

// ============================================
// CHANGE USER ROLE (ADM Master only)
// ============================================
window.openChangeRole = function(uid) {
  // Só ADM Master pode alterar cargos
  if (!isMasterAdmin()) {
    toast('Apenas o ADM Master pode alterar cargos.', 'error');
    return;
  }
  
  const u = state.allUsers.find(x => x.id === uid);
  if (!u) return;
  
  // Não permitir alterar o próprio cargo
  if (uid === state.currentUser.uid) {
    toast('Você não pode alterar seu próprio cargo.', 'error');
    return;
  }
  
  const modal = $('#modal-change-role');
  modal.dataset.userId = uid;
  
  $('#role-change-user-name').textContent = u.nome || u.nick || '-';
  $('#role-change-user-email').textContent = u.email || '-';
  
  // Mostrar cargo atual
  const currentBadge = $('#role-change-current');
  if (u.role === 'admin') {
    currentBadge.textContent = 'Administrador (ADM)';
    currentBadge.className = 'role-badge role-admin';
  } else {
    currentBadge.textContent = 'Usuário Comum';
    currentBadge.className = 'role-badge role-user';
  }
  
  // Selecionar cargo atual no dropdown
  const select = $('#role-change-select');
  select.value = u.role || 'user';
  
  // Mostrar aviso
  const warning = $('#role-change-warning');
  if (u.role === 'admin') {
    warning.textContent = '⚠️ Ao rebaixar, o usuário perderá acesso ao painel administrativo.';
    warning.style.color = 'var(--accent-red)';
  } else {
    warning.textContent = 'O usuário terá acesso ao painel administrativo com permissões de ADM.';
    warning.style.color = 'var(--accent-green)';
  }
  
  show(modal);
};

window.saveUserRole = async function() {
  if (!isMasterAdmin()) {
    toast('Apenas o ADM Master pode alterar cargos.', 'error');
    return;
  }
  
  const uid = $('#modal-change-role').dataset.userId;
  const newRole = $('#role-change-select').value;
  const u = state.allUsers.find(x => x.id === uid);
  
  if (!u) return;
  
  try {
    await updateDoc(doc(db, 'users', uid), {
      role: newRole,
      roleUpdatedAt: serverTimestamp(),
      roleUpdatedBy: state.currentUser.uid,
      roleUpdatedByName: state.userProfile.nome || state.userProfile.nick || 'ADM Master'
    });
    
    hide($('#modal-change-role'));
    
    if (newRole === 'admin') {
      toast(`${u.nick || u.nome} foi promovido a ADM com sucesso!`, 'success');
    } else {
      toast(`${u.nick || u.nome} foi rebaixado para Usuário Comum.`, 'success');
    }
    
    // Recarregar lista de usuários e ADMs
    loadUsersTable();
    loadAdminsList();
    loadParticipantsList();
  } catch (err) {
    console.error('Error changing user role:', err);
    toast('Erro ao alterar cargo do usuário.', 'error');
  }
};

window.openEditUser = function(uid) {
  const u = state.allUsers.find(x => x.id === uid);
  if (!u) return;
  $('#edit-user-id').value = uid;
  $('#edit-nome').value = u.nome || '';
  $('#edit-nick').value = u.nick || '';
  $('#edit-contaid').value = u.contaid || '';
  $('#edit-whatsapp').value = u.whatsapp || '';
  $('#edit-nascimento').value = u.nascimento || '';
  $('#edit-genero').value = u.genero || 'masculino';
  show($('#modal-edit-user'));
};

window.openDeleteUser = function(uid) {
  const u = state.allUsers.find(x => x.id === uid);
  if (!u) return;
  $('#delete-user-id').value = uid;
  $('#delete-user-name-label').textContent = u.nick || u.nome;
  $('#delete-reason').value = '';
  $('#delete-observacao').value = '';
  $('#delete-block-data').checked = false;
  show($('#modal-delete-user'));
};

async function handleEditUser(e) {
  e.preventDefault();
  const uid = $('#edit-user-id').value;
  try {
    await updateDoc(doc(db, 'users', uid), {
      nome: $('#edit-nome').value.trim(),
      nick: $('#edit-nick').value.trim(),
      contaid: $('#edit-contaid').value.trim(),
      whatsapp: $('#edit-whatsapp').value.trim(),
      nascimento: $('#edit-nascimento').value.trim(),
      genero: $('#edit-genero').value,
      updatedAt: serverTimestamp()
    });
    hide($('#modal-edit-user'));
    toast('Usuário atualizado com sucesso!', 'success');
    loadUsersTable();
    loadParticipantsList();
  } catch (err) {
    toast('Erro ao atualizar usuário.', 'error');
  }
}

async function handleDeleteUser(e) {
  e.preventDefault();
  const uid = $('#delete-user-id').value;
  const reason = $('#delete-reason').value;
  const observacao = $('#delete-observacao').value.trim();
  const blockData = $('#delete-block-data').checked;
  const u = state.allUsers.find(x => x.id === uid);

  try {
    if (blockData && u) {
      await addDoc(collection(db, 'blockedData'), {
        uid, email: u.email, whatsapp: u.whatsapp, contaid: u.contaid,
        reason, observacao, blockedAt: serverTimestamp()
      });
    }

    // Update status to blocked/removed
    await updateDoc(doc(db, 'users', uid), {
      status: 'blocked',
      deleteReason: reason,
      deleteObservacao: observacao,
      deletedAt: serverTimestamp()
    });

    // Save to registration history
    if (u) {
      await saveRegistrationHistory('deleted', u, reason, observacao);
    }

    hide($('#modal-delete-user'));
    toast('Usuário excluído com sucesso.', 'success');
    loadUsersTable();
    loadParticipantsList();
    loadRegistrationHistory();
  } catch (err) {
    toast('Erro ao excluir usuário.', 'error');
  }
}

// ============================================
// PENDING APPROVALS (Admin)
// ============================================
async function loadPendingUsers() {
  try {
    const snap = await getDocs(collection(db, 'pendingUsers'));
    state.pendingUsers = [];
    snap.forEach(d => state.pendingUsers.push({ id: d.id, ...d.data() }));
    renderPendingUsers();
  } catch (err) {
    console.error('Error loading pending:', err);
  }
}

function renderPendingUsers() {
  const container = $('#pending-list');
  if (state.pendingUsers.length === 0) {
    container.innerHTML = '<p class="empty-state">Nenhum cadastro pendente de aprovação.</p>';
    return;
  }
  container.innerHTML = state.pendingUsers.map(p => `
    <div class="pending-card" data-id="${p.id}">
      <div class="pending-card-header">
        <div>
          <span class="pending-card-name">${p.nome || '-'}</span>
          <span class="pending-card-nick"> @${p.nick || '-'}</span>
        </div>
        <span class="status-badge status-pending">Pendente</span>
      </div>
      <div class="pending-card-details">
        <div class="pending-detail"><span>ID Conta: </span>${p.contaid || '-'}</div>
        <div class="pending-detail"><span>Email: </span>${p.email || '-'}</div>
        <div class="pending-detail"><span>WhatsApp: </span>${p.whatsapp || '-'}</div>
      </div>
      <div class="pending-card-actions">
        <button class="btn btn-outline btn-sm" onclick="viewPendingDetails('${p.id}')">👁️ Ver Detalhes</button>
        <button class="btn btn-danger btn-sm" onclick="rejectPending('${p.id}', '${p.uid || ''}')">❌ Rejeitar</button>
        <button class="btn btn-accent btn-sm" onclick="approvePendingInline('${p.id}', '${p.uid || ''}')">✅ Aprovar</button>
      </div>
    </div>
  `).join('');
}

// View full details of pending user in modal
window.viewPendingDetails = function(pendingId) {
  const p = state.pendingUsers.find(x => x.id === pendingId);
  if (!p) return;
  
  $('#pending-view-nome').textContent = p.nome || '-';
  $('#pending-view-nick').textContent = p.nick || '-';
  $('#pending-view-contaid').textContent = p.contaid || '-';
  $('#pending-view-email').textContent = p.email || '-';
  $('#pending-view-whatsapp').textContent = p.whatsapp || '-';
  $('#pending-view-nascimento').textContent = p.nascimento ? formatBirth(p.nascimento) : '-';
  $('#pending-view-genero').textContent = p.genero || '-';
  
  // Show ADM destination
  const admUser = state.admins.find(a => a.id === p.admDestino);
  $('#pending-view-adm').textContent = admUser ? (admUser.nick || admUser.nome) : (p.admDestino || '-');
  $('#pending-view-adm-whatsapp').textContent = p.admWhatsapp || '-';
  
  // Show registration date
  if (p.createdAt) {
    const date = p.createdAt.toDate ? p.createdAt.toDate() : new Date(p.createdAt);
    $('#pending-view-date').textContent = date.toLocaleDateString('pt-BR') + ' ' + date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  } else {
    $('#pending-view-date').textContent = 'Não informado';
  }
  
  // Store pending id and uid for approve/reject from modal
  const modal = $('#modal-view-pending');
  modal.dataset.pendingId = pendingId;
  modal.dataset.uid = p.uid || '';
  
  show(modal);
};

// Wrapper síncrono para abrir WhatsApp antes do async (evita bloqueio de popup)
window.approvePendingInline = function(pendingId, uid) {
  const pendingData = state.pendingUsers.find(p => p.id === pendingId);
  if (pendingData) {
    const userWhats = pendingData.whatsapp || '';
    if (userWhats) {
      const groupLink = state.settings?.groupLink || '';
      let message = `Olá ${pendingData.nome || pendingData.nick}!\n\n✅ Seu cadastro foi APROVADO!\n\nBem-vindo ao clan! `;
      if (groupLink) {
        message += `\n\n🔗 Acesse nosso grupo: ${groupLink}`;
      }
      const encodedMessage = encodeURIComponent(message);
      const whatsappUrl = `https://wa.me/${userWhats}?text=${encodedMessage}`;
      // Usar link temporário para evitar bloqueio de popup
      const link = document.createElement('a');
      link.href = whatsappUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }
  approvePending(pendingId, uid);
};

window.approvePending = async function(pendingId, uid) {
  try {
    const pendingDoc = await getDoc(doc(db, 'pendingUsers', pendingId));
    if (!pendingDoc.exists()) return toast('Cadastro não encontrado.', 'error');
    const data = pendingDoc.data();

    // Create user record
    await setDoc(doc(db, 'users', uid || pendingId), {
      nome: data.nome, nick: data.nick, contaid: data.contaid,
      whatsapp: data.whatsapp, email: data.email,
      nascimento: data.nascimento, genero: data.genero,
      role: 'user', status: 'active',
      createdAt: serverTimestamp()
    });

    // Save to registration history
    await saveRegistrationHistory('approved', data);

    // Remove pending
    await deleteDoc(doc(db, 'pendingUsers', pendingId));
    
    if (!data.whatsapp) {
      toast('Usuário aprovado com sucesso! (WhatsApp não cadastrado)', 'success');
    }
    
    loadPendingUsers();
    loadParticipantsList();
    loadRegistrationHistory();
  } catch (err) {
    console.error('Error approving user:', err);
    toast('Erro ao aprovar usuário.', 'error');
  }
};

window.rejectPending = async function(pendingId, uid) {
  try {
    const pendingDoc = await getDoc(doc(db, 'pendingUsers', pendingId));
    const data = pendingDoc.exists() ? pendingDoc.data() : {};
    
    await deleteDoc(doc(db, 'pendingUsers', pendingId));
    
    // Save to registration history
    await saveRegistrationHistory('rejected', data);
    
    // If user auth exists, we could also delete it but that requires admin SDK
    toast('Cadastro rejeitado.', 'info');
    loadPendingUsers();
    loadRegistrationHistory();
  } catch (err) {
    toast('Erro ao rejeitar.', 'error');
  }
};

// ============================================
// CODES MANAGEMENT (Admin)
// ============================================
async function handleRegisterCode(e) {
  e.preventDefault();
  const codeValue = $('#code-value').value.trim().toUpperCase();
  const goldValue = parseFloat($('#code-gold').value) || 0;

  // Validações
  if (!/^[A-Za-z0-9]+$/.test(codeValue)) {
    return toast('Código deve conter apenas letras e números.', 'error');
  }
  if (goldValue <= 0) {
    return toast('Valor em Gold deve ser maior que zero.', 'error');
  }

  try {
    // Verificar se código já existe (pendente ou resgatado)
    const qPending = query(collection(db, 'codes'), where('code', '==', codeValue), where('status', '==', 'pending'));
    const snapPending = await getDocs(qPending);
    if (!snapPending.empty) {
      return toast('Este código já existe e está pendente.', 'error');
    }

    const qRedeemed = query(collection(db, 'codes'), where('code', '==', codeValue), where('status', '==', 'redeemed'));
    const snapRedeemed = await getDocs(qRedeemed);
    if (!snapRedeemed.empty) {
      return toast('Este código já foi resgatado anteriormente.', 'error');
    }

    // Cadastrar código
    await addDoc(collection(db, 'codes'), {
      code: codeValue,
      goldValue: goldValue,
      status: 'pending',
      createdAt: serverTimestamp(),
      createdBy: state.currentUser.uid,
      createdByName: state.userProfile.nome || state.userProfile.nick || 'ADM'
    });

    toast('Código cadastrado com sucesso!', 'success');
    e.target.reset();
    loadCodes();
  } catch (err) {
    console.error('Error registering code:', err);
    toast('Erro ao cadastrar código.', 'error');
  }
}

async function loadCodes() {
  try {
    const snap = await getDocs(collection(db, 'codes'));
    const codes = [];
    snap.forEach(d => codes.push({ id: d.id, ...d.data() }));
    
    // Separar pendentes e resgatados
    const pendingCodes = codes.filter(c => c.status === 'pending')
      .sort((a, b) => new Date(b.createdAt?.seconds * 1000 || 0) - new Date(a.createdAt?.seconds * 1000 || 0));
    
    const redeemedCodes = codes.filter(c => c.status === 'redeemed')
      .sort((a, b) => new Date(b.redeemedAt?.seconds * 1000 || 0) - new Date(a.redeemedAt?.seconds * 1000 || 0));

    renderPendingCodes(pendingCodes);
    renderRedeemedCodes(redeemedCodes);
  } catch (err) {
    console.error('Error loading codes:', err);
  }
}

function renderPendingCodes(codes) {
  const container = $('#pending-codes-list');
  if (!codes || codes.length === 0) {
    container.innerHTML = '<p class="empty-state">Nenhum código pendente.</p>';
    return;
  }

  container.innerHTML = codes.map(c => `
    <div class="code-card">
      <div class="code-card-header">
        <div>
          <span class="code-value">${c.code}</span>
          <span class="code-gold">G ${c.goldValue.toFixed(2)}</span>
        </div>
        <span class="status-badge status-pending">Pendente</span>
      </div>
      <div class="code-details">
        <div>Cadastrado por: <strong>${c.createdByName || 'ADM'}</strong></div>
        <div>Data: <strong>${c.createdAt ? new Date(c.createdAt.seconds * 1000).toLocaleDateString('pt-BR') + ' ' + new Date(c.createdAt.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</strong></div>
      </div>
      <div class="code-actions">
        <button class="btn btn-accent btn-sm" onclick="redeemCode('${c.id}')">🎯 Resgatar</button>
        <button class="btn btn-danger btn-sm" onclick="deleteCode('${c.id}', '${c.code}')">🗑️ Excluir</button>
      </div>
    </div>
  `).join('');
}

function renderRedeemedCodes(codes) {
  const container = $('#redeemed-codes-list');
  if (!codes || codes.length === 0) {
    container.innerHTML = '<p class="empty-state">Nenhum código resgatado ainda.</p>';
    return;
  }

  container.innerHTML = codes.map(c => `
    <div class="code-card redeemed">
      <div class="code-card-header">
        <div>
          <span class="code-value">${c.code}</span>
          <span class="code-gold">G ${c.goldValue.toFixed(2)}</span>
        </div>
        <span class="status-badge status-active">Resgatado</span>
      </div>
      <div class="code-details">
        <div>Cadastrado por: <strong>${c.createdByName || 'ADM'}</strong></div>
        <div>Data cadastro: <strong>${c.createdAt ? new Date(c.createdAt.seconds * 1000).toLocaleDateString('pt-BR') + ' ' + new Date(c.createdAt.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</strong></div>
        <div>Resgatado por: <strong>${c.redeemedByName || 'ADM'}</strong></div>
        <div>Data resgate: <strong>${c.redeemedAt ? new Date(c.redeemedAt.seconds * 1000).toLocaleDateString('pt-BR') + ' ' + new Date(c.redeemedAt.seconds * 1000).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '-'}</strong></div>
      </div>
    </div>
  `).join('');
}

window.redeemCode = async function(codeId) {
  if (!confirm('Deseja realmente resgatar este código?')) return;

  try {
    await updateDoc(doc(db, 'codes', codeId), {
      status: 'redeemed',
      redeemedAt: serverTimestamp(),
      redeemedBy: state.currentUser.uid,
      redeemedByName: state.userProfile.nome || state.userProfile.nick || 'ADM'
    });

    toast('Código resgatado com sucesso!', 'success');
    loadCodes();
  } catch (err) {
    console.error('Error redeeming code:', err);
    toast('Erro ao resgatar código.', 'error');
  }
};

window.deleteCode = async function(codeId, codeValue) {
  if (!confirm(`Deseja realmente excluir o código "${codeValue}"?`)) return;

  try {
    await deleteDoc(doc(db, 'codes', codeId));
    toast('Código excluído com sucesso.', 'success');
    loadCodes();
  } catch (err) {
    console.error('Error deleting code:', err);
    toast('Erro ao excluir código.', 'error');
  }
};

// ============================================
// NÚMEROS DA SORTE (venda de números para usuários)
// ============================================
function formatBRL(v) {
  return (v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

// Usuários ativos e não-ADM (excluindo o ADM Master) - elegíveis para dividir o custo do pack
async function getActiveEligibleUsers() {
  try {
    const q = query(collection(db, 'users'), where('status', '==', 'active'));
    const snap = await getDocs(q);
    const list = [];
    snap.forEach(d => {
      const u = d.data();
      const email = (u.email || '').trim().toLowerCase();
      if (u.role === 'admin') return;
      if (email === MASTER_EMAIL.toLowerCase()) return;
      list.push({ id: d.id, ...u });
    });
    return list;
  } catch (err) {
    console.error('Error loading eligible users:', err);
    return [];
  }
}

function populatePackSelect() {
  const sel = $('#pack-select');
  if (!sel) return;
  sel.innerHTML = '<option value="">Selecione um pack...</option>';
  GOLD_PACKS_CATALOG.forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = `${p.name} — ${formatBRL(p.cost)}`;
    sel.appendChild(opt);
  });
}

async function handlePackSelectChange() {
  const packId = $('#pack-select').value;
  const preview = $('#pack-preview');
  const btn = $('#btn-publish-pack');
  if (!packId) {
    preview.textContent = 'Selecione um pack para ver os detalhes.';
    btn.disabled = true;
    return;
  }
  const pack = GOLD_PACKS_CATALOG.find(p => p.id === packId);
  preview.innerHTML = 'Calculando usuários elegíveis...';
  const eligible = await getActiveEligibleUsers();
  if (eligible.length === 0) {
    preview.innerHTML = `<strong>${pack.name}</strong> — ${formatBRL(pack.cost)} · G ${pack.gold}<br>⚠️ Nenhum usuário ativo elegível encontrado.`;
    btn.disabled = true;
    return;
  }
  const pricePerNumber = pack.cost / eligible.length;
  preview.innerHTML = `<strong>${pack.name}</strong> — ${formatBRL(pack.cost)} · G ${pack.gold}<br>
    Usuários elegíveis: <strong>${eligible.length}</strong><br>
    Total de números: <strong>${eligible.length}</strong><br>
    Valor por número: <strong>${formatBRL(pricePerNumber)}</strong>`;
  btn.disabled = false;
}

async function handlePublishPack() {
  const packId = $('#pack-select').value;
  if (!packId) return toast('Selecione um pack.', 'error');
  const pack = GOLD_PACKS_CATALOG.find(p => p.id === packId);
  if (!pack) return toast('Pack inválido.', 'error');

  const btn = $('#btn-publish-pack');
  btn.disabled = true;
  try {
    const eligible = await getActiveEligibleUsers();
    if (eligible.length === 0) {
      toast('Nenhum usuário ativo elegível para dividir o pack.', 'error');
      btn.disabled = false;
      return;
    }
    const totalNumbers = eligible.length;
    const pricePerNumber = pack.cost / totalNumbers;

    await addDoc(collection(db, 'numberSales'), {
      packCatalogId: pack.id,
      packName: pack.name,
      gold: pack.gold,
      costValue: pack.cost,
      totalNumbers,
      pricePerNumber,
      soldCount: 0,
      numbers: [],
      purchases: [],
      status: 'open',
      createdBy: state.currentUser.uid,
      createdByName: state.userProfile.nome || state.userProfile.nick || 'ADM',
      createdAt: serverTimestamp(),
      dateStr: nowFormatted()
    });

    toast('Pack publicado com sucesso!', 'success');
    $('#pack-select').value = '';
    $('#pack-preview').textContent = 'Selecione um pack para ver os detalhes.';
    loadNumberSales();
  } catch (err) {
    console.error('Error publishing pack:', err);
    toast('Erro ao publicar pack.', 'error');
  }
  btn.disabled = false;
}

function packRemaining(pack) {
  return Math.max(0, (pack.totalNumbers || 0) - (pack.soldCount || 0));
}

async function loadNumberSales() {
  try {
    const snap = await getDocs(collection(db, 'numberSales'));
    const packs = [];
    snap.forEach(d => packs.push({ id: d.id, ...d.data() }));
    packs.sort((a, b) => {
      const ta = a.createdAt?.seconds || 0;
      const tb = b.createdAt?.seconds || 0;
      return tb - ta;
    });
    state.numberSales = packs;
    renderNumberPacks();
    renderNumbersHistory();
  } catch (err) {
    console.error('Error loading number sales:', err);
  }
}

function renderNumberPacks() {
  const container = $('#numbers-packs-list');
  if (!container) return;
  if (!state.numberSales.length) {
    container.innerHTML = '<p class="empty-state">Nenhum pack disponível no momento.</p>';
    return;
  }

  container.innerHTML = state.numberSales.map(p => {
    const remaining = packRemaining(p);
    const pct = p.totalNumbers ? Math.min(100, Math.round((p.soldCount / p.totalNumbers) * 100)) : 0;
    const cardClass = p.status === 'drawn' ? 'pack-card drawn' : (p.status === 'sold_out' ? 'pack-card sold-out' : 'pack-card');
    const statusBadge = p.status === 'drawn'
      ? '<span class="status-badge status-active">🏆 Sorteado</span>'
      : p.status === 'sold_out'
      ? '<span class="status-badge status-blocked">Esgotado</span>'
      : '<span class="status-badge status-active">Aberto</span>';

    const winnerBanner = p.status === 'drawn' ? `
      <div class="pack-winner-banner">
        🏆 Número sorteado: <span class="lucky-number">${p.drawnNumber}</span> — Vencedor: <strong>${p.drawnWinnerName || '-'}</strong>
      </div>` : '';

    let actions = `<button class="btn btn-outline btn-sm" onclick="openPackHistoryModal('${p.id}')">📜 Ver Histórico</button>`;
    if (p.status === 'open') {
      if (state.isAdmin) {
        actions += ` <button class="btn btn-primary btn-sm" onclick="openRegisterSaleModal('${p.id}')">➕ Registrar Venda</button>`;
      } else {
        actions += ` <button class="btn btn-accent btn-sm" onclick="openBuyNumbersModal('${p.id}')">🎟️ Comprar Números</button>`;
      }
    } else if (p.status === 'sold_out' && state.isAdmin) {
      actions += ` <button class="btn btn-accent btn-sm" onclick="drawPackWinner('${p.id}')">🎯 Sortear Vencedor</button>`;
    }
    if (state.isAdmin && p.status !== 'drawn') {
      actions += ` <button class="btn btn-danger btn-sm" onclick="deleteNumberPack('${p.id}','${p.packName}')">🗑️ Excluir</button>`;
    }

    return `
      <div class="${cardClass}">
        <div class="pack-card-header">
          <div><span class="pack-card-title">${p.packName}</span><span class="pack-card-gold">G ${p.gold}</span></div>
          ${statusBadge}
        </div>
        ${winnerBanner}
        <div class="pack-card-details">
          Custo total: <strong>${formatBRL(p.costValue)}</strong> · Valor por número: <strong>${formatBRL(p.pricePerNumber)}</strong><br>
          Vendidos: <strong>${p.soldCount || 0}/${p.totalNumbers}</strong> · Restam: <strong>${remaining}</strong> números<br>
          Publicado por: <strong>${p.createdByName || 'ADM'}</strong> em ${p.dateStr || '-'}
        </div>
        <div class="pack-stock-bar"><div class="pack-stock-fill" style="width:${pct}%"></div></div>
        <div class="pack-card-actions">${actions}</div>
      </div>
    `;
  }).join('');
}

function renderNumbersHistory() {
  const container = $('#numbers-history-list');
  const title = $('#numbers-history-title');
  if (!container) return;

  let purchases = [];
  state.numberSales.forEach(p => {
    (p.purchases || []).forEach(pu => {
      purchases.push({ ...pu, packName: p.packName, gold: p.gold });
    });
  });

  if (!state.isAdmin) {
    title.textContent = '📋 Meu Histórico de Compras';
    const uid = state.currentUser?.uid;
    purchases = purchases.filter(pu => pu.userId === uid);
  } else {
    title.textContent = '📋 Histórico Geral de Vendas';
  }

  purchases.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  if (!purchases.length) {
    container.innerHTML = '<p class="empty-state">Nenhuma compra registrada ainda.</p>';
    return;
  }

  container.innerHTML = purchases.map(pu => `
    <div class="purchase-history-item">
      <div><strong>${pu.packName}</strong> (G ${pu.gold}) — ${pu.quantity} número(s) — ${formatBRL(pu.value)}</div>
      ${!state.isAdmin ? '' : `<div>Comprador: <strong>${pu.userName}</strong></div>`}
      <div>Números: ${(pu.numbers || []).map(n => `<span class="lucky-number">${n}</span>`).join('')}</div>
      <div>Confirmado por: <strong>${pu.confirmedByName || 'ADM'}</strong> em ${pu.dateStr || '-'}</div>
    </div>
  `).join('');
}

// --- Comprar Números (Usuário) ---
window.openBuyNumbersModal = function(packId) {
  const pack = state.numberSales.find(p => p.id === packId);
  if (!pack) return;
  const remaining = packRemaining(pack);
  if (remaining <= 0) return toast('Este pack está esgotado.', 'error');

  $('#buy-pack-id').value = packId;
  $('#buy-pack-info').innerHTML = `<strong>${pack.packName}</strong> — Valor por número: <strong>${formatBRL(pack.pricePerNumber)}</strong>`;
  $('#buy-quantity').value = 1;
  $('#buy-quantity').max = remaining;
  $('#buy-quantity-hint').textContent = `Disponível: ${remaining} números`;

  const sel = $('#buy-adm-destino');
  sel.innerHTML = '<option value="">Selecione um ADM...</option>';
  state.admins.forEach(a => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.nick || a.nome;
    opt.dataset.whatsapp = a.whatsapp;
    sel.appendChild(opt);
  });

  updateBuyTotalPreview();
  show($('#modal-buy-numbers'));
};

function updateBuyTotalPreview() {
  const pack = state.numberSales.find(p => p.id === $('#buy-pack-id').value);
  if (!pack) return;
  let qty = parseInt($('#buy-quantity').value) || 0;
  const remaining = packRemaining(pack);
  if (qty > remaining) qty = remaining;
  if (qty < 1) qty = 1;
  $('#buy-quantity').value = qty;
  $('#buy-total-preview').textContent = `Total: ${formatBRL(qty * pack.pricePerNumber)}`;
}

function handleConfirmBuyNumbers() {
  const packId = $('#buy-pack-id').value;
  const pack = state.numberSales.find(p => p.id === packId);
  if (!pack) return;
  const qty = parseInt($('#buy-quantity').value) || 0;
  const remaining = packRemaining(pack);
  if (qty < 1 || qty > remaining) return toast('Quantidade inválida.', 'error');

  const admSelect = $('#buy-adm-destino');
  const admOption = admSelect.selectedOptions[0];
  const admWhatsapp = admOption?.dataset.whatsapp;
  if (!admSelect.value || !admWhatsapp) return toast('Selecione um ADM.', 'error');

  const total = qty * pack.pricePerNumber;
  const p = state.userProfile;
  const waMessage = encodeURIComponent(
    `🔢 *PEDIDO DE NÚMEROS DA SORTE - NYXEN CLAN*\n\n` +
    `*Pack:* ${pack.packName} (G ${pack.gold})\n` +
    `*Comprador:* ${p?.nick || p?.nome || '-'}\n` +
    `*ID Conta:* ${p?.contaid || '-'}\n` +
    `*Quantidade:* ${qty} número(s)\n` +
    `*Valor por número:* ${formatBRL(pack.pricePerNumber)}\n` +
    `*Valor total:* ${formatBRL(total)}\n\n` +
    `💰 Pagamento via Pix/dinheiro combinado diretamente com o ADM.\n` +
    `⏳ Aguardando confirmação do ADM para geração dos números.`
  );
  const link = document.createElement('a');
  link.href = `https://wa.me/${admWhatsapp}?text=${waMessage}`;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  hide($('#modal-buy-numbers'));
  toast('Pedido enviado via WhatsApp! Aguarde a confirmação do ADM.', 'success');
}

// --- Registrar Venda Confirmada (Admin) ---
window.openRegisterSaleModal = async function(packId) {
  const pack = state.numberSales.find(p => p.id === packId);
  if (!pack) return;
  const remaining = packRemaining(pack);
  if (remaining <= 0) return toast('Este pack está esgotado.', 'error');

  $('#sale-pack-id').value = packId;
  $('#sale-pack-info').innerHTML = `<strong>${pack.packName}</strong> — Valor por número: <strong>${formatBRL(pack.pricePerNumber)}</strong>`;
  $('#sale-quantity').value = 1;
  $('#sale-quantity').max = remaining;
  $('#sale-quantity-hint').textContent = `Disponível: ${remaining} números`;

  const sel = $('#sale-user-select');
  sel.innerHTML = '<option value="">Carregando usuários...</option>';
  const eligible = await getActiveEligibleUsers();
  sel.innerHTML = '<option value="">Selecione o usuário...</option>';
  eligible.forEach(u => {
    const opt = document.createElement('option');
    opt.value = u.id;
    opt.textContent = `${u.nick || u.nome} (ID: ${u.contaid || '-'})`;
    opt.dataset.nome = u.nick || u.nome;
    sel.appendChild(opt);
  });

  updateSaleTotalPreview();
  show($('#modal-register-sale'));
};

function updateSaleTotalPreview() {
  const pack = state.numberSales.find(p => p.id === $('#sale-pack-id').value);
  if (!pack) return;
  let qty = parseInt($('#sale-quantity').value) || 0;
  const remaining = packRemaining(pack);
  if (qty > remaining) qty = remaining;
  if (qty < 1) qty = 1;
  $('#sale-quantity').value = qty;
  $('#sale-total-preview').textContent = `Total: ${formatBRL(qty * pack.pricePerNumber)}`;
}

function generateUniqueNumbers(count, existingNumbers) {
  const used = new Set(existingNumbers);
  const result = [];
  while (result.length < count) {
    const n = String(Math.floor(Math.random() * 1000000)).padStart(6, '0');
    if (!used.has(n)) {
      used.add(n);
      result.push(n);
    }
  }
  return result;
}

async function handleConfirmRegisterSale() {
  const packId = $('#sale-pack-id').value;
  const pack = state.numberSales.find(p => p.id === packId);
  if (!pack) return;

  const userSel = $('#sale-user-select');
  const userId = userSel.value;
  if (!userId) return toast('Selecione um usuário.', 'error');
  const userName = userSel.selectedOptions[0]?.dataset.nome || 'Usuário';

  const qty = parseInt($('#sale-quantity').value) || 0;
  const remaining = packRemaining(pack);
  if (qty < 1 || qty > remaining) return toast('Quantidade inválida.', 'error');

  const btn = $('#btn-confirm-register-sale');
  btn.disabled = true;
  try {
    const newNumbers = generateUniqueNumbers(qty, pack.numbers || []);
    const value = qty * pack.pricePerNumber;
    const purchase = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 8),
      userId, userName,
      quantity: qty,
      numbers: newNumbers,
      value,
      confirmedByName: state.userProfile.nome || state.userProfile.nick || 'ADM',
      confirmedByUid: state.currentUser.uid,
      date: new Date().toISOString(),
      dateStr: nowFormatted()
    };

    const updatedNumbers = [...(pack.numbers || []), ...newNumbers];
    const updatedPurchases = [...(pack.purchases || []), purchase];
    const newSoldCount = (pack.soldCount || 0) + qty;
    const newStatus = newSoldCount >= pack.totalNumbers ? 'sold_out' : 'open';

    await updateDoc(doc(db, 'numberSales', packId), {
      numbers: updatedNumbers,
      purchases: updatedPurchases,
      soldCount: newSoldCount,
      status: newStatus
    });

    toast(`Venda registrada! Números gerados: ${newNumbers.join(', ')}`, 'success');
    hide($('#modal-register-sale'));
    loadNumberSales();
  } catch (err) {
    console.error('Error registering sale:', err);
    toast('Erro ao registrar venda.', 'error');
  }
  btn.disabled = false;
}

// --- Sortear Vencedor ---
window.drawPackWinner = async function(packId) {
  const pack = state.numberSales.find(p => p.id === packId);
  if (!pack) return;
  if (!pack.numbers || !pack.numbers.length) return toast('Nenhum número vendido neste pack.', 'error');
  if (!confirm(`Sortear o vencedor do pack "${pack.packName}"? Esta ação não pode ser desfeita.`)) return;

  try {
    const drawnNumber = pack.numbers[Math.floor(Math.random() * pack.numbers.length)];
    const winningPurchase = (pack.purchases || []).find(pu => (pu.numbers || []).includes(drawnNumber));

    await updateDoc(doc(db, 'numberSales', packId), {
      status: 'drawn',
      drawnNumber,
      drawnWinnerId: winningPurchase?.userId || '',
      drawnWinnerName: winningPurchase?.userName || 'Desconhecido',
      drawnAt: serverTimestamp(),
      drawnAtStr: nowFormatted()
    });

    toast(`🏆 Número sorteado: ${drawnNumber} — Vencedor: ${winningPurchase?.userName || 'Desconhecido'}`, 'success');
    loadNumberSales();
  } catch (err) {
    console.error('Error drawing pack winner:', err);
    toast('Erro ao sortear vencedor.', 'error');
  }
};

window.deleteNumberPack = async function(packId, packName) {
  if (!confirm(`Deseja realmente excluir o pack "${packName}"? Vendas já registradas serão perdidas.`)) return;
  try {
    await deleteDoc(doc(db, 'numberSales', packId));
    toast('Pack excluído.', 'info');
    loadNumberSales();
  } catch (err) {
    console.error('Error deleting pack:', err);
    toast('Erro ao excluir pack.', 'error');
  }
};

window.openPackHistoryModal = function(packId) {
  const pack = state.numberSales.find(p => p.id === packId);
  if (!pack) return;
  $('#pack-history-title').textContent = `📋 ${pack.packName} — Números Vendidos`;
  const list = $('#pack-history-list');
  const purchases = pack.purchases || [];

  const winnerBanner = pack.status === 'drawn' ? `
    <div class="pack-winner-banner">
      🏆 Número sorteado: <span class="lucky-number">${pack.drawnNumber}</span> — Vencedor: <strong>${pack.drawnWinnerName || '-'}</strong> em ${pack.drawnAtStr || '-'}
    </div>` : '';

  if (!purchases.length) {
    list.innerHTML = winnerBanner + '<p class="empty-state">Nenhuma venda registrada ainda para este pack.</p>';
  } else {
    list.innerHTML = winnerBanner + purchases.map(pu => `
      <div class="purchase-history-item">
        <div><strong>${pu.userName}</strong> — ${pu.quantity} número(s) — ${formatBRL(pu.value)}</div>
        <div>Números: ${(pu.numbers || []).map(n => `<span class="lucky-number${pack.drawnNumber === n ? ' winner-badge' : ''}">${n}</span>`).join('')}</div>
        <div>Confirmado por: <strong>${pu.confirmedByName || 'ADM'}</strong> em ${pu.dateStr || '-'}</div>
      </div>
    `).join('');
  }
  show($('#modal-pack-history'));
};

// ============================================
// PROFILE EDIT (own data)
// ============================================
function openEditProfile() {
  const p = state.userProfile;
  if (!p) return;
  $('#eprof-nome').value = p.nome || '';
  $('#eprof-nick').value = p.nick || '';
  $('#eprof-contaid').value = p.contaid || '';
  $('#eprof-email').value = p.email || '';
  $('#eprof-whatsapp').value = p.whatsapp || '';
  $('#eprof-nascimento').value = p.nascimento || '';
  $('#eprof-genero').value = p.genero || 'masculino';
  show($('#modal-edit-profile'));
}

async function handleEditProfile(e) {
  e.preventDefault();
  const uid = state.currentUser.uid;
  const newEmail = $('#eprof-email').value.trim();
  const oldEmail = state.userProfile.email;
  
  try {
    // Update Firestore document with all fields
    await updateDoc(doc(db, 'users', uid), {
      nome: $('#eprof-nome').value.trim(),
      nick: $('#eprof-nick').value.trim(),
      contaid: $('#eprof-contaid').value.trim(),
      email: newEmail,
      whatsapp: $('#eprof-whatsapp').value.trim(),
      nascimento: $('#eprof-nascimento').value.trim(),
      genero: $('#eprof-genero').value,
      updatedAt: serverTimestamp()
    });
    
    // If email changed, update Firebase Auth
    if (newEmail !== oldEmail) {
      const user = auth.currentUser;
      await updateEmail(user, newEmail);
      toast('Email atualizado com sucesso!', 'success');
    } else {
      toast('Dados atualizados!', 'success');
    }
    
    hide($('#modal-edit-profile'));
    await loadUserProfile(uid);
    loadAdminsList();
  } catch (err) {
    console.error('Error updating profile:', err);
    if (err.code === 'auth/requires-recent-login') {
      toast('Por segurança, faça login novamente para alterar o email.', 'error');
    } else {
      toast('Erro ao atualizar dados.', 'error');
    }
  }
}

// ============================================
// ADMIN WHATSAPP SETTING
// ============================================
// ============================================
// CLOCK UPDATE
// ============================================
function updateClock() {
  $('#sorteio-data').textContent = todayStr();
  $('#sorteio-hora').textContent = timeStr();
}

// ============================================
// EVENT LISTENERS
// ============================================
function bindEvents() {
  // Auth navigation
  $('#btn-go-register').addEventListener('click', (e) => { e.preventDefault(); showScreen('register'); });
  $('#btn-go-login').addEventListener('click', (e) => { e.preventDefault(); showScreen('login'); });

  // Forms
  $('#form-login').addEventListener('submit', handleLogin);
  $('#form-register').addEventListener('submit', handleRegister);
  $('#form-edit-user').addEventListener('submit', handleEditUser);
  $('#form-delete-user').addEventListener('submit', handleDeleteUser);
  $('#form-edit-profile').addEventListener('submit', handleEditProfile);
  $('#form-register-code').addEventListener('submit', handleRegisterCode);

  // Números da Sorte
  populatePackSelect();
  $('#pack-select').addEventListener('change', handlePackSelectChange);
  $('#btn-publish-pack').addEventListener('click', handlePublishPack);
  $('#buy-quantity').addEventListener('input', updateBuyTotalPreview);
  $('#btn-confirm-buy-numbers').addEventListener('click', handleConfirmBuyNumbers);
  $('#btn-cancel-buy-numbers').addEventListener('click', () => hide($('#modal-buy-numbers')));
  $('#btn-close-buy-numbers').addEventListener('click', () => hide($('#modal-buy-numbers')));
  $('#sale-quantity').addEventListener('input', updateSaleTotalPreview);
  $('#btn-confirm-register-sale').addEventListener('click', handleConfirmRegisterSale);
  $('#btn-cancel-register-sale').addEventListener('click', () => hide($('#modal-register-sale')));
  $('#btn-close-register-sale').addEventListener('click', () => hide($('#modal-register-sale')));
  $('#btn-close-pack-history').addEventListener('click', () => hide($('#modal-pack-history')));
  $('#btn-close-pack-history-2').addEventListener('click', () => hide($('#modal-pack-history')));

  // Logout
  $('#btn-logout').addEventListener('click', handleLogout);

  // Tab navigation
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(item.dataset.tab);
      if (item.dataset.tab === 'aprovacoes') loadPendingUsers();
      if (item.dataset.tab === 'gerenciamento') loadUsersTable();
      if (item.dataset.tab === 'historico') loadRegistrationHistory();
      if (item.dataset.tab === 'codigos') loadCodes();
      if (item.dataset.tab === 'numeros') loadNumberSales();
    });
  });

  // Input masks
  $('#reg-nome').addEventListener('input', maskOnlyLetters);
  $('#reg-nick').addEventListener('input', maskAlphaNum);
  $('#reg-contaid').addEventListener('input', maskOnlyNumbers);
  $('#reg-whatsapp').addEventListener('input', maskOnlyNumbers);
  $('#reg-nascimento').addEventListener('input', maskOnlyNumbers);
  $('#edit-nome').addEventListener('input', maskOnlyLetters);
  $('#edit-nick').addEventListener('input', maskAlphaNum);
  $('#edit-contaid').addEventListener('input', maskOnlyNumbers);
  $('#edit-whatsapp').addEventListener('input', maskOnlyNumbers);
  $('#edit-nascimento').addEventListener('input', maskOnlyNumbers);
  $('#eprof-nome').addEventListener('input', maskOnlyLetters);
  $('#eprof-nick').addEventListener('input', maskAlphaNum);
  $('#eprof-contaid').addEventListener('input', maskOnlyNumbers);
  $('#eprof-email').addEventListener('input', (e) => { /* email validation handled by type */ });
  $('#eprof-whatsapp').addEventListener('input', maskOnlyNumbers);
  $('#eprof-nascimento').addEventListener('input', maskOnlyNumbers);
  $('#code-value').addEventListener('input', maskAlphaNum);

  // Draw controls
  $('#btn-girar-roleta').addEventListener('click', spinRoulette);
  $('#btn-salvar-sorteio').addEventListener('click', () => {
    const valor = parseFloat($('#draw-valor').value) || 0;
    state.drawConfig.valor = valor;
    state.drawConfig.participantes = Array.from(state.selectedParticipants);

    // Desenha a pré-visualização da roleta com os participantes selecionados
    const canvas = $('#roulette-canvas');
    const ctx = canvas.getContext('2d');
    const names = state.drawConfig.participantes.map(id => {
      const u = state.allUsers.find(u => u.id === id);
      return u ? (u.nick || u.nome) : id;
    });
    hide($('#roulette-result'));
    drawWheel(ctx, canvas, names, 0);

    toast('Configuração de sorteio salva!', 'success');
  });
  $('#btn-select-all').addEventListener('click', () => {
    $$('#participants-list input[type="checkbox"]').forEach(cb => {
      cb.checked = true;
      state.selectedParticipants.add(cb.value);
    });
  });
  $('#btn-deselect-all').addEventListener('click', () => {
    $$('#participants-list input[type="checkbox"]').forEach(cb => {
      cb.checked = false;
    });
    state.selectedParticipants.clear();
  });

  // Next Draw controls
  if ($('#btn-save-next-draw')) {
    $('#btn-save-next-draw').addEventListener('click', saveNextDraw);
  }
  if ($('#btn-cancel-next-draw')) {
    $('#btn-cancel-next-draw').addEventListener('click', cancelNextDraw);
  }

  // Group Link control
  if ($('#btn-save-group-link')) {
    $('#btn-save-group-link').addEventListener('click', async () => {
      const groupLink = $('#group-link').value.trim();
      if (!groupLink) {
        toast('Por favor, insira um link válido.', 'error');
        return;
      }
      const success = await saveSettings({ groupLink });
      if (success) {
        toast('Link do grupo salvo com sucesso!', 'success');
      } else {
        toast('Erro ao salvar link do grupo.', 'error');
      }
    });
  }

  // Modals close
  $('#btn-close-edit').addEventListener('click', () => hide($('#modal-edit-user')));
  $('#btn-cancel-edit').addEventListener('click', () => hide($('#modal-edit-user')));
  $('#btn-close-delete').addEventListener('click', () => hide($('#modal-delete-user')));
  $('#btn-cancel-delete').addEventListener('click', () => hide($('#modal-delete-user')));
  $('#btn-close-edit-profile').addEventListener('click', () => hide($('#modal-edit-profile')));
  $('#btn-cancel-edit-profile').addEventListener('click', () => hide($('#modal-edit-profile')));
  $$('.modal-backdrop').forEach(bd => {
    bd.addEventListener('click', () => {
      $$('.modal').forEach(m => m.classList.add('hidden'));
    });
  });

  // Profile edit
  $('#btn-edit-profile').addEventListener('click', openEditProfile);

  // History filter
  $('#filter-history-type').addEventListener('change', (e) => {
    const filterType = e.target.value;
    if (filterType === 'all') {
      renderRegistrationHistory(state.registrationHistory || []);
    } else {
      const filtered = (state.registrationHistory || []).filter(h => h.action === filterType);
      renderRegistrationHistory(filtered);
    }
  });

  // Search users
  if ($('#search-users')) {
    $('#search-users').addEventListener('input', (e) => {
      const term = e.target.value.toLowerCase();
      const statusFilter = $('#filter-user-status')?.value || 'all';
      let filtered = state.allUsers;
      
      // Apply status filter first
      if (statusFilter !== 'all') {
        filtered = filtered.filter(u => u.status === statusFilter);
      }
      
      // Then apply search filter
      filtered = filtered.filter(u =>
        (u.nome || '').toLowerCase().includes(term) ||
        (u.nick || '').toLowerCase().includes(term) ||
        (u.email || '').toLowerCase().includes(term) ||
        (u.contaid || '').includes(term)
      );
      renderUsersTable(filtered);
    });
  }
  
  // Filter by status
  if ($('#filter-user-status')) {
    $('#filter-user-status').addEventListener('change', (e) => {
      const statusFilter = e.target.value;
      const searchTerm = ($('#search-users')?.value || '').toLowerCase();
      let filtered = state.allUsers;
      
      // Apply status filter
      if (statusFilter !== 'all') {
        filtered = filtered.filter(u => u.status === statusFilter);
      }
      
      // Then apply search filter
      if (searchTerm) {
        filtered = filtered.filter(u =>
          (u.nome || '').toLowerCase().includes(searchTerm) ||
          (u.nick || '').toLowerCase().includes(searchTerm) ||
          (u.email || '').toLowerCase().includes(searchTerm) ||
          (u.contaid || '').includes(searchTerm)
        );
      }
      
      renderUsersTable(filtered);
    });
  }
  
  // Blocked user modal controls
  if ($('#btn-close-view-blocked')) {
    $('#btn-close-view-blocked').addEventListener('click', () => hide($('#modal-view-blocked')));
  }
  if ($('#btn-close-blocked-details')) {
    $('#btn-close-blocked-details').addEventListener('click', () => hide($('#modal-view-blocked')));
  }
  if ($('#btn-reactivate-user')) {
    $('#btn-reactivate-user').addEventListener('click', () => {
      const uid = $('#modal-view-blocked').dataset.userId;
      if (uid) {
        reactivateUser(uid);
      }
    });
  }
  
  // Change Role modal controls
  if ($('#btn-close-change-role')) {
    $('#btn-close-change-role').addEventListener('click', () => hide($('#modal-change-role')));
  }
  if ($('#btn-cancel-change-role')) {
    $('#btn-cancel-change-role').addEventListener('click', () => hide($('#modal-change-role')));
  }
  if ($('#btn-confirm-change-role')) {
    $('#btn-confirm-change-role').addEventListener('click', () => {
      saveUserRole();
    });
  }
  
  // Pending details modal controls
  if ($('#btn-close-view-pending')) {
    $('#btn-close-view-pending').addEventListener('click', () => hide($('#modal-view-pending')));
  }
  if ($('#btn-close-pending-details')) {
    $('#btn-close-pending-details').addEventListener('click', () => hide($('#modal-view-pending')));
  }
  if ($('#btn-approve-from-modal')) {
    $('#btn-approve-from-modal').addEventListener('click', () => {
      const modal = $('#modal-view-pending');
      const pendingId = modal.dataset.pendingId;
      const uid = modal.dataset.uid;
      if (pendingId) {
        // Abrir WhatsApp SINCRONAMENTE antes de qualquer await (evita bloqueio de popup)
        const pendingData = state.pendingUsers.find(p => p.id === pendingId);
        if (pendingData) {
          const userWhats = pendingData.whatsapp || '';
          if (userWhats) {
            const groupLink = state.settings?.groupLink || '';
            let message = `Olá ${pendingData.nome || pendingData.nick}!\n\n✅ Seu cadastro foi APROVADO!\n\nBem-vindo ao clan! `;
            if (groupLink) {
              message += `\n\n🔗 Acesse nosso grupo: ${groupLink}`;
            }
            const encodedMessage = encodeURIComponent(message);
            const whatsappUrl = `https://wa.me/${userWhats}?text=${encodedMessage}`;
            // Usar link temporário para evitar bloqueio de popup
            const link = document.createElement('a');
            link.href = whatsappUrl;
            link.target = '_blank';
            link.rel = 'noopener noreferrer';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
          }
        }
        
        hide(modal);
        approvePending(pendingId, uid);
      }
    });
  }
  if ($('#btn-reject-from-modal')) {
    $('#btn-reject-from-modal').addEventListener('click', () => {
      const modal = $('#modal-view-pending');
      const pendingId = modal.dataset.pendingId;
      const uid = modal.dataset.uid;
      if (pendingId) {
        hide(modal);
        rejectPending(pendingId, uid);
      }
    });
  }
  
  // Mobile menu
  if ($('#mobile-menu-btn')) {
    $('#mobile-menu-btn').addEventListener('click', () => {
      const sidebar = $('#sidebar');
      const overlay = $('#mobile-overlay');
      sidebar.classList.toggle('open');
      if (sidebar.classList.contains('open')) {
        overlay.classList.remove('hidden');
      } else {
        overlay.classList.add('hidden');
      }
    });
  }
  
  if ($('#mobile-overlay')) {
    $('#mobile-overlay').addEventListener('click', () => {
      $('#sidebar').classList.remove('open');
      $('#mobile-overlay').classList.add('hidden');
    });
  }
  
  // Close mobile menu when clicking nav items
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', () => {
      if (window.innerWidth <= 768) {
        $('#sidebar').classList.remove('open');
        $('#mobile-overlay').classList.add('hidden');
      }
    });
  });
}

// ============================================
// AUTH STATE LISTENER
// ============================================
function initAuthListener() {
  onAuthStateChanged(auth, async (user) => {
    hide($('#loading-screen'));
    if (user) {
      state.currentUser = user;
      await loadUserProfile(user.uid);

      // Check if user is pending
      if (state.userProfile?._pending) {
        toast('Seu cadastro está pendente de aprovação.', 'info');
        showScreen('login');
        await signOut(auth);
        return;
      }

      showScreen('app');
      updateClock();
      setInterval(updateClock, 1000);
      initRoulette();
      loadAdminsList();
    } else {
      state.currentUser = null;
      state.userProfile = null;
      state.isAdmin = false;
      showScreen('login');
      // Carregar lista de ADMs com WhatsApp para o formulario de cadastro
      // (nao depende do ADM estar online no site - envio 24h via WhatsApp)
      loadAdminsList();
    }
  });
}

// ============================================
// INIT
// ============================================
function init() {
  bindEvents();
  initAuthListener();
}

init();
