import { Card, CardContent } from "@/components/ui/card";

type TestimonialCardProps = {
  name: string;
  role: string;
  quote: string;
};

export default function TestimonialCard({
  name,
  role,
  quote
}: TestimonialCardProps) {
  return (
    <Card className="rounded-2xl">
      <CardContent className="p-6">
        <p className="text-sm text-[#2B2C4B]">“{quote}”</p>
        <div className="mt-4 text-sm font-semibold">{name}</div>
        <div className="text-xs text-[#2B2C4B]">{role}</div>
      </CardContent>
    </Card>
  );
}
