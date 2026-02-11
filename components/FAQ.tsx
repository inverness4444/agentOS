import { faqs } from "@/lib/data";
import Section from "./Section";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger
} from "@/components/ui/accordion";

export default function FAQ() {
  return (
    <Section id="faq">
      <div className="max-w-2xl">
        <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
          Ответы на частые вопросы
        </h2>
      </div>
      <Accordion type="single" collapsible className="mt-8 space-y-4">
        {faqs.map((item) => (
          <AccordionItem key={item.question} value={item.question}>
            <AccordionTrigger>{item.question}</AccordionTrigger>
            <AccordionContent>
              <div className="whitespace-pre-line">{item.answer}</div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </Section>
  );
}
