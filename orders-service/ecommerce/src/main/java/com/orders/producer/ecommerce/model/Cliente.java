package com.orders.producer.ecommerce.model;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Email;

import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Cliente {
    @NotBlank(message = "Nome do cliente é obrigatório")
    private String nome;

    @Email(message = "Email inválido")
    private String email;
}