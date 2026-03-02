import pkg from "../../../package.json";

const ENKA_API_BASE = "https://enka.network/api/uid";

function getUserAgent(): string {
  const custom = process.env.ENKA_USER_AGENT?.trim();
  if (custom) {
    return custom;
  }

  const name = typeof pkg.name === "string" ? pkg.name : "app";
  const version = typeof pkg.version === "string" ? pkg.version : "0.0.0";

  return `${name}/${version} (+local)`;
}

export async function fetchEnkaUid(uid: string): Promise<{ status: number; data?: unknown }> {
  const response = await fetch(`${ENKA_API_BASE}/${uid}/`, {
    headers: {
      Accept: "application/json",
      "User-Agent": getUserAgent(),
    },
    cache: "no-store",
  });

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }

  return {
    status: response.status,
    data,
  };
}
