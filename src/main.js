import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
import { collection, addDoc, query, where, getDocs, updateDoc, arrayUnion, doc, onSnapshot } from "firebase/firestore";
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

let currentRoomId = null;
let unsubscribeItems = null;
let allRoomItems = []; // Guardamos los items en memoria para usarlos luego en las ofertas

// --- 1. AUTENTICACIÓN ---
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.classList.add("hidden");
    userPanel.classList.remove("hidden");
    roomPanel.classList.add("hidden");
    userName.textContent = `¡Hola, ${user.displayName}!`;
  } else {
    loginSection.classList.remove("hidden");
    userPanel.classList.add("hidden");
    roomPanel.classList.add("hidden");
    currentRoomId = null;
  }
});

document.getElementById("btn-login").addEventListener("click", () => signInWithPopup(auth, provider));
document.getElementById("btn-logout").addEventListener("click", () => signOut(auth));

// --- 2. SALAS ---
function enterRoomUI(nombre, codigo, roomId) {
  currentRoomId = roomId;
  userPanel.classList.add("hidden");
  roomPanel.classList.remove("hidden");
  roomTitle.textContent = `Sala: ${nombre}`;
  roomCodeDisplay.textContent = codigo;
  startListeningToItems();
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
  if (unsubscribeItems) unsubscribeItems();
  currentRoomId = null;
  roomPanel.classList.add("hidden");
  userPanel.classList.remove("hidden");
});

// --- 3. FORMULARIO DE ITEMS Y SLIDERS ---
document.getElementById("btn-toggle-add-item").addEventListener("click", () => {
  addItemBox.classList.toggle("hidden");
});
document.getElementById("btn-cancel-add").addEventListener("click", () => {
  addItemBox.classList.add("hidden");
});

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
    snapshot.forEach((docSnap) => {
      allRoomItems.push({ id: docSnap.id, ...docSnap.data() });
    });
    renderKanban();
  });
}

function renderKanban() {
  const user = auth.currentUser;
  kanbanBoard.innerHTML = "";

  // Agrupamos los items por propietario_uid
  const stands = {};
  // Aseguramos que nuestro propio puesto siempre exista primero
  stands[user.uid] = { nombre: `${user.displayName} (Tú)`, items: [] };

  allRoomItems.forEach((item) => {
    if (!stands[item.propietario_uid]) {
      stands[item.propietario_uid] = { nombre: item.propietario_nombre, items: [] };
    }
    stands[item.propietario_uid].items.push(item);
  });

  // Pintamos cada columna vertical
  Object.entries(stands).forEach(([uid, stand]) => {
    const isMine = uid === user.uid;
    const colDiv = document.createElement("div");
    colDiv.className = `kanban-column ${isMine ? "my-column" : ""}`;
    colDiv.dataset.uid = uid; // Clave para el modo oferta

    let cardsHTML = stand.items.map((item) => {
      const badgeClass = item.interes < 0 ? "badge-vendo" : item.interes > 0 ? "badge-compro" : "badge-neutral";
      return `
        <div class="item-card" data-item-id="${item.id}" data-owner-uid="${uid}">
          <h4>${item.titulo}</h4>
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

    colDiv.innerHTML = `
      <h3>${stand.nombre}</h3>
      <div class="column-items">${cardsHTML}</div>
    `;
    kanbanBoard.appendChild(colDiv);
  });
}