import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, getDocs, updateDoc, arrayUnion, doc, onSnapshot, writeBatch } from "firebase/firestore";
import { auth, provider, db } from "./firebase.js";

// Elementos UI principales
const loginSection = document.getElementById("login-section");
const userPanel = document.getElementById("user-panel");
const userName = document.getElementById("user-name");
const roomPanel = document.getElementById("room-panel");
const roomTitle = document.getElementById("room-title");
const roomCodeDisplay = document.getElementById("room-code-display");

// Elementos Kanban y Formulario
const kanbanBoard = document.getElementById("kanban-board");
const addItemBox = document.getElementById("add-item-box");
const formAddItem = document.getElementById("form-add-item");
const sliderVal = document.getElementById("item-valoracion");
const valDisplay = document.getElementById("val-display");
const sliderInt = document.getElementById("item-interes");
const intDisplay = document.getElementById("int-display");

// Elementos de Ofertas
const btnNewTrade = document.getElementById("btn-new-trade");
const tradeBuilderBar = document.getElementById("trade-builder-bar");
const tradeStepText = document.getElementById("trade-step-text");
const btnTradeNext = document.getElementById("btn-trade-next");
const btnTradeCancel = document.getElementById("btn-trade-cancel");
const tradesList = document.getElementById("trades-list");

const myRoomsList = document.getElementById("my-rooms-list");
let unsubscribeMyRooms = null;

let currentRoomId = null;
let unsubscribeItems = null;
let unsubscribeTrades = null;
let allRoomItems = [];
let allRoomTrades = [];

// Estado del creador de ofertas / contraofertas
let tradeState = {
  active: false,
  step: 0, // 1: elegir mis items, 2: elegir usuario, 3: elegir sus items
  editingTradeId: null,
  mySelectedIds: new Set(),
  targetUid: null,
  targetName: null,
  targetSelectedIds: new Set()
};

// --- 1. AUTENTICACIÓN ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.classList.add("hidden");
    userPanel.classList.remove("hidden");
    roomPanel.classList.add("hidden");
    userName.textContent = `¡Hola, ${user.displayName}!`;
    startListeningToMyRooms(user.uid); // <-- AÑADIDO
  } else {
    if (unsubscribeMyRooms) unsubscribeMyRooms(); // <-- AÑADIDO
    cleanupRoom();
    loginSection.classList.remove("hidden");
    userPanel.classList.add("hidden");
    roomPanel.classList.add("hidden");
  }
});

document.getElementById("btn-login").addEventListener("click", () => signInWithPopup(auth, provider));
// document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

// --- 2. SALAS ---
function enterRoomUI(nombre, codigo, roomId) {
  currentRoomId = roomId;
  userPanel.classList.add("hidden");
  roomPanel.classList.remove("hidden");
  roomTitle.textContent = `Sala: ${nombre}`;
  roomCodeDisplay.textContent = codigo;
  startListeningToItems();
  startListeningToTrades();
}

function cleanupRoom() {
  if (unsubscribeItems) unsubscribeItems();
  if (unsubscribeTrades) unsubscribeTrades();
  cancelTradeMode();
  currentRoomId = null;
}

document.getElementById("btn-create-room").addEventListener("click", async () => {
  const user = auth.currentUser;
  const roomName = prompt("Nombre de la sala:");
  if (!roomName) return;

  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();
  const docRef = await addDoc(collection(db, "rooms"), {
    nombre: roomName,
    codigo_acceso: roomCode,
    creador_uid: user.uid,
    participantes: [user.uid]
  });
  enterRoomUI(roomName, roomCode, docRef.id);
});

document.getElementById("btn-join-room").addEventListener("click", async () => {
  const user = auth.currentUser;
  const codeToJoin = prompt("Código de la sala:");
  if (!codeToJoin) return;

  const q = query(collection(db, "rooms"), where("codigo_acceso", "==", codeToJoin.toUpperCase()));
  const snap = await getDocs(q);
  if (snap.empty) return alert("Sala no encontrada.");

  const roomDoc = snap.docs[0];
  await updateDoc(doc(db, "rooms", roomDoc.id), {
    participantes: arrayUnion(user.uid)
  });
  enterRoomUI(roomDoc.data().nombre, roomDoc.data().codigo_acceso, roomDoc.id);
});

document.getElementById("btn-leave-room").addEventListener("click", () => {
  cleanupRoom();
  roomPanel.classList.add("hidden");
  userPanel.classList.remove("hidden");
});

