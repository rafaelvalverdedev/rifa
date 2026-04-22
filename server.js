require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const supabase = require("./supabase");

const app = express();
app.use(cors());
app.use(express.json());

const client = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN
});

const payment = new Payment(client);

const TEMPO_RESERVA = 10 * 60 * 1000;

// =========================
// LISTAR RIFAS
// =========================
app.get("/rifas", async (req, res) => {
  const { data, error } = await supabase
    .from("rifas")
    .select("*")
    .eq("ativa", true);

  if (error) return res.status(500).json(error);

  res.json(data);
});

// =========================
// LISTAR NÚMEROS
// =========================
app.get("/numeros/:rifaId", async (req, res) => {
  const { rifaId } = req.params;
  const agora = new Date();

  // liberar reservas expiradas
  await supabase
    .from("rifa_numeros")
    .update({
      status: "disponivel",
      nome: null,
      telefone: null,
      reservado_em: null,
      payment_id: null
    })
    .eq("status", "reservado")
    .lt("reservado_em", new Date(agora - TEMPO_RESERVA));

  const { data, error } = await supabase
    .from("rifa_numeros")
    .select("*")
    .eq("rifa_id", rifaId)
    .order("numero");

  if (error) return res.status(500).json(error);

  res.json(data);
});

// =========================
// RESERVAR NÚMERO
// =========================
app.post("/reservar", async (req, res) => {
  try {
    let { numero, rifa_id, nome, telefone, email } = req.body;

    console.log("DEBUG REQUEST:", req.body);

    // =========================
    // VALIDAÇÕES BÁSICAS
    // =========================
    if (!Number.isFinite(numero)) {
      return res.status(400).json({ error: "Número inválido" });
    }

    if (!rifa_id || typeof rifa_id !== "string") {
      return res.status(400).json({ error: "Rifa inválida" });
    }

    if (!nome || nome.trim().length < 3) {
      return res.status(400).json({ error: "Nome inválido" });
    }

    if (!email || !email.includes("@")) {
      return res.status(400).json({ error: "Email inválido" });
    }

    nome = nome.trim();
    email = email.trim().toLowerCase();
    telefone = telefone?.trim();
    rifa_id = rifa_id.trim();

    // =========================
    // VALIDAR SE A RIFA EXISTE
    // =========================
    const { data: rifa, error: rifaError } = await supabase
      .from("rifas")
      .select("*")
      .eq("id", rifa_id)
      .single();

    if (rifaError || !rifa) {
      console.error("RIFA NÃO ENCONTRADA:", rifaError);
      return res.status(400).json({ error: "Rifa inválida" });
    }

    // =========================
    // RESERVAR NÚMERO (RPC)
    // =========================
    const { data, error } = await supabase.rpc("reservar_numero", {
      p_numero: numero,
      p_rifa_id: rifa_id,
      p_nome: nome,
      p_telefone: telefone,
      p_email: email
    });

    if (error) {
      console.error("ERRO RPC:", error);
      return res.status(400).json({ error: "Erro ao reservar número" });
    }

    if (!data || !data[0]?.success) {
      return res.status(400).json({ error: "Número indisponível" });
    }

    // =========================
    // GERAR PAGAMENTO PIX
    // =========================
    const pagamento = await payment.create({
      body: {
        transaction_amount: Number(rifa.valor),
        description: `Rifa ${rifa.nome} - número ${numero}`,
        payment_method_id: "pix",
        payer: { email },
        notification_url: `${process.env.BASE_URL}/webhook`
      }
    });

    const paymentId = pagamento.id;

    // salvar payment_id
    await supabase
      .from("rifa_numeros")
      .update({ payment_id: paymentId })
      .eq("numero", numero)
      .eq("rifa_id", rifa_id);

    res.json({
      qr_code_base64:
        pagamento.point_of_interaction.transaction_data.qr_code_base64,

      qr_code:
        pagamento.point_of_interaction.transaction_data.qr_code,

      payment_id: paymentId
    });

  } catch (err) {
    console.error("ERRO INTERNO:", err);
    res.status(500).json({ error: "Erro interno do servidor" });
  }
});

// =========================
// WEBHOOK (MERCADO PAGO)
// =========================
app.post("/webhook", async (req, res) => {
  try {
    if (req.body.type !== "payment") return res.sendStatus(200);

    const pagamento = await payment.get({ id: req.body.data.id });

    if (pagamento.status === "approved") {
      const paymentId = pagamento.id;

      await supabase
        .from("rifa_numeros")
        .update({ status: "pago" })
        .eq("payment_id", paymentId);
    }

    res.sendStatus(200);

  } catch (err) {
    console.error("ERRO WEBHOOK:", err);
    res.sendStatus(500);
  }
});

// =========================
// START SERVER
// =========================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});