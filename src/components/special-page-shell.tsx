import Link from "next/link";

export function SpecialPageShell({ title, description }: { title: string; description: string }) {
  return (
    <main className="section">
      <div className="container">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Agrovet</p>
            <h1>{title}</h1>
            <p>{description}</p>
          </div>
          <Link className="button button-light" href="/tienda">Ver tienda</Link>
        </div>
      </div>
    </main>
  );
}
