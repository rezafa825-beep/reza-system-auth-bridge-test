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
const bridgeButton = document.querySelector('#bridgeButton');
const authStatus = document.querySelector('#authStatus');
const userPanel = document.querySelector('#userPanel');
const userName = document.querySelector('#userName');
const userEmail = document.querySelector('#userEmail');
const userUid = document.querySelector('#userUid');
const tokenStatus = document.querySelector('#tokenStatus');
const bridgeStatus = document.querySelector('#bridgeStatus');
const bridgeFrame = document.querySelector('#authBridge');

let currentIdToken = null;
let bridgeWindow = null;
let bridgeOrigin = null;
let pendingRequestId = null;
let bridgeTimeout = null;

function show(element, message, type = '') {
  element.textContent = message;
  element.className = type;
}

function setAuthBusy(busy) {
  loginButton.disabled = busy;
  logoutButton.disabled = busy || !auth.currentUser;
}

loginButton.addEventListener('click', async () => {
  setAuthBusy(true);
  show(authStatus, 'Membuka Google Sign-In...');
  try {
    await authPersistenceReady;
    const credential = await signInWithPopup(auth, googleProvider);
    currentIdToken = await getIdToken(credential.user);
    show(
      authStatus,
      'LOGIN BERHASIL — Firebase Authentication menerima akun Google.',
      'ok'
    );
    show(
      tokenStatus,
      'Firebase ID Token berhasil diperoleh. Token tidak ditampilkan, tidak disimpan ke database, dan belum dikirim ke Apps Script.',
      'ok'
    );
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
    show(authStatus, 'Anda sudah logout dari Firebase.', '');
    show(tokenStatus, 'Tidak ada ID Token aktif di halaman ini.', '');
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
    show(
      authStatus,
      'LOGIN AKTIF — Identitas berhasil dibaca dari Firebase Authentication.',
      'ok'
    );
    show(
      tokenStatus,
      'ID Token tersedia di memori halaman. Kedaluwarsa: ' +
        new Date(tokenInfo.expirationTime).toLocaleString('id-ID') +
        '. Token tidak ditampilkan dan belum dikirim ke backend.',
      'ok'
    );
    loginButton.disabled = true;
    logoutButton.disabled = false;
  } catch (error) {
    currentIdToken = null;
    show(tokenStatus, 'Gagal memperoleh ID Token — ' + (error.code || error.message), 'err');
  }
});

// Auth Bridge handshake and ping test. This does not transmit Firebase tokens.
const allowedBridgeOrigin = /^https:\/\/(script\.google\.com|[a-z0-9-]+-script\.googleusercontent\.com)$/;
const expectedBridgeVersion = '0.1.2';

function showBridge(message, type = '') {
  show(bridgeStatus, message, type);
}

window.addEventListener('message', (event) => {
  const payload = event.data;
  if (!payload || typeof payload !== 'object') return;
  if (event.source === window || !allowedBridgeOrigin.test(event.origin)) return;

  if (payload.type === 'REZA_SYSTEM_BRIDGE_READY') {
    if (payload.version !== expectedBridgeVersion) {
      bridgeButton.disabled = true;
      showBridge('Versi AuthBridge tidak sesuai. Diharapkan ' + expectedBridgeVersion + '.', 'err');
      return;
    }
    bridgeWindow = event.source;
    bridgeOrigin = event.origin;
    bridgeButton.disabled = false;
    showBridge('AuthBridge siap. Origin: ' + bridgeOrigin);
    return;
  }

  if (payload.type !== 'REZA_SYSTEM_BRIDGE_RESPONSE') return;
  if (event.source !== bridgeWindow || event.origin !== bridgeOrigin) return;
  if (!pendingRequestId || payload.requestId !== pendingRequestId) return;

  clearTimeout(bridgeTimeout);
  pendingRequestId = null;
  bridgeButton.disabled = false;

  const result = payload.result;
  if (result?.success === true &&
      result.service === 'REZA_SYSTEM_AUTH_BRIDGE' &&
      result.status === 'READY') {
    showBridge(
      'BERHASIL — Bridge merespons. Service: ' + result.service +
      ' | Versi backend: ' + result.version + ' | Status: ' + result.status,
      'ok'
    );
  } else {
    showBridge('Respons bridge tidak sesuai: ' + JSON.stringify(result || payload), 'err');
  }
});

bridgeButton.addEventListener('click', () => {
  if (!bridgeWindow || !bridgeOrigin) {
    showBridge('AuthBridge belum siap. Muat ulang halaman dan periksa deployment Apps Script.', 'err');
    return;
  }

  clearTimeout(bridgeTimeout);
  pendingRequestId = 'bridge-test-' + Date.now() + '-' + Math.random().toString(16).slice(2);
  bridgeButton.disabled = true;
  showBridge('Menghubungi Google Apps Script...');

  bridgeWindow.postMessage({
    type: 'REZA_SYSTEM_BRIDGE_PING',
    requestId: pendingRequestId
  }, bridgeOrigin);

  bridgeTimeout = setTimeout(() => {
    if (!pendingRequestId) return;
    pendingRequestId = null;
    bridgeButton.disabled = false;
    showBridge('TIMEOUT — Bridge tidak mengirim respons dalam 15 detik.', 'err');
  }, 15000);
});

// Keep the token variable intentionally private to this module for the next test stage.
void currentIdToken;
void bridgeFrame;
