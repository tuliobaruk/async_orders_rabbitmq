# Sistema de Pedidos Resiliente com Spring Boot, RabbitMQ, Redis e Node.js

Este projeto é uma demonstração de um sistema de pedidos resiliente utilizando **Spring Boot**, **RabbitMQ**, **Redis** e **Node.js**, com capacidade de tolerância a falhas e recuperação automática.

A arquitetura foi projetada para garantir **entregabilidade de mensagens**, **persistência**, e **comunicação entre serviços de forma assíncrona**.

---

## Tecnologias Utilizadas

[![Java](https://img.shields.io/badge/Java-%23ED8B00.svg?logo=openjdk&logoColor=white)](#)
[![Spring Boot](https://img.shields.io/badge/Spring%20Boot-6DB33F?logo=springboot&logoColor=fff)](#)
[![NodeJS](https://img.shields.io/badge/Node.js-6DA55F?logo=node.js&logoColor=white)](#)
![RabbitMQ](https://img.shields.io/badge/RabbitMQ-ff6600?logo=rabbitmq&logoColor=white)
[![Redis](https://img.shields.io/badge/Redis-%23DD0031.svg?logo=redis&logoColor=white)](#)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=fff)](#)
[![Nginx](https://img.shields.io/badge/Nginx-0F8C3B?logo=Nginx&logoColor=fff)](#)

---

## Diagrama de Arquitetura

[![Diagrama](./docs/Arquitetura.png)](./docs/Arquitetura.png)

---
## Pré-requisitos

- **Docker**
- **Docker Compose**

---

## Estrutura do Projeto

```
.
├── docker-compose.yml
├── frontend/              # Página HTML para interação com a API
├── notify-service/        # Envia e-mails com Nodemailer
├── orders-consumer/       # Processa pedidos e gera PDFs com PDFKit
├── orders-service/        # API Spring Boot para registrar pedidos
├── stock-api/             # JSON Server simulando banco de dados
├── README.md
└── docs/                  # Imagens utilizadas no README.md
```

---

# Subindo com Docker Compose

Com o Docker e Docker Compose instalados. Para subir todos os serviços:



Após criação do arquivo **.env** do notify service execute na raiz do projeto:
```bash
docker-compose up --build -d
```

**(Antes disso é necessária a criação do .env como exemplificado na seção abaixo)**

---

## Configuração de E-mail no Notify Service

O `notify-service` usa o **Nodemailer** para envio de e-mails. É necessário criar um arquivo `.env` com as credenciais do remetente:

```env
USER_GMAIL="seu_email@gmail.com"
PASSWORD_GMAIL="sua_senha_de_aplicativo"
```

> 💡 **Importante:** A senha do Gmail deve ser uma **senha de aplicativo**, que pode ser gerada [neste link](https://myaccount.google.com/apppasswords) (com a autenticação em dois fatores ativada na conta).

---

## Funcionamento

### 1. Envio de Pedido via API

Endpoint:

```
POST http://localhost:8080/api/pedidos
```

Payload:

```json
{
  "cliente": {
    "nome": "Seu nome",
    "email": "seu@email.com"
  },
  "itens": [
    {
      "idProduto": "1",
      "nome": "Notebook Dell Inspiron 15",
      "quantidade": 6,
      "precoUnitario": 3499.90
    },
    {
      "idProduto": "2",
      "nome": "Smartphone Samsung Galaxy S23",
      "quantidade": 1,
      "precoUnitario": 3999.00
    }
  ]
}
```

Resposta:

```json
{
  "idPedido": "UUID",
  "dataCriacao": "data e hora",
  "cliente": {...},
  "itens": [...],
  "valorTotal": 24998.4,
  "status": "pendente"
}
```

---

## Fallback de Envio com Redis

A API tenta enviar o pedido diretamente para o **RabbitMQ**:

```java
OrderService.java:

try {
    rabbitTemplate.convertAndSend(
        RabbitMQConfig.EXCHANGE,
        RabbitMQConfig.ROUTING_KEY,
        order
    );
} catch (AmqpException e) {
    redisBuffer.save(order);
    System.err.println("RabbitMQ está offline. Pedido salvo no Redis.");
}
```
Caso não consiga conexão e levante uma exception, o **OrderService** irá salvar a mensagem no redis e então um `@Scheduled` job tenta reenviar os pedidos armazenados a cada 10 segundos:

```java
RedisOrderResender.java:

@Scheduled(fixedRate = 10000)
public void resendBufferedOrders() {
    Order order;
    while ((order = redisBuffer.getNextOrder()) != null) {
        try {
            rabbitTemplate.convertAndSend(...);
        } catch (Exception e) {
            redisBuffer.save(order);
            break;
        }
    }
}
```

---

## Processamento

1. **API envia pedido à `orders-exchange` → `orders-queue`**
2. **Notify Service** escuta a `orders-queue` e:
   - Envia e-mail: “Pedido Recebido”
   - Encaminha o pedido para a fila `waiting-processing`
3. **Orders Consumer** escuta a `waiting-processing` e:
   - Gera PDF com `pdfkit`
   - Retorna notificação ao `notify-service`
4. **Notify Service** envia e-mail: “Pedido Confirmado” com PDF em anexo

---

## Frontend Simples

Uma única página HTML serve como interface para simular o envio de pedidos de forma rápida e prática, conectando-se à API REST da aplicação.

---

## Mock de Estoque

O diretório `stock-api` contém um servidor **JSON Server** que simula um banco de dados de produtos para consulta e uso nos pedidos.

---
## Exemplo

**Email de pedido recebido:**
![alt text](./docs/PedidoRecebido.png "Pedido recebido")

**Email de pedido confirmado:**
![alt text](./docs/PedidoConfirmado.png "Pedido confirmado")
