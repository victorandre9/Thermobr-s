import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { Document, Image, Page, StyleSheet, Text, View, renderToBuffer } from "@react-pdf/renderer";
import type { ConteudoExterno } from "../services/relatorio-atendimento";
import { LOGO_SRC } from "@/lib/marca";
import { fmtDataHora } from "@/lib/datas";

const s = StyleSheet.create({
  page: { padding: 36, fontSize: 9.5, fontFamily: "Helvetica", color: "#102238" },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", borderBottom: "1.5pt solid #102238", paddingBottom: 8, marginBottom: 12 },
  marca: { fontSize: 16, fontFamily: "Helvetica-Bold" },
  titulo: { fontSize: 12, fontFamily: "Helvetica-Bold", textAlign: "right" },
  muted: { color: "#657486" },
  secao: { marginTop: 10, marginBottom: 4, fontSize: 10.5, fontFamily: "Helvetica-Bold", color: "#1C6FA6" },
  caixa: { border: "0.75pt solid #DCE7EF", borderRadius: 4, padding: 8, marginBottom: 6 },
  linha: { flexDirection: "row", marginBottom: 2 },
  k: { width: 110, color: "#657486" },
  v: { flex: 1 },
  fotos: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  foto: { width: 160, height: 120, objectFit: "cover", border: "0.5pt solid #DCE7EF" },
  rodape: { position: "absolute", bottom: 20, left: 36, right: 36, fontSize: 7.5, color: "#657486", borderTop: "0.5pt solid #DCE7EF", paddingTop: 4 },
});

const L = ({ k, v }: { k: string; v?: string | null }) => <View style={s.linha}><Text style={s.k}>{k}</Text><Text style={s.v}>{v || "—"}</Text></View>;

export async function gerarPdfRelatorio(c: ConteudoExterno, meta: { versao: number; emitidoEm: Date; id: string; ciencia: { situacao: string; nome: string | null; em: Date | null; observacao: string | null } }, fotos: Array<{ nome: string; dados: Buffer; mime: string }>) {
  let logo: Buffer | null = null;
  if (LOGO_SRC) { try { logo = await readFile(path.join(process.cwd(), "public", LOGO_SRC)); } catch { logo = null; } }
  const ident = c.escopo === "visita" ? `Relatório de atendimento — VISITA ${c.visitaSequencia} da OS ${c.osNumero}` : `Relatório de atendimento — OS ${c.osNumero} (todas as visitas finalizadas)`;
  const doc = (
    <Document title={ident} author={c.empresa}>
      <Page size="A4" style={s.page}>
        <View style={s.head}>
          <View>{logo ? <Image src={logo} style={{ width: 150 }} /> : <Text style={s.marca}>Thermobrás</Text>}</View>
          <View><Text style={s.titulo}>{ident}</Text><Text style={[s.muted, { textAlign: "right" }]}>Versão {meta.versao} · emitido em {fmtDataHora(meta.emitidoEm)}</Text></View>
        </View>
        <View style={s.caixa}>
          <L k="Cliente" v={c.cliente} />
          <L k="Local" v={c.local} />
          <L k="Equipamentos" v={c.equipamentos.map((e) => e.descricao + (e.numeroSerie ? ` (S/N ${e.numeroSerie})` : "")).join("; ")} />
        </View>
        {c.visitas.map((v) => (
          <View key={v.sequencia} wrap={false}>
            <Text style={s.secao}>Visita {v.sequencia}</Text>
            <View style={s.caixa}>
              <L k="Início / fim" v={`${v.inicio ? fmtDataHora(v.inicio) : "—"} — ${v.fim ? fmtDataHora(v.fim) : "—"}`} />
              <L k="Profissionais" v={v.profissionais.join(", ")} />
              <L k="Resultado" v={v.resultado + (v.motivo ? ` — ${v.motivo}` : "")} />
              {v.pendencia ? <L k="Pendência" v={v.pendencia} /> : null}
              {v.proximaAcao ? <L k="Próxima ação" v={v.proximaAcao} /> : null}
              {v.execucoes.map((e, i) => (
                <View key={i} style={{ marginTop: 5 }}>
                  <Text style={{ fontFamily: "Helvetica-Bold" }}>{e.equipamento}</Text>
                  <L k="Diagnóstico" v={e.diagnostico} />
                  <L k="Serviço realizado" v={e.servicoRealizado} />
                  <L k="Teste de funcionamento" v={e.teste} />
                </View>
              ))}
            </View>
          </View>
        ))}
        {fotos.length > 0 && (
          <View>
            <Text style={s.secao}>Evidências</Text>
            <View style={s.fotos}>{fotos.map((f, i) => <Image key={i} src={{ data: f.dados, format: f.mime === "image/png" ? "png" : "jpg" }} style={s.foto} />)}</View>
          </View>
        )}
        <Text style={s.secao}>Ciência do responsável no local</Text>
        <View style={s.caixa}>
          {meta.ciencia.situacao === "registrada" ? <L k="Ciente" v={`${meta.ciencia.nome} em ${meta.ciencia.em ? fmtDataHora(meta.ciencia.em) : "—"}`} />
            : meta.ciencia.situacao === "pendente" ? <Text style={s.muted}>Não registrada nesta versão.</Text>
            : <L k={meta.ciencia.situacao === "ausente" ? "Ausente" : "Recusou-se"} v={meta.ciencia.observacao} />}
          {meta.ciencia.situacao === "registrada" && meta.ciencia.observacao ? <L k="Observações" v={meta.ciencia.observacao} /> : null}
          <Text style={[s.muted, { marginTop: 4, fontSize: 7.5 }]}>Registro de ciência do atendimento; não constitui assinatura digital certificada nem aprovação de valores.</Text>
        </View>
        <Text style={s.rodape} fixed render={({ pageNumber, totalPages }) => `${c.empresa} · Documento ${meta.id.slice(0, 8)} · versão ${meta.versao} · página ${pageNumber}/${totalPages}`} />
      </Page>
    </Document>
  );
  return renderToBuffer(doc);
}
