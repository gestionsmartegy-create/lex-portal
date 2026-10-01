import { notFound } from "next/navigation";

// Toute URL inconnue sous /[locale] affiche la 404 traduite.
export default function CatchAllPage() {
  notFound();
}
