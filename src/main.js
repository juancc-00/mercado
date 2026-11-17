import { signInWithPopup, signOut, onAuthStateChanged } from "firebase/auth";
// IMPORTANTE: Nuevas herramientas para la base de datos
import { collection, addDoc, query, where, getDocs, updateDoc, arrayUnion, doc } from "firebase/firestore";
import { auth, provider, db } from "./firebase.js";

// Capturamos los elementos
const loginSection = document.getElementById("login-section");
const userPanel = document.getElementById("user-panel");
const userName = document.getElementById("user-name");
const btnLogin = document.getElementById("btn-login");
const btnLogout = document.getElementById("btn-logout");

const btnCreateRoom = document.getElementById("btn-create-room");
const btnJoinRoom = document.getElementById("btn-join-room");
const roomPanel = document.getElementById("room-panel");
const roomTitle = document.getElementById("room-title");
const roomCodeDisplay = document.getElementById("room-code-display");
const btnLeaveRoom = document.getElementById("btn-leave-room");

let currentRoomId = null; // Variable para saber en qué sala estamos metidos

// 1. EL VIGILANTE DE SESIÓN
onAuthStateChanged(auth, (user) => {
  if (user) {
    loginSection.style.display = "none";
    userPanel.style.display = "block";
    roomPanel.style.display = "none"; // Aseguramos que la sala esté oculta al principio
    userName.textContent = `¡Hola, ${user.displayName}!`;
  } else {
    loginSection.style.display = "block";
    userPanel.style.display = "none";
    roomPanel.style.display = "none";
    currentRoomId = null;
  }
});

btnLogin.addEventListener("click", () => signInWithPopup(auth, provider));
btnLogout.addEventListener("click", () => signOut(auth));

// --- NUEVA LÓGICA DE SALAS ---

// Función auxiliar para cambiar la pantalla visualmente a "Dentro de la sala"
function enterRoomUI(nombre, codigo, roomId) {
  currentRoomId = roomId;
  userPanel.style.display = "none";
  roomPanel.style.display = "block";
  roomTitle.textContent = `Sala: ${nombre}`;
  roomCodeDisplay.textContent = codigo;
}

// 2. CREAR SALA
btnCreateRoom.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const roomName = prompt("Ponle nombre a la sala (ej. Navidad Oficina):");
  if (!roomName) return; // Si cancela el prompt, no hacemos nada

  // Generamos un código aleatorio de 6 letras/números (ej. 4X9L2A)
  const roomCode = Math.random().toString(36).substring(2, 8).toUpperCase();

  try {
    // Guardamos la sala en la colección "rooms" de Firestore
    const docRef = await addDoc(collection(db, "rooms"), {
      nombre: roomName,
      codigo_acceso: roomCode,
      creador_uid: user.uid,
      participantes: [user.uid] // El creador se añade a sí mismo como participante
    });

    console.log("Sala creada con ID:", docRef.id);
    enterRoomUI(roomName, roomCode, docRef.id);

  } catch (error) {
    console.error("Error creando sala:", error);
    alert("Hubo un error al crear la sala.");
  }
});

// 3. UNIRSE A SALA
btnJoinRoom.addEventListener("click", async () => {
  const user = auth.currentUser;
  if (!user) return;

  const codeToJoin = prompt("Introduce el código de la sala:");
  if (!codeToJoin) return;

  try {
    // Buscamos en la colección "rooms" donde el código coincida
    const q = query(collection(db, "rooms"), where("codigo_acceso", "==", codeToJoin.toUpperCase()));
    const querySnapshot = await getDocs(q);

    if (querySnapshot.empty) {
      alert("No se ha encontrado ninguna sala con ese código.");
      return;
    }

    // Como el código es único, cogemos el primer resultado [0]
    const roomDoc = querySnapshot.docs[0];
    const roomData = roomDoc.data();
    const roomId = roomDoc.id;

    // Actualizamos el array de participantes usando arrayUnion (añade el ID si no está repetido)
    await updateDoc(doc(db, "rooms", roomId), {
      participantes: arrayUnion(user.uid)
    });

    enterRoomUI(roomData.nombre, roomData.codigo_acceso, roomId);

  } catch (error) {
    console.error("Error al unirse:", error);
    alert("Hubo un problema al buscar la sala.");
  }
});

// 4. SALIR AL MENÚ PRINCIPAL
btnLeaveRoom.addEventListener("click", () => {
  currentRoomId = null;
  roomPanel.style.display = "none";
  userPanel.style.display = "block";
});