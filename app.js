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
}

async function comprar() {
    if (!selecionado) return alert("Escolha um número");

    const res = await fetch(`${API}/reservar`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            numero: selecionado,
            nome: usuario.nome,
            telefone: usuario.telefone,
            email: usuario.email,
            rifa_id: usuario.rifa
        })
    });

    const data = await res.json();

    document.getElementById("qr").src =
        "data:image/png;base64," + data.qr_code_base64;
}

carregar();