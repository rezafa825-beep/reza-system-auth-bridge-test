import './style.css';
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  getIdToken,
  getIdTokenResult
} from 'firebase/auth';
import { auth, googleProvider, authPersistenceReady } from './firebase.js';

const loginButton = document.querySelector('#loginButton');
const logoutButton = document.querySelector('#logoutButton');
const verifyButton = document.querySelector('#verifyButton');
const bridgeButton = document.querySelector('#bridgeButton');
const authStatus = document.querySelector('#authStatus');
const userPanel = document.querySelector('#userPanel');
const userName = document.querySelector('#userName');
const userEmail = document.querySelector('#userEmail');
const userUid = document.querySelector('#userUid');
const tokenStatus = document.querySelector('#tokenStatus');
const verifyStatus = document.querySelector('#verifyStatus');
const bridgeStatus = document.querySelector('#bridgeStatus');

let currentIdToken = null;
let bridgeWindow = null;
let bridgeOrigin = null;
let pendingRequestId = null;
let pendingAction = null;
let bridgeTimeout = null;

function show(element, message, type = '') {
  element.textContent = message;
  element.className = 'status ' + type;
}

function setAuthBusy(busy) {
  loginButton.disabled = busy || !!auth.currentUser;
  logoutButton.disabled = busy || !auth.currentUser;
  verifyButton.disabled = busy || !auth.currentUser || !bridgeWindow;
}

loginButton.addEventListener('click', async () => {
  setAuthBusy(true);
  show(authStatus, 'Membuka Google Sign-In...');
  try {
    await authPersistenceReady;
    const credential = await signInWithPopup(auth, googleProvider);
    currentIdToken = await getIdToken(credential.user);
    show(authStatus, 'LOGIN BERHASIL — Firebase Authentication menerima akun Google.', 'ok');
    show(tokenStatus, 'Firebase ID Token tersedia di memori halaman. Token tidak ditampilkan.', 'ok');
  } catch (error) {
    currentIdToken = null;
    show(authStatus, 'LOGIN GAGAL — ' + (error.code || error.message), 'err');
    show(tokenStatus, 'ID Token belum diperoleh.', 'err');
  } finally {
    setAuthBusy(false);
  }
});

logoutButton.addEventListener('click', async () => {
  setAuthBusy(true);
  try {
    await signOut(auth);
    currentIdToken = null;
    show(authStatus, 'Anda sudah logout dari Firebase.');
    show(tokenStatus, 'Tidak ada Firebase ID Token aktif.');
    show(verifyStatus, 'Silakan login kembali untuk melakukan verifikasi.');
    userPanel.hidden = true;
  } catch (error) {
    show(authStatus, 'LOGOUT GAGAL — ' + (error.code || error.message), 'err');
  } finally {
    setAuthBusy(false);
  }
});

onAuthStateChanged(auth, async (user) => {
  if (!user) {
    currentIdToken = null;
    userPanel.hidden = true;
    loginButton.disabled = false;
    logoutButton.disabled = true;
    verifyButton.disabled = true;
    if (!authStatus.textContent.startsWith('LOGIN GAGAL')) {
      show(authStatus, 'Belum login. Silakan gunakan akun Google untuk pengujian.');
    }
    show(tokenStatus, 'Belum ada Firebase ID Token.');
    return;
  }

  try {
    await authPersistenceReady;
    currentIdToken = await getIdToken(user);
    const tokenInfo = await getIdTokenResult(user);
    userPanel.hidden = false;
    userName.textContent = user.displayName || '(Nama tidak tersedia)';
    userEmail.textContent = user.email || '(Email tidak tersedia)';
    userUid.textContent = user.uid;
    show(authStatus, 'LOGIN AKTIF — Identitas berhasil dibaca dari Firebase Authentication.', 'ok');
    show(
      tokenStatus,
      'ID Token tersedia di memori halaman. Kedaluwarsa: ' +
        new Date(tokenInfo.expirationTime).toLocaleString('id-ID') +
        '. Token tidak ditampilkan.',
      'ok'
    );
    loginButton.disabled = true;
    logoutButton.disabled = false;
    verifyButton.disabled = !bridgeWindow;
  } catch (error) {
    currentIdToken = null;
    show(tokenStatus, 'Gagal memperoleh ID Token — ' + (error.code || error.message), 'err');
  }
});

