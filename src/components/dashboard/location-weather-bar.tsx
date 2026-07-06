/**
 * Barra de cabeçalho do Dashboard: localização (cidade), data por extenso e
 * condições climáticas do dia. Tudo client-side, sem secret/backend:
 *  - Localização: navigator.geolocation (permissão do navegador).
 *  - Cidade: reverse geocoding via BigDataCloud (endpoint gratuito, sem
 *    chave, feito para uso direto do client).
 *  - Clima: Open-Meteo (API gratuita, sem chave, CORS liberado).
 *
 * Falha silenciosa em qualquer etapa (permissão negada, geolocalização
 * indisponível, API fora do ar) — a data continua aparecendo sozinha, sem
 * bloquear nem poluir o Dashboard com erro.
 */
import { useEffect, useState } from "react";
import {
  Sun,
  CloudSun,
  Cloud,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  MapPin,
  CalendarDays,
} from "lucide-react";

const WEATHER_CACHE_KEY = "gerentefina-weather-cache-v1";
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutos

interface WeatherInfo {
  city: string | null;
  temperature: number | null;
  weatherCode: number | null;
}

function weatherMeta(code: number | null): { Icon: typeof Sun; label: string } {
  if (code === null) return { Icon: Sun, label: "" };
  if (code === 0) return { Icon: Sun, label: "Céu limpo" };
  if (code === 1 || code === 2) return { Icon: CloudSun, label: "Parcialmente nublado" };
  if (code === 3) return { Icon: Cloud, label: "Nublado" };
  if (code === 45 || code === 48) return { Icon: CloudFog, label: "Neblina" };
  if ([51, 53, 55, 56, 57].includes(code)) return { Icon: CloudDrizzle, label: "Garoa" };
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return { Icon: CloudRain, label: "Chuva" };
  if ([71, 73, 75, 77, 85, 86].includes(code)) return { Icon: CloudSnow, label: "Neve" };
  if ([95, 96, 99].includes(code)) return { Icon: CloudLightning, label: "Tempestade" };
  return { Icon: Cloud, label: "" };
}

function formatFullDatePtBR(d: Date): string {
  const s = d.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function LocationWeatherBar() {
  const [info, setInfo] = useState<WeatherInfo | null>(null);

  useEffect(() => {
    try {
      const cachedRaw = sessionStorage.getItem(WEATHER_CACHE_KEY);
      if (cachedRaw) {
        const cached = JSON.parse(cachedRaw) as { data: WeatherInfo; ts: number };
        if (Date.now() - cached.ts < CACHE_TTL_MS) {
          setInfo(cached.data);
          return;
        }
      }
    } catch {
      // cache corrompido — ignora e segue para buscar de novo
    }

    if (!("geolocation" in navigator)) return;

    navigator.geolocation.getCurrentPosition(
      async ({ coords }) => {
        const { latitude, longitude } = coords;
        try {
          const [geoRes, weatherRes] = await Promise.all([
            fetch(
              `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${latitude}&longitude=${longitude}&localityLanguage=pt`,
            ),
            fetch(
              `https://api.open-meteo.com/v1/forecast?latitude=${latitude}&longitude=${longitude}&current_weather=true`,
            ),
          ]);

          const geoJson = geoRes.ok ? await geoRes.json() : null;
          const weatherJson = weatherRes.ok ? await weatherRes.json() : null;

          const data: WeatherInfo = {
            city: geoJson?.city || geoJson?.locality || null,
            temperature: weatherJson?.current_weather?.temperature ?? null,
            weatherCode: weatherJson?.current_weather?.weathercode ?? null,
          };
          setInfo(data);
          sessionStorage.setItem(WEATHER_CACHE_KEY, JSON.stringify({ data, ts: Date.now() }));
        } catch {
          // API fora do ar — segue mostrando só a data
        }
      },
      () => {
        // Permissão negada ou indisponível — segue mostrando só a data
      },
      { timeout: 8000 },
    );
  }, []);

  const { Icon, label } = weatherMeta(info?.weatherCode ?? null);

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-foreground/50">
      <span className="flex items-center gap-1.5">
        <CalendarDays className="size-3.5 text-primary/70" />
        {formatFullDatePtBR(new Date())}
      </span>
      {info?.city && (
        <span className="flex items-center gap-1.5">
          <MapPin className="size-3.5 text-primary/70" />
          {info.city}
        </span>
      )}
      {info?.temperature !== null && info?.temperature !== undefined && (
        <span className="flex items-center gap-1.5">
          <Icon className="size-3.5 text-primary/70" />
          {Math.round(info.temperature)}°C{label ? ` · ${label}` : ""}
        </span>
      )}
    </div>
  );
}
