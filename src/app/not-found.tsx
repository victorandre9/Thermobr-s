import Link from "next/link";
export default function NaoEncontrado() {
  return (
    <div className="mx-auto mt-24 max-w-md card p-8 text-center">
      <h1 className="text-xl font-bold text-navy">Página não encontrada</h1>
      <p className="mt-2 text-muted">O endereço não existe ou você não tem acesso a este registro.</p>
      <Link href="/" className="btn btn-primary mt-5">Voltar ao início</Link>
    </div>
  );
}
