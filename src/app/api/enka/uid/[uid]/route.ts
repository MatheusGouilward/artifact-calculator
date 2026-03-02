import { NextRequest, NextResponse } from "next/server";

import { getCachedValue, getOrCreateInFlight, setCachedValue } from "@/lib/enka/cache";
import { fetchEnkaUid } from "@/lib/enka/client";
import { normalizeEnkaUidResponse } from "@/lib/enka/normalize";
import type { EnkaNormalizedResponse } from "@/lib/enka/types";

export const runtime = "nodejs";

const UID_PATTERN = /^\d{9}$/;

const FRIENDLY_STATUS_MAP: Record<number, { code: string; error: string }> = {
  404: {
    code: "UID_NOT_FOUND",
    error: "The requested UID was not found on Enka.",
  },
  424: {
    code: "UID_DATA_UNAVAILABLE",
    error: "The showcase data is currently unavailable for this UID.",
  },
  429: {
    code: "RATE_LIMITED",
    error: "Enka rate limit reached. Please retry in a moment.",
  },
  500: {
    code: "UPSTREAM_ERROR",
    error: "Enka returned an internal error.",
  },
  503: {
    code: "UPSTREAM_UNAVAILABLE",
    error: "Enka is temporarily unavailable.",
  },
};

type GatewayResult =
  | {
      ok: true;
      payload: EnkaNormalizedResponse;
      ttlSeconds?: number;
    }
  | {
      ok: false;
      status: number;
      error: string;
      code: string;
      ttlSeconds?: number;
    };

function resolveLocale(request: NextRequest): "en" | "pt-BR" {
  const locale = request.nextUrl.searchParams.get("locale");
  return locale === "pt-BR" || locale === "en" ? locale : "en";
}

function withLocale(
  payload: EnkaNormalizedResponse,
  locale: "en" | "pt-BR",
): EnkaNormalizedResponse {
  if (payload.metadata.locale === locale) {
    return payload;
  }

  return {
    ...payload,
    metadata: {
      ...payload.metadata,
      locale,
    },
  };
}

function createHeaders(cacheStatus: "HIT" | "MISS", ttlSeconds?: number): Headers {
  return new Headers({
    "Cache-Control": "private, max-age=0, must-revalidate",
    "X-Cache": cacheStatus,
    "X-Enka-TTL": String(ttlSeconds ?? 0),
  });
}

async function fetchAndNormalize(uid: string, locale: "en" | "pt-BR"): Promise<GatewayResult> {
  let upstream: { status: number; data?: unknown };
  try {
    upstream = await fetchEnkaUid(uid);
  } catch {
    return {
      ok: false,
      status: 503,
      code: "UPSTREAM_UNAVAILABLE",
      error: "Failed to connect to Enka.",
    };
  }

  if (upstream.status < 200 || upstream.status >= 300) {
    const mapped = FRIENDLY_STATUS_MAP[upstream.status];
    if (mapped) {
      return {
        ok: false,
        status: upstream.status,
        error: mapped.error,
        code: mapped.code,
      };
    }

    return {
      ok: false,
      status: 502,
      code: "UPSTREAM_BAD_RESPONSE",
      error: "Unexpected upstream response from Enka.",
    };
  }

  const raw =
    upstream.data && typeof upstream.data === "object"
      ? ({ uid, ...(upstream.data as Record<string, unknown>) } as Record<string, unknown>)
      : { uid };

  const payload = normalizeEnkaUidResponse(raw, { locale });
  const ttlSeconds = payload.ttlSeconds;

  if (ttlSeconds && ttlSeconds > 0) {
    setCachedValue(uid, payload, ttlSeconds);
  }

  return {
    ok: true,
    payload,
    ttlSeconds,
  };
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ uid: string }> },
) {
  const { uid } = await context.params;
  const locale = resolveLocale(request);

  if (!UID_PATTERN.test(uid)) {
    return NextResponse.json(
      {
        error: "UID must be a 9-digit numeric string.",
        code: "BAD_UID",
      },
      {
        status: 400,
        headers: createHeaders("MISS"),
      },
    );
  }

  const cached = getCachedValue<EnkaNormalizedResponse>(uid);
  if (cached) {
    return NextResponse.json(withLocale(cached, locale), {
      status: 200,
      headers: createHeaders("HIT", cached.ttlSeconds),
    });
  }

  const result = await getOrCreateInFlight(uid, () => fetchAndNormalize(uid, locale));

  if (!result.ok) {
    return NextResponse.json(
      {
        error: result.error,
        code: result.code,
        status: result.status,
      },
      {
        status: result.status,
        headers: createHeaders("MISS", result.ttlSeconds),
      },
    );
  }

  return NextResponse.json(withLocale(result.payload, locale), {
    status: 200,
    headers: createHeaders("MISS", result.ttlSeconds),
  });
}
