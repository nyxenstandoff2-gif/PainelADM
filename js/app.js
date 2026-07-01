// ============================================
// PAINEL ADM - Main Application
// ============================================
import { initializeApp } from 'https://www.gstatic.com/firebasejs/11.0.0/firebase-app.js';
import {
  getAuth, signInWithEmailAndPassword, createUserWithEmailAndPassword,
  signOut, onAuthStateChanged
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

// === State ===
const state = {
  currentUser: null,
  userProfile: null,
  isAdmin: false,
  allUsers: [],
  pendingUsers: [],
  drawHistory: [],
  admins: [],
  currentTab: 'sorteio',
  selectedParticipants: new Set(),
  drawConfig: { valor: 0, participantes: [] },
  rouletteSpinning: false
};

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

function updateUIForRole() {
  const p = state.userProfile;
  if (!p) return;
  $('#user-display-name').textContent = p.nick || p.nome || 'Usuário';
  $('#user-display-role').textContent = state.isAdmin ? 'ADMINISTRADOR' : 'USUÁRIO';
  $('#user-avatar').textContent = (p.nick || p.nome || 'U').charAt(0).toUpperCase();

  if (state.isAdmin) {
    $$('.admin-only').forEach(el => show(el));
    show($('#sorteio-admin-controls'));
    show($('#admin-settings'));
    loadDrawAdminsList();
  } else {
    $$('.admin-only').forEach(el => hide(el));
    hide($('#sorteio-admin-controls'));
    hide($('#admin-settings'));
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

  // Load admin WhatsApp setting
  if (state.isAdmin && p.adminWhatsapp) {
    $('#admin-whatsapp-number').value = p.adminWhatsapp;
  }

  // Load draw participants list
  loadParticipantsList();
  loadDrawHistory();
  loadAdminsList();
  switchTab('sorteio');
}

function formatBirth(b) {
  if (!b || b.length !== 8) return b || '-';
  return `${b.substring(0,2)}/${b.substring(2,4)}/${b.substring(4,8)}`;
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
      if (data.adminWhatsapp) {
        state.admins.push({ id: d.id, nome: data.nome, nick: data.nick, whatsapp: data.adminWhatsapp });
      }
    });
    // Also populate the register form dropdown
    const sel = $('#reg-adm-destino');
    sel.innerHTML = '<option value="">Selecione um ADM...</option>';
    state.admins.forEach(a => {
      const opt = document.createElement('option');
      opt.value = a.id;
      opt.textContent = `${a.nick || a.nome} (WhatsApp)`;
      opt.dataset.whatsapp = a.whatsapp;
      sel.appendChild(opt);
    });
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
    const admOption = $('#reg-adm-destino').selectedOptions[0];
    const admWhatsapp = admOption?.dataset.whatsapp || '';

    await addDoc(collection(db, 'pendingUsers'), {
      uid, nome, nick, contaid, whatsapp, email, nascimento, genero,
      admDestino, admWhatsapp,
      status: 'pending',
      createdAt: serverTimestamp()
    });

    // WhatsApp redirect
    const selectedAdm = state.admins.find(a => a.id === admDestino);
    const waNumber = selectedAdm?.whatsapp || admWhatsapp;
    const waMessage = encodeURIComponent(
      `📋 *NOVO CADASTRO - PAINEL ADM*\n\n` +
      `*Nome:* ${nome}\n` +
      `*Nick:* ${nick}\n` +
      `*ID Conta:* ${contaid}\n` +
      `*Email:* ${email}\n` +
      `*WhatsApp:* ${whatsapp}\n` +
      `*Gênero:* ${genero}\n` +
      `*Nascimento:* ${formatBirth(nascimento)}\n\n` +
      `⏳ Aguardando aprovação.`
    );
    if (waNumber) {
      window.open(`https://wa.me/${waNumber}?text=${waMessage}`, '_blank');
    }

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
    snap.forEach(d => {
      const u = d.data();
      if (u.role === 'admin') return;
      state.allUsers.push({ id: d.id, ...u });
      const item = document.createElement('label');
      item.className = 'participant-item';
      item.innerHTML = `<input type="checkbox" value="${d.id}" data-nick="${u.nick || u.nome}"> <span>${u.nick || u.nome} <small style="color:var(--text-muted)">(ID: ${u.contaid || '-'})</small></span>`;
      item.querySelector('input').addEventListener('change', (e) => {
        if (e.target.checked) state.selectedParticipants.add(d.id);
        else state.selectedParticipants.delete(d.id);
      });
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

  // Center circle
  ctx.beginPath();
  ctx.arc(cx, cy, 20, 0, Math.PI * 2);
  ctx.fillStyle = '#0a0e1a';
  ctx.fill();
  ctx.strokeStyle = '#f0b429';
  ctx.lineWidth = 2;
  ctx.stroke();
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
// USER MANAGEMENT (Admin)
// ============================================
async function loadUsersTable() {
  try {
    const q2 = query(collection(db, 'users'));
    const snap = await getDocs(q2);
    const users = [];
    snap.forEach(d => {
      const data = d.data();
      if (data.role !== 'admin') users.push({ id: d.id, ...data });
    });
    state.allUsers = users;
    renderUsersTable(users);
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
  tbody.innerHTML = users.map(u => `
    <tr>
      <td>${u.nome || '-'}</td>
      <td>${u.nick || '-'}</td>
      <td>${u.contaid || '-'}</td>
      <td>${u.email || '-'}</td>
      <td>${u.whatsapp || '-'}</td>
      <td><span class="status-badge status-${u.status === 'active' ? 'active' : u.status === 'blocked' ? 'blocked' : 'pending'}">${u.status === 'active' ? 'Ativo' : u.status === 'blocked' ? 'Bloqueado' : 'Pendente'}</span></td>
      <td>
        <div class="action-btns">
          <button class="action-btn" onclick="openEditUser('${u.id}')" title="Editar">✏️</button>
          <button class="action-btn delete" onclick="openDeleteUser('${u.id}')" title="Excluir">🗑️</button>
        </div>
      </td>
    </tr>
  `).join('');
}

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

    hide($('#modal-delete-user'));
    toast('Usuário excluído com sucesso.', 'success');
    loadUsersTable();
    loadParticipantsList();
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
        <div class="pending-detail"><span>Gênero: </span>${p.genero || '-'}</div>
        <div class="pending-detail"><span>Nascimento: </span>${formatBirth(p.nascimento)}</div>
      </div>
      <div class="pending-card-actions">
        <button class="btn btn-danger btn-sm" onclick="rejectPending('${p.id}', '${p.uid || ''}')">❌ Rejeitar</button>
        <button class="btn btn-accent btn-sm" onclick="approvePending('${p.id}', '${p.uid || ''}')">✅ Aprovar</button>
      </div>
    </div>
  `).join('');
}

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

    // Remove pending
    await deleteDoc(doc(db, 'pendingUsers', pendingId));
    toast('Usuário aprovado com sucesso!', 'success');
    loadPendingUsers();
    loadParticipantsList();
  } catch (err) {
    toast('Erro ao aprovar usuário.', 'error');
  }
};

window.rejectPending = async function(pendingId, uid) {
  try {
    await deleteDoc(doc(db, 'pendingUsers', pendingId));
    // If user auth exists, we could also delete it but that requires admin SDK
    toast('Cadastro rejeitado.', 'info');
    loadPendingUsers();
  } catch (err) {
    toast('Erro ao rejeitar.', 'error');
  }
};

// ============================================
// PROFILE EDIT (own data)
// ============================================
function openEditProfile() {
  const p = state.userProfile;
  if (!p) return;
  $('#eprof-nome').value = p.nome || '';
  $('#eprof-nick').value = p.nick || '';
  $('#eprof-whatsapp').value = p.whatsapp || '';
  $('#eprof-nascimento').value = p.nascimento || '';
  $('#eprof-genero').value = p.genero || 'masculino';
  show($('#modal-edit-profile'));
}

async function handleEditProfile(e) {
  e.preventDefault();
  const uid = state.currentUser.uid;
  try {
    await updateDoc(doc(db, 'users', uid), {
      nome: $('#eprof-nome').value.trim(),
      nick: $('#eprof-nick').value.trim(),
      whatsapp: $('#eprof-whatsapp').value.trim(),
      nascimento: $('#eprof-nascimento').value.trim(),
      genero: $('#eprof-genero').value,
      updatedAt: serverTimestamp()
    });
    hide($('#modal-edit-profile'));
    toast('Dados atualizados!', 'success');
    await loadUserProfile(uid);
  } catch (err) {
    toast('Erro ao atualizar dados.', 'error');
  }
}

// ============================================
// ADMIN WHATSAPP SETTING
// ============================================
async function saveAdminWhatsapp() {
  const val = $('#admin-whatsapp-number').value.trim();
  if (!/^[0-9]+$/.test(val)) return toast('Número inválido.', 'error');
  try {
    await updateDoc(doc(db, 'users', state.currentUser.uid), {
      adminWhatsapp: val,
      updatedAt: serverTimestamp()
    });
    state.userProfile.adminWhatsapp = val;
    toast('WhatsApp do ADM salvo!', 'success');
    loadAdminsList();
  } catch (err) {
    toast('Erro ao salvar.', 'error');
  }
}

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

  // Logout
  $('#btn-logout').addEventListener('click', handleLogout);

  // Tab navigation
  $$('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      switchTab(item.dataset.tab);
      if (item.dataset.tab === 'aprovacoes') loadPendingUsers();
      if (item.dataset.tab === 'gerenciamento') loadUsersTable();
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
  $('#eprof-whatsapp').addEventListener('input', maskOnlyNumbers);
  $('#eprof-nascimento').addEventListener('input', maskOnlyNumbers);

  // Draw controls
  $('#btn-girar-roleta').addEventListener('click', spinRoulette);
  $('#btn-salvar-sorteio').addEventListener('click', () => {
    const valor = parseFloat($('#draw-valor').value) || 0;
    state.drawConfig.valor = valor;
    state.drawConfig.participantes = Array.from(state.selectedParticipants);
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

  // Admin WhatsApp
  $('#btn-save-admin-whatsapp').addEventListener('click', saveAdminWhatsapp);

  // Search users
  $('#search-users').addEventListener('input', (e) => {
    const term = e.target.value.toLowerCase();
    const filtered = state.allUsers.filter(u =>
      (u.nome || '').toLowerCase().includes(term) ||
      (u.nick || '').toLowerCase().includes(term) ||
      (u.contaid || '').includes(term) ||
      (u.email || '').toLowerCase().includes(term)
    );
    renderUsersTable(filtered);
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
