const API = "https://rifa-baxs.onrender.com";

let selecionados = [];

const usuario = JSON.parse(sessionStorage.getItem("usuario"));

if (!usuario || !usuario.rifa) {
  sessionStorage.clear();
  window.location.href = "login.html";
}

document.getElementById("userNome").innerText = usuario.nome;
document.getElementById("userEmail").innerText = usuario.email;

async function carregar() {
  try {
    const res = await fetch(`${API}/numeros/${usuario.rifa}`);
    const numeros = await res.json();

    const grid = document.getElementById("grid");
    grid.innerHTML = "";

    numeros.forEach((n) => {
      const div = document.createElement("div");
      div.innerText = n.numero;
      div.className = "numero";

      if (n.status === "pago") div.classList.add("vendido");
      if (n.status === "reservado") div.classList.add("reservado");

      if (n.status !== "disponivel") {
        div.style.cursor = "not-allowed";
      }

      if (selecionados.includes(n.numero)) {
        div.classList.add("selecionado");
      }

      div.onclick = (e) => selecionar(n, e);
      grid.appendChild(div);
    });
  } catch (err) {
    console.error(err);
    mostrarErro("Erro ao carregar números");
  }
}

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

  document.getElementById("pagamento").classList.add("hidden");
  document.getElementById("qr").src = "";
  document.getElementById("pixCode").value = "";
}

function atualizarTextoSelecionados() {
  const texto = document.getElementById("selecionado-texto");

  if (selecionados.length === 0) {
    texto.innerText = "Nenhum número selecionado";
    return;
  }

  texto.innerText = `Números selecionados: ${selecionados.join(", ")}`;
}

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

function copiarPix() {
  const campo = document.getElementById("pixCode");

  if (!campo.value) {
    mostrarErro("Código PIX não disponível");
    return;
  }

  navigator.clipboard
    .writeText(campo.value)
    .then(() => alert("Código PIX copiado com sucesso!"))
    .catch(() => mostrarErro("Erro ao copiar código PIX"));
}

function voltar() {
  sessionStorage.clear();
  window.location.href = "login.html";
}

function mostrarErro(msg) {
  const erro = document.getElementById("erro");
  erro.innerText = msg;

  setTimeout(() => {
    erro.innerText = "";
  }, 4000);
}

carregar();