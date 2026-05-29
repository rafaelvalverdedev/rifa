require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { MercadoPagoConfig, Payment } = require("mercadopago");
const supabase = require("./supabase");

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

/* =========================
   EMAIL
========================= */

const nodemailer = require("nodemailer");

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: "rafaelvalverde.dev@gmail.com",
    pass: "hbqyiutbrpznezsq"
  }
});

async function enviarEmailConfirmacao(numeros) {
  try {
    const cliente = numeros[0];
    const listaNumeros = numeros.map(n => n.numero).join(", ");

    await transporter.sendMail({
      from: '"Rifa Online" <rafaelvalverde.dev@gmail.com>',
      to: cliente.email,
      subject: "Pagamento confirmado 🎉",
      html: `
        <div style="font-family: Arial; padding: 20px;">
          <h2 style="color:#28a745;">✅ Pagamento Confirmado!</h2>

          <p>Olá, <strong>${cliente.nome}</strong></p>

          <p>Seu pagamento foi aprovado com sucesso 🎉</p>

          <h3>🎟️ Seus números:</h3>
          <p style="font-size:18px; font-weight:bold;">
            ${listaNumeros}
          </p>

          <p>Guarde este email como comprovante.</p>

          <br>
          <p>Boa sorte 🍀</p>
        </div>
      `
    });

    console.log("📧 Email enviado para:", cliente.email);

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
      .eq("ativa", "TRUE")
      .order("id", { ascending: true });

    if (error) {
      return res.status(500).json({ error: "Erro ao carregar rifas" });
    }

    res.json(data);

  } catch (err) {
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
        date_of_expiration: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
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
   🔥 WEBHOOK (NOVO)
========================= */

app.post("/webhook", async (req, res) => {
  try {
    const paymentId = req.body.data?.id;

    if (!paymentId) return res.sendStatus(200);

    const pagamento = await payment.get({ id: paymentId });

    if (pagamento.status !== "approved") {
      return res.sendStatus(200);
    }

    const { data: numeros } = await supabase
      .from("rifa_numeros")
      .select("*")
      .eq("payment_id", paymentId);

    if (!numeros || numeros.length === 0) {
      return res.sendStatus(200);
    }

    await supabase
      .from("rifa_numeros")
      .update({ status: "pago" })
      .eq("payment_id", paymentId);

    await enviarEmailConfirmacao(numeros);

    console.log("✅ Pagamento confirmado e email enviado");

    res.sendStatus(200);

  } catch (err) {
    console.error("Erro webhook:", err);
    res.sendStatus(500);
  }
});

/* =========================
   🔍 GANHADOR (NOVO)
========================= */

app.get("/ganhador/:numero", async (req, res) => {
  try {
    const { numero } = req.params;

    const { data, error } = await supabase
      .from("rifa_numeros")
      .select("numero, nome, email, telefone")
      .eq("numero", Number(numero))
      .eq("status", "pago")
      .single();

    if (error || !data) {
      return res.status(404).json({
        error: "Nenhum ganhador encontrado"
      });
    }

    res.json(data);

  } catch (err) {
    res.status(500).json({ error: "Erro interno" });
  }
});

/* =========================
   START
========================= */

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
  console.log(`🚀 Servidor rodando na porta ${PORT}`);
});