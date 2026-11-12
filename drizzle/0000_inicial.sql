CREATE TABLE "adiantamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"data" date NOT NULL,
	"descricao" text,
	"obrigacao_id" uuid,
	"resumo_id" uuid,
	"registrado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_reserva" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"visita_id" uuid,
	"tipo" text NOT NULL,
	"papel_na_visita" text,
	"periodo" "tstzrange" NOT NULL,
	"motivo" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "agenda_vaga" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"hora_inicio" time NOT NULL,
	"hora_fim" time NOT NULL,
	"dias_semana" jsonb DEFAULT '[1,2,3,4,5]'::jsonb NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "anexo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"entidade_tipo" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	"categoria" text DEFAULT 'foto' NOT NULL,
	"nome_arquivo" text NOT NULL,
	"mime" text NOT NULL,
	"tamanho_bytes" integer NOT NULL,
	"chave_storage" text NOT NULL,
	"enviado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "aprovacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"entidade_tipo" text NOT NULL,
	"entidade_id" uuid NOT NULL,
	"acao" text NOT NULL,
	"decisao" text NOT NULL,
	"solicitado_por" uuid,
	"decidido_por" uuid NOT NULL,
	"autoaprovacao" boolean DEFAULT false NOT NULL,
	"motivo" text,
	"valor_centavos" bigint,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "auditoria" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid,
	"acao" text NOT NULL,
	"entidade_tipo" text NOT NULL,
	"entidade_id" text,
	"motivo" text,
	"antes" jsonb,
	"depois" jsonb,
	"sensivel" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "autonomo_servico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"os_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"descricao" text NOT NULL,
	"valor_combinado_centavos" bigint,
	"valor_definido_por" uuid,
	"situacao" text DEFAULT 'aguardando_valor' NOT NULL,
	"conferido_por" uuid,
	"conferido_em" timestamp with time zone,
	"liberado_por" uuid,
	"liberado_em" timestamp with time zone,
	"resumo_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "baixa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"parcela_id" uuid NOT NULL,
	"conta_id" uuid NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"data_pagamento" date NOT NULL,
	"forma" text,
	"status" text DEFAULT 'aguardando_conferencia' NOT NULL,
	"estorno_de_id" uuid,
	"motivo" text,
	"registrada_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmada_por" uuid,
	"confirmada_em" timestamp with time zone,
	"autoconfirmacao" boolean DEFAULT false NOT NULL,
	"chave_idempotencia" text
);
--> statement-breakpoint
CREATE TABLE "categoria_financeira" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"natureza" text NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"restrita" boolean DEFAULT false NOT NULL,
	"dupla_aprovacao_acima_centavos" bigint,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_modelo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"validade_horas" integer DEFAULT 12 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_modelo_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"modelo_id" uuid NOT NULL,
	"ordem" integer DEFAULT 0 NOT NULL,
	"descricao" text NOT NULL,
	"exige_foto_irregular" boolean DEFAULT false NOT NULL,
	"criticidade" text DEFAULT 'media' NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "checklist_resposta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"modelo_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"veiculo_id" uuid,
	"profissional_id" uuid,
	"usuario_id" uuid NOT NULL,
	"km" integer,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"valido_ate" timestamp with time zone NOT NULL,
	"observacoes" text,
	"chave_idempotencia" text
);
--> statement-breakpoint
CREATE TABLE "checklist_resposta_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"resposta_id" uuid NOT NULL,
	"item_id" uuid,
	"ferramenta_id" uuid,
	"descricao" text NOT NULL,
	"resultado" text NOT NULL,
	"observacao" text,
	"pendencia_id" uuid
);
--> statement-breakpoint
CREATE TABLE "cliente" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text DEFAULT 'PJ' NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"email" text,
	"telefone" text,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente_contato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"telefone" text,
	"email" text,
	"cargo" text,
	"principal" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cliente_local" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"logradouro" text,
	"numero" text,
	"complemento" text,
	"bairro" text,
	"cidade" text,
	"uf" text,
	"cep" text,
	"instrucoes_acesso" text,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cobranca_contato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"obrigacao_id" uuid,
	"cliente_id" uuid NOT NULL,
	"canal" text NOT NULL,
	"resumo" text NOT NULL,
	"responsavel_id" uuid NOT NULL,
	"proxima_acao" text,
	"proxima_acao_em" date,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compra" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"fornecedor_id" uuid,
	"os_id" uuid,
	"data" date NOT NULL,
	"documento" text,
	"situacao" text DEFAULT 'registrada' NOT NULL,
	"obrigacao_id" uuid,
	"registrada_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "compra_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"compra_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"custo_unitario_centavos" bigint NOT NULL,
	"destino_posicao_id" uuid
);
--> statement-breakpoint
CREATE TABLE "conta_financeira" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"tipo" text DEFAULT 'banco' NOT NULL,
	"saldo_inicial_centavos" bigint,
	"saldo_inicial_data" date,
	"saldo_inicial_por" uuid,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contador" (
	"empresa_id" uuid NOT NULL,
	"chave" text NOT NULL,
	"valor" bigint DEFAULT 0 NOT NULL,
	CONSTRAINT "contador_empresa_id_chave_pk" PRIMARY KEY("empresa_id","chave")
);
--> statement-breakpoint
CREATE TABLE "contrato" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"cliente_id" uuid NOT NULL,
	"numero" text NOT NULL,
	"descricao" text,
	"cobertura" text,
	"valor_mensal_centavos" bigint,
	"inicio" date NOT NULL,
	"fim" date,
	"dia_vencimento" smallint DEFAULT 10 NOT NULL,
	"visitas_incluidas_mes" smallint,
	"status" text DEFAULT 'ativo' NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "contrato_local" (
	"contrato_id" uuid NOT NULL,
	"local_id" uuid NOT NULL,
	CONSTRAINT "contrato_local_contrato_id_local_id_pk" PRIMARY KEY("contrato_id","local_id")
);
--> statement-breakpoint
CREATE TABLE "empresa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "equipamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"cliente_id" uuid NOT NULL,
	"local_id" uuid,
	"tipo" text NOT NULL,
	"marca" text,
	"modelo" text,
	"capacidade_btu" integer,
	"numero_serie" text,
	"identificacao" text,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ferramenta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"tipo" text DEFAULT 'ferramenta' NOT NULL,
	"conjunto_id" uuid,
	"condicao" text DEFAULT 'boa' NOT NULL,
	"situacao" text DEFAULT 'disponivel' NOT NULL,
	"custodiante_profissional_id" uuid,
	"custodiante_veiculo_id" uuid,
	"custodia_desde" timestamp with time zone,
	"os_reserva_id" uuid,
	"versao" integer DEFAULT 0 NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ferramenta_movimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"ferramenta_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"status" text NOT NULL,
	"de_profissional_id" uuid,
	"para_profissional_id" uuid,
	"veiculo_id" uuid,
	"os_id" uuid,
	"visita_id" uuid,
	"condicao" text,
	"observacao" text,
	"registrado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmado_por" uuid,
	"confirmado_em" timestamp with time zone,
	"chave_idempotencia" text
);
--> statement-breakpoint
CREATE TABLE "fornecedor" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"documento" text,
	"telefone" text,
	"email" text,
	"observacoes" text,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integracao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"provedor" text NOT NULL,
	"status" text DEFAULT 'aguardando_validacao' NOT NULL,
	"modo" text,
	"ultimo_teste_em" timestamp with time zone,
	"ultimo_teste_resultado" text,
	"observacao" text,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "login_tentativa" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" text NOT NULL,
	"sucesso" boolean NOT NULL,
	"em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"categoria" text,
	"especificacao" text,
	"unidade" text NOT NULL,
	"fracionavel" boolean DEFAULT false NOT NULL,
	"controla_retalho" boolean DEFAULT false NOT NULL,
	"estoque_minimo" numeric(14, 3),
	"custo_referencia_centavos" bigint,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_divergencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"posicao_id" uuid,
	"profissional_id" uuid,
	"os_id" uuid,
	"tipo" text NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"descricao" text,
	"situacao" text DEFAULT 'aberta' NOT NULL,
	"aberta_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"justificativa" text,
	"decidida_por" uuid,
	"decidida_em" timestamp with time zone,
	"autoaprovacao" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_movimento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"status" text NOT NULL,
	"origem_posicao_id" uuid NOT NULL,
	"destino_posicao_id" uuid NOT NULL,
	"quantidade_informada" numeric(14, 3),
	"quantidade" numeric(14, 3) NOT NULL,
	"unidade" text NOT NULL,
	"os_id" uuid,
	"visita_id" uuid,
	"compra_id" uuid,
	"divergencia_id" uuid,
	"retalho" boolean DEFAULT false NOT NULL,
	"observacao" text,
	"registrado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"confirmado_por" uuid,
	"confirmado_em" timestamp with time zone,
	"chave_idempotencia" text
);
--> statement-breakpoint
CREATE TABLE "material_posicao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"nome" text NOT NULL,
	"veiculo_id" uuid,
	"profissional_id" uuid,
	"responsavel_profissional_id" uuid,
	"virtual" boolean DEFAULT false NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_reserva" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"posicao_id" uuid NOT NULL,
	"os_id" uuid NOT NULL,
	"quantidade" numeric(14, 3) NOT NULL,
	"situacao" text DEFAULT 'ativa' NOT NULL,
	"criado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_retalho" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"posicao_id" uuid NOT NULL,
	"comprimento" numeric(14, 3) NOT NULL,
	"situacao" text DEFAULT 'disponivel' NOT NULL,
	"movimento_origem_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "material_saldo" (
	"material_id" uuid NOT NULL,
	"posicao_id" uuid NOT NULL,
	"quantidade" numeric(14, 3) DEFAULT '0' NOT NULL,
	"reservado" numeric(14, 3) DEFAULT '0' NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "material_saldo_material_id_posicao_id_pk" PRIMARY KEY("material_id","posicao_id")
);
--> statement-breakpoint
CREATE TABLE "notificacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"chave_agrupamento" text NOT NULL,
	"titulo" text NOT NULL,
	"mensagem" text,
	"link" text,
	"prioridade" text DEFAULT 'media' NOT NULL,
	"vencimento" date,
	"ocorrencias" integer DEFAULT 1 NOT NULL,
	"lida_em" timestamp with time zone,
	"encerrada_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "obrigacao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"natureza" text NOT NULL,
	"categoria_id" uuid NOT NULL,
	"cliente_id" uuid,
	"fornecedor_id" uuid,
	"profissional_id" uuid,
	"beneficiario_nome" text,
	"descricao" text NOT NULL,
	"competencia" date,
	"valor_bruto_centavos" bigint NOT NULL,
	"desconto_centavos" bigint DEFAULT 0 NOT NULL,
	"desconto_autorizado_por" uuid,
	"origem_tipo" text NOT NULL,
	"origem_id" uuid,
	"os_id" uuid,
	"veiculo_id" uuid,
	"chave_unicidade" text,
	"situacao_aprovacao" text DEFAULT 'aguardando_aprovacao' NOT NULL,
	"conta_prevista_id" uuid,
	"documento" text,
	"nota_fiscal_ref" text,
	"criado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"cancelada_por" uuid,
	"cancelada_motivo" text,
	"demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ordem_servico" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"origem" text NOT NULL,
	"pedido_externo_id" uuid,
	"referencia_externa" text,
	"contrato_id" uuid,
	"os_origem_id" uuid,
	"cliente_id" uuid NOT NULL,
	"local_id" uuid,
	"contato_id" uuid,
	"descricao" text NOT NULL,
	"prioridade" text DEFAULT 'normal' NOT NULL,
	"observacoes" text,
	"situacao_comercial" text DEFAULT 'rascunho' NOT NULL,
	"etapa" text DEFAULT 'aberta' NOT NULL,
	"etapa_desde" timestamp with time zone DEFAULT now() NOT NULL,
	"motivo_etapa" text,
	"situacao_material" text DEFAULT 'nao_avaliado' NOT NULL,
	"situacao_conferencia" text DEFAULT 'nao_aplicavel' NOT NULL,
	"responsavel_resolucao_id" uuid,
	"proxima_acao" text,
	"proxima_acao_em" date,
	"aberta_por" uuid NOT NULL,
	"conferida_por" uuid,
	"conferida_em" timestamp with time zone,
	"encerrada_em" timestamp with time zone,
	"cancelada_motivo" text,
	"demo" boolean DEFAULT false NOT NULL,
	"ultimo_avanco_em" timestamp with time zone DEFAULT now() NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "os_equipamento" (
	"os_id" uuid NOT NULL,
	"equipamento_id" uuid NOT NULL,
	CONSTRAINT "os_equipamento_os_id_equipamento_id_pk" PRIMARY KEY("os_id","equipamento_id")
);
--> statement-breakpoint
CREATE TABLE "os_item" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"os_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"descricao" text NOT NULL,
	"material_id" uuid,
	"quantidade" numeric(14, 3) DEFAULT '1' NOT NULL,
	"unidade" text DEFAULT 'un' NOT NULL,
	"preco_unitario_centavos" bigint,
	"custo_unitario_centavos" bigint,
	"situacao" text DEFAULT 'previsto' NOT NULL,
	"incluido_contrato" boolean DEFAULT false NOT NULL,
	"solicitado_por" uuid,
	"visita_id" uuid,
	"decidido_por" uuid,
	"decidido_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papel" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"codigo" text NOT NULL,
	"nome" text NOT NULL,
	"descricao" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"sistema" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "papel_permissao" (
	"papel_id" uuid NOT NULL,
	"permissao" text NOT NULL,
	"escopo" text NOT NULL,
	CONSTRAINT "papel_permissao_papel_id_permissao_pk" PRIMARY KEY("papel_id","permissao")
);
--> statement-breakpoint
CREATE TABLE "parcela" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"obrigacao_id" uuid NOT NULL,
	"numero" integer NOT NULL,
	"descricao" text,
	"vencimento" date NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"cancelada" boolean DEFAULT false NOT NULL,
	"cancelada_motivo" text
);
--> statement-breakpoint
CREATE TABLE "pedido_externo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"origem" text NOT NULL,
	"id_externo" text NOT NULL,
	"versao_externa" text,
	"atualizado_externo_em" timestamp with time zone,
	"dados_originais" jsonb NOT NULL,
	"hash_conteudo" text NOT NULL,
	"cliente_id" uuid,
	"situacao" text DEFAULT 'para_programar' NOT NULL,
	"motivo_conferencia" text,
	"os_id" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pedido_externo_versao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"pedido_id" uuid NOT NULL,
	"hash_conteudo" text NOT NULL,
	"versao_externa" text,
	"dados" jsonb NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pendencia" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"titulo" text NOT NULL,
	"descricao" text,
	"prioridade" text DEFAULT 'media' NOT NULL,
	"entidade_tipo" text,
	"entidade_id" uuid,
	"os_id" uuid,
	"visita_id" uuid,
	"veiculo_id" uuid,
	"ferramenta_id" uuid,
	"profissional_id" uuid,
	"responsavel_id" uuid,
	"prazo" date,
	"situacao" text DEFAULT 'aberta' NOT NULL,
	"chave" text,
	"aberta_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"resolvida_por" uuid,
	"resolvida_em" timestamp with time zone,
	"resolucao" text,
	"liberacao_excepcional" text
);
--> statement-breakpoint
CREATE TABLE "pneu" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"veiculo_id" uuid,
	"identificacao" text NOT NULL,
	"marca" text,
	"modelo" text,
	"posicao" text,
	"instalado_em" date,
	"km_instalacao" integer,
	"retirado_em" date,
	"km_retirada" integer,
	"motivo_retirada" text,
	"situacao" text DEFAULT 'instalado' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "profissional" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"usuario_id" uuid,
	"nome" text NOT NULL,
	"vinculo" text NOT NULL,
	"funcao" text DEFAULT 'tecnico' NOT NULL,
	"telefone" text,
	"veiculo_id" uuid,
	"ativo" boolean DEFAULT true NOT NULL,
	"observacoes" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "redefinicao_senha" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"usado_em" timestamp with time zone,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "resumo_semanal_autonomo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"profissional_id" uuid NOT NULL,
	"semana_inicio" date NOT NULL,
	"data_prevista_pagamento" date NOT NULL,
	"total_servicos_centavos" bigint NOT NULL,
	"total_adiantamentos_centavos" bigint NOT NULL,
	"liquido_centavos" bigint NOT NULL,
	"situacao" text DEFAULT 'preparado' NOT NULL,
	"obrigacao_id" uuid,
	"preparado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sessao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"usuario_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"expira_em" timestamp with time zone NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"ultimo_uso_em" timestamp with time zone DEFAULT now() NOT NULL,
	"user_agent" text,
	"revogada_em" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE "sincronizacao_log" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"provedor" text NOT NULL,
	"tipo" text NOT NULL,
	"status" text NOT NULL,
	"id_externo" text,
	"mensagem" text,
	"tentativa" integer DEFAULT 1 NOT NULL,
	"payload" jsonb,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"reprocessado_por" uuid
);
--> statement-breakpoint
CREATE TABLE "transferencia_conta" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"origem_conta_id" uuid NOT NULL,
	"destino_conta_id" uuid NOT NULL,
	"valor_centavos" bigint NOT NULL,
	"data" date NOT NULL,
	"descricao" text,
	"status" text DEFAULT 'aguardando_conferencia' NOT NULL,
	"registrada_por" uuid NOT NULL,
	"confirmada_por" uuid,
	"confirmada_em" timestamp with time zone,
	"chave_idempotencia" text,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"nome" text NOT NULL,
	"email" text NOT NULL,
	"senha_hash" text,
	"ativo" boolean DEFAULT true NOT NULL,
	"demo" boolean DEFAULT false NOT NULL,
	"deve_trocar_senha" boolean DEFAULT false NOT NULL,
	"ultimo_login_em" timestamp with time zone,
	"desativado_em" timestamp with time zone,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usuario_papel" (
	"usuario_id" uuid NOT NULL,
	"papel_id" uuid NOT NULL,
	"concedido_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_papel_usuario_id_papel_id_pk" PRIMARY KEY("usuario_id","papel_id")
);
--> statement-breakpoint
CREATE TABLE "usuario_permissao" (
	"usuario_id" uuid NOT NULL,
	"permissao" text NOT NULL,
	"escopo" text NOT NULL,
	"concedido_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "usuario_permissao_usuario_id_permissao_pk" PRIMARY KEY("usuario_id","permissao")
);
--> statement-breakpoint
CREATE TABLE "veiculo" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"identificacao" text NOT NULL,
	"placa" text,
	"modelo" text,
	"ano" smallint,
	"responsavel_profissional_id" uuid,
	"odometro_km" integer,
	"odometro_atualizado_em" timestamp with time zone,
	"parametros_manutencao" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"ativo" boolean DEFAULT true NOT NULL,
	"demo" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veiculo_manutencao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"veiculo_id" uuid NOT NULL,
	"tipo" text NOT NULL,
	"data" date NOT NULL,
	"km" integer,
	"descricao" text,
	"fornecedor_id" uuid,
	"obrigacao_id" uuid,
	"registrado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "veiculo_odometro" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"veiculo_id" uuid NOT NULL,
	"km" integer NOT NULL,
	"fonte" text NOT NULL,
	"correcao" boolean DEFAULT false NOT NULL,
	"motivo" text,
	"autorizado_por" uuid,
	"registrado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visita" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"os_id" uuid NOT NULL,
	"sequencia" integer NOT NULL,
	"tipo" text DEFAULT 'atendimento' NOT NULL,
	"inicio_previsto" timestamp with time zone,
	"fim_previsto" timestamp with time zone,
	"situacao" text DEFAULT 'nao_agendada' NOT NULL,
	"resultado" text,
	"motivo_resultado" text,
	"comentario_resultado" text,
	"instrucoes" text,
	"veiculo_id" uuid,
	"checkin_em" timestamp with time zone,
	"checkin_por" uuid,
	"checkout_em" timestamp with time zone,
	"checkout_por" uuid,
	"pendencia_descricao" text,
	"proxima_acao" text,
	"destino_materiais" text,
	"conferida_por" uuid,
	"conferida_em" timestamp with time zone,
	"cancelada_motivo" text,
	"criado_por" uuid,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visita_execucao" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"equipamento_id" uuid,
	"diagnostico" text,
	"servico_realizado" text,
	"teste_funcionamento" text DEFAULT 'nao_testado' NOT NULL,
	"resultado" text,
	"observacoes" text,
	"atualizado_por" uuid,
	"atualizado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "visita_reagendamento" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"visita_id" uuid NOT NULL,
	"de_inicio" timestamp with time zone,
	"de_fim" timestamp with time zone,
	"para_inicio" timestamp with time zone,
	"para_fim" timestamp with time zone,
	"equipe_antes" jsonb,
	"equipe_depois" jsonb,
	"motivo" text NOT NULL,
	"por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "adiantamento" ADD CONSTRAINT "adiantamento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adiantamento" ADD CONSTRAINT "adiantamento_profissional_id_profissional_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "adiantamento" ADD CONSTRAINT "adiantamento_registrado_por_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_reserva" ADD CONSTRAINT "agenda_reserva_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_reserva" ADD CONSTRAINT "agenda_reserva_profissional_id_profissional_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_reserva" ADD CONSTRAINT "agenda_reserva_visita_id_visita_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visita"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_reserva" ADD CONSTRAINT "agenda_reserva_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "agenda_vaga" ADD CONSTRAINT "agenda_vaga_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexo" ADD CONSTRAINT "anexo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anexo" ADD CONSTRAINT "anexo_enviado_por_usuario_id_fk" FOREIGN KEY ("enviado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aprovacao" ADD CONSTRAINT "aprovacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aprovacao" ADD CONSTRAINT "aprovacao_solicitado_por_usuario_id_fk" FOREIGN KEY ("solicitado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "aprovacao" ADD CONSTRAINT "aprovacao_decidido_por_usuario_id_fk" FOREIGN KEY ("decidido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "auditoria" ADD CONSTRAINT "auditoria_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomo_servico" ADD CONSTRAINT "autonomo_servico_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomo_servico" ADD CONSTRAINT "autonomo_servico_os_id_ordem_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordem_servico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomo_servico" ADD CONSTRAINT "autonomo_servico_profissional_id_profissional_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomo_servico" ADD CONSTRAINT "autonomo_servico_valor_definido_por_usuario_id_fk" FOREIGN KEY ("valor_definido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomo_servico" ADD CONSTRAINT "autonomo_servico_conferido_por_usuario_id_fk" FOREIGN KEY ("conferido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "autonomo_servico" ADD CONSTRAINT "autonomo_servico_liberado_por_usuario_id_fk" FOREIGN KEY ("liberado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baixa" ADD CONSTRAINT "baixa_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baixa" ADD CONSTRAINT "baixa_parcela_id_parcela_id_fk" FOREIGN KEY ("parcela_id") REFERENCES "public"."parcela"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baixa" ADD CONSTRAINT "baixa_conta_id_conta_financeira_id_fk" FOREIGN KEY ("conta_id") REFERENCES "public"."conta_financeira"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baixa" ADD CONSTRAINT "baixa_registrada_por_usuario_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "baixa" ADD CONSTRAINT "baixa_confirmada_por_usuario_id_fk" FOREIGN KEY ("confirmada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "categoria_financeira" ADD CONSTRAINT "categoria_financeira_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_modelo" ADD CONSTRAINT "checklist_modelo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_modelo_item" ADD CONSTRAINT "checklist_modelo_item_modelo_id_checklist_modelo_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."checklist_modelo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_resposta" ADD CONSTRAINT "checklist_resposta_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_resposta" ADD CONSTRAINT "checklist_resposta_modelo_id_checklist_modelo_id_fk" FOREIGN KEY ("modelo_id") REFERENCES "public"."checklist_modelo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_resposta" ADD CONSTRAINT "checklist_resposta_veiculo_id_veiculo_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_resposta" ADD CONSTRAINT "checklist_resposta_profissional_id_profissional_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_resposta" ADD CONSTRAINT "checklist_resposta_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_resposta_item" ADD CONSTRAINT "checklist_resposta_item_resposta_id_checklist_resposta_id_fk" FOREIGN KEY ("resposta_id") REFERENCES "public"."checklist_resposta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "checklist_resposta_item" ADD CONSTRAINT "checklist_resposta_item_item_id_checklist_modelo_item_id_fk" FOREIGN KEY ("item_id") REFERENCES "public"."checklist_modelo_item"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente" ADD CONSTRAINT "cliente_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_contato" ADD CONSTRAINT "cliente_contato_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cliente_local" ADD CONSTRAINT "cliente_local_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranca_contato" ADD CONSTRAINT "cobranca_contato_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranca_contato" ADD CONSTRAINT "cobranca_contato_obrigacao_id_obrigacao_id_fk" FOREIGN KEY ("obrigacao_id") REFERENCES "public"."obrigacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranca_contato" ADD CONSTRAINT "cobranca_contato_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cobranca_contato" ADD CONSTRAINT "cobranca_contato_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_fornecedor_id_fornecedor_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra" ADD CONSTRAINT "compra_registrada_por_usuario_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_item" ADD CONSTRAINT "compra_item_compra_id_compra_id_fk" FOREIGN KEY ("compra_id") REFERENCES "public"."compra"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_item" ADD CONSTRAINT "compra_item_material_id_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "compra_item" ADD CONSTRAINT "compra_item_destino_posicao_id_material_posicao_id_fk" FOREIGN KEY ("destino_posicao_id") REFERENCES "public"."material_posicao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conta_financeira" ADD CONSTRAINT "conta_financeira_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "conta_financeira" ADD CONSTRAINT "conta_financeira_saldo_inicial_por_usuario_id_fk" FOREIGN KEY ("saldo_inicial_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contador" ADD CONSTRAINT "contador_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato" ADD CONSTRAINT "contrato_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_local" ADD CONSTRAINT "contrato_local_contrato_id_contrato_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contrato"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contrato_local" ADD CONSTRAINT "contrato_local_local_id_cliente_local_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."cliente_local"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipamento" ADD CONSTRAINT "equipamento_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipamento" ADD CONSTRAINT "equipamento_local_id_cliente_local_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."cliente_local"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferramenta" ADD CONSTRAINT "ferramenta_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferramenta" ADD CONSTRAINT "ferramenta_custodiante_profissional_id_profissional_id_fk" FOREIGN KEY ("custodiante_profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferramenta" ADD CONSTRAINT "ferramenta_custodiante_veiculo_id_veiculo_id_fk" FOREIGN KEY ("custodiante_veiculo_id") REFERENCES "public"."veiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferramenta_movimento" ADD CONSTRAINT "ferramenta_movimento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferramenta_movimento" ADD CONSTRAINT "ferramenta_movimento_ferramenta_id_ferramenta_id_fk" FOREIGN KEY ("ferramenta_id") REFERENCES "public"."ferramenta"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferramenta_movimento" ADD CONSTRAINT "ferramenta_movimento_de_profissional_id_profissional_id_fk" FOREIGN KEY ("de_profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferramenta_movimento" ADD CONSTRAINT "ferramenta_movimento_para_profissional_id_profissional_id_fk" FOREIGN KEY ("para_profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferramenta_movimento" ADD CONSTRAINT "ferramenta_movimento_veiculo_id_veiculo_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferramenta_movimento" ADD CONSTRAINT "ferramenta_movimento_registrado_por_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ferramenta_movimento" ADD CONSTRAINT "ferramenta_movimento_confirmado_por_usuario_id_fk" FOREIGN KEY ("confirmado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "fornecedor" ADD CONSTRAINT "fornecedor_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integracao" ADD CONSTRAINT "integracao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material" ADD CONSTRAINT "material_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_divergencia" ADD CONSTRAINT "material_divergencia_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_divergencia" ADD CONSTRAINT "material_divergencia_material_id_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_divergencia" ADD CONSTRAINT "material_divergencia_posicao_id_material_posicao_id_fk" FOREIGN KEY ("posicao_id") REFERENCES "public"."material_posicao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_divergencia" ADD CONSTRAINT "material_divergencia_profissional_id_profissional_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_divergencia" ADD CONSTRAINT "material_divergencia_aberta_por_usuario_id_fk" FOREIGN KEY ("aberta_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_divergencia" ADD CONSTRAINT "material_divergencia_decidida_por_usuario_id_fk" FOREIGN KEY ("decidida_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_movimento" ADD CONSTRAINT "material_movimento_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_movimento" ADD CONSTRAINT "material_movimento_material_id_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_movimento" ADD CONSTRAINT "material_movimento_origem_posicao_id_material_posicao_id_fk" FOREIGN KEY ("origem_posicao_id") REFERENCES "public"."material_posicao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_movimento" ADD CONSTRAINT "material_movimento_destino_posicao_id_material_posicao_id_fk" FOREIGN KEY ("destino_posicao_id") REFERENCES "public"."material_posicao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_movimento" ADD CONSTRAINT "material_movimento_registrado_por_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_movimento" ADD CONSTRAINT "material_movimento_confirmado_por_usuario_id_fk" FOREIGN KEY ("confirmado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_posicao" ADD CONSTRAINT "material_posicao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_posicao" ADD CONSTRAINT "material_posicao_veiculo_id_veiculo_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_posicao" ADD CONSTRAINT "material_posicao_profissional_id_profissional_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_posicao" ADD CONSTRAINT "material_posicao_responsavel_profissional_id_profissional_id_fk" FOREIGN KEY ("responsavel_profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_reserva" ADD CONSTRAINT "material_reserva_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_reserva" ADD CONSTRAINT "material_reserva_material_id_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_reserva" ADD CONSTRAINT "material_reserva_posicao_id_material_posicao_id_fk" FOREIGN KEY ("posicao_id") REFERENCES "public"."material_posicao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_reserva" ADD CONSTRAINT "material_reserva_os_id_ordem_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordem_servico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_reserva" ADD CONSTRAINT "material_reserva_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_retalho" ADD CONSTRAINT "material_retalho_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_retalho" ADD CONSTRAINT "material_retalho_material_id_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_retalho" ADD CONSTRAINT "material_retalho_posicao_id_material_posicao_id_fk" FOREIGN KEY ("posicao_id") REFERENCES "public"."material_posicao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_saldo" ADD CONSTRAINT "material_saldo_material_id_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_saldo" ADD CONSTRAINT "material_saldo_posicao_id_material_posicao_id_fk" FOREIGN KEY ("posicao_id") REFERENCES "public"."material_posicao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notificacao" ADD CONSTRAINT "notificacao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_categoria_id_categoria_financeira_id_fk" FOREIGN KEY ("categoria_id") REFERENCES "public"."categoria_financeira"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_fornecedor_id_fornecedor_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_profissional_id_profissional_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_desconto_autorizado_por_usuario_id_fk" FOREIGN KEY ("desconto_autorizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_conta_prevista_id_conta_financeira_id_fk" FOREIGN KEY ("conta_prevista_id") REFERENCES "public"."conta_financeira"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "obrigacao" ADD CONSTRAINT "obrigacao_cancelada_por_usuario_id_fk" FOREIGN KEY ("cancelada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_pedido_externo_id_pedido_externo_id_fk" FOREIGN KEY ("pedido_externo_id") REFERENCES "public"."pedido_externo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_contrato_id_contrato_id_fk" FOREIGN KEY ("contrato_id") REFERENCES "public"."contrato"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_local_id_cliente_local_id_fk" FOREIGN KEY ("local_id") REFERENCES "public"."cliente_local"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_contato_id_cliente_contato_id_fk" FOREIGN KEY ("contato_id") REFERENCES "public"."cliente_contato"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_responsavel_resolucao_id_usuario_id_fk" FOREIGN KEY ("responsavel_resolucao_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_aberta_por_usuario_id_fk" FOREIGN KEY ("aberta_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ordem_servico" ADD CONSTRAINT "ordem_servico_conferida_por_usuario_id_fk" FOREIGN KEY ("conferida_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_equipamento" ADD CONSTRAINT "os_equipamento_os_id_ordem_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordem_servico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_equipamento" ADD CONSTRAINT "os_equipamento_equipamento_id_equipamento_id_fk" FOREIGN KEY ("equipamento_id") REFERENCES "public"."equipamento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_item" ADD CONSTRAINT "os_item_os_id_ordem_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordem_servico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_item" ADD CONSTRAINT "os_item_solicitado_por_usuario_id_fk" FOREIGN KEY ("solicitado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "os_item" ADD CONSTRAINT "os_item_decidido_por_usuario_id_fk" FOREIGN KEY ("decidido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papel" ADD CONSTRAINT "papel_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "papel_permissao" ADD CONSTRAINT "papel_permissao_papel_id_papel_id_fk" FOREIGN KEY ("papel_id") REFERENCES "public"."papel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "parcela" ADD CONSTRAINT "parcela_obrigacao_id_obrigacao_id_fk" FOREIGN KEY ("obrigacao_id") REFERENCES "public"."obrigacao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_externo" ADD CONSTRAINT "pedido_externo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_externo" ADD CONSTRAINT "pedido_externo_cliente_id_cliente_id_fk" FOREIGN KEY ("cliente_id") REFERENCES "public"."cliente"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pedido_externo_versao" ADD CONSTRAINT "pedido_externo_versao_pedido_id_pedido_externo_id_fk" FOREIGN KEY ("pedido_id") REFERENCES "public"."pedido_externo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencia" ADD CONSTRAINT "pendencia_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencia" ADD CONSTRAINT "pendencia_responsavel_id_usuario_id_fk" FOREIGN KEY ("responsavel_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencia" ADD CONSTRAINT "pendencia_aberta_por_usuario_id_fk" FOREIGN KEY ("aberta_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pendencia" ADD CONSTRAINT "pendencia_resolvida_por_usuario_id_fk" FOREIGN KEY ("resolvida_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pneu" ADD CONSTRAINT "pneu_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pneu" ADD CONSTRAINT "pneu_veiculo_id_veiculo_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profissional" ADD CONSTRAINT "profissional_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "profissional" ADD CONSTRAINT "profissional_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redefinicao_senha" ADD CONSTRAINT "redefinicao_senha_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "redefinicao_senha" ADD CONSTRAINT "redefinicao_senha_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumo_semanal_autonomo" ADD CONSTRAINT "resumo_semanal_autonomo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumo_semanal_autonomo" ADD CONSTRAINT "resumo_semanal_autonomo_profissional_id_profissional_id_fk" FOREIGN KEY ("profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "resumo_semanal_autonomo" ADD CONSTRAINT "resumo_semanal_autonomo_preparado_por_usuario_id_fk" FOREIGN KEY ("preparado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessao" ADD CONSTRAINT "sessao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sincronizacao_log" ADD CONSTRAINT "sincronizacao_log_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sincronizacao_log" ADD CONSTRAINT "sincronizacao_log_reprocessado_por_usuario_id_fk" FOREIGN KEY ("reprocessado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_conta" ADD CONSTRAINT "transferencia_conta_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_conta" ADD CONSTRAINT "transferencia_conta_origem_conta_id_conta_financeira_id_fk" FOREIGN KEY ("origem_conta_id") REFERENCES "public"."conta_financeira"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_conta" ADD CONSTRAINT "transferencia_conta_destino_conta_id_conta_financeira_id_fk" FOREIGN KEY ("destino_conta_id") REFERENCES "public"."conta_financeira"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_conta" ADD CONSTRAINT "transferencia_conta_registrada_por_usuario_id_fk" FOREIGN KEY ("registrada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transferencia_conta" ADD CONSTRAINT "transferencia_conta_confirmada_por_usuario_id_fk" FOREIGN KEY ("confirmada_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario" ADD CONSTRAINT "usuario_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_papel" ADD CONSTRAINT "usuario_papel_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_papel" ADD CONSTRAINT "usuario_papel_papel_id_papel_id_fk" FOREIGN KEY ("papel_id") REFERENCES "public"."papel"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_papel" ADD CONSTRAINT "usuario_papel_concedido_por_usuario_id_fk" FOREIGN KEY ("concedido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_permissao" ADD CONSTRAINT "usuario_permissao_usuario_id_usuario_id_fk" FOREIGN KEY ("usuario_id") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "usuario_permissao" ADD CONSTRAINT "usuario_permissao_concedido_por_usuario_id_fk" FOREIGN KEY ("concedido_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo" ADD CONSTRAINT "veiculo_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo" ADD CONSTRAINT "veiculo_responsavel_profissional_id_profissional_id_fk" FOREIGN KEY ("responsavel_profissional_id") REFERENCES "public"."profissional"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_manutencao" ADD CONSTRAINT "veiculo_manutencao_veiculo_id_veiculo_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_manutencao" ADD CONSTRAINT "veiculo_manutencao_fornecedor_id_fornecedor_id_fk" FOREIGN KEY ("fornecedor_id") REFERENCES "public"."fornecedor"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_manutencao" ADD CONSTRAINT "veiculo_manutencao_registrado_por_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_odometro" ADD CONSTRAINT "veiculo_odometro_veiculo_id_veiculo_id_fk" FOREIGN KEY ("veiculo_id") REFERENCES "public"."veiculo"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_odometro" ADD CONSTRAINT "veiculo_odometro_autorizado_por_usuario_id_fk" FOREIGN KEY ("autorizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "veiculo_odometro" ADD CONSTRAINT "veiculo_odometro_registrado_por_usuario_id_fk" FOREIGN KEY ("registrado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_os_id_ordem_servico_id_fk" FOREIGN KEY ("os_id") REFERENCES "public"."ordem_servico"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_checkin_por_usuario_id_fk" FOREIGN KEY ("checkin_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_checkout_por_usuario_id_fk" FOREIGN KEY ("checkout_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_conferida_por_usuario_id_fk" FOREIGN KEY ("conferida_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita" ADD CONSTRAINT "visita_criado_por_usuario_id_fk" FOREIGN KEY ("criado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_execucao" ADD CONSTRAINT "visita_execucao_visita_id_visita_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visita"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_execucao" ADD CONSTRAINT "visita_execucao_equipamento_id_equipamento_id_fk" FOREIGN KEY ("equipamento_id") REFERENCES "public"."equipamento"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_execucao" ADD CONSTRAINT "visita_execucao_atualizado_por_usuario_id_fk" FOREIGN KEY ("atualizado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_reagendamento" ADD CONSTRAINT "visita_reagendamento_visita_id_visita_id_fk" FOREIGN KEY ("visita_id") REFERENCES "public"."visita"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "visita_reagendamento" ADD CONSTRAINT "visita_reagendamento_por_usuario_id_fk" FOREIGN KEY ("por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "agenda_reserva_visita_idx" ON "agenda_reserva" USING btree ("visita_id");--> statement-breakpoint
CREATE INDEX "anexo_ent_idx" ON "anexo" USING btree ("entidade_tipo","entidade_id");--> statement-breakpoint
CREATE INDEX "aprovacao_ent_idx" ON "aprovacao" USING btree ("entidade_tipo","entidade_id");--> statement-breakpoint
CREATE UNIQUE INDEX "aprovacao_unica_por_decisor" ON "aprovacao" USING btree ("entidade_tipo","entidade_id","acao","decidido_por");--> statement-breakpoint
CREATE INDEX "auditoria_ent_idx" ON "auditoria" USING btree ("entidade_tipo","entidade_id");--> statement-breakpoint
CREATE INDEX "auditoria_em_idx" ON "auditoria" USING btree ("empresa_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "autonomo_servico_uq" ON "autonomo_servico" USING btree ("os_id","profissional_id");--> statement-breakpoint
CREATE UNIQUE INDEX "baixa_idem_uq" ON "baixa" USING btree ("chave_idempotencia");--> statement-breakpoint
CREATE INDEX "baixa_parcela_idx" ON "baixa" USING btree ("parcela_id");--> statement-breakpoint
CREATE UNIQUE INDEX "categoria_codigo_uq" ON "categoria_financeira" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "checklist_resp_idem_uq" ON "checklist_resposta" USING btree ("chave_idempotencia");--> statement-breakpoint
CREATE INDEX "cliente_empresa_nome_idx" ON "cliente" USING btree ("empresa_id","nome");--> statement-breakpoint
CREATE UNIQUE INDEX "contrato_numero_uq" ON "contrato" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "ferramenta_codigo_uq" ON "ferramenta" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "ferr_mov_idem_uq" ON "ferramenta_movimento" USING btree ("chave_idempotencia");--> statement-breakpoint
CREATE INDEX "ferr_mov_ferr_idx" ON "ferramenta_movimento" USING btree ("ferramenta_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "integracao_provedor_uq" ON "integracao" USING btree ("empresa_id","provedor");--> statement-breakpoint
CREATE INDEX "login_tentativa_email_idx" ON "login_tentativa" USING btree ("email","em");--> statement-breakpoint
CREATE UNIQUE INDEX "material_codigo_uq" ON "material" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "mat_mov_idem_uq" ON "material_movimento" USING btree ("chave_idempotencia");--> statement-breakpoint
CREATE INDEX "mat_mov_os_idx" ON "material_movimento" USING btree ("os_id");--> statement-breakpoint
CREATE INDEX "mat_mov_mat_idx" ON "material_movimento" USING btree ("material_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "mat_pos_prof_uq" ON "material_posicao" USING btree ("profissional_id");--> statement-breakpoint
CREATE UNIQUE INDEX "mat_pos_veic_uq" ON "material_posicao" USING btree ("veiculo_id");--> statement-breakpoint
CREATE INDEX "notif_usuario_idx" ON "notificacao" USING btree ("usuario_id","encerrada_em");--> statement-breakpoint
CREATE UNIQUE INDEX "obrigacao_chave_uq" ON "obrigacao" USING btree ("empresa_id","chave_unicidade");--> statement-breakpoint
CREATE INDEX "obrigacao_empresa_nat_idx" ON "obrigacao" USING btree ("empresa_id","natureza");--> statement-breakpoint
CREATE UNIQUE INDEX "os_numero_uq" ON "ordem_servico" USING btree ("empresa_id","numero");--> statement-breakpoint
CREATE UNIQUE INDEX "os_pedido_externo_uq" ON "ordem_servico" USING btree ("pedido_externo_id");--> statement-breakpoint
CREATE INDEX "os_empresa_etapa_idx" ON "ordem_servico" USING btree ("empresa_id","etapa");--> statement-breakpoint
CREATE UNIQUE INDEX "papel_codigo_uq" ON "papel" USING btree ("empresa_id","codigo");--> statement-breakpoint
CREATE UNIQUE INDEX "parcela_num_uq" ON "parcela" USING btree ("obrigacao_id","numero");--> statement-breakpoint
CREATE INDEX "parcela_venc_idx" ON "parcela" USING btree ("vencimento");--> statement-breakpoint
CREATE UNIQUE INDEX "pedido_externo_uq" ON "pedido_externo" USING btree ("empresa_id","origem","id_externo");--> statement-breakpoint
CREATE UNIQUE INDEX "pedido_versao_uq" ON "pedido_externo_versao" USING btree ("pedido_id","hash_conteudo");--> statement-breakpoint
CREATE INDEX "pendencia_empresa_sit_idx" ON "pendencia" USING btree ("empresa_id","situacao");--> statement-breakpoint
CREATE UNIQUE INDEX "pneu_ident_uq" ON "pneu" USING btree ("empresa_id","identificacao");--> statement-breakpoint
CREATE UNIQUE INDEX "profissional_usuario_uq" ON "profissional" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "profissional_empresa_idx" ON "profissional" USING btree ("empresa_id");--> statement-breakpoint
CREATE UNIQUE INDEX "redef_token_uq" ON "redefinicao_senha" USING btree ("token_hash");--> statement-breakpoint
CREATE UNIQUE INDEX "resumo_semana_uq" ON "resumo_semanal_autonomo" USING btree ("profissional_id","semana_inicio");--> statement-breakpoint
CREATE UNIQUE INDEX "sessao_token_uq" ON "sessao" USING btree ("token_hash");--> statement-breakpoint
CREATE INDEX "sessao_usuario_idx" ON "sessao" USING btree ("usuario_id");--> statement-breakpoint
CREATE INDEX "sync_log_idx" ON "sincronizacao_log" USING btree ("empresa_id","criado_em");--> statement-breakpoint
CREATE UNIQUE INDEX "transf_idem_uq" ON "transferencia_conta" USING btree ("chave_idempotencia");--> statement-breakpoint
CREATE UNIQUE INDEX "usuario_email_uq" ON "usuario" USING btree (lower("email"));--> statement-breakpoint
CREATE UNIQUE INDEX "veiculo_ident_uq" ON "veiculo" USING btree ("empresa_id","identificacao");--> statement-breakpoint
CREATE UNIQUE INDEX "visita_seq_uq" ON "visita" USING btree ("os_id","sequencia");--> statement-breakpoint
CREATE INDEX "visita_empresa_inicio_idx" ON "visita" USING btree ("empresa_id","inicio_previsto");--> statement-breakpoint
CREATE UNIQUE INDEX "visita_exec_uq" ON "visita_execucao" USING btree ("visita_id",coalesce("equipamento_id", '00000000-0000-0000-0000-000000000000'::uuid));