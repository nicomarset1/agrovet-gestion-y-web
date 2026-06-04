import Link from "next/link";

export function SpecialPageShell({ title, description }: { title: string; description: string }) {
  const paragraphs = description.split(/\n+/).map((line) => line.trim()).filter(Boolean);

  return (
    <main className="section">
      <div className="container">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Agrovet</p>
            <h1>{title}</h1>
            <p>{paragraphs[0] ?? "Contenido pendiente de cargar."}</p>
          </div>
          <Link className="button button-light" href="/tienda">Ver tienda</Link>
        </div>
        {paragraphs.length > 1 ? (
          <section className="card special-page-content">
            {paragraphs.slice(1).map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
          </section>
        ) : null}
      </div>
    </main>
  );
}
