-- Recursos exclusivos: veículo/ferramenta não podem estar em duas visitas sobrepostas.
ALTER TABLE "recurso_reserva" ADD CONSTRAINT "recurso_veiculo_sem_sobreposicao" EXCLUDE USING gist (veiculo_id WITH =, periodo WITH &&) WHERE (ativo AND veiculo_id IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "recurso_reserva" ADD CONSTRAINT "recurso_ferramenta_sem_sobreposicao" EXCLUDE USING gist (ferramenta_id WITH =, periodo WITH &&) WHERE (ativo AND ferramenta_id IS NOT NULL);
--> statement-breakpoint
ALTER TABLE "recurso_reserva" ADD CONSTRAINT "recurso_um_tipo" CHECK ((veiculo_id IS NULL) <> (ferramenta_id IS NULL));
--> statement-breakpoint
ALTER TABLE "autonomo_servico" ADD CONSTRAINT "autonomo_base_ck" CHECK (base IN ('servico','visita','pacote','adicional_retorno'));
--> statement-breakpoint
-- Um modelo ativo por tipo (versões antigas permanecem para as respostas que as usaram).
CREATE UNIQUE INDEX "checklist_modelo_ativo_uq" ON "checklist_modelo" (empresa_id, tipo) WHERE ativo;
