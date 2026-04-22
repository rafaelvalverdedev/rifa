const API = "https://rifa-baxs.onrender.com";
let selecionado = null;

// =========================
// USUÁRIO
// =========================
const usuario = JSON.parse(sessionStorage.getItem("usuario"));

if (!usuario || !usuario.rifa) {
    sessionStorage.clear();
    window.location.href = "login.html";
}

document.getElementById("userNome").innerText = usuario.nome;
document.getElementById("userEmail").innerText = usuario.email;

// =========================
// CARREGAR NÚMEROS
// =========================
async function carregar() {
    try {
        const res = await fetch(`${API}/numeros/${usuario.rifa}`);
        const numeros = await res.json();

        const grid = document.getElementById("grid");
        grid.innerHTML = "";

        numeros.forEach(n => {
            const div = document.createElement("div");
            div.innerText = n.numero;
            div.className = "numero";

            if (n.status === "pago") div.classList.add("vendido");
            if (n.status === "reservado") div.classList.add("reservado");

            if (n.status !== "disponivel") {
                div.style.cursor = "not-allowed";
            }

            div.onclick = (e) => selecionar(n, e);

            grid.appendChild(div);
        });

    } catch (err) {
        console.error("Erro ao carregar números:", err);
        mostrarErro("Erro ao carregar números.");
    }
}

// =========================
// SELECIONAR NÚMERO
// =========================
function selecionar(n, e) {
    if (n.status !== "disponivel") {
        mostrarErro("Número já indisponível!");
        return;
    }

    document.querySelectorAll(".numero").forEach(el =>
        el.classList.remove("selecionado")
    );

    e.target.classList.add("selecionado");
    selecionado = n.numero;

    document.getElementById("selecionado-texto").innerText =
        `Número selecionado: ${n.numero}`;

    // reset pagamento
    document.getElementById("pagamento").classList.add("hidden");
    document.getElementById("qr").src = "";
}

// =========================
// COMPRAR
// =========================
async function comprar() {
    const btn = document.getElementById("btnComprar");
    const erroEl = document.getElementById("erro");

    erroEl.innerText = "";

    try {
        if (!selecionado) {
            return mostrarErro("Escolha um número");
        }

        const numeroFinal = Number(selecionado);
        const rifaFinal = usuario.rifa; // UUID

        if (!Number.isFinite(numeroFinal) || !rifaFinal) {
            return mostrarErro("Erro interno: dados inválidos.");
        }

        btn.disabled = true;
        btn.innerText = "Processando...";

        document.getElementById("pagamento").classList.remove("hidden");
        document.getElementById("qr").src = "";

        const res = await fetch(`${API}/reservar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                numero: numeroFinal,
                nome: usuario.nome,
                telefone: usuario.telefone,
                email: usuario.email,
                rifa_id: rifaFinal
            })
        });

        const data = await res.json();

        if (!res.ok) {
            throw new Error(data.error || "Erro ao reservar número");
        }

        if (!data.qr_code_base64) {
            throw new Error("Erro ao gerar QR Code");
        }

        document.getElementById("qr").src =
            "data:image/png;base64," + data.qr_code_base64;

        // scroll suave
        document.getElementById("pagamento").scrollIntoView({
            behavior: "smooth"
        });

        // 🔥 atualiza grid após reservar
        await carregar();

    } catch (err) {
        console.error(err);
        mostrarErro(err.message);
        document.getElementById("pagamento").classList.add("hidden");
    } finally {
        btn.disabled = false;
        btn.innerText = "Continuar para pagamento";
    }
}


function voltar() {
    sessionStorage.removeItem("usuario"); // limpa dados
    window.location.href = "login.html";  // volta pra tela inicial
}


// =========================
// ERRO UI
// =========================
function mostrarErro(msg) {
    const el = document.getElementById("erro");
    el.innerText = msg;
    el.style.display = "block";
}

// =========================
// INIT
// =========================
carregar();