const allowedBridgeOrigin = /^https:\/\/(script\.google\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/;
const expectedBridgeVersion = '0.1.3';

function showBridge(message, type = '') {
  show(bridgeStatus, message, type);
}

function sendBridgeRequest(type, extra = {}) {
  if (!bridgeWindow || !bridgeOrigin) {
    showBridge('AuthBridge belum siap. Muat ulang halaman dan periksa deployment Apps Script.', 'err');
    return;
  }
  clearTimeout(bridgeTimeout);
  pendingRequestId = 'auth-test-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  pendingAction = type;
  bridgeButton.disabled = true;
  verifyButton.disabled = true;

  bridgeWindow.postMessage({
    type,
    requestId: pendingRequestId,
    ...extra
  }, bridgeOrigin);

  bridgeTimeout = setTimeout(() => {
    if (!pendingRequestId) return;
    pendingRequestId = null;
    pendingAction = null;
    bridgeButton.disabled = false;
    verifyButton.disabled = !auth.currentUser;
    const status = type === 'REZA_SYSTEM_VERIFY_FIREBASE_TOKEN' ? verifyStatus : bridgeStatus;
    show(status, 'TIMEOUT — Tidak ada respons dari Apps Script dalam 20 detik.', 'err');
  }, 20000);
}

window.addEventListener('message', (event) => {
  const payload = event.data;
  if (!payload || typeof payload !== 'object') return;
  if (event.source === window || !allowedBridgeOrigin.test(event.origin)) return;

  if (payload.type === 'REZA_SYSTEM_BRIDGE_READY') {
    if (payload.version !== expectedBridgeVersion) {
      bridgeButton.disabled = true;
      verifyButton.disabled = true;
      showBridge('Versi AuthBridge tidak sesuai. Diharapkan ' + expectedBridgeVersion + '.', 'err');
      return;
    }
    bridgeWindow = event.source;
    bridgeOrigin = event.origin;
    bridgeButton.disabled = false;
    verifyButton.disabled = !auth.currentUser;
    showBridge('AuthBridge siap. Versi: ' + payload.version);
    return;
  }

  if (payload.type !== 'REZA_SYSTEM_BRIDGE_RESPONSE') return;
  if (event.source !== bridgeWindow || event.origin !== bridgeOrigin) return;
  if (!pendingRequestId || payload.requestId !== pendingRequestId) return;

  clearTimeout(bridgeTimeout);
  const action = pendingAction;
  pendingRequestId = null;
  pendingAction = null;
  bridgeButton.disabled = false;
  verifyButton.disabled = !auth.currentUser;

  const result = payload.result || {};
  if (action === 'REZA_SYSTEM_VERIFY_FIREBASE_TOKEN') {
    if (result.success === true && result.verified === true) {
      show(
        verifyStatus,
        'VERIFIKASI BACKEND BERHASIL\n' +
        'Project: ' + result.projectId + '\n' +
        'UID cocok: ' + result.uid + '\n' +
        'Email: ' + result.email + '\n' +
        'Email terverifikasi: ' + (result.emailVerified ? 'Ya' : 'Tidak') + '\n' +
        'Provider: ' + result.provider + '\n' +
        'Status: TOKEN VALID',
        'ok'
      );
    } else {
      show(
        verifyStatus,
        'VERIFIKASI DITOLAK\nKode: ' + (result.code || 'VERIFICATION_FAILED') +
        '\nPesan: ' + (result.message || 'Backend tidak dapat memverifikasi token.'),
        'err'
      );
    }
    return;
  }

  if (result.success === true && result.service === 'REZA_SYSTEM_AUTH_BRIDGE' && result.status === 'READY') {
    showBridge('BERHASIL — Bridge merespons. Service: ' + result.service + ' | Versi backend: ' + result.version + ' | Status: ' + result.status, 'ok');
  } else {
    showBridge('Respons bridge tidak sesuai.', 'err');
  }
});

bridgeButton.addEventListener('click', () => {
  showBridge('Menghubungi Google Apps Script...');
  sendBridgeRequest('REZA_SYSTEM_BRIDGE_PING');
});

verifyButton.addEventListener('click', async () => {
  if (!auth.currentUser) {
    show(verifyStatus, 'Login terlebih dahulu.', 'err');
    return;
  }
  try {
    currentIdToken = await getIdToken(auth.currentUser, true);
    show(
      verifyStatus,
      'Mengirim Firebase ID Token ke backend untuk verifikasi. Token tidak ditampilkan.',
      ''
    );
    sendBridgeRequest('REZA_SYSTEM_VERIFY_FIREBASE_TOKEN', { idToken: currentIdToken });
  } catch (error) {
    show(verifyStatus, 'Gagal memperbarui ID Token — ' + (error.code || error.message), 'err');
  }
});
