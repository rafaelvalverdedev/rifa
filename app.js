const API = "https://rifa-baxs.onrender.com";
let selecionado = null;

const usuario = JSON.parse(sessionStorage.getItem("usuario"));

if (!usuario) {
    window.location.href = "login.html";
}

document.getElementById("userNome").innerText = usuario.nome;
document.getElementById("userEmail").innerText = usuario.email;

async function carregar() {
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
}

function selecionar(n, e) {
    if (n.status !== "disponivel") {
        alert("Número já indisponível!");
        return;
    }

    document.querySelectorAll(".numero").forEach(el =>
        el.classList.remove("selecionado")
    );

    e.target.classList.add("selecionado");
    selecionado = n.numero;

    document.getElementById("selecionado-texto").innerText =
        `Número selecionado: ${n.numero}`;

    // 🔄 RESET DO PAGAMENTO
    document.getElementById("pagamento").classList.add("hidden");
    document.getElementById("qr").src = "";
}

async function comprar() {
    const btn = document.getElementById("btnComprar");
    const erroEl = document.getElementById("erro");

    erroEl.innerText = "";

    try {
        if (!selecionado) {
            return mostrarErro("Escolha um número");
        }

        btn.disabled = true;
        btn.innerText = "Processando...";

        // 👇 MOSTRA LOADING
        document.getElementById("pagamento").classList.remove("hidden");
        document.getElementById("qr").src = "";

        const res = await fetch(`${API}/reservar`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                numero: Number(selecionado),
                nome: usuario.nome,
                telefone: usuario.telefone,
                email: usuario.email,
                rifa_id: Number(usuario.rifa)
            })
        });

        let data;

        try {
            data = await res.json();
        } catch {
            throw new Error("Resposta inválida do servidor");
        }

        if (!res.ok) {
            throw new Error(data.error || "Erro ao reservar número");
        }

        if (!data.qr_code_base64) {
            throw new Error("Erro ao gerar QR Code");
        }

        document.getElementById("qr").src =
            "data:image/png;base64," + data.qr_code_base64;

    } catch (err) {
        console.error(err);
        mostrarErro(err.message);
        document.getElementById("pagamento").classList.add("hidden");
    } finally {
        btn.disabled = false;
        btn.innerText = "Continuar para pagamento";
    }
}

function mostrarErro(msg) {
    const el = document.getElementById("erro");
    el.innerText = msg;
    el.style.display = "block";
}

carregar();