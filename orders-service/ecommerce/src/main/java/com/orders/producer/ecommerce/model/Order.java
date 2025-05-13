package com.orders.producer.ecommerce.model;

import jakarta.validation.constraints.*;
import lombok.*;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;

@Data
@NoArgsConstructor
@AllArgsConstructor
public class Order {

    private String idPedido;

    private LocalDateTime dataCriacao;

    @NotNull(message = "Cliente não pode ser nulo")
    private Cliente cliente;

    @NotEmpty(message = "Lista de itens não pode ser vazia")
    private List<Item> itens;

    private BigDecimal valorTotal;

    private String status;

}
