package com.orders.producer.ecommerce.repository;

import com.orders.producer.ecommerce.model.Order;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.stereotype.Repository;


@Repository
public class RedisOrderBuffer {

    private static final String KEY = "order-buffer";

    private final RedisTemplate<String, Order> redisTemplate;

    public RedisOrderBuffer(RedisTemplate<String, Order> redisTemplate) {
        this.redisTemplate = redisTemplate;
    }

    public void save(Order order) {
        redisTemplate.opsForList().rightPush(KEY, order);
    }

    public Order getNextOrder() {
        return redisTemplate.opsForList().leftPop(KEY);
    }

    public Long size() {
        return redisTemplate.opsForList().size(KEY);
    }
}
