import type { Metadata } from "next";

import { DamageLab } from "@/components/damage-lab";

export const metadata: Metadata = {
  title: "Damage Lab | Genshin Calculator",
  description: "Simple imported-character damage sandbox (beta).",
};

export default function DamagePage() {
  return <DamageLab />;
}
