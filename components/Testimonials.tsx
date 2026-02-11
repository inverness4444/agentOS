import { testimonials } from "@/lib/data";
import Section from "./Section";
import TestimonialCard from "./TestimonialCard";

export default function Testimonials() {
  return (
    <Section id="testimonials">
      <div className="max-w-2xl">
        <p className="tag">Отзывы</p>
        <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
          Нам доверяют основатели, владельцы сервисов и маркетологи
        </h2>
        <p
          className="mt-3 text-sm sm:text-base"
          style={{ color: "#1F213D" }}
        >
          Реальные команды, которые запускают AgentOS и получают измеримые
          результаты.
        </p>
      </div>
      <div className="mt-10 grid gap-5 lg:grid-cols-3">
        {testimonials.map((item) => (
          <TestimonialCard key={item.name} {...item} />
        ))}
      </div>
    </Section>
  );
}
