import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import Container from "./Container";

type SectionProps = {
  id?: string;
  children: ReactNode;
  className?: string;
  containerClassName?: string;
};

export default function Section({
  id,
  children,
  className,
  containerClassName
}: SectionProps) {
  return (
    <section id={id} className={cn("scroll-mt-28 py-16", className)}>
      <Container className={containerClassName}>{children}</Container>
    </section>
  );
}
