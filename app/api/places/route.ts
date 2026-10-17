import { places, collection } from "@/lib/places";

export async function GET() {
  return Response.json({ places, collection: { status: collection.status, collectedAt: collection.collectedAt, source: collection.source, count: collection.count }, note: "Описание и длительность — редакционные. Часть координат приблизительная и явно помечена в источнике. Ссылки на 2ГИС, Ticketon, kino.kz, sxodim — переходы к сервисам." }, { headers: { "Cache-Control": "public, max-age=300" } });
}
