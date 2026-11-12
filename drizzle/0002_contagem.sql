CREATE TABLE "material_contagem" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"empresa_id" uuid NOT NULL,
	"material_id" uuid NOT NULL,
	"posicao_id" uuid NOT NULL,
	"quantidade_esperada" numeric(14, 3) NOT NULL,
	"quantidade_contada" numeric(14, 3) NOT NULL,
	"divergencia_id" uuid,
	"contado_por" uuid NOT NULL,
	"criado_em" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "material_contagem" ADD CONSTRAINT "material_contagem_empresa_id_empresa_id_fk" FOREIGN KEY ("empresa_id") REFERENCES "public"."empresa"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_contagem" ADD CONSTRAINT "material_contagem_material_id_material_id_fk" FOREIGN KEY ("material_id") REFERENCES "public"."material"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_contagem" ADD CONSTRAINT "material_contagem_posicao_id_material_posicao_id_fk" FOREIGN KEY ("posicao_id") REFERENCES "public"."material_posicao"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "material_contagem" ADD CONSTRAINT "material_contagem_contado_por_usuario_id_fk" FOREIGN KEY ("contado_por") REFERENCES "public"."usuario"("id") ON DELETE no action ON UPDATE no action;