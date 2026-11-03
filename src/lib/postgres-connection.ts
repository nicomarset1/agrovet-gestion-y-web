// Configuración de la conexión a Postgres, separada del driver para poder probarla sin una base.

// La verificación del certificado se apaga solo contra una base en esta misma máquina (el Postgres de
// prueba usa un certificado propio, o ninguno). Contra Neon siempre se verifica: sin eso, cualquiera en el
// camino podría hacerse pasar por la base y leer pedidos y contraseñas.
const localHosts = new Set(["localhost", "127.0.0.1", "[::1]", "::1"]);

export function postgresSslOption(url: string): { rejectUnauthorized: true } | "prefer" {
  return localHosts.has(new URL(url).hostname.toLowerCase()) ? "prefer" : { rejectUnauthorized: true };
}

// Pensado para serverless contra el pooler de Neon (PgBouncer en modo transacción):
// - max bajo: una instancia atiende pocos pedidos a la vez y el pooler multiplexa; el panel llega a 4 en paralelo.
// - idle_timeout: suelta las conexiones quietas para que Neon pueda suspenderse y no consuma cuota de cómputo.
// - connect_timeout: margen para que Neon despierte, sin colgar un pedido hasta que lo corte Vercel.
// No se pasan parámetros de sesión (lock_timeout en connection): PgBouncer rechaza el arranque con parámetros
// que no conoce, y eso dejaría la tienda sin base. Los timeouts van con SET LOCAL en cada transacción.
export function postgresPoolOptions(url: string) {
  return {
    max: 5,
    idle_timeout: 20,
    connect_timeout: 10,
    ssl: postgresSslOption(url),
  };
}

// lock_timeout: que un pedido no espere para siempre a otro; mejor un error reintentable que una fila de
// pedidos colgados. Alcanza de sobra para una transacción normal, que retiene sus filas menos de un par de segundos.
// statement_timeout e idle_in_transaction: si una función muere con la transacción abierta, Postgres suelta los bloqueos.
export const transactionTimeoutsSql = "SET LOCAL lock_timeout = '8s'; SET LOCAL statement_timeout = '25s'; SET LOCAL idle_in_transaction_session_timeout = '20s'";

type BeginCallback = (tx: never) => unknown;
type WithBegin = { begin: (...args: never[]) => unknown };

// Envuelve sql.begin una sola vez, acá: así toda transacción lleva los timeouts, también las que se agreguen
// más adelante, sin tocar cada lugar que abre una. SET LOCAL muere con la transacción: pasa bien por el pooler.
export function applyTransactionTimeouts<T extends WithBegin>(sql: T): T {
  const begin = sql.begin as unknown as (...args: unknown[]) => unknown;
  (sql as { begin: unknown }).begin = (...args: unknown[]) => {
    const callback = args[args.length - 1] as BeginCallback;
    const wrapped = async (tx: { unsafe: (text: string) => PromiseLike<unknown> }) => {
      await tx.unsafe(transactionTimeoutsSql);
      return callback(tx as never);
    };
    return begin(...args.slice(0, -1), wrapped);
  };
  return sql;
}
