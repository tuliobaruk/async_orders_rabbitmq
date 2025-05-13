// notify-service/index.js
const amqp = require('amqplib');
const nodemailer = require("nodemailer");
const dotenv = require("dotenv");
const fs = require("fs");
const path = require("path");
dotenv.config();

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const ORDERS_QUEUE = 'orders-queue';
const NOTIFICATIONS_QUEUE = 'notifications-queue';
const PROCESSED_ORDERS_SET = new Set();

class NotifyService {
  constructor() {
    this.transporter = nodemailer.createTransport({
      host: "smtp.gmail.com",
      port: 587,
      secure: false,
      auth: {
        user: process.env.USER_GMAIL,
        pass: process.env.PASSWORD_GMAIL,
      },
    });
  }

  async sendOrderReceivedEmail(orderData) {
    try {
      const itemsDetail = orderData.itens.map(item => 
        `${item.quantidade}x ${item.nome || 'Produto'} - R$ ${(item.precoUnitario * item.quantidade).toFixed(2)}`
      ).join("<br>");
      
      const info = await this.transporter.sendMail({
        to: orderData.cliente.email,
        subject: `Pedido Recebido #${orderData.id || 'ID-' + Date.now()}`,
        text: `Olá ${orderData.cliente.nome}, recebemos seu pedido no valor de R$ ${orderData.valorTotal.toFixed(2)}. Estamos processando!`,
        html: `
          <h2>Olá ${orderData.cliente.nome},</h2>
          <p>Recebemos seu pedido e estamos processando!</p>
          <h3>Detalhes do pedido:</h3>
          <div>${itemsDetail}</div>
          <p><strong>Total: R$ ${orderData.valorTotal.toFixed(2)}</strong></p>
          <p>Você receberá um email de confirmação assim que o pedido for processado.</p>
          <p>Obrigado por comprar conosco!</p>
        `,
      });
    
      console.log("Email de recebimento enviado:", info.messageId);
      return info;
    } catch (error) {
      console.error("Erro ao enviar email de recebimento:", error);
      throw error;
    }
  }

  async sendOrderProcessedEmail(orderData) {
    try {
      const itemsDetail = orderData.itens.map(item => 
        `${item.quantidade}x ${item.nome || 'Produto'} - R$ ${(item.precoUnitario * item.quantidade).toFixed(2)}`
      ).join("<br>");
      
      const attachments = [];
      
      if (orderData.invoicePdfPath) {
        let pdfPath = orderData.invoicePdfPath;
        if (pdfPath.startsWith('./data/invoices/')) {
          pdfPath = pdfPath.replace('./data/invoices/', '/app/data/invoices/');
        }
        
        if (fs.existsSync(pdfPath)) {
          attachments.push({
            filename: `NotaFiscal-${orderData.invoiceNumber}.pdf`,
            path: pdfPath,
            contentType: 'application/pdf'
          });
        } else {
          console.warn(`Arquivo PDF não encontrado: ${pdfPath}`);
        }
      }
      
      const info = await this.transporter.sendMail({
        to: orderData.cliente.email,
        subject: `Pedido Confirmado #${orderData.orderId || orderData.id || 'ID-' + Date.now()}`,
        text: `Olá ${orderData.cliente.nome}, sua compra no valor de R$ ${orderData.valorTotal.toFixed(2)} foi processada com sucesso!`,
        html: `
          <h2>Olá ${orderData.cliente.nome},</h2>
          <p>Seu pedido foi processado com sucesso!</p>
          <h3>Detalhes do pedido:</h3>
          <div>${itemsDetail}</div>
          <p><strong>Total: R$ ${orderData.valorTotal.toFixed(2)}</strong></p>
          ${orderData.invoiceNumber ? `<p>Nota fiscal: ${orderData.invoiceNumber}</p>` : ''}
          ${attachments.length > 0 ? '<p>A nota fiscal está anexada a este email.</p>' : ''}
          <p>Obrigado por comprar conosco!</p>
        `,
        attachments: attachments
      });
    
      console.log("Email de confirmação enviado:", info.messageId);
      return info;
    } catch (error) {
      console.error("Erro ao enviar email de confirmação:", error);
      throw error;
    }
  }
}

async function startService() {
  let connection;
  let channel;
  
  try {
    console.log(`Conectando ao RabbitMQ: ${RABBITMQ_URL}`);
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    
    await channel.assertQueue(ORDERS_QUEUE, {
      durable: true
    });
    
    await channel.assertQueue(NOTIFICATIONS_QUEUE, {
      durable: true
    });
    
    channel.prefetch(1);
    
    const notifyService = new NotifyService();
    
    console.log(`Serviço de notificações conectado ao RabbitMQ. Aguardando mensagens...`);
    
    channel.consume(ORDERS_QUEUE, async (msg) => {
      if (!msg) return;
      
      try {
        const orderData = JSON.parse(msg.content.toString());
        const orderId = orderData.id || orderData.orderId || JSON.stringify(orderData);
        
        if (PROCESSED_ORDERS_SET.has(orderId)) {
          console.log(`Pedido ${orderId} já teve email enviado. Ignorando.`);
          channel.reject(msg, true);
          return;
        }
        
        console.log(`Novo pedido recebido: ${orderId}`);
        
        await notifyService.sendOrderReceivedEmail(orderData);
        
        PROCESSED_ORDERS_SET.add(orderId);
        
        if (PROCESSED_ORDERS_SET.size > 1000) {
          const oldestKey = Array.from(PROCESSED_ORDERS_SET)[0];
          PROCESSED_ORDERS_SET.delete(oldestKey);
        }
        
        channel.reject(msg, true);
        
        console.log(`Email de recebimento enviado para ${orderId} e mensagem devolvida à fila para processamento`);
      } catch (error) {
        console.error('Erro ao processar novo pedido:', error.message);
        
        const isRetryable = !error.message.includes('no recipients');
        channel.reject(msg, isRetryable);
        
        console.log(`Erro ao processar pedido. Mensagem ${isRetryable ? 'devolvida para a fila' : 'descartada'}`);
      }
    }, { noAck: false });
    
    channel.consume(NOTIFICATIONS_QUEUE, async (msg) => {
      if (!msg) return;
      
      try {
        const orderData = JSON.parse(msg.content.toString());
        const orderId = orderData.orderId || orderData.id || JSON.stringify(orderData);
        
        console.log(`Notificação de processamento recebida: ${orderId}`);
        
        await notifyService.sendOrderProcessedEmail(orderData);
        
        channel.ack(msg);
        
        console.log(`Email de confirmação enviado para ${orderId} e mensagem confirmada`);
      } catch (error) {
        console.error('Erro ao processar notificação:', error.message);
        
        const isRetryable = !error.message.includes('no recipients');
        channel.reject(msg, isRetryable);
        
        console.log(`Erro ao processar notificação. Mensagem ${isRetryable ? 'devolvida para a fila' : 'descartada'}`);
      }
    }, { noAck: false });
    
    connection.on('error', (err) => {
      console.error('Erro na conexão RabbitMQ:', err.message);
      setTimeout(startService, 5000);
    });
    
    connection.on('close', () => {
      console.error('Conexão RabbitMQ fechada. Tentando reconectar...');
      setTimeout(startService, 5000);
    });
    
  } catch (error) {
    console.error('Erro ao iniciar serviço:', error.message);
    
    if (channel) await channel.close();
    if (connection) await connection.close();
    
    setTimeout(startService, 5000);
  }
}

console.log('Iniciando serviço de notificações...');
startService();