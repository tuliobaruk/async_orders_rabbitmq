package com.orders.producer.ecommerce.controller;

import com.orders.producer.ecommerce.model.Order;
import com.orders.producer.ecommerce.service.OrderService;

import jakarta.validation.Valid;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/pedidos")
public class OrderController {

    private final OrderService orderService;

    public OrderController(OrderService orderService) {
        this.orderService = orderService;
    }

    @CrossOrigin(origins = "*")
    @PostMapping
    public ResponseEntity<Order> createOrder(@Valid @RequestBody Order order) {
        orderService.sendOrder(order);
        return ResponseEntity.ok(order);
    }
}
