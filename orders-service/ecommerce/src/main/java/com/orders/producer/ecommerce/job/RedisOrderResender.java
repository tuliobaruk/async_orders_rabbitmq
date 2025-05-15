package com.orders.producer.ecommerce.job;

import com.orders.producer.ecommerce.config.RabbitMQConfig;
import com.orders.producer.ecommerce.model.Order;
import com.orders.producer.ecommerce.repository.RedisOrderBuffer;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

@Component
public class RedisOrderResender {

    private final RedisOrderBuffer redisBuffer;
    private final RabbitTemplate rabbitTemplate;

    public RedisOrderResender(RedisOrderBuffer redisBuffer, RabbitTemplate rabbitTemplate) {
        this.redisBuffer = redisBuffer;
        this.rabbitTemplate = rabbitTemplate;
    }

    @Scheduled(fixedRate = 10000)
    public void resendBufferedOrders() {
        Order order;
        while ((order = redisBuffer.getNextOrder()) != null) {
            try {
                rabbitTemplate.convertAndSend(
                    RabbitMQConfig.EXCHANGE,
                    RabbitMQConfig.ROUTING_KEY,
                    order
                );
                System.out.println("Pedido reenviado do Redis com sucesso: " + order.getIdPedido());
            } catch (Exception e) {
                redisBuffer.save(order);
                break;
            }
        }
    }
}
