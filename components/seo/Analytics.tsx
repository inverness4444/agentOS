"use client";

import { useEffect, useMemo, useState } from "react";
import Script from "next/script";

const CONSENT_STORAGE_KEY = "agentos_cookie_consent";

type ConsentState = "unknown" | "granted" | "denied";

const parseFlag = (value?: string) => {
  const normalized = String(value || "").trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
};

export default function Analytics() {
  const gaId = process.env.NEXT_PUBLIC_GA_ID || "";
  const yandexMetricaId = process.env.NEXT_PUBLIC_YANDEX_METRICA_ID || "";
  const requireConsent = parseFlag(process.env.NEXT_PUBLIC_REQUIRE_COOKIE_CONSENT);
  const hasAnyProvider = Boolean(gaId || yandexMetricaId);

  const [consent, setConsent] = useState<ConsentState>(requireConsent ? "unknown" : "granted");

  useEffect(() => {
    if (!requireConsent) return;
    const stored = window.localStorage.getItem(CONSENT_STORAGE_KEY);
    if (stored === "granted" || stored === "denied") {
      setConsent(stored);
      return;
    }
    setConsent("unknown");
  }, [requireConsent]);

  const analyticsEnabled = useMemo(() => {
    if (process.env.NODE_ENV !== "production") return false;
    if (!hasAnyProvider) return false;
    if (!requireConsent) return true;
    return consent === "granted";
  }, [consent, hasAnyProvider, requireConsent]);

  useEffect(() => {
    if (!analyticsEnabled) return;

    const clickHandler = (event: MouseEvent) => {
      const target = event.target as HTMLElement | null;
      if (!target) return;
      const tracked = target.closest("[data-analytics-event]") as HTMLElement | null;
      if (!tracked) return;

      const eventName = tracked.dataset.analyticsEvent || "";
      if (!eventName) return;

      const eventLabel = tracked.dataset.analyticsLabel || tracked.textContent?.trim() || "";
      const payload = {
        event_category: "cta",
        event_label: eventLabel
      };

      const maybeWindow = window as typeof window & {
        gtag?: (...args: any[]) => void;
        ym?: (...args: any[]) => void;
      };

      if (typeof maybeWindow.gtag === "function") {
        maybeWindow.gtag("event", eventName, payload);
      }

      const ymId = Number(yandexMetricaId);
      if (Number.isFinite(ymId) && typeof maybeWindow.ym === "function") {
        maybeWindow.ym(ymId, "reachGoal", eventName, payload);
      }
    };

    document.addEventListener("click", clickHandler);
    return () => document.removeEventListener("click", clickHandler);
  }, [analyticsEnabled, yandexMetricaId]);

  const onConsent = (next: Exclude<ConsentState, "unknown">) => {
    setConsent(next);
    window.localStorage.setItem(CONSENT_STORAGE_KEY, next);
  };

  if (!hasAnyProvider) return null;

  return (
    <>
      {analyticsEnabled && gaId ? (
        <>
          <Script src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`} strategy="afterInteractive" />
          <Script id="ga-init" strategy="afterInteractive">
            {`
              window.dataLayer = window.dataLayer || [];
              function gtag(){dataLayer.push(arguments);}
              window.gtag = gtag;
              gtag('js', new Date());
              gtag('config', '${gaId}', { anonymize_ip: true, transport_type: 'beacon' });
            `}
          </Script>
        </>
      ) : null}

      {analyticsEnabled && yandexMetricaId ? (
        <Script id="ym-init" strategy="afterInteractive">
          {`
            (function(m,e,t,r,i,k,a){m[i]=m[i]||function(){(m[i].a=m[i].a||[]).push(arguments)};
            m[i].l=1*new Date();
            for (var j = 0; j < document.scripts.length; j++) {if (document.scripts[j].src === r) { return; }}
            k=e.createElement(t),a=e.getElementsByTagName(t)[0],k.async=1,k.src=r,a.parentNode.insertBefore(k,a)})
            (window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
            ym(${Number(yandexMetricaId)}, "init", { clickmap:true, trackLinks:true, accurateTrackBounce:true, webvisor:false });
          `}
        </Script>
      ) : null}

      {requireConsent && consent === "unknown" ? (
        <div className="fixed bottom-4 left-4 right-4 z-50 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg md:left-auto md:max-w-lg">
          <p className="text-sm text-[#1F2238]">
            Используем cookie для аналитики кликов и улучшения сайта. Можно отключить в любой момент.
          </p>
          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={() => onConsent("granted")}
              className="rounded-full bg-[#5C5BD6] px-4 py-2 text-xs font-semibold text-white"
            >
              Разрешить
            </button>
            <button
              type="button"
              onClick={() => onConsent("denied")}
              className="rounded-full border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-[#1F2238]"
            >
              Отклонить
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