function startListeningToMyRooms(uid) {
  if (unsubscribeMyRooms) unsubscribeMyRooms();

  const q = query(collection(db, "rooms"), where("participantes", "array-contains", uid));
  unsubscribeMyRooms = onSnapshot(q, (snapshot) => {
    myRoomsList.innerHTML = "";

    if (snapshot.empty) {
      myRoomsList.innerHTML = `<small style="color: #888;">Aún no estás en ninguna sala.</small>`;
      return;
    }

    snapshot.forEach((docSnap) => {
      const room = docSnap.data();
      const btn = document.createElement("button");
      btn.style.cssText = "padding: 10px; background: #f5f5f5; border: 1px solid #ddd; border-radius: 6px; cursor: pointer; display: flex; justify-content: space-between; align-items: center; text-align: left;";
      btn.innerHTML = `<strong>${room.nombre}</strong> <span style="font-size: 12px; color: #666; background: #e0e0e0; padding: 2px 6px; border-radius: 4px;">${room.codigo_acceso}</span>`;
      
      btn.addEventListener("click", () => enterRoomUI(room.nombre, room.codigo_acceso, docSnap.id));
      myRoomsList.appendChild(btn);
    });
  });
}

// --- 3. FORMULARIO DE ITEMS Y SLIDERS ---
document.getElementById("btn-toggle-add-item").addEventListener("click", () => addItemBox.classList.toggle("hidden"));
document.getElementById("btn-cancel-add").addEventListener("click", () => addItemBox.classList.add("hidden"));

function formatInteres(val) {
  const n = Number(val);
  if (n < 0) return `${n} (Vendo)`;
  if (n > 0) return `+${n} (Compro)`;
  return `0 (Neutral)`;
}

sliderVal.addEventListener("input", () => valDisplay.textContent = sliderVal.value);
sliderInt.addEventListener("input", () => intDisplay.textContent = formatInteres(sliderInt.value));

formAddItem.addEventListener("submit", async (e) => {
  e.preventDefault();
  const user = auth.currentUser;

  await addDoc(collection(db, "rooms", currentRoomId, "items"), {
    titulo: document.getElementById("item-titulo").value,
    marca: document.getElementById("item-marca").value,
    peso: document.getElementById("item-peso").value,
    valoracion: Number(sliderVal.value),
    interes: Number(sliderInt.value),
    propietario_uid: user.uid,
    propietario_nombre: user.displayName,
    estado: "disponible"
  });

  formAddItem.reset();
  valDisplay.textContent = "5";
  intDisplay.textContent = "0 (Neutral)";
  addItemBox.classList.add("hidden");
});

// --- 4. KANBAN EN TIEMPO REAL ---
function startListeningToItems() {
  const itemsRef = collection(db, "rooms", currentRoomId, "items");
  unsubscribeItems = onSnapshot(itemsRef, (snapshot) => {
    allRoomItems = [];
    snapshot.forEach((docSnap) => allRoomItems.push({ id: docSnap.id, ...docSnap.data() }));
    renderKanban();
  });
}

function renderKanban() {
  const user = auth.currentUser;
  if (!user) return;
  kanbanBoard.innerHTML = "";

  const stands = {};
  stands[user.uid] = { nombre: `${user.displayName} (Tú)`, rawName: user.displayName, items: [] };

  allRoomItems.forEach((item) => {
    if (!stands[item.propietario_uid]) {
      stands[item.propietario_uid] = { nombre: item.propietario_nombre, rawName: item.propietario_nombre, items: [] };
    }
    stands[item.propietario_uid].items.push(item);
  });

  Object.entries(stands).forEach(([uid, stand]) => {
    const isMine = uid === user.uid;
    const colDiv = document.createElement("div");
    let colClasses = `kanban-column ${isMine ? "my-column" : ""}`;

    // Lógica visual según el paso del modo oferta
    let showPlusButtons = false;
    if (tradeState.active) {
      if (tradeState.step === 1) {
        colClasses += isMine ? " active-trade-col" : " dimmed";
        showPlusButtons = isMine;
      } else if (tradeState.step === 2) {
        colClasses += isMine ? " dimmed" : " selectable-col";
      } else if (tradeState.step === 3) {
        const isTarget = uid === tradeState.targetUid;
        colClasses += isTarget ? " active-trade-col" : " dimmed";
        showPlusButtons = isTarget;
      }
    }

    colDiv.className = colClasses;
    colDiv.dataset.uid = uid;
    colDiv.dataset.name = stand.rawName;

    let cardsHTML = stand.items.map((item) => {
      const badgeClass = item.interes < 0 ? "badge-vendo" : item.interes > 0 ? "badge-compro" : "badge-neutral";
      const isSelected = isMine ? tradeState.mySelectedIds.has(item.id) : tradeState.targetSelectedIds.has(item.id);
      const plusBtnHTML = showPlusButtons
        ? `<button class="btn-select-item" data-item-id="${item.id}" data-owner-uid="${uid}">${isSelected ? "✓" : "+"}</button>`
        : "";

      return `
        <div class="item-card ${isSelected ? "selected-card" : ""}" data-item-id="${item.id}">
          ${plusBtnHTML}
          <h4 style="padding-right: 28px;">${item.titulo}</h4>
          <div class="item-meta">${item.marca} · ${item.peso}</div>
          <div class="item-badges">
            <span class="badge-rating">⭐ ${item.valoracion}/10</span>
            <span class="${badgeClass}">${formatInteres(item.interes)}</span>
          </div>
        </div>
      `;
    }).join("");

    if (stand.items.length === 0) {
      cardsHTML = `<p style="font-size: 13px; color: #777;">Sin productos todavía.</p>`;
    }

    colDiv.innerHTML = `<h3>${stand.nombre}</h3><div class="column-items">${cardsHTML}</div>`;
    kanbanBoard.appendChild(colDiv);
  });
}

