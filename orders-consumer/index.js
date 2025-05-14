const amqp = require('amqplib');
const fs = require('fs').promises;
const fsSync = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');
const axios = require('axios');

const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';
const ORDERS_QUEUE = 'orders-queue';
const NOTIFICATIONS_QUEUE = 'notifications-queue';

const INVOICES_DIR = './data/invoices';

const STOCK_API_URL = process.env.STOCK_API_URL || 'http://localhost:3001';

async function checkAvailability(productId, quantity) {
  try {
    const response = await axios.get(`${STOCK_API_URL}/products/${productId}`);
    const product = response.data;
    
    if (!product) {
      throw new Error(`Produto não encontrado: ${productId}`);
    }
    
    if (product.available < quantity) {
      throw new Error(`Estoque insuficiente para ${product.nome}. Disponível: ${product.available}, Solicitado: ${quantity}`);
    }
    
    return true;
  } catch (error) {
    if (error.response && error.response.status === 404) {
      throw new Error(`Produto não encontrado: ${productId}`);
    }
    throw error;
  }
}

async function updateStock(productId, quantity) {
  try {
    const response = await axios.get(`${STOCK_API_URL}/products/${productId}`);
    const product = response.data;
    
    if (!product) {
      throw new Error(`Produto não encontrado: ${productId}`);
    }
    
    const newAvailable = product.available - quantity;
    
    await axios.patch(`${STOCK_API_URL}/products/${productId}`, {
      available: newAvailable
    });
    
    console.log(`Estoque atualizado para ${product.nome}: ${newAvailable} unidades restantes`);
    
    return newAvailable;
  } catch (error) {
    console.error(`Erro ao atualizar estoque:`, error.message);
    throw error;
  }
}

async function getProductInfo(productId) {
  try {
    const response = await axios.get(`${STOCK_API_URL}/products/${productId}`);
    return response.data;
  } catch (error) {
    console.error(`Erro ao obter informações do produto ${productId}:`, error.message);
    return null;
  }
}

async function validateOrder(order) {
  console.log(`Validando pedido...`);
  
  if (!order.cliente || !order.cliente.nome || !order.cliente.email) {
    throw new Error('Dados do cliente incompletos');
  }
  
  if (!order.itens || order.itens.length === 0) {
    throw new Error('Pedido sem itens');
  }
  
  for (const item of order.itens) {
    await checkAvailability(item.idProduto, item.quantidade);
  }
  
  let calculatedTotal = 0;
  for (const item of order.itens) {
    calculatedTotal += item.quantidade * item.precoUnitario;
  }
  
  if (Math.abs(calculatedTotal - order.valorTotal) > 0.01) {
    throw new Error(`Valor total do pedido inconsistente. Calculado: ${calculatedTotal.toFixed(2)}, Informado: ${order.valorTotal}`);
  }
  
  console.log(`Pedido validado com sucesso`);
  return true;
}

