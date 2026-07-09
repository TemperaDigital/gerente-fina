/**
 * HeaderClockBar — cabeçalho de clima + relógio digital, reaproveitado em
 * todas as telas principais (Dashboard, Chat IA, Configurações, Lançamentos,
 * Parcelas & Dívidas).
 *
 * Mantém a mesma estratégia 100% client-side / sem secret de
 * LocationWeatherBar (geolocalização do navegador + BigDataCloud + Open-Meteo,
 * cache de 20min em sessionStorage, falha silenciosa em qualquer etapa — o
 * relógio continua funcionando mesmo sem permissão de localização), só troca
 * a apresentação: cartão com gradiente + relógio "digital" (mono, tabular,
 * brilho sutil) em vez da barra de texto simples.
 */
import { useEffect, useState } from "react";
import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  Cloudy,
  CloudFog,
  CloudDrizzle,
  CloudRain,
  CloudSnow,
  CloudLightning,
  MapPin,
  type LucideIcon,
} from "lucide-react";

const WEATHER_CACHE_KEY = "gerentefina-weather-cache-v1";
const CACHE_TTL_MS = 20 * 60 * 1000; // 20 minutos

interface WeatherInfo {
  city: string | null;
  temperature: number | null;
  weatherCode: number | null;
}

type CondicaoKey =
  | "limpo"
  | "poucas-nuvens"
  | "nublado"
  | "garoa"
  | "chuva"
  | "tempestade"
  | "neve"
  | "neblina";

const CLIMA: Record<
  CondicaoKey,
  { dia: LucideIcon; noite: LucideIcon; cor: string; label: string }
> = {
  limpo: { dia: Sun, noite: Moon, cor: "#f59e0b", label: "Céu limpo" },
  "poucas-nuvens": {
    dia: CloudSun,
    noite: CloudMoon,
    cor: "#60a5fa",
    label: "Parcialmente nublado",
  },
  nublado: { dia: Cloudy, noite: Cloudy, cor: "#94a3b8", label: "Nublado" },
  garoa: { dia: CloudDrizzle, noite: CloudDrizzle, cor: "#38bdf8", label: "Garoa" },
  chuva: { dia: CloudRain, noite: CloudRain, cor: "#38bdf8", label: "Chuva" },
  tempestade: {
    dia: CloudLightning,
    noite: CloudLightning,
    cor: "#a78bfa",
    label: "Tempestade",
  },
  neve: { dia: CloudSnow, noite: CloudSnow, cor: "#67e8f9", label: "Neve" },
  neblina: { dia: CloudFog, noite: CloudFog, cor: "#a1a1aa", label: "Neblina" },
};

/** Mapeia o weathercode do Open-Meteo (WMO) pra uma chave do mapa CLIMA acima. */
function weatherCodeToCondicao(code: number | null): CondicaoKey {
  if (code === null) return "limpo";
  if (code === 0) return "limpo";
  if (code === 1 || code === 2) return "poucas-nuvens";
  if (code === 3) return "nublado";
  if (code === 45 || code === 48) return "neblina";
  if ([51, 53, 55, 56, 57].includes(code)) return "garoa";
  if ([61, 63, 65, 66, 67, 80, 81, 82].includes(code)) return "chuva";
  if ([71, 73, 75, 77, 85, 86].includes(code)) return "neve";
  if ([95, 96, 99].includes(code)) return "tempestade";
  return "limpo";
}

const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);