// --- 5. FLUJO DE NUEVA OFERTA / CONTRAOFERTA ---
btnNewTrade.addEventListener("click", () => {
  tradeState = {
    active: true,
    step: 1,
    editingTradeId: null,
    mySelectedIds: new Set(),
    targetUid: null,
    targetName: null,
    targetSelectedIds: new Set()
  };
  updateTradeBuilderUI();
});

btnTradeCancel.addEventListener("click", cancelTradeMode);

function cancelTradeMode() {
  tradeState.active = false;
  tradeState.step = 0;
  tradeState.editingTradeId = null;
  tradeBuilderBar.classList.add("hidden");
  btnNewTrade.classList.remove("hidden");
  renderKanban();
}

function updateTradeBuilderUI() {
  btnNewTrade.classList.add("hidden");
  tradeBuilderBar.classList.remove("hidden");

  if (tradeState.step === 1) {
    const prefix = tradeState.editingTradeId ? "[Contraoferta] " : "";
    tradeStepText.textContent = `${prefix}Paso 1: Pulsa '+' en los items de TU puesto que ofreces (${tradeState.mySelectedIds.size} seleccionados).`;
    btnTradeNext.classList.remove("hidden");
    btnTradeNext.textContent = tradeState.targetUid ? `Siguiente: Revisar items de ${tradeState.targetName}` : "Siguiente: Elegir persona";
  } else if (tradeState.step === 2) {
    tradeStepText.textContent = "Paso 2: Haz clic en la columna de la persona con la que quieres tradear.";
    btnTradeNext.classList.add("hidden");
  } else if (tradeState.step === 3) {
    tradeStepText.textContent = `Paso 3: Pulsa '+' en los items que pides a ${tradeState.targetName} (${tradeState.targetSelectedIds.size} seleccionados).`;
    btnTradeNext.classList.remove("hidden");
    btnTradeNext.textContent = tradeState.editingTradeId ? "Enviar Contraoferta" : "Crear Oferta";
  }
  renderKanban();
}

// Delegación de clics en el Kanban (para botones + y selección de columna en Paso 2)
kanbanBoard.addEventListener("click", (e) => {
  if (!tradeState.active) return;

  // Clic en botón + / ✓ de un item
  const btn = e.target.closest(".btn-select-item");
  if (btn) {
    const itemId = btn.dataset.itemId;
    const ownerUid = btn.dataset.ownerUid;
    const set = ownerUid === auth.currentUser.uid ? tradeState.mySelectedIds : tradeState.targetSelectedIds;
    if (set.has(itemId)) set.delete(itemId);
    else set.add(itemId);
    updateTradeBuilderUI();
    return;
  }

  // Clic en una columna en Paso 2 para elegir con quién tradear
  if (tradeState.step === 2) {
    const col = e.target.closest(".selectable-col");
    if (col) {
      tradeState.targetUid = col.dataset.uid;
      tradeState.targetName = col.dataset.name;
      tradeState.step = 3;
      updateTradeBuilderUI();
    }
  }
});

// Botón Siguiente / Crear Oferta
btnTradeNext.addEventListener("click", async () => {
  if (tradeState.step === 1) {
    if (tradeState.mySelectedIds.size === 0) return alert("Selecciona al menos 1 item tuyo para ofrecer.");
    // Si es contraoferta, ya sabemos quién es el destinatario, saltamos al paso 3
    tradeState.step = tradeState.targetUid ? 3 : 2;
    updateTradeBuilderUI();
  } else if (tradeState.step === 3) {
    if (tradeState.targetSelectedIds.size === 0) return alert("Selecciona al menos 1 item que quieras recibir.");
    await submitTrade();
  }
});

