package com.orders.producer.ecommerce.service;

import com.orders.producer.ecommerce.config.RabbitMQConfig;
import com.orders.producer.ecommerce.model.Order;
import com.orders.producer.ecommerce.repository.RedisOrderBuffer;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Service;

import java.math.BigDecimal;
import java.util.UUID;

@Service
public class OrderService {

    private final RabbitTemplate rabbitTemplate;
    private final RedisOrderBuffer redisBuffer;

    public OrderService(RabbitTemplate rabbitTemplate, RedisOrderBuffer redisBuffer) {
        this.rabbitTemplate = rabbitTemplate;
        this.redisBuffer = redisBuffer;
    }

    public void sendOrder(Order order) {
        order.setIdPedido(UUID.randomUUID().toString());
        order.setDataCriacao(java.time.LocalDateTime.now());

        BigDecimal total = order.getItens().stream()
                .map(item -> item.getPrecoUnitario().multiply(BigDecimal.valueOf(item.getQuantidade())))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
        order.setValorTotal(total);
        order.setStatus("pendente");

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
    }
}
