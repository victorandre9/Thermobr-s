CREATE TABLE "recurso_reserva" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"visita_id" uuid NOT NULL,
	"veiculo_id" uuid,
	"ferramenta_id" uuid,
	"periodo" "tstzrange" NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "relatorio_atendimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"escopo" text NOT NULL,
	"os_id" uuid NOT NULL,
	"visita_id" uuid,
	"versao" integer NOT NULL,
	"conteudo" jsonb NOT NULL,
	"anexos_ids" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"emitido_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ciencia_situacao" text DEFAULT 'pendente' NOT NULL,
	"ciencia_nome" text,
	"ciencia_em" timestamp with time zone,
	"ciencia_observacao" text,
	"ciencia_registrada_por" uuid
);
--> statement-breakpoint
CREATE TABLE "rotina_execucao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid,
	"rotina" text NOT NULL,
	"chave" text NOT NULL,
	"status" text NOT NULL,
	"tentativa" integer DEFAULT 1 NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"finalizado_em" timestamp with time zone,
	"mensagem" text,
	"resultado" jsonb,
	"disparado_por" text DEFAULT 'agendador' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visita_liberacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"item" text NOT NULL,
	"justificativa" text NOT NULL,
	"autorizado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visita_participacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"chegada_em" timestamp with time zone,
	"saida_em" timestamp with time zone,
	"observacao" text,
	"registrado_por" uuid NOT NULL
);
--> statement-breakpoint
DROP INDEX "autonomo_servico_uq";--> statement-breakpoint
ALTER TABLE "autonomo_servico" ADD COLUMN "base" text DEFAULT 'servico' NOT NULL;--> statement-breakpoint
ALTER TABLE "autonomo_servico" ADD COLUMN "chave" text DEFAULT 'principal' NOT NULL;--> statement-breakpoint
ALTER TABLE "autonomo_servico" ADD COLUMN "visita_id" uuid;--> statement-breakpoint
ALTER TABLE "autonomo_servico" ADD COLUMN "coberto_por_id" uuid;--> statement-breakpoint
ALTER TABLE "baixa" ADD COLUMN "excecao_sem_aprovacao" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "checklist_modelo" ADD COLUMN "versao" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "checklist_resposta" ADD COLUMN "modelo_versao" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "checklist_resposta" ADD COLUMN "composicao_hash" text;--> statement-breakpoint
ALTER TABLE "checklist_resposta_item" ADD COLUMN "criticidade" text;--> statement-breakpoint
ALTER TABLE "checklist_resposta_item" ADD COLUMN "exige_foto_irregular" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "cliente" ADD COLUMN "versao" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "contrato" ADD COLUMN "versao" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ferramenta" ADD COLUMN "exclusiva" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "material" ADD COLUMN "versao" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "obrigacao" ADD COLUMN "legado" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "obrigacao" ADD COLUMN "versao" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "ordem_servico" ADD COLUMN "competencias_exigidas" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "ordem_servico" ADD COLUMN "qtd_profissionais" smallint DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "ordem_servico" ADD COLUMN "versao" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "parcela" ADD COLUMN "data_esperada" date;--> statement-breakpoint
ALTER TABLE "pendencia" ADD COLUMN "proxima_acao" text;--> statement-breakpoint
ALTER TABLE "pendencia" ADD COLUMN "aguardando_terceiro" text;--> statement-breakpoint
ALTER TABLE "profissional" ADD COLUMN "competencias" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "profissional" ADD COLUMN "regioes" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "veiculo" ADD COLUMN "versao" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "recurso_reserva" ADD CONSTRAINT "recurso_reserva_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurso_reserva" ADD CONSTRAINT "recurso_reserva_visita_id_visita_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visita"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurso_reserva" ADD CONSTRAINT "recurso_reserva_veiculo_id_veiculo_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurso_reserva" ADD CONSTRAINT "recurso_reserva_ferramenta_id_ferramenta_id_fk" FOREIGN KEY ("ferramenta_id") REFERENCES "public"."ferramenta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "recurso_reserva" ADD CONSTRAINT "recurso_reserva_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorio_atendimento" ADD CONSTRAINT "relatorio_atendimento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorio_atendimento" ADD CONSTRAINT "relatorio_atendimento_os_id_ordem_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordem_servico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorio_atendimento" ADD CONSTRAINT "relatorio_atendimento_visita_id_visita_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visita"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorio_atendimento" ADD CONSTRAINT "relatorio_atendimento_emitido_por_usuario_id_fk" FOREIGN KEY ("emitido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "relatorio_atendimento" ADD CONSTRAINT "relatorio_atendimento_ciencia_registrada_por_usuario_id_fk" FOREIGN KEY ("ciencia_registrada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "rotina_execucao" ADD CONSTRAINT "rotina_execucao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_liberacao" ADD CONSTRAINT "visita_liberacao_visita_id_visita_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visita"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_liberacao" ADD CONSTRAINT "visita_liberacao_autorizado_por_usuario_id_fk" FOREIGN KEY ("autorizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_participacao" ADD CONSTRAINT "visita_participacao_visita_id_visita_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visita"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_participacao" ADD CONSTRAINT "visita_participacao_profissional_id_profissional_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_participacao" ADD CONSTRAINT "visita_participacao_registrado_por_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "recurso_reserva_visita_idx" ON "recurso_reserva" USING btree ("visita_id");--> statement-breakpoint
CREATE UNIQUE INDEX "relatorio_versao_uq" ON "relatorio_atendimento" USING btree ("os_id","escopo",coalesce("visita_id", '00000000-0000-0000-0000-000000000000'::uuid),"versao");--> statement-breakpoint
CREATE UNIQUE INDEX "rotina_chave_uq" ON "rotina_execucao" USING btree ("rotina","chave");--> statement-breakpoint
CREATE UNIQUE INDEX "visita_lib_uq" ON "visita_liberacao" USING btree ("visita_id","item");--> statement-breakpoint
CREATE UNIQUE INDEX "visita_part_uq" ON "visita_participacao" USING btree ("visita_id","profissional_id");--> statement-breakpoint
CREATE UNIQUE INDEX "autonomo_servico_uq" ON "autonomo_servico" USING btree ("os_id","profissional_id","chave");