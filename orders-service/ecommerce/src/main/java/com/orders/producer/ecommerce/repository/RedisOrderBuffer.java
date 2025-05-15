package com.orders.producer.ecommerce.repository;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.orders.producer.ecommerce.model.Order;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Repository;

@Repository
public class RedisOrderBuffer {

    private static final String KEY = "order-buffer";

    private final StringRedisTemplate stringRedisTemplate;
    private final ObjectMapper objectMapper;

    public RedisOrderBuffer(StringRedisTemplate stringRedisTemplate,
            ObjectMapper objectMapper) {
        this.stringRedisTemplate = stringRedisTemplate;
        this.objectMapper = objectMapper;
    }

    public void save(Order order) {
        try {
            String json = objectMapper.writeValueAsString(order);
            stringRedisTemplate.opsForList().rightPush(KEY, json);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Erro ao serializar Order para JSON", e);
        }
    }

    public Order getNextOrder() {
        String json = stringRedisTemplate.opsForList().leftPop(KEY);
        if (json == null) {
            return null;
        }
        try {
            return objectMapper.readValue(json, Order.class);
        } catch (JsonProcessingException e) {
            throw new RuntimeException("Erro ao desserializar JSON para Order", e);
        }
    }

    public Long size() {
        return stringRedisTemplate.opsForList().size(KEY);
    }
}
