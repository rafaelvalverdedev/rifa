// server.js

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

const TEMPO_RESERVA = 10 * 60 * 1000; // 10 minutos

// ========================================
// LISTAR RIFAS
// ========================================
app.get("/rifas", async (req, res) => {
  try {
    const { data, error } = await supabase
      .from("rifas")
      .select("*")
      .eq("ativa", true)
      .order("nome");

    if (error) {
      console.error("ERRO RIFAS:", error);
      return res.status(500).json({ error: "Erro ao carregar rifas" });
    }

    res.json(data);
  } catch (err) {
    console.error("ERRO INTERNO RIFAS:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ========================================
// LIBERAR RESERVAS EXPIRADAS
// ========================================
async function liberarReservasExpiradas() {
  try {
    const limite = new Date(Date.now() - TEMPO_RESERVA);

    console.log("LIBERANDO RESERVAS ANTES DE:", limite);

    const { data, error } = await supabase
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
      .lt("reservado_em", limite.toISOString())
      .select();

    if (error) {
      console.error(
        "ERRO AO LIBERAR RESERVAS:",
        error
      );
      return;
    }

    console.log(
      "NÚMEROS LIBERADOS:",
      data?.length || 0
    );

  } catch (err) {
    console.error(
      "ERRO INTERNO AO LIBERAR RESERVAS:",
      err
    );
  }
}

// ========================================
// LISTAR NÚMEROS
// ========================================
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
      console.error("ERRO NÚMEROS:", error);
      return res.status(500).json({ error: "Erro ao carregar números" });
    }

    res.json(data);
  } catch (err) {
    console.error("ERRO INTERNO NÚMEROS:", err);
    res.status(500).json({ error: "Erro interno" });
  }
});

// ========================================
// RESERVAR + GERAR PIX
// ========================================
app.post("/reservar", async (req, res) => {
  try {
    await liberarReservasExpiradas();
    let { numero, nome, telefone, email, rifa_id } = req.body;

    console.log("DEBUG REQUEST:", req.body);

    // ----------------------------
    // Validações
    // ----------------------------
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

    numero = Number(numero);
    nome = nome.trim();
    telefone = (telefone || "").trim();
    email = email.trim().toLowerCase();
    rifa_id = rifa_id.trim();

    // ----------------------------
    // Validar rifa
    // ----------------------------
    const { data: rifa, error: erroRifa } = await supabase
      .from("rifas")
      .select("*")
      .eq("id", rifa_id)
      .single();

    if (erroRifa || !rifa) {
      console.error("RIFA NÃO ENCONTRADA:", erroRifa);
      return res.status(400).json({ error: "Rifa inválida" });
    }

    // ----------------------------
    // Reservar número via RPC
    // IMPORTANTE:
    // A função SQL deve estar na mesma ordem:
    //
    // reservar_numero(
    //   p_email text,
    //   p_nome text,
    //   p_numero integer,
    //   p_rifa_id uuid,
    //   p_telefone text
    // )
    // ----------------------------
    const { data, error } = await supabase.rpc("reservar_numero", {
      p_email: email,
      p_nome: nome,
      p_numero: numero,
      p_rifa_id: rifa_id,
      p_telefone: telefone
    });

    if (error) {
      console.error("ERRO RPC:", error);
      return res.status(400).json({
        error: "Erro ao reservar número"
      });
    }

    if (!data || !data[0]?.success) {
      return res.status(400).json({
        error: "Número indisponível"
      });
    }

    // ----------------------------
    // Criar pagamento PIX
    // ----------------------------
    const pagamento = await payment.create({
      body: {
        transaction_amount: Number(rifa.valor),
        description: `Rifa ${rifa.nome} - Número ${numero}`,
        payment_method_id: "pix",
        payer: {
          email: email
        },
        notification_url: `${process.env.BASE_URL}/webhook`
      }
    });

    console.log(
      "POINT OF INTERACTION:",
      JSON.stringify(
        pagamento.point_of_interaction,
        null,
        2
      )
    );

    const paymentId = pagamento.id;

    // salvar payment_id
    await supabase
      .from("rifa_numeros")
      .update({
        payment_id: paymentId
      })
      .eq("rifa_id", rifa_id)
      .eq("numero", numero);

    // ----------------------------
    // Resposta para frontend
    // ----------------------------
    res.json({
      qr_code_base64:
        pagamento.point_of_interaction?.transaction_data?.qr_code_base64 || "",

      qr_code:
        pagamento.point_of_interaction?.transaction_data?.qr_code || "",

      payment_id: paymentId
    });

  } catch (err) {
    console.error("ERRO INTERNO /reservar:", err);
    res.status(500).json({
      error: "Erro interno do servidor"
    });
  }
});

// ========================================
// WEBHOOK MERCADO PAGO
// ========================================
app.post("/webhook", async (req, res) => {
  try {
    if (req.body.type !== "payment") {
      return res.sendStatus(200);
    }

    const paymentId = req.body.data?.id;

    if (!paymentId) {
      return res.sendStatus(200);
    }

    const pagamento = await payment.get({
      id: paymentId
    });

    if (pagamento.status === "approved") {
      await supabase
        .from("rifa_numeros")
        .update({
          status: "pago"
        })
        .eq("payment_id", paymentId);

      console.log("PAGAMENTO APROVADO:", paymentId);
    }

    res.sendStatus(200);
  } catch (err) {
    console.error("ERRO WEBHOOK:", err);
    res.sendStatus(500);
  }
});

// ========================================
// START
// ========================================
const PORT = process.env.PORT || 10000;

app.listen(PORT, () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});