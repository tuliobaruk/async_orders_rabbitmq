// notify-service/index.js
const amqp = require('amqplib');
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
dotenv.config();

const RABBITMQ_URL = process.env.RABBITMQ_URL;
const NOTIFICATIONS_QUEUE = 'orders-queue';

class NotifyService {
  sendEmail(orderData) {
    const transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.USER_GMAIL,
        pass: process.env.PASSWORD_GMAIL,
      },
    });
    
    (async () => {
      const itemsDetail = orderData.itens.map(item => 
        `${item.quantidade}x ${item.nome} - R$ ${(item.precoUnitario * item.quantidade).toFixed(2)}`
      ).join("<br>");
      
      const info = await transporter.sendMail({
        to: orderData.cliente.email,
        subject: `Pedido Confirmado #${orderData.id || 'ID-' + Date.now()}`,
        text: `Olá ${orderData.cliente.nome}, sua compra no valor de R$ ${orderData.valorTotal.toFixed(2)} foi confirmada!`,
        html: `
          <h2>Olá ${orderData.cliente.nome},</h2>
          <p>Sua compra foi processada com sucesso!</p>
          <h3>Detalhes do pedido:</h3>
          <div>${itemsDetail}</div>
          <p><strong>Total: R$ ${orderData.valorTotal.toFixed(2)}</strong></p>
          ${orderData.invoiceNumber ? `<p>Nota fiscal: ${orderData.invoiceNumber}</p>` : ''}
          <p>Obrigado por comprar conosco!</p>
        `,
      });
    
      console.log("Email enviado:", info.messageId);
    })().catch(error => {
      console.error("Erro ao enviar email:", error);
    });
  }
}

function processMessage(notifyService, message) {
  try {
    const orderData = JSON.parse(message.content.toString());
    console.log('Mensagem recebida:', orderData);
    
    notifyService.sendEmail(orderData);
    
    console.log('Notificação enviada com sucesso');
  } catch (error) {
    console.error('Erro ao processar mensagem:', error);
  }
}

async function consumeMessages() {
  try {
    const connection = await amqp.connect(RABBITMQ_URL);
    console.log('Conectado ao RabbitMQ com sucesso');
    
    const channel = await connection.createChannel();
    
    await channel.assertQueue(NOTIFICATIONS_QUEUE, {
      durable: true
    });
    
    channel.prefetch(1);
    
    const notifyService = new NotifyService();
    
    console.log(`Aguardando mensagens na fila ${NOTIFICATIONS_QUEUE}...`);
    
    channel.consume(NOTIFICATIONS_QUEUE, (message) => {
      if (!message) return;
      
      processMessage(notifyService, message);
      
      channel.ack(message);
    });
    
  } catch (error) {
    console.error('Erro ao conectar ao RabbitMQ:', error);
    setTimeout(consumeMessages, 5000);
  }
}

console.log('Iniciando serviço de notificações...');
consumeMessages();