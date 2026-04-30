const API = "https://rifa-baxs.onrender.com";

let selecionados = [];
let intervaloAtualizacao = null;

const usuario = JSON.parse(sessionStorage.getItem("usuario"));

if (!usuario || !usuario.rifa) {
  sessionStorage.clear();
  window.location.href = "login.html";
}

document.getElementById("userNome").innerText = usuario.nome;
document.getElementById("userEmail").innerText = usuario.email;
document.getElementById("userTelefone").innerText = usuario.telefone;

/* =========================
   CARREGAR NÚMEROS
========================= */

async function carregar() {
  try {
    const res = await fetch(`${API}/numeros/${usuario.rifa}`);
    const numeros = await res.json();

    const grid = document.getElementById("grid");
    grid.innerHTML = "";

    let pagamentoConfirmado = false;

    numeros.forEach((n) => {
      const div = document.createElement("div");
      div.innerText = n.numero;
      div.className = "numero";

      // 🔥 DISPONÍVEL
      if (n.status === "disponivel") {
        div.classList.add("disponivel");
      }

      // 🔥 RESERVADO (ainda NÃO pago)
      if (n.status === "reservado") {
        div.classList.add("reservado");
      }

      // 🔥 PAGO (aqui sim é confirmado)
      if (n.status === "pago") {
        div.classList.add("vendido");

        // ✔ só confirma se for um número que EU selecionei
        if (selecionados.includes(n.numero)) {
          pagamentoConfirmado = true;
        }
      }

      // bloquear clique se não disponível
      if (n.status !== "disponivel") {
        div.style.cursor = "not-allowed";
      }

      // manter seleção visual
      if (selecionados.includes(n.numero)) {
        div.classList.add("selecionado");
      }

      div.onclick = (e) => selecionar(n, e);
      grid.appendChild(div);
    });

    // 🔥 só para quando REALMENTE pagou
    if (pagamentoConfirmado) {
      pararAtualizacao();
      mostrarConfirmacao();
    }

  } catch (err) {
    console.error(err);
    mostrarErro("Erro ao carregar números");
  }
}

/* =========================
   SELECIONAR
========================= */

function selecionar(n, e) {
  if (n.status !== "disponivel") {
    mostrarErro("Número já indisponível");
    return;
  }

  const index = selecionados.indexOf(n.numero);

  if (index > -1) {
    selecionados.splice(index, 1);
    e.target.classList.remove("selecionado");
  } else {
    selecionados.push(n.numero);
    e.target.classList.add("selecionado");
  }

  atualizarTextoSelecionados();

  // reset pagamento ao mudar seleção
  document.getElementById("pagamento").classList.add("hidden");
  document.getElementById("qr").src = "";
  document.getElementById("pixCode").value = "";

  pararAtualizacao();
}

/* =========================
   TEXTO
========================= */

function atualizarTextoSelecionados() {
  const texto = document.getElementById("selecionado-texto");

  if (selecionados.length === 0) {
    texto.innerText = "Nenhum número selecionado";
    return;
  }

  texto.innerText = `Números selecionados: ${selecionados.join(", ")}`;
}

/* =========================
   COMPRAR
========================= */

async function comprar() {
  const btn = document.getElementById("btnComprar");

  btn.disabled = true;
  btn.innerText = "Processando...";

  try {
    if (selecionados.length === 0) {
      mostrarErro("Escolha pelo menos um número");
      return;
    }

    const res = await fetch(`${API}/reservar`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        numeros: selecionados,
        nome: usuario.nome,
        telefone: usuario.telefone,
        email: usuario.email,
        rifa_id: usuario.rifa
      })
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data.error || "Erro ao gerar pagamento");
    }

    document.getElementById("pagamento").classList.remove("hidden");

    document.getElementById("qr").src =
      "data:image/png;base64," + data.qr_code_base64;

    document.getElementById("pixCode").value = data.qr_code || "";

    await carregar();

    // 🔥 começa monitoramento só após gerar PIX
    iniciarAtualizacao();

    document.getElementById("pagamento").scrollIntoView({
      behavior: "smooth"
    });

  } catch (err) {
    console.error(err);
    mostrarErro(err.message);
  } finally {
    btn.disabled = false;
    btn.innerText = "Continuar para pagamento";
  }
}

/* =========================
   MONITORAMENTO
========================= */

function iniciarAtualizacao() {
  if (intervaloAtualizacao) return;

  intervaloAtualizacao = setInterval(() => {
    console.log("🔄 Verificando pagamento...");
    carregar();
  }, 4000);
}

function pararAtualizacao() {
  if (intervaloAtualizacao) {
    clearInterval(intervaloAtualizacao);
    intervaloAtualizacao = null;
    console.log("⛔ Atualização parada");
  }
}

/* =========================
   UI CONFIRMAÇÃO
========================= */

function mostrarConfirmacao() {
  const box = document.querySelector(".aguardando");

  if (box) {
    box.innerText = "✅ Pagamento confirmado!";
    box.style.color = "green";
  }
}

/* =========================
   COPIAR PIX
========================= */

function copiarPix() {
  const campo = document.getElementById("pixCode");

  if (!campo.value) {
    mostrarErro("Código PIX não disponível");
    return;
  }

  campo.removeAttribute("readonly");
  campo.select();
  campo.setSelectionRange(0, 99999);

  try {
    document.execCommand("copy");
    alert("Código PIX copiado!");
  } catch (err) {
    console.error(err);
    mostrarErro("Erro ao copiar");
  }

  campo.setAttribute("readonly", true);
}

/* =========================
   ERRO
========================= */

function mostrarErro(msg) {
  const erro = document.getElementById("erro");
  if (!erro) return;

  erro.innerText = msg;
}

/* =========================
   INICIAL
========================= */

carregar();