async function generatePDF(invoiceData, invoiceFilename) {
  return new Promise((resolve, reject) => {
    try {
      const doc = new PDFDocument({ margin: 50 });
      
      const pdfFilename = invoiceFilename.replace('.json', '.pdf');
      const writeStream = fsSync.createWriteStream(pdfFilename);
      doc.pipe(writeStream);
      
      doc.fontSize(20).text('NOTA FISCAL ELETRÔNICA', { align: 'center' });
      doc.moveDown();
      doc.fontSize(12).text(`Nota Fiscal: ${invoiceData.invoiceNumber}`, { align: 'center' });
      doc.fontSize(10).text(`Emitida em: ${new Date(invoiceData.issuedAt).toLocaleString('pt-BR')}`, { align: 'center' });
      doc.moveDown(2);
      
      doc.fontSize(14).text('DADOS DO CLIENTE');
      doc.fontSize(10).text(`Nome: ${invoiceData.cliente.nome}`);
      doc.text(`Email: ${invoiceData.cliente.email}`);
      if (invoiceData.cliente.cpf) {
        doc.text(`CPF/CNPJ: ${invoiceData.cliente.cpf}`);
      }
      if (invoiceData.cliente.endereco) {
        doc.text(`Endereço: ${invoiceData.cliente.endereco}`);
      }
      doc.moveDown(2);
      
      doc.fontSize(14).text('ITENS');
      doc.moveDown();
      
      const invoiceTableTop = doc.y;
      const itemCodeX = 50;
      const descriptionX = 110;
      const quantityX = 320;
      const priceX = 380;
      const totalX = 450;
      
      doc.fontSize(10)
        .text('CÓDIGO', itemCodeX, invoiceTableTop)
        .text('DESCRIÇÃO', descriptionX, invoiceTableTop)
        .text('QTD', quantityX, invoiceTableTop)
        .text('PREÇO', priceX, invoiceTableTop)
        .text('TOTAL', totalX, invoiceTableTop);
      
      doc.moveDown();
      doc.strokeColor('#aaaaaa')
        .lineWidth(1)
        .moveTo(itemCodeX, doc.y)
        .lineTo(550, doc.y)
        .stroke();
      doc.moveDown();
      
      let itemY = doc.y;
      invoiceData.itens.forEach(item => {
        doc.text(item.idProduto, itemCodeX, itemY)
          .text(item.nome, descriptionX, itemY)
          .text(item.quantidade.toString(), quantityX, itemY)
          .text(`R$ ${item.precoUnitario.toFixed(2)}`, priceX, itemY)
          .text(`R$ ${item.precoTotal.toFixed(2)}`, totalX, itemY);
        
        itemY = doc.y + 15;
        doc.moveDown();
      });
      
      doc.strokeColor('#aaaaaa')
        .lineWidth(1)
        .moveTo(itemCodeX, doc.y)
        .lineTo(550, doc.y)
        .stroke();
      doc.moveDown();
      
      doc.fontSize(10)
        .text('', itemCodeX)
        .text('', descriptionX)
        .text('', quantityX)
        .text('Subtotal:', priceX)
        .text(`R$ ${invoiceData.valorTotal.toFixed(2)}`, totalX);
      
      doc.fontSize(12)
        .text('', itemCodeX)
        .text('', descriptionX)
        .text('', quantityX)
        .text('TOTAL:', priceX)
        .text(`R$ ${(invoiceData.valorTotal).toFixed(2)}`, totalX);
      
      doc.moveDown(4);
      doc.fontSize(8).text('Documento emitido eletronicamente. Validade fiscal conforme regulamentação.', { align: 'center' });
      
      doc.end();
      
      writeStream.on('finish', () => {
        console.log(`PDF da Nota Fiscal criado em ${pdfFilename}`);
        resolve(pdfFilename);
      });
      
      writeStream.on('error', (error) => {
        console.error(`Erro ao gerar PDF: ${error.message}`);
        reject(error);
      });
      
    } catch (error) {
      console.error(`Erro ao gerar PDF: ${error.message}`);
      reject(error);
    }
  });
}

async function generateInvoice(order) {
  try {
    await fs.mkdir(INVOICES_DIR, { recursive: true });
    
    console.log(`Gerando nota fiscal para o pedido`);
    
    const invoiceNumber = `NF-${Date.now()}`;
    
    const itensWithProductInfo = await Promise.all(order.itens.map(async (item) => {
      const productInfo = await getProductInfo(item.idProduto);
      return {
        idProduto: item.idProduto,
        nome: productInfo ? productInfo.nome : item.nome || 'Produto',
        quantidade: item.quantidade,
        precoUnitario: item.precoUnitario,
        precoTotal: item.quantidade * item.precoUnitario
      };
    }));
    
    const invoiceContent = {
      invoiceNumber,
      issuedAt: new Date().toISOString(),
      cliente: order.cliente,
      itens: itensWithProductInfo,
      valorTotal: order.valorTotal,
    };
    
    const invoiceFilename = path.join(INVOICES_DIR, `${invoiceNumber}.json`);
    await fs.writeFile(
      invoiceFilename, 
      JSON.stringify(invoiceContent, null, 2)
    );
    
    console.log(`Nota fiscal JSON ${invoiceNumber} gerada com sucesso`);
    
    const pdfFilename = await generatePDF(invoiceContent, invoiceFilename);
    
    console.log(`Nota fiscal PDF ${invoiceNumber} gerada com sucesso`);
    
    return {
      invoiceNumber,
      jsonPath: invoiceFilename,
      pdfPath: pdfFilename
    };
  } catch (error) {
    console.error(`Erro ao gerar nota fiscal:`, error.message);
    throw error;
  }
}

