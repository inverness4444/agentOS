import Section from "./Section";
import { Card, CardContent } from "@/components/ui/card";

export default function WorkBlock() {
  return (
    <Section>
      <Card className="rounded-3xl">
        <CardContent className="p-8 md:p-10">
          <p className="tag">Фокус на результате</p>
          <h2 className="mt-4 text-3xl font-semibold sm:text-4xl">
            Большинство AI-инструментов болтают. Эти — делают.
          </h2>
          <p
            className="mt-4 text-sm sm:text-base"
            style={{ color: "#1F213D" }}
          >
            AgentOS выдаёт конкретные артефакты: лиды, цепочки, контент-планы и
            схемы. Никакой болтовни — только работа.
          </p>
        </CardContent>
      </Card>
    </Section>
  );
}