export function HeaderClockBar() {
  const [info, setInfo] = useState<WeatherInfo | null>(null);
  const [agora, setAgora] = useState(new Date());

  // Relógio — atualiza a cada segundo.
  useEffect(() => {
    const id = setInterval(() => setAgora(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  // Clima/localização — mesma estratégia de LocationWeatherBar (cache 20min,
  // falha silenciosa, nunca bloqueia o cabeçalho).
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
          // API fora do ar — segue mostrando só o relógio/data
        }
      },
      () => {
        // Permissão negada ou indisponível — segue mostrando só o relógio/data
      },
      { timeout: 8000 },
    );
  }, []);

  const hora = agora.getHours();
  const ehNoite = hora < 6 || hora >= 19;
  const condicao = weatherCodeToCondicao(info?.weatherCode ?? null);
  const meta = CLIMA[condicao];
  const Icone = ehNoite ? meta.noite : meta.dia;
  // céu limpo à noite fica com um tom mais frio (índigo) em vez de âmbar
  const cor = condicao === "limpo" && ehNoite ? "#818cf8" : meta.cor;

  const hh = String(hora).padStart(2, "0");
  const mm = String(agora.getMinutes()).padStart(2, "0");
  const ss = String(agora.getSeconds()).padStart(2, "0");

  const diaSemana = cap(agora.toLocaleDateString("pt-BR", { weekday: "long" }));
  const dia = agora.getDate();
  const mes = agora.toLocaleDateString("pt-BR", { month: "long" });
  const ano = agora.getFullYear();

  const hasWeather = info?.temperature !== null && info?.temperature !== undefined;

  return (
    <div
      className="relative overflow-hidden rounded-2xl border border-white/10 p-5 sm:p-6"
      style={{ background: "linear-gradient(135deg,#12141c 0%,#0a0b10 100%)" }}
    >
      <style>{`
        @keyframes gf-pisca-colon { 0%,100%{opacity:1} 50%{opacity:.2} }
        .gf-colon { animation: gf-pisca-colon 1.1s steps(1,end) infinite; }
      `}</style>

      {/* brilho ambiente que muda com o clima */}
      <div
        className="pointer-events-none absolute -top-20 -left-16 h-64 w-64 rounded-full blur-3xl opacity-25"
        style={{ background: cor }}
      />
      <div
        className="absolute inset-x-0 top-0 h-px"
        style={{ background: `linear-gradient(90deg,transparent,${cor}66,transparent)` }}
      />

      <div className="relative flex flex-col gap-6 sm:flex-row sm:items-center sm:justify-between">
        {/* ---- bloco do clima ---- */}
        <div className="flex items-center gap-4">
          <div
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl"
            style={{ background: `${cor}1f`, boxShadow: `inset 0 0 0 1px ${cor}40` }}
          >
            <Icone className="h-7 w-7" strokeWidth={1.75} style={{ color: cor }} />
          </div>
          <div>
            {hasWeather ? (
              <>
                <div className="flex items-baseline gap-1">
                  <span className="text-3xl font-semibold tabular-nums text-foreground">
                    {Math.round(info!.temperature!)}
                  </span>
                  <span className="text-lg text-foreground/50">°C</span>
                </div>
                <div className="mt-0.5 text-sm text-foreground/70">{meta.label}</div>
              </>
            ) : (
              <div className="text-sm text-foreground/70">{diaSemana}</div>
            )}
            {info?.city && (
              <div className="mt-1 flex items-center gap-1 text-xs text-foreground/40">
                <MapPin className="h-3 w-3" /> {info.city}
              </div>
            )}
          </div>
        </div>

        {/* ---- bloco do relógio digital + data ---- */}
        <div className="text-left sm:text-right">
          <div
            className="font-mono text-4xl font-semibold tracking-tight tabular-nums text-foreground sm:text-5xl"
            style={{ textShadow: `0 0 18px ${cor}55` }}
          >
            {hh}
            <span className="gf-colon mx-0.5 text-foreground/40">:</span>
            {mm}
            <span className="ml-1 text-2xl text-foreground/40 sm:text-3xl">{ss}</span>
          </div>
          <div className="mt-1.5 text-sm text-foreground/50">
            <span className="font-medium text-foreground/80">{diaSemana}</span>
            {`, ${dia} de ${mes} de ${ano}`}
          </div>
        </div>
      </div>
    </div>
  );
}
