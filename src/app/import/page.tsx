import type { Metadata } from "next";

import { EnkaImport } from "@/components/enka-import";

export const metadata: Metadata = {
  title: "Import via UID | Genshin Calculator",
  description: "Import and select a Genshin character from Enka by UID.",
};

export default function ImportPage() {
  return <EnkaImport />;
}
