package com.orders.producer.model;

import java.math.BigDecimal;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import lombok.AllArgsConstructor;
import lombok.Data;
import lombok.NoArgsConstructor;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Item {
    @NotBlank(message = "ID do produto é obrigatório")
    private String idProduto;

    @NotBlank(message = "Nome do produto é obrigatório")
    private String nome;

    @Min(value = 1, message = "Quantidade deve ser no mínimo 1")
    private int quantidade;

    @DecimalMin(value = "0.0", inclusive = false, message = "Preço unitário deve ser positivo")
    private BigDecimal precoUnitario;
}