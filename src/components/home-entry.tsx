"use client";

import Link from "next/link";

import { useLocale } from "@/components/locale-provider";
import { ArtifactCalculator } from "@/components/artifact-calculator";
import { Button } from "@/components/ui/button";
import { t } from "@/lib/i18n";

interface HomeEntryProps {
  appName: string;
  appVersion: string;
}

export function HomeEntry({ appName, appVersion }: HomeEntryProps) {
  const { locale } = useLocale();
  const tr = (key: string, vars?: Record<string, string | number>) => t(locale, key, vars);

  return (
    <>
      <div className="mx-auto w-full max-w-7xl px-4 pt-4 md:px-8 md:pt-8">
        <Button asChild size="sm" variant="outline">
          <Link href="/import">{tr("home.importViaUid")}</Link>
        </Button>
      </div>
      <ArtifactCalculator appName={appName} appVersion={appVersion} />
    </>
  );
}
