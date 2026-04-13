const API = "https://rifa-baxs.onrender.com";
let selecionado = null;

async function carregar() {
    try {
        const res = await fetch(`${API}/numeros`);
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
        alert("Erro ao carregar números");
        console.error(err);
    }
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
    const nome = document.getElementById("nome").value;
    const telefone = document.getElementById("telefone").value;
    const email = document.getElementById("email").value;

    if (!selecionado) return alert("Escolha um número");
    if (!nome) return alert("Informe seu nome");
    if (!email) return alert("Informe seu email");

    alert(`Você escolheu o número ${selecionado}`);

    document.body.style.opacity = 0.5;

    try {
        await carregar();
        
        const res = await fetch(`${API}/reservar`, {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({
                numero: selecionado,
                nome,
                telefone,
                email
            })
        });

        if (!res.ok) {
            const err = await res.json();
            alert(err.error || "Erro ao comprar");
            return;
        }

        const data = await res.json();

        document.getElementById("qr").src =
            "data:image/png;base64," + data.qr_code_base64;

        selecionado = null;

        document.getElementById("selecionado-texto").innerText =
            "Nenhum número selecionado";

        carregar();

    } catch (err) {
        alert("Erro na comunicação com servidor");
        console.error(err);
    } finally {
        document.body.style.opacity = 1;
    }
}

carregar();