async function submitTrade() {
  const user = auth.currentUser;
  const ofrecidos = allRoomItems
    .filter((i) => tradeState.mySelectedIds.has(i.id))
    .map((i) => ({ id: i.id, titulo: i.titulo }));
  const solicitados = allRoomItems
    .filter((i) => tradeState.targetSelectedIds.has(i.id))
    .map((i) => ({ id: i.id, titulo: i.titulo }));

  const tradeData = {
    emisor_uid: user.uid,
    emisor_nombre: user.displayName,
    receptor_uid: tradeState.targetUid,
    receptor_nombre: tradeState.targetName,
    items_ofrecidos: ofrecidos,
    items_solicitados: solicitados,
    estado: "pendiente",
    es_contraoferta: Boolean(tradeState.editingTradeId),
    updatedAt: Date.now()
  };

  if (tradeState.editingTradeId) {
    await updateDoc(doc(db, "rooms", currentRoomId, "trades", tradeState.editingTradeId), tradeData);
  } else {
    await addDoc(collection(db, "rooms", currentRoomId, "trades"), tradeData);
  }
  cancelTradeMode();
}

// --- 6. LISTA DE OFERTAS ACTIVAS EN TIEMPO REAL ---
function startListeningToTrades() {
  const tradesRef = collection(db, "rooms", currentRoomId, "trades");
  const q = query(tradesRef, where("estado", "==", "pendiente"));

  unsubscribeTrades = onSnapshot(q, (snapshot) => {
    allRoomTrades = [];
    snapshot.forEach((docSnap) => allRoomTrades.push({ id: docSnap.id, ...docSnap.data() }));
    renderTrades();
  });
}

function renderTrades() {
  const user = auth.currentUser;
  if (allRoomTrades.length === 0) {
    tradesList.innerHTML = `<p style="color: #666;">No hay ofertas activas en la sala.</p>`;
    return;
  }

  tradesList.innerHTML = allRoomTrades.map((t) => {
    const isForMe = t.receptor_uid === user.uid;
    const ofrecidosTxt = t.items_ofrecidos.map((i) => `<strong>${i.titulo}</strong>`).join(", ");
    const solicitadosTxt = t.items_solicitados.map((i) => `<strong>${i.titulo}</strong>`).join(", ");
    const tag = t.es_contraoferta ? `<span style="background:#ffe0b2; padding:2px 6px; border-radius:4px; font-size:11px; margin-left:6px;">Contraoferta</span>` : "";

    const actionsHTML = isForMe ? `
      <div class="trade-actions">
        <button class="btn-accept" data-action="accept" data-trade-id="${t.id}">Aceptar</button>
        <button class="btn-counter" data-action="counter" data-trade-id="${t.id}">Contraoferta</button>
        <button class="btn-reject" data-action="reject" data-trade-id="${t.id}">Rechazar</button>
      </div>
    ` : `<small style="color:#888;">Esperando a ${t.receptor_nombre}</small>`;

    return `
      <div class="trade-card ${isForMe ? "for-me" : ""}">
        <div>
          <div style="margin-bottom:4px;">
            <strong>${t.emisor_nombre}</strong> ➡️ <strong>${t.receptor_nombre}</strong> ${tag}
          </div>
          <div style="font-size:14px;">
            Ofrece: ${ofrecidosTxt} <br>
            Pide: ${solicitadosTxt}
          </div>
        </div>
        ${actionsHTML}
      </div>
    `;
  }).join("");
}

// Acciones de Aceptar, Rechazar y Contraoferta
tradesList.addEventListener("click", async (e) => {
  const btn = e.target.closest("button[data-action]");
  if (!btn) return;

  const action = btn.dataset.action;
  const trade = allRoomTrades.find((t) => t.id === btn.dataset.tradeId);
  if (!trade) return;

  if (action === "reject") {
    await updateDoc(doc(db, "rooms", currentRoomId, "trades", trade.id), { estado: "rechazada" });
  } else if (action === "accept") {
    // Intercambio atómico: cambiamos de dueño todos los items y marcamos la oferta como aceptada
    const batch = writeBatch(db);
    trade.items_ofrecidos.forEach((item) => {
      batch.update(doc(db, "rooms", currentRoomId, "items", item.id), {
        propietario_uid: trade.receptor_uid,
        propietario_nombre: trade.receptor_nombre
      });
    });
    trade.items_solicitados.forEach((item) => {
      batch.update(doc(db, "rooms", currentRoomId, "items", item.id), {
        propietario_uid: trade.emisor_uid,
        propietario_nombre: trade.emisor_nombre
      });
    });
    batch.update(doc(db, "rooms", currentRoomId, "trades", trade.id), { estado: "aceptada" });
    await batch.commit();
  } else if (action === "counter") {
    // Invertimos los roles: lo que el otro pedía ahora es lo que yo ofrezco, y viceversa
    tradeState = {
      active: true,
      step: 1,
      editingTradeId: trade.id,
      mySelectedIds: new Set(trade.items_solicitados.map((i) => i.id)),
      targetUid: trade.emisor_uid,
      targetName: trade.emisor_nombre,
      targetSelectedIds: new Set(trade.items_ofrecidos.map((i) => i.id))
    };
    updateTradeBuilderUI();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
});