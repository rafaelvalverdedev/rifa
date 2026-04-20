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
// LISTAR NÚMEROS POR RIFA
// =========================
app.get("/numeros/:rifaId", async (req, res) => {
  const { rifaId } = req.params;
  const agora = new Date();

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
// RESERVAR
// =========================
app.post("/reservar", async (req, res) => {
  const { numero, nome, telefone, email, rifa_id } = req.body;

  if (!numero || !nome || !email || !rifa_id) {
    return res.status(400).json({ error: "Dados obrigatórios faltando" });
  }

  const { data, error } = await supabase
    .from("rifa_numeros")
    .update({
      nome,
      telefone,
      status: "reservado",
      reservado_em: new Date()
    })
    .eq("numero", numero)
    .eq("rifa_id", rifa_id)
    .eq("status", "disponivel")
    .select();

  if (error || data.length === 0) {
    return res.status(400).json({ error: "Número indisponível" });
  }

  try {
    const pagamento = await payment.create({
      body: {
        transaction_amount: 10,
        description: `Rifa ${rifa_id} - número ${numero}`,
        payment_method_id: "pix",
        payer: { email },
        notification_url: `${process.env.BASE_URL}/webhook`
      }
    });

    const paymentId = pagamento.id;

    await supabase
      .from("rifa_numeros")
      .update({ payment_id: paymentId })
      .eq("numero", numero)
      .eq("rifa_id", rifa_id);

    res.json({
      qr_code_base64:
        pagamento.point_of_interaction.transaction_data.qr_code_base64,
      payment_id: paymentId
    });

  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao gerar pagamento" });
  }
});

// =========================
// WEBHOOK
// =========================
app.post("/webhook", async (req, res) => {
  try {
    if (req.body.type !== "payment") return res.sendStatus(200);

    const pagamento = await payment.get({ id: req.body.data.id });

    if (pagamento.status === "approved") {
      await supabase
        .from("rifa_numeros")
        .update({ status: "pago" })
        .eq("payment_id", pagamento.id);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error(err);
    res.sendStatus(500);
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Servidor rodando na porta " + PORT);
});