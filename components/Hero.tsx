"use client";

import { motion } from "framer-motion";
import Container from "./Container";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 }
};

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.15 } }
};

type HeroProps = {
  title: string;
  subtitle: string;
  trustBadges: string[];
};

export default function Hero({
  title,
  subtitle,
  trustBadges
}: HeroProps) {
  return (
    <section className="relative overflow-hidden pb-16 pt-20 sm:pt-28">
      <Container>
        <div className="mx-auto grid max-w-4xl gap-10">
          <motion.div
            initial="hidden"
            animate="visible"
            variants={container}
            className="flex flex-col items-center space-y-6 text-center"
          >
            <motion.h1
              variants={fadeUp}
              className="text-4xl font-semibold leading-tight text-[#2B2C4B] sm:text-5xl lg:text-6xl"
            >
              {title}
            </motion.h1>
            <motion.p
              variants={fadeUp}
              className="max-w-2xl text-base sm:text-lg"
              style={{ color: "#1F213D" }}
            >
              {subtitle}
            </motion.p>
            <motion.div
              variants={fadeUp}
              className="flex flex-wrap justify-center gap-2"
            >
              {trustBadges.map((badgeItem) => (
                <Badge key={badgeItem}>{badgeItem}</Badge>
              ))}
            </motion.div>
            <motion.div variants={fadeUp} className="pt-2">
              <Link
                href="/register"
                data-analytics-event="cta_access_hero"
                data-analytics-label="hero_get_access"
                className="inline-flex items-center gap-3 rounded-full bg-[#5C5BD6] px-7 py-3 text-sm font-semibold text-white shadow-[0_18px_34px_rgba(92,91,214,0.35)] transition hover:-translate-y-0.5 hover:bg-[#4F4EC6]"
              >
                Получить доступ
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="h-4 w-4"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M5 12h14" />
                  <path d="m13 5 6 7-6 7" />
                </svg>
              </Link>
            </motion.div>
          </motion.div>
        </div>
      </Container>
    </section>
  );
}