async function processOrder(order, channel) {
  try {
    console.log(`Iniciando processamento do pedido`);
    
    if (!order.id) {
      order.id = `ORD-${Date.now()}`;
    }
    
    await validateOrder(order);
    
    for (const item of order.itens) {
      await updateStock(item.idProduto, item.quantidade);
    }
    
    const invoiceResult = await generateInvoice(order);
    
    console.log(`Pedido processado com sucesso!`);
    console.log(`ID: ${order.id}`);
    console.log(`Nota Fiscal: ${invoiceResult.invoiceNumber}`);
    console.log(`JSON: ${invoiceResult.jsonPath}`);
    console.log(`PDF: ${invoiceResult.pdfPath}`);
    
    await sendNotification(order, invoiceResult, channel);
    
    return {
      success: true,
      orderId: order.id,
      invoiceNumber: invoiceResult.invoiceNumber,
      invoicePdfPath: invoiceResult.pdfPath
    };
  } catch (error) {
    console.error(`Erro ao processar pedido:`, error.message);
    throw error;
  }
}

async function sendNotification(order, invoiceResult, channel) {
  try {
    const itensWithProductInfo = await Promise.all(order.itens.map(async (item) => {
      const productInfo = await getProductInfo(item.idProduto);
      return {
        ...item,
        nome: productInfo ? productInfo.nome : item.nome || 'Produto'
      };
    }));
    
    const notification = {
      orderId: order.id,
      invoiceNumber: invoiceResult.invoiceNumber,
      invoicePdfPath: invoiceResult.pdfPath,
      cliente: order.cliente,
      itens: itensWithProductInfo,
      valorTotal: order.valorTotal,
      processedAt: new Date().toISOString()
    };
    
    await channel.assertQueue(NOTIFICATIONS_QUEUE, { durable: true });
    
    channel.sendToQueue(
      NOTIFICATIONS_QUEUE,
      Buffer.from(JSON.stringify(notification)),
      { persistent: true }
    );
    
    console.log(`Notificação enviada para a fila`);
  } catch (error) {
    console.error('Erro ao enviar notificação:', error.message);
    throw error;
  }
}

async function startConsumer() {
  let connection;
  let channel;
  
  try {
    console.log(`Conectando ao RabbitMQ: ${RABBITMQ_URL}`);
    connection = await amqp.connect(RABBITMQ_URL);
    channel = await connection.createChannel();
    
    await channel.assertQueue(ORDERS_QUEUE, {
      durable: true
    });
    
    channel.prefetch(1);
    
    console.log(`Serviço de processamento de pedidos conectado ao RabbitMQ. Aguardando mensagens na fila ${ORDERS_QUEUE}...`);
    
    channel.consume(ORDERS_QUEUE, async (msg) => {
      if (!msg) return;
      
      try {
        const order = JSON.parse(msg.content.toString());
        console.log(`Mensagem recebida:`, msg.content.toString());
        
        await processOrder(order, channel);
        
        channel.ack(msg);
        console.log(`Pedido processado e confirmado`);
      } catch (error) {
        console.error('Erro no processamento do pedido:', error.message);
        
        const isRetryable = !error.message.includes('inconsistente') && 
                           !error.message.includes('incompletos') &&
                           !error.message.includes('sem itens');
        
        channel.reject(msg, isRetryable);
        console.log(`Mensagem ${isRetryable ? 'devolvida para a fila' : 'descartada'}`);
      }
    });
    
    connection.on('error', (err) => {
      console.error('Erro na conexão RabbitMQ:', err.message);
      setTimeout(startConsumer, 5000);
    });
    
    connection.on('close', () => {
      console.error('Conexão RabbitMQ fechada. Tentando reconectar...');
      setTimeout(startConsumer, 5000);
    });
    
  } catch (error) {
    console.error('Erro ao iniciar consumidor:', error.message);
    
    if (channel) await channel.close();
    if (connection) await connection.close();
    
    setTimeout(startConsumer, 5000);
  }
}

console.log('Iniciando serviço de processamento de pedidos...');
startConsumer();