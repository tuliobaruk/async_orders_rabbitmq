package com.orders.producer.ecommerce.config;

import com.orders.producer.ecommerce.model.Order;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.SerializationFeature;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.data.redis.connection.RedisConnectionFactory;
import org.springframework.data.redis.core.RedisTemplate;
import org.springframework.data.redis.serializer.GenericJackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.Jackson2JsonRedisSerializer;
import org.springframework.data.redis.serializer.RedisSerializer;

@Configuration
public class RedisConfig {

    @Bean
    public RedisSerializer<Object> springSessionDefaultRedisSerializer() {
        ObjectMapper objectMapper = new ObjectMapper();
        objectMapper.registerModule(new JavaTimeModule());
        objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
        objectMapper.setSerializationInclusion(JsonInclude.Include.NON_NULL);
        return new GenericJackson2JsonRedisSerializer(objectMapper);
    }

@Bean
public RedisTemplate<String, Order> redisTemplate(RedisConnectionFactory connectionFactory) {
    RedisTemplate<String, Order> template = new RedisTemplate<>();
    template.setConnectionFactory(connectionFactory);

    Jackson2JsonRedisSerializer<Order> serializer = new Jackson2JsonRedisSerializer<>(Order.class);
    ObjectMapper objectMapper = new ObjectMapper();
    objectMapper.registerModule(new JavaTimeModule());
    objectMapper.disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    objectMapper.setSerializationInclusion(JsonInclude.Include.NON_NULL);
    serializer.setObjectMapper(objectMapper);

    template.setKeySerializer(RedisSerializer.string());
    template.setValueSerializer(serializer);
    template.afterPropertiesSet();
    return template;
}



}
