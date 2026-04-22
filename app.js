// app.js

const API = "https://rifa-baxs.onrender.com";

let selecionado = null;

// ========================================
// USUÁRIO
// ========================================
const usuario = JSON.parse(
  sessionStorage.getItem("usuario")
);

if (!usuario || !usuario.rifa) {
  sessionStorage.clear();
  window.location.href = "login.html";
}

document.getElementById("userNome").innerText =
  usuario.nome;

document.getElementById("userEmail").innerText =
  usuario.email;

// ========================================
// CARREGAR NÚMEROS
// ========================================
async function carregar() {
  try {
    const res = await fetch(
      `${API}/numeros/${usuario.rifa}`
    );

    const numeros = await res.json();

    const grid = document.getElementById("grid");
    grid.innerHTML = "";

    numeros.forEach((n) => {
      const div = document.createElement("div");

      div.innerText = n.numero;
      div.className = "numero";

      if (n.status === "pago") {
        div.classList.add("vendido");
      }

      if (n.status === "reservado") {
        div.classList.add("reservado");
      }

      if (n.status !== "disponivel") {
        div.style.cursor = "not-allowed";
      }

      div.onclick = (e) => selecionar(n, e);

      grid.appendChild(div);
    });

  } catch (err) {
    console.error(err);
    mostrarErro("Erro ao carregar números");
  }
}

// ========================================
// SELECIONAR
// ========================================
function selecionar(n, e) {
  if (n.status !== "disponivel") {
    mostrarErro("Número já indisponível");
    return;
  }

  document
    .querySelectorAll(".numero")
    .forEach((el) => {
      el.classList.remove("selecionado");
    });

  e.target.classList.add("selecionado");

  selecionado = n.numero;

  document.getElementById(
    "selecionado-texto"
  ).innerText = `Número selecionado: ${n.numero}`;

  document
    .getElementById("pagamento")
    .classList.add("hidden");

  document.getElementById("qr").src = "";
  document.getElementById("pixCode").value = "";
}

// ========================================
// COMPRAR
// ========================================
async function comprar() {
  const btn = document.getElementById("btnComprar");

  btn.disabled = true;
  btn.innerText = "Processando...";

  try {
    if (!selecionado) {
      mostrarErro("Escolha um número");
      return;
    }

    const res = await fetch(`${API}/reservar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        numero: Number(selecionado),
        nome: usuario.nome,
        telefone: usuario.telefone,
        email: usuario.email,
        rifa_id: usuario.rifa
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(
        data.error || "Erro ao reservar número"
      );
    }

    // mostrar área de pagamento
    document
      .getElementById("pagamento")
      .classList.remove("hidden");

    // QR visual
    document.getElementById("qr").src =
      "data:image/png;base64," +
      data.qr_code_base64;

    // PIX copia e cola
    document.getElementById("pixCode").value =
      data.qr_code || "";

    // atualizar grid
    await carregar();

    // scroll suave
    document
      .getElementById("pagamento")
      .scrollIntoView({
        behavior: "smooth"
      });

  } catch (err) {
    console.error(err);
    mostrarErro(err.message);
  } finally {
    btn.disabled = false;
    btn.innerText =
      "Continuar para pagamento";
  }
}

// ========================================
// COPIAR PIX
// ========================================
function copiarPix() {
  const campo =
    document.getElementById("pixCode");

  if (!campo.value) {
    mostrarErro("Código PIX não disponível");
    return;
  }

  navigator.clipboard
    .writeText(campo.value)
    .then(() => {
      alert("Código PIX copiado com sucesso!");
    })
    .catch(() => {
      mostrarErro("Erro ao copiar código PIX");
    });
}

// ========================================
// VOLTAR
// ========================================
function voltar() {
  sessionStorage.clear();
  window.location.href = "login.html";
}

// ========================================
// ERRO UI
// ========================================
function mostrarErro(msg) {
  const el = document.getElementById("erro");

  el.innerText = msg;

  setTimeout(() => {
    el.innerText = "";
  }, 4000);
}

// ========================================
// START
// ========================================
carregar();