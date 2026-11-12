-- Restrições de consistência que o Drizzle não expressa diretamente.
CREATE EXTENSION IF NOT EXISTS btree_gist;
--> statement-breakpoint
ALTER TABLE "agenda_reserva" ADD CONSTRAINT "agenda_reserva_periodo_valido" CHECK (NOT isempty(periodo) AND lower(periodo) IS NOT NULL AND upper(periodo) IS NOT NULL);
--> statement-breakpoint
-- Nenhum profissional pode ter duas reservas ativas sobrepostas (visita ou indisponibilidade).
ALTER TABLE "agenda_reserva" ADD CONSTRAINT "agenda_reserva_sem_sobreposicao" EXCLUDE USING gist (profissional_id WITH =, periodo WITH &&) WHERE (ativo);
--> statement-breakpoint
CREATE UNIQUE INDEX "agenda_reserva_visita_prof_uq" ON "agenda_reserva" (visita_id, profissional_id) WHERE ativo AND visita_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_periodo_valido" CHECK (inicio_previsto IS NULL OR fim_previsto > inicio_previsto);
--> statement-breakpoint
ALTER TABLE "profissional" ADD CONSTRAINT "profissional_vinculo_ck" CHECK (vinculo IN ('autonomo','proprio'));
--> statement-breakpoint
ALTER TABLE "material_saldo" ADD CONSTRAINT "material_saldo_nao_negativo" CHECK (quantidade >= 0 AND reservado >= 0 AND reservado <= quantidade);
--> statement-breakpoint
ALTER TABLE "material_movimento" ADD CONSTRAINT "material_movimento_qtd_pos" CHECK (quantidade > 0 AND origem_posicao_id <> destino_posicao_id);
--> statement-breakpoint
ALTER TABLE "material_reserva" ADD CONSTRAINT "material_reserva_qtd_pos" CHECK (quantidade > 0);
--> statement-breakpoint
ALTER TABLE "material_divergencia" ADD CONSTRAINT "material_divergencia_qtd_pos" CHECK (quantidade > 0);
--> statement-breakpoint
ALTER TABLE "material_retalho" ADD CONSTRAINT "material_retalho_pos" CHECK (comprimento > 0);
--> statement-breakpoint
ALTER TABLE "parcela" ADD CONSTRAINT "parcela_valor_pos" CHECK (valor_centavos > 0);
--> statement-breakpoint
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_valores_ck" CHECK (valor_bruto_centavos >= 0 AND desconto_centavos >= 0 AND desconto_centavos <= valor_bruto_centavos);
--> statement-breakpoint
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_natureza_ck" CHECK (natureza IN ('receber','pagar'));
--> statement-breakpoint
ALTER TABLE "baixa" ADD CONSTRAINT "baixa_valor_ck" CHECK ((estorno_de_id IS NULL AND valor_centavos > 0) OR (estorno_de_id IS NOT NULL AND valor_centavos < 0));
--> statement-breakpoint
CREATE UNIQUE INDEX "baixa_um_estorno_uq" ON "baixa" (estorno_de_id) WHERE estorno_de_id IS NOT NULL AND status <> 'rejeitada';
--> statement-breakpoint
ALTER TABLE "transferencia_conta" ADD CONSTRAINT "transferencia_ck" CHECK (valor_centavos > 0 AND origem_conta_id <> destino_conta_id);
--> statement-breakpoint
ALTER TABLE "adiantamento" ADD CONSTRAINT "adiantamento_pos" CHECK (valor_centavos > 0);
--> statement-breakpoint
ALTER TABLE "autonomo_servico" ADD CONSTRAINT "autonomo_valor_ck" CHECK (valor_combinado_centavos IS NULL OR valor_combinado_centavos >= 0);
--> statement-breakpoint
-- Uma única movimentação pendente por ferramenta (evita duas entregas/transferências simultâneas).
CREATE UNIQUE INDEX "ferr_mov_pendente_uq" ON "ferramenta_movimento" (ferramenta_id) WHERE status = 'pendente';
--> statement-breakpoint
CREATE UNIQUE INDEX "pendencia_chave_aberta_uq" ON "pendencia" (empresa_id, chave) WHERE chave IS NOT NULL AND situacao IN ('aberta','em_andamento');
--> statement-breakpoint
CREATE UNIQUE INDEX "notificacao_aberta_uq" ON "notificacao" (usuario_id, chave_agrupamento) WHERE encerrada_em IS NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_item_ferr_uq" ON "checklist_resposta_item" (resposta_id, ferramenta_id) WHERE ferramenta_id IS NOT NULL;
--> statement-breakpoint
ALTER TABLE "veiculo_odometro" ADD CONSTRAINT "odometro_pos" CHECK (km >= 0);
