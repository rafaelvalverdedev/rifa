require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const supabase = require("./supabase");
const { Resend } = require("resend");

const app = express();
app.use(cors());
app.use(express.json());

/* =========================
   CONFIGS
========================= */

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const payment = new Payment(client);
const resend = new Resend(process.env.RESEND_API_KEY);

const TEMPO_RESERVA = 10 * 60 * 1000;

/* =========================
   FUNÇÕES AUXILIARES
========================= */

async function liberarReservasExpiradas() {
  try {
    const limite = new Date(Date.now() - TEMPO_RESERVA);

    await supabase
      .from("rifa_numeros")
      .update({
        status: "disponivel",
        nome: null,
        telefone: null,
        email: null,
        reservado_em: null,
        payment_id: null
      })
      .eq("status", "reservado")
      .lt("reservado_em", limite.toISOString());
  } catch (err) {
    console.error(err);
  }
}

async function enviarEmailConfirmacao(numeros) {
  try {
    const cliente = numeros[0];
    const listaNumeros = numeros.map(n => n.numero).join(", ");

    await resend.emails.send({
      from: "Rifa <onboarding@resend.dev>", // troque depois por domínio próprio
      to: cliente.email,
      subject: "Pagamento confirmado 🎉",
      html: `
        <h2>Pagamento confirmado com sucesso!</h2>

        <p>Olá, ${cliente.nome}</p>

        <p>Seu pagamento foi aprovado.</p>

        <p><strong>Números comprados:</strong> ${listaNumeros}</p>

        <p>Boa sorte no sorteio 🍀</p>
      `
    });

    console.log("Email enviado:", cliente.email);

  } catch (err) {
    console.error("Erro ao enviar email:", err);
  }
}

/* =========================
   ROTAS
========================= */

app.get("/rifas", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("rifas")
      .select("*")
      .order("id", { ascending: true });

    if (error) {
      return res.status(500).json({ error: "Erro ao carregar rifas" });
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

app.get("/numeros/:rifaId", async (req, res) => {
  try {
    const { rifaId } = req.params;

    await liberarReservasExpiradas();

    const { data, error } = await supabase
      .from("rifa_numeros")
      .select("*")
      .eq("rifa_id", rifaId)
      .order("numero", { ascending: true });

    if (error) {
      return res.status(500).json({ error: "Erro ao carregar números" });
    }

    res.json(data);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro interno" });
  }
});

app.post("/reservar", async (req, res) => {
  try {
    await liberarReservasExpiradas();

    let { numeros, nome, telefone, email, rifa_id } = req.body;

    if (!Array.isArray(numeros) || numeros.length === 0) {
      return res.status(400).json({
        error: "Selecione pelo menos um número"
      });
    }

    const { data: rifa } = await supabase
      .from("rifas")
      .select("*")
      .eq("id", rifa_id)
      .single();

    for (const numero of numeros) {
      const { data } = await supabase.rpc("reservar_numero", {
        p_email: email.trim().toLowerCase(),
        p_nome: nome.trim(),
        p_numero: Number(numero),
        p_rifa_id: rifa_id,
        p_telefone: telefone
      });

      if (!data || !data[0]?.success) {
        return res.status(400).json({
          error: `Número ${numero} indisponível`
        });
      }
    }

    const valorTotal = Number(rifa.valor) * numeros.length;

    const pagamento = await payment.create({
      body: {
        transaction_amount: valorTotal,
        description: `Rifa ${rifa.nome} - Números: ${numeros.join(", ")}`,
        payment_method_id: "pix",
        payer: {
          email: email.trim().toLowerCase()
        },
        notification_url: `${process.env.BASE_URL}/webhook`
      }
    });

    const paymentId = pagamento.id;

    for (const numero of numeros) {
      await supabase
        .from("rifa_numeros")
        .update({ payment_id: paymentId })
        .eq("rifa_id", rifa_id)
        .eq("numero", Number(numero));
    }

    res.json({
      success: true,
      numeros,
      valor_total: valorTotal,
      qr_code_base64:
        pagamento.point_of_interaction?.transaction_data?.qr_code_base64 || "",
      qr_code:
        pagamento.point_of_interaction?.transaction_data?.qr_code || ""
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar pagamento" });
  }
});

/* =========================
   WEBHOOK (PAGAMENTO)
========================= */

app.post("/webhook", async (req, res) => {
  try {
    console.log("Webhook recebido:", req.body);

    const paymentId =
      req.body?.data?.id ||
      req.body?.id;

    if (!paymentId) {
      return res.status(200).send("ok");
    }

    const pagamentoDetalhado = await payment.get({
      id: Number(paymentId)
    });

    const status = pagamentoDetalhado.status;

    console.log("Status:", status);

    if (status !== "approved") {
      return res.status(200).send("ok");
    }

    const { data: numeros } = await supabase
      .from("rifa_numeros")
      .select("*")
      .eq("payment_id", paymentId);

    if (!numeros || numeros.length === 0) {
      return res.status(200).send("ok");
    }

    // 🚫 evita duplicação
    if (numeros[0].status === "pago") {
      return res.status(200).send("já processado");
    }

    // ✅ marca como pago
    await supabase
      .from("rifa_numeros")
      .update({ status: "pago" })
      .eq("payment_id", paymentId);

    // 📧 envia email
    await enviarEmailConfirmacao(numeros);

    res.status(200).send("ok");

  } catch (err) {
    console.error(err);
    res.status(500).send("erro");
  }
});

/* =========================
   START SERVER
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log("Servidor rodando na porta", PORT);
});