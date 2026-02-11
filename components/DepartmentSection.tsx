"use client";

import { motion } from "framer-motion";
import Section from "./Section";
import { Badge } from "@/components/ui/badge";
import NftAvatar from "@/components/NftAvatar";
import type { Department, Agent } from "@/lib/data";

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 }
};

type DepartmentSectionProps = {
  department: Department;
};

function FeaturedCard({ agent, index }: { agent: Agent; index: number }) {

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.4, delay: index * 0.05 }}
      className="h-full"
    >
      <div className="flex h-full flex-col rounded-3xl border border-slate-200/80 bg-white/90 px-6 py-7 text-center shadow-soft transition hover:-translate-y-1 hover:border-slate-300/80">
        <NftAvatar
          seed={agent.id}
          size={72}
          className="mx-auto"
          photo={agent.photo}
          alt={agent.name}
        />
        <div className="mt-4 text-lg font-semibold text-[#2B2C4B]">
          {agent.name}
        </div>
        <div className="mt-1 text-[11px] uppercase tracking-[0.2em] text-[#2B2C4B] whitespace-normal break-words leading-snug">
          {agent.role}
        </div>
        <p className="mt-3 text-[13px] text-[#2B2C4B] sm:text-sm leading-relaxed whitespace-normal break-words">
          {agent.description}
        </p>
        <div className="mt-4 text-xs uppercase tracking-[0.2em] text-[#2B2C4B] whitespace-normal break-words leading-snug">
          Выдаёт
        </div>
        <div className="mt-1 text-[13px] text-[#2B2C4B] sm:text-sm leading-relaxed whitespace-normal break-words">
          {agent.delivers}
        </div>
      </div>
    </motion.div>
  );
}

function IncludedRow({ agent, index }: { agent: Agent; index: number }) {
  const isBonus = agent.id === "mitya";

  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount: 0.2 }}
      transition={{ duration: 0.35, delay: index * 0.03 }}
      className="group"
    >
      <div
        className="flex flex-wrap items-start justify-between gap-4 rounded-2xl border border-slate-200/80 bg-white px-5 py-4 text-[#1F2238] shadow-sm transition hover:border-slate-300/80 hover:bg-[#F7F8FF]"
        style={{ color: "#1F2238" }}
      >
        <div className="flex items-center gap-4">
          <NftAvatar
            seed={agent.id}
            size={52}
            className="rounded-xl"
            photo={agent.photo}
            alt={agent.name}
          />
          <div>
            <div className="flex items-center gap-2">
              <span
                className="text-base font-semibold text-[#1F2238]"
                style={{ color: "#1F2238" }}
              >
                {agent.name}
              </span>
              {isBonus && (
                <Badge variant="glow" className="text-[10px]">
                  BONUS
                </Badge>
              )}
            </div>
            <div
              className="text-[11px] uppercase tracking-[0.2em] text-[#1F2238] whitespace-normal break-words leading-snug"
              style={{ color: "#1F2238" }}
            >
              {agent.role}
            </div>
          </div>
        </div>
        <div
          className="w-full text-sm text-[#1F2238] sm:w-auto sm:max-w-[520px] sm:text-base sm:text-right leading-relaxed whitespace-normal break-words"
          style={{ color: "#1F2238" }}
        >
          {agent.description}
        </div>
      </div>
    </motion.div>
  );
}

export default function DepartmentSection({ department }: DepartmentSectionProps) {
  return (
    <Section id={department.id} className="py-20">
      <div className="mx-auto max-w-3xl text-center">
        <h2 className="text-3xl font-semibold text-[#2B2C4B] sm:text-4xl">
          {department.title}
        </h2>
        <p
          className="mt-3 text-sm sm:text-base"
          style={{ color: "#1F213D" }}
        >
          {department.subtitle}
        </p>
      </div>

      <div className="mt-10 grid items-stretch gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {department.featured.map((agent, index) => (
          <FeaturedCard key={agent.id} agent={agent} index={index} />
        ))}
      </div>

      {department.included.length > 0 ? (
        <>
          <div className="mt-10 text-center text-sm uppercase tracking-[0.2em] text-[#2B2C4B]">
            Также включено в {department.title}:
          </div>
          <div className="mt-6 space-y-3">
            {department.included.map((agent, index) => (
              <IncludedRow key={agent.id} agent={agent} index={index} />
            ))}
          </div>
        </>
      ) : null}

    </Section>
  );